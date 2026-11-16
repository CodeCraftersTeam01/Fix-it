use crate::runtime_parser::{parse_runtime_log_entry, RuntimeCrashInfo};
use serde::Deserialize;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::Duration;

#[derive(Debug, Deserialize)]
struct IncomingCrashPayload {
    message: Option<String>,
    file_path: Option<String>,
    file: Option<String>,
    line_number: Option<u32>,
    line: Option<u32>,
    error_type: Option<String>,
    r#type: Option<String>,
    snippet: Option<String>,
    raw: Option<String>,
    log: Option<String>,
    url: Option<String>,
    stack: Option<String>,
    column_number: Option<u32>,
}

pub const BROWSER_INJECTOR_SCRIPT: &str = r#"/** FixIt Browser Console & Runtime Monitor **/
!function(){
  if(window.__fixitConsoleMonitorActive)return;
  window.__fixitConsoleMonitorActive=true;

  var REPORT_URL = 'http://127.0.0.1:45678/report';
  var lastReportTimes = {};

  function shouldThrottle(key) {
    var now = Date.now();
    if (lastReportTimes[key] && (now - lastReportTimes[key] < 1500)) {
      return true;
    }
    lastReportTimes[key] = now;
    return false;
  }

  function report(payload) {
    try {
      var key = (payload.error_type || '') + ':' + (payload.message || '') + ':' + (payload.line_number || 0);
      if (shouldThrottle(key)) return;

      var body = JSON.stringify(payload);
      if (window.navigator && typeof window.navigator.sendBeacon === 'function') {
        var sent = window.navigator.sendBeacon(REPORT_URL, body);
        if (sent) return;
      }
      var xhr = new XMLHttpRequest();
      xhr.open('POST', REPORT_URL, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(body);
    } catch (e) {}
  }

  function parseStack(stack) {
    if (!stack || typeof stack !== 'string') return { file: '', line: 0, col: 0, snippet: '' };
    var lines = stack.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      var match = line.match(/(https?:\/\/[^\s:)]+|file:\/\/[^\s:)]+|[a-zA-Z]:\\[^\s:)]+):(\d+)(?::(\d+))?/);
      if (match) {
        return {
          file: match[1],
          line: parseInt(match[2], 10) || 0,
          col: parseInt(match[3], 10) || 0,
          snippet: line
        };
      }
    }
    return { file: '', line: 0, col: 0, snippet: '' };
  }

  // 1. Intercept window.onerror
  window.addEventListener('error', function (e) {
    try {
      var parsed = parseStack(e.error && e.error.stack);
      var filePath = e.filename || parsed.file || window.location.href;
      var lineNumber = e.lineno || parsed.line || 0;
      var colNumber = e.colno || parsed.col || 0;
      var errorType = (e.error && e.error.name) || 'Error';
      var message = e.message || (e.error && e.error.message) || String(e);

      report({
        error_type: errorType,
        message: message,
        file_path: filePath,
        line_number: lineNumber,
        column_number: colNumber,
        snippet: parsed.snippet || (e.error && e.error.stack) || message,
        url: window.location.href
      });
    } catch (err) {}
  });

  // 2. Intercept window.onunhandledrejection (Promise rejections - e.g. async errors in Zen/Firefox/Chrome)
  window.addEventListener('unhandledrejection', function (e) {
    try {
      var reason = e.reason || {};
      var stack = reason.stack || '';
      var parsed = parseStack(stack);
      var filePath = parsed.file || window.location.href;
      var lineNumber = parsed.line || 0;
      var colNumber = parsed.col || 0;
      var errorType = reason.name || 'TypeError';
      var message = reason.message || (typeof reason === 'string' ? reason : 'Unhandled Promise Rejection');

      report({
        error_type: errorType,
        message: message,
        file_path: filePath,
        line_number: lineNumber,
        column_number: colNumber,
        snippet: parsed.snippet || stack || message,
        url: window.location.href
      });
    } catch (err) {}
  });

  // 3. Intercept console.error
  var origConsoleError = console.error;
  console.error = function () {
    try {
      var args = Array.prototype.slice.call(arguments);
      var message = args.map(function (a) {
        if (a instanceof Error) return (a.name ? a.name + ': ' : '') + a.message + (a.stack ? '\n' + a.stack : '');
        if (typeof a === 'object') {
          try { return JSON.stringify(a); } catch (_) { return String(a); }
        }
        return String(a);
      }).join(' ');

      var stack = '';
      for (var i = 0; i < args.length; i++) {
        if (args[i] instanceof Error && args[i].stack) {
          stack = args[i].stack;
          break;
        }
      }
      if (!stack) {
        try { throw new Error(); } catch (fake) { stack = fake.stack || ''; }
      }
      var parsed = parseStack(stack);

      report({
        error_type: 'ConsoleError',
        message: message,
        file_path: parsed.file || window.location.href,
        line_number: parsed.line || 0,
        column_number: parsed.col || 0,
        snippet: parsed.snippet || message,
        url: window.location.href
      });
    } catch (err) {}
    return origConsoleError.apply(console, arguments);
  };

  console.log('%c[FixIt]%c Browser Console Monitor aktif untuk ' + window.location.origin, 'color:#10b981;font-weight:bold;', 'color:gray;');
}();
"#;

pub const USERSCRIPT_CONTENT: &str = r#"// ==UserScript==
// @name         FixIt Local Website Console Monitor
// @namespace    http://fixit.local/
// @version      1.0
// @description  Stream local website console errors & exceptions to FixIt desktop HUD
// @match        http://localhost:*/*
// @match        http://127.0.0.1:*/*
// @match        http://*.test/*
// @match        http://*.local/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
(function () {
  var s = document.createElement('script');
  s.src = 'http://127.0.0.1:45678/fixit.js';
  s.async = false;
  (document.head || document.documentElement).appendChild(s);
})();
"#;

/// Start an unprivileged loopback crash report HTTP listener on 127.0.0.1:{port}.
/// Returns None without panicking if binding fails (e.g. port conflict).
pub fn start_loopback_reporter<F>(port: u16, on_crash: F) -> Option<JoinHandle<()>>
where
    F: Fn(RuntimeCrashInfo) + Send + Sync + 'static,
{
    start_loopback_reporter_inner(port, on_crash).map(|(handle, _)| handle)
}

/// Internal helper returning the JoinHandle and the actual bound port (useful for port 0 in tests).
pub fn start_loopback_reporter_inner<F>(port: u16, on_crash: F) -> Option<(JoinHandle<()>, u16)>
where
    F: Fn(RuntimeCrashInfo) + Send + Sync + 'static,
{
    let addr = format!("127.0.0.1:{}", port);
    let listener = match TcpListener::bind(&addr) {
        Ok(l) => l,
        Err(e) => {
            eprintln!(
                "Warning: Failed to bind loopback crash reporter on {}: {}",
                addr, e
            );
            return None;
        }
    };

    let bound_port = listener.local_addr().ok().map(|a| a.port()).unwrap_or(port);
    let on_crash = Arc::new(on_crash);

    let handle = std::thread::spawn(move || {
        for stream in listener.incoming() {
            match stream {
                Ok(mut stream) => {
                    let on_crash = Arc::clone(&on_crash);
                    std::thread::spawn(move || {
                        handle_connection(&mut stream, &on_crash);
                    });
                }
                Err(e) => {
                    eprintln!(
                        "Warning: Error accepting connection on loopback listener: {}",
                        e
                    );
                }
            }
        }
    });

    Some((handle, bound_port))
}

fn handle_connection<F>(stream: &mut TcpStream, on_crash: &Arc<F>)
where
    F: Fn(RuntimeCrashInfo) + Send + Sync + 'static,
{
    let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(3)));

    let mut buffer = Vec::new();
    let mut chunk = [0u8; 1024];
    let mut header_end = None;

    // Read HTTP headers safely (max 64KB)
    while buffer.len() < 65536 {
        match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => {
                buffer.extend_from_slice(&chunk[..n]);
                if let Some(pos) = find_subsequence(&buffer, b"\r\n\r\n") {
                    header_end = Some(pos + 4);
                    break;
                }
                if let Some(pos) = find_subsequence(&buffer, b"\n\n") {
                    header_end = Some(pos + 2);
                    break;
                }
            }
            Err(_) => break,
        }
    }

    let header_end_idx = match header_end {
        Some(idx) => idx,
        None => return,
    };

    let header_bytes = &buffer[..header_end_idx];
    let header_str = String::from_utf8_lossy(header_bytes);
    let mut lines = header_str.lines();
    let request_line = match lines.next() {
        Some(l) => l,
        None => return,
    };

    let mut parts = request_line.split_whitespace();
    let method = match parts.next() {
        Some(m) => m.to_uppercase(),
        None => return,
    };
    let path = parts.next().unwrap_or("/");

    if method == "OPTIONS" {
        let response = "HTTP/1.1 204 No Content\r\n\
Access-Control-Allow-Origin: *\r\n\
Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
Access-Control-Allow-Headers: Content-Type\r\n\
Connection: close\r\n\
\r\n";
        let _ = stream.write_all(response.as_bytes());
        let _ = stream.flush();
        return;
    }

    if method == "GET" {
        if path.starts_with("/fixit.js") || path.starts_with("/fixit-inject.js") {
            let body = BROWSER_INJECTOR_SCRIPT;
            let response = format!(
                "HTTP/1.1 200 OK\r\n\
Access-Control-Allow-Origin: *\r\n\
Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
Content-Type: application/javascript; charset=utf-8\r\n\
Content-Length: {}\r\n\
Connection: close\r\n\
\r\n{}",
                body.len(),
                body
            );
            let _ = stream.write_all(response.as_bytes());
            let _ = stream.flush();
            return;
        }

        if path.starts_with("/fixit.user.js") {
            let body = USERSCRIPT_CONTENT;
            let response = format!(
                "HTTP/1.1 200 OK\r\n\
Access-Control-Allow-Origin: *\r\n\
Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
Content-Type: application/javascript; charset=utf-8\r\n\
Content-Length: {}\r\n\
Connection: close\r\n\
\r\n{}",
                body.len(),
                body
            );
            let _ = stream.write_all(response.as_bytes());
            let _ = stream.flush();
            return;
        }

        if path.starts_with("/health") || path.starts_with("/status") {
            let body = "{\"status\":\"ok\",\"service\":\"fixit-runtime-reporter\"}";
            let response = format!(
                "HTTP/1.1 200 OK\r\n\
Access-Control-Allow-Origin: *\r\n\
Content-Type: application/json\r\n\
Content-Length: {}\r\n\
Connection: close\r\n\
\r\n{}",
                body.len(),
                body
            );
            let _ = stream.write_all(response.as_bytes());
            let _ = stream.flush();
            return;
        }
    }

    if method == "POST" {
        let mut content_length: usize = 0;
        for line in lines {
            if let Some((k, v)) = line.split_once(':') {
                if k.trim().eq_ignore_ascii_case("content-length") {
                    if let Ok(len) = v.trim().parse::<usize>() {
                        content_length = len;
                    }
                }
            }
        }

        let max_len = content_length.min(1024 * 1024);
        let mut body_bytes = buffer[header_end_idx..].to_vec();

        while body_bytes.len() < max_len {
            let to_read = (max_len - body_bytes.len()).min(chunk.len());
            match stream.read(&mut chunk[..to_read]) {
                Ok(0) => break,
                Ok(n) => body_bytes.extend_from_slice(&chunk[..n]),
                Err(_) => break,
            }
        }

        let body_str = String::from_utf8_lossy(&body_bytes);
        if let Some(crash_info) = parse_crash_payload(&body_str) {
            on_crash(crash_info);
        }

        let response = "HTTP/1.1 200 OK\r\n\
Access-Control-Allow-Origin: *\r\n\
Access-Control-Allow-Methods: POST, OPTIONS\r\n\
Access-Control-Allow-Headers: Content-Type\r\n\
Content-Type: application/json\r\n\
Content-Length: 15\r\n\
Connection: close\r\n\
\r\n\
{\"status\":\"ok\"}";
        let _ = stream.write_all(response.as_bytes());
        let _ = stream.flush();
        return;
    }

    let response = "HTTP/1.1 405 Method Not Allowed\r\n\
Access-Control-Allow-Origin: *\r\n\
Content-Length: 0\r\n\
Connection: close\r\n\
\r\n";
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

fn parse_crash_payload(body: &str) -> Option<RuntimeCrashInfo> {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return None;
    }

    // Try parsing as JSON first
    if let Ok(payload) = serde_json::from_str::<IncomingCrashPayload>(trimmed) {
        // Case 1: raw or log entry in JSON
        if let Some(raw) = payload.raw.as_deref().or(payload.log.as_deref()) {
            if let Some(parsed) = parse_runtime_log_entry(raw, None) {
                return Some(parsed);
            }
            if !raw.trim().is_empty() {
                return Some(RuntimeCrashInfo {
                    error_type: "RuntimeError".to_string(),
                    message: raw.trim().to_string(),
                    file_path: "unknown".to_string(),
                    line_number: 0,
                    snippet: None,
                });
            }
        }

        // Case 2: Structured fields
        if payload.message.is_some() || payload.file_path.is_some() || payload.file.is_some() || payload.url.is_some() {
            let _ = payload.column_number;
            let error_type = payload
                .error_type
                .or(payload.r#type)
                .unwrap_or_else(|| "RuntimeError".to_string());
            let message = payload.message.unwrap_or_default();
            let file_path = payload
                .file_path
                .or(payload.file)
                .or(payload.url)
                .unwrap_or_else(|| "unknown".to_string());
            let line_number = payload.line_number.or(payload.line).unwrap_or(0);
            let snippet = payload.snippet.or(payload.stack);

            return Some(RuntimeCrashInfo {
                error_type,
                message,
                file_path,
                line_number,
                snippet,
            });
        }
    }

    // Case 3: Try parsing as raw log entry via parse_runtime_log_entry
    if let Some(parsed) = parse_runtime_log_entry(trimmed, None) {
        return Some(parsed);
    }

    // Case 4: Fallback for arbitrary non-empty text body
    Some(RuntimeCrashInfo {
        error_type: "RuntimeError".to_string(),
        message: trimmed.to_string(),
        file_path: "unknown".to_string(),
        line_number: 0,
        snippet: None,
    })
}

fn find_subsequence(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpStream;
    use std::sync::mpsc::channel;
    use std::time::Duration;

    fn send_raw_http(port: u16, request: &str) -> String {
        let mut stream = TcpStream::connect(format!("127.0.0.1:{}", port))
            .expect("Failed to connect to loopback listener");
        stream
            .set_read_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        stream
            .set_write_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        stream.write_all(request.as_bytes()).unwrap();
        stream.flush().unwrap();

        let mut response = String::new();
        let _ = stream.read_to_string(&mut response);
        response
    }

    #[test]
    fn test_loopback_reporter_options_preflight() {
        let (_handle, port) =
            start_loopback_reporter_inner(0, |_| {}).expect("Failed to start listener");

        let request = "OPTIONS /report HTTP/1.1\r\n\
Host: 127.0.0.1\r\n\
Origin: http://localhost:8000\r\n\
Access-Control-Request-Method: POST\r\n\
\r\n";

        let response = send_raw_http(port, request);
        assert!(
            response.starts_with("HTTP/1.1 204 No Content")
                || response.starts_with("HTTP/1.1 200 OK"),
            "Unexpected response: {}",
            response
        );
        assert!(response.contains("Access-Control-Allow-Origin: *"));
        assert!(response.contains("Access-Control-Allow-Methods:"));
        assert!(response.contains("POST"));
        assert!(response.contains("OPTIONS"));
        assert!(response.contains("Access-Control-Allow-Headers: Content-Type"));
    }

    #[test]
    fn test_loopback_reporter_structured_json() {
        let (tx, rx) = channel();
        let (_handle, port) = start_loopback_reporter_inner(0, move |info| {
            let _ = tx.send(info);
        })
        .expect("Failed to start listener");

        let body = r#"{"message":"Call to undefined method Auth::login()","file_path":"/app/Http/Controllers/AuthController.php","line_number":42,"error_type":"BadMethodCallException"}"#;
        let request = format!(
            "POST /report HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );

        let response = send_raw_http(port, &request);
        assert!(response.starts_with("HTTP/1.1 200 OK"));
        assert!(response.contains(r#"{"status":"ok"}"#));

        let crash = rx
            .recv_timeout(Duration::from_millis(1000))
            .expect("Did not receive crash info");
        assert_eq!(crash.error_type, "BadMethodCallException");
        assert_eq!(crash.message, "Call to undefined method Auth::login()");
        assert_eq!(
            crash.file_path,
            "/app/Http/Controllers/AuthController.php"
        );
        assert_eq!(crash.line_number, 42);
    }

    #[test]
    fn test_loopback_reporter_alternative_json_keys() {
        let (tx, rx) = channel();
        let (_handle, port) = start_loopback_reporter_inner(0, move |info| {
            let _ = tx.send(info);
        })
        .expect("Failed to start listener");

        let body = r#"{"message":"QueryException in query","file":"database.php","line":99}"#;
        let request = format!(
            "POST /report HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );

        let response = send_raw_http(port, &request);
        assert!(response.starts_with("HTTP/1.1 200 OK"));

        let crash = rx
            .recv_timeout(Duration::from_millis(1000))
            .expect("Did not receive crash info");
        assert_eq!(crash.error_type, "RuntimeError");
        assert_eq!(crash.message, "QueryException in query");
        assert_eq!(crash.file_path, "database.php");
        assert_eq!(crash.line_number, 99);
    }

    #[test]
    fn test_loopback_reporter_raw_log_entry_json() {
        let (tx, rx) = channel();
        let (_handle, port) = start_loopback_reporter_inner(0, move |info| {
            let _ = tx.send(info);
        })
        .expect("Failed to start listener");

        let raw_entry = "[2026-11-11 16:30:00] local.ERROR: Call to undefined function calculate() in /app/Services/Calc.php:15";
        let body = serde_json::json!({ "raw": raw_entry }).to_string();
        let request = format!(
            "POST /report HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );

        let response = send_raw_http(port, &request);
        assert!(response.starts_with("HTTP/1.1 200 OK"));

        let crash = rx
            .recv_timeout(Duration::from_millis(1000))
            .expect("Did not receive crash info");
        assert_eq!(crash.error_type, "Error");
        assert_eq!(crash.message, "Call to undefined function calculate()");
        assert_eq!(crash.file_path, "/app/Services/Calc.php");
        assert_eq!(crash.line_number, 15);
    }

    #[test]
    fn test_loopback_reporter_plain_text_trace() {
        let (tx, rx) = channel();
        let (_handle, port) = start_loopback_reporter_inner(0, move |info| {
            let _ = tx.send(info);
        })
        .expect("Failed to start listener");

        let body = "ReferenceError: token is not defined\n    at login (/app/auth.js:25:9)";
        let request = format!(
            "POST /report HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );

        let response = send_raw_http(port, &request);
        assert!(response.starts_with("HTTP/1.1 200 OK"));

        let crash = rx
            .recv_timeout(Duration::from_millis(1000))
            .expect("Did not receive crash info");
        assert_eq!(crash.error_type, "ReferenceError");
        assert_eq!(crash.message, "token is not defined");
        assert_eq!(crash.file_path, "/app/auth.js");
        assert_eq!(crash.line_number, 25);
    }

    #[test]
    fn test_loopback_reporter_serves_fixit_js_and_userscript() {
        let (_handle, port) = start_loopback_reporter_inner(0, |_| {})
            .expect("Failed to start listener");

        // 1. GET /fixit.js
        let request_js = "GET /fixit.js HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n";
        let response_js = send_raw_http(port, request_js);
        assert!(response_js.starts_with("HTTP/1.1 200 OK"));
        assert!(response_js.contains("application/javascript"));
        assert!(response_js.contains("Browser Console & Runtime Monitor"));

        // 2. GET /fixit.user.js
        let request_user = "GET /fixit.user.js HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n";
        let response_user = send_raw_http(port, request_user);
        assert!(response_user.starts_with("HTTP/1.1 200 OK"));
        assert!(response_user.contains("// ==UserScript=="));
        assert!(response_user.contains("FixIt Local Website Console Monitor"));
    }

    #[test]
    fn test_loopback_reporter_browser_console_payload() {
        let (tx, rx) = channel();
        let (_handle, port) = start_loopback_reporter_inner(0, move |info| {
            let _ = tx.send(info);
        })
        .expect("Failed to start listener");

        let body = serde_json::json!({
            "error_type": "TypeError",
            "message": "can't access property \"value\", document.getElementById(...) is null",
            "url": "http://127.0.0.1:5500/public/index.html",
            "line_number": 176,
            "column_number": 39,
            "snippet": "const username = document.getElementById('username1').value;"
        }).to_string();

        let request = format!(
            "POST /report HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );

        let response = send_raw_http(port, &request);
        assert!(response.starts_with("HTTP/1.1 200 OK"));

        let crash = rx
            .recv_timeout(Duration::from_millis(1000))
            .expect("Did not receive browser crash info");
        assert_eq!(crash.error_type, "TypeError");
        assert!(crash.message.contains("can't access property"));
        assert_eq!(crash.file_path, "http://127.0.0.1:5500/public/index.html");
        assert_eq!(crash.line_number, 176);
    }

    #[test]
    fn test_port_conflict_graceful_handling() {
        // Pre-bind an ephemeral port
        let blocker = TcpListener::bind("127.0.0.1:0").expect("Failed to bind blocker");
        let occupied_port = blocker.local_addr().unwrap().port();

        // Attempting to bind on occupied_port should gracefully return None
        let result = start_loopback_reporter(occupied_port, |_| {});
        assert!(result.is_none());
    }

    #[test]
    fn test_public_start_loopback_reporter() {
        let handle = start_loopback_reporter(0, |_| {});
        assert!(handle.is_some());
    }
}
