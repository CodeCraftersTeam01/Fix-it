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
}

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

    if method == "OPTIONS" {
        let response = "HTTP/1.1 204 No Content\r\n\
Access-Control-Allow-Origin: *\r\n\
Access-Control-Allow-Methods: POST, OPTIONS\r\n\
Access-Control-Allow-Headers: Content-Type\r\n\
Connection: close\r\n\
\r\n";
        let _ = stream.write_all(response.as_bytes());
        let _ = stream.flush();
        return;
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
        if payload.message.is_some() || payload.file_path.is_some() || payload.file.is_some() {
            let error_type = payload
                .error_type
                .or(payload.r#type)
                .unwrap_or_else(|| "RuntimeError".to_string());
            let message = payload.message.unwrap_or_default();
            let file_path = payload
                .file_path
                .or(payload.file)
                .unwrap_or_else(|| "unknown".to_string());
            let line_number = payload.line_number.or(payload.line).unwrap_or(0);
            let snippet = payload.snippet;

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
        assert!(response.contains("Access-Control-Allow-Methods: POST, OPTIONS"));
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
