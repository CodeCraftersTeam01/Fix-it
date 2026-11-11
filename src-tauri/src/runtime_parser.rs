use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RuntimeCrashInfo {
    pub error_type: String,
    pub message: String,
    pub file_path: String,
    pub line_number: u32,
    pub snippet: Option<String>,
}

#[derive(Debug, Clone)]
struct StackFrame {
    file_path: String,
    line_number: u32,
    snippet: Option<String>,
}

fn is_vendor_or_framework(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.contains("/vendor/")
        || lower.contains("\\vendor\\")
        || lower.starts_with("vendor/")
        || lower.starts_with("vendor\\")
        || lower.contains("/node_modules/")
        || lower.contains("\\node_modules\\")
        || lower.starts_with("node_modules/")
        || lower.starts_with("node_modules\\")
        || lower.contains("/site-packages/")
        || lower.contains("\\site-packages\\")
        || lower.contains("/dist-packages/")
        || lower.contains("\\dist-packages\\")
        || lower.contains("/venv/")
        || lower.contains("/.venv/")
        || lower.contains("\\venv\\")
        || lower.contains("\\.venv\\")
        || lower.starts_with("node:internal")
        || lower.starts_with("<frozen ")
        || lower.contains("/usr/lib/python")
        || lower.contains("/library/frameworks/python.framework")
}

fn select_best_frame(
    frames: &[StackFrame],
    workspace_root: Option<&str>,
    reverse_search: bool,
) -> Option<StackFrame> {
    if frames.is_empty() {
        return None;
    }

    let normalized_root = workspace_root.map(|r| r.trim_end_matches(['/', '\\']).to_lowercase());

    let frame_list: Vec<&StackFrame> = if reverse_search {
        frames.iter().rev().collect()
    } else {
        frames.iter().collect()
    };

    // 1. In workspace root AND not vendor/framework
    if let Some(ref root) = normalized_root {
        for frame in &frame_list {
            let path_lower = frame.file_path.to_lowercase();
            if path_lower.starts_with(root) && !is_vendor_or_framework(&frame.file_path) {
                return Some((*frame).clone());
            }
        }
    }

    // 2. Not vendor/framework anywhere
    for frame in &frame_list {
        if !is_vendor_or_framework(&frame.file_path) {
            return Some((*frame).clone());
        }
    }

    // 3. In workspace root (even if vendor/framework)
    if let Some(ref root) = normalized_root {
        for frame in &frame_list {
            let path_lower = frame.file_path.to_lowercase();
            if path_lower.starts_with(root) {
                return Some((*frame).clone());
            }
        }
    }

    // 4. Fallback to the first frame
    frames.first().cloned()
}

fn parse_php_laravel(raw_entry: &str, workspace_root: Option<&str>) -> Option<RuntimeCrashInfo> {
    let laravel_header_re = Regex::new(
        r"(?s)^\[\d{4}-\d{2}-\d{2}[^\]]*\]\s+[A-Za-z0-9_-]+\.(?:ERROR|CRITICAL|EMERGENCY|ALERT):\s*(.*?)(?:\s+in\s+([^\s:]+\.php)(?::(\d+)|\s+on\s+line\s+(\d+)))?(?:\n|$)"
    ).ok()?;

    let php_fatal_re = Regex::new(
        r"(?i)^(?:PHP\s+)?(Fatal error|Parse error|Warning|Notice):\s*(?:Uncaught\s+([A-Za-z0-9_\\]+):\s*)?(.*?)(?:\s+in\s+([^\s:]+\.php)(?::(\d+)|\s+on\s+line\s+(\d+)))?(?:\n|$)"
    ).ok()?;

    let exception_class_re = Regex::new(r"^([A-Za-z0-9_\\]+(?:Exception|Error)):\s*(.*)").ok()?;
    let php_frame_re = Regex::new(r"(?m)^\s*#\d+\s+([^\s(:]+\.php)(?:\((\d+)\)|:(\d+))").ok()?;

    let mut frames = Vec::new();

    let (error_type, message) = if let Some(caps) = laravel_header_re.captures(raw_entry) {
        let raw_msg = caps.get(1).map_or("", |m| m.as_str()).trim();
        let (e_type, msg) = if let Some(exc_caps) = exception_class_re.captures(raw_msg) {
            (
                exc_caps.get(1).map_or("Error", |m| m.as_str()).to_string(),
                exc_caps.get(2).map_or(raw_msg, |m| m.as_str()).to_string(),
            )
        } else {
            ("Error".to_string(), raw_msg.to_string())
        };

        if let Some(fmatch) = caps.get(2) {
            let line = caps.get(3).or_else(|| caps.get(4))
                .and_then(|m| m.as_str().parse::<u32>().ok())
                .unwrap_or(1);
            frames.push(StackFrame {
                file_path: fmatch.as_str().to_string(),
                line_number: line,
                snippet: None,
            });
        }
        (e_type, msg)
    } else if let Some(caps) = php_fatal_re.captures(raw_entry) {
        let prefix = caps.get(1).map_or("Fatal error", |m| m.as_str());
        let uncaught = caps.get(2).map(|m| m.as_str());
        let raw_msg = caps.get(3).map_or("", |m| m.as_str()).trim();

        let (e_type, msg) = if let Some(u) = uncaught {
            (u.to_string(), raw_msg.to_string())
        } else if let Some(exc_caps) = exception_class_re.captures(raw_msg) {
            (
                exc_caps.get(1).map_or(prefix, |m| m.as_str()).to_string(),
                exc_caps.get(2).map_or(raw_msg, |m| m.as_str()).to_string(),
            )
        } else {
            (prefix.to_string(), raw_msg.to_string())
        };

        if let Some(fmatch) = caps.get(4) {
            let line = caps.get(5).or_else(|| caps.get(6))
                .and_then(|m| m.as_str().parse::<u32>().ok())
                .unwrap_or(1);
            frames.push(StackFrame {
                file_path: fmatch.as_str().to_string(),
                line_number: line,
                snippet: None,
            });
        }
        (e_type, msg)
    } else {
        return None;
    };

    // Extract subsequent stacktrace frames (#0 /path/file.php:line or #0 /path/file.php(line))
    for caps in php_frame_re.captures_iter(raw_entry) {
        if let Some(fmatch) = caps.get(1) {
            let line = caps.get(2).or_else(|| caps.get(3))
                .and_then(|m| m.as_str().parse::<u32>().ok())
                .unwrap_or(1);
            frames.push(StackFrame {
                file_path: fmatch.as_str().to_string(),
                line_number: line,
                snippet: None,
            });
        }
    }

    let selected = select_best_frame(&frames, workspace_root, false)?;

    Some(RuntimeCrashInfo {
        error_type,
        message,
        file_path: selected.file_path,
        line_number: selected.line_number,
        snippet: selected.snippet,
    })
}

fn parse_nodejs(raw_entry: &str, workspace_root: Option<&str>) -> Option<RuntimeCrashInfo> {
    let err_header_re = Regex::new(r"(?m)^(?:Uncaught\s+)?([A-Za-z0-9_$]*Error):\s*(.*)$").ok()?;
    let frame_re = Regex::new(
        r"(?m)^\s*at\s+(?:.*?\(([^)]+?):(\d+)(?::\d+)?\)|([^\s(]+?):(\d+)(?::\d+)?)"
    ).ok()?;

    let caps = err_header_re.captures(raw_entry)?;
    let error_type = caps.get(1).map_or("Error", |m| m.as_str()).to_string();
    let message = caps.get(2).map_or("", |m| m.as_str()).trim().to_string();

    let mut frames = Vec::new();
    for f_caps in frame_re.captures_iter(raw_entry) {
        let fpath = f_caps.get(1).or_else(|| f_caps.get(3)).map(|m| m.as_str())?;
        let lnum = f_caps.get(2).or_else(|| f_caps.get(4))
            .and_then(|m| m.as_str().parse::<u32>().ok())
            .unwrap_or(1);

        frames.push(StackFrame {
            file_path: fpath.to_string(),
            line_number: lnum,
            snippet: None,
        });
    }

    if frames.is_empty() {
        return None;
    }

    let selected = select_best_frame(&frames, workspace_root, false)?;

    Some(RuntimeCrashInfo {
        error_type,
        message,
        file_path: selected.file_path,
        line_number: selected.line_number,
        snippet: selected.snippet,
    })
}

fn parse_python(raw_entry: &str, workspace_root: Option<&str>) -> Option<RuntimeCrashInfo> {
    if !raw_entry.contains("Traceback (most recent call last):") {
        return None;
    }

    let frame_re = Regex::new(
        r#"(?m)^\s*File "([^"]+)", line (\d+)(?:, in .*)?(?:\n\s*(.+))?"#
    ).ok()?;

    let mut frames = Vec::new();
    for caps in frame_re.captures_iter(raw_entry) {
        let fpath = caps.get(1).map(|m| m.as_str())?;
        let lnum = caps.get(2)
            .and_then(|m| m.as_str().parse::<u32>().ok())
            .unwrap_or(1);
        let snippet = caps.get(3).map(|m| m.as_str().trim().to_string())
            .filter(|s| !s.is_empty() && !s.starts_with("File "));

        frames.push(StackFrame {
            file_path: fpath.to_string(),
            line_number: lnum,
            snippet,
        });
    }

    if frames.is_empty() {
        return None;
    }

    // Exception type and message is usually the last non-empty line
    let last_line = raw_entry.lines().rev().find(|l| !l.trim().is_empty())?;
    let exc_re = Regex::new(r"^([A-Za-z0-9_]+Error|[A-Za-z0-9_]+Exception|[A-Za-z0-9_]+):\s*(.*)$").ok()?;

    let (error_type, message) = if let Some(caps) = exc_re.captures(last_line.trim()) {
        (
            caps.get(1).map_or("Error", |m| m.as_str()).to_string(),
            caps.get(2).map_or("", |m| m.as_str()).trim().to_string(),
        )
    } else {
        (last_line.trim().to_string(), String::new())
    };

    // Python tracebacks are outer-to-inner, so reverse search to find closest application frame
    let selected = select_best_frame(&frames, workspace_root, true)?;

    Some(RuntimeCrashInfo {
        error_type,
        message,
        file_path: selected.file_path,
        line_number: selected.line_number,
        snippet: selected.snippet,
    })
}

pub fn parse_runtime_log_entry(raw_entry: &str, workspace_root: Option<&str>) -> Option<RuntimeCrashInfo> {
    if let Some(info) = parse_python(raw_entry, workspace_root) {
        return Some(info);
    }
    if let Some(info) = parse_php_laravel(raw_entry, workspace_root) {
        return Some(info);
    }
    if let Some(info) = parse_nodejs(raw_entry, workspace_root) {
        return Some(info);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_laravel_single_line() {
        let log = "[2026-11-11 16:30:00] local.ERROR: Call to undefined method App\\Models\\User::authentikasi() in /path/to/app/Http/Controllers/AuthController.php:42";
        let crash = parse_runtime_log_entry(log, None).expect("Should parse Laravel error");
        assert_eq!(crash.error_type, "Error");
        assert_eq!(crash.message, "Call to undefined method App\\Models\\User::authentikasi()");
        assert_eq!(crash.file_path, "/path/to/app/Http/Controllers/AuthController.php");
        assert_eq!(crash.line_number, 42);
        assert_eq!(crash.snippet, None);
    }

    #[test]
    fn test_parse_laravel_with_vendor_stacktrace() {
        let log = r#"[2026-11-11 16:30:00] local.ERROR: Call to undefined method App\Models\User::authentikasi() in /var/www/my-project/vendor/laravel/framework/src/Illuminate/Routing/Route.php:200
[stacktrace]
#0 /var/www/my-project/vendor/laravel/framework/src/Illuminate/Routing/Router.php(680): Illuminate\Routing\Route->run()
#1 /var/www/my-project/app/Http/Controllers/AuthController.php(42): App\Models\User::authentikasi()
#2 /var/www/my-project/vendor/laravel/framework/src/Illuminate/Routing/ControllerDispatcher.php(48): App\Http\Controllers\AuthController->login()
#3 /var/www/my-project/public/index.php(52): Illuminate\Foundation\Http\Kernel->handle()
#4 {main}
"#;
        let crash = parse_runtime_log_entry(log, Some("/var/www/my-project")).expect("Should parse with vendor filtering");
        assert_eq!(crash.error_type, "Error");
        assert_eq!(crash.message, "Call to undefined method App\\Models\\User::authentikasi()");
        assert_eq!(crash.file_path, "/var/www/my-project/app/Http/Controllers/AuthController.php");
        assert_eq!(crash.line_number, 42);
    }

    #[test]
    fn test_parse_php_fatal_uncaught_exception() {
        let log = "Fatal error: Uncaught Exception: Database connection lost in /var/www/my-project/app/Services/Db.php:28\nStack trace:\n#0 ...";
        let crash = parse_runtime_log_entry(log, None).expect("Should parse PHP fatal error");
        assert_eq!(crash.error_type, "Exception");
        assert_eq!(crash.message, "Database connection lost");
        assert_eq!(crash.file_path, "/var/www/my-project/app/Services/Db.php");
        assert_eq!(crash.line_number, 28);
    }

    #[test]
    fn test_parse_nodejs_error() {
        let log = "ReferenceError: token is not defined\n    at login (/path/to/server.js:25:9)";
        let crash = parse_runtime_log_entry(log, None).expect("Should parse Node.js error");
        assert_eq!(crash.error_type, "ReferenceError");
        assert_eq!(crash.message, "token is not defined");
        assert_eq!(crash.file_path, "/path/to/server.js");
        assert_eq!(crash.line_number, 25);
    }

    #[test]
    fn test_parse_nodejs_filter_node_modules() {
        let log = r#"TypeError: Cannot read properties of undefined (reading 'auth')
    at /app/node_modules/express/lib/router/layer.js:95:5
    at handleLogin (/app/src/controllers/auth.js:18:12)
    at /app/node_modules/express/lib/router/route.js:144:13
"#;
        let crash = parse_runtime_log_entry(log, Some("/app")).expect("Should filter node_modules");
        assert_eq!(crash.error_type, "TypeError");
        assert_eq!(crash.message, "Cannot read properties of undefined (reading 'auth')");
        assert_eq!(crash.file_path, "/app/src/controllers/auth.js");
        assert_eq!(crash.line_number, 18);
    }

    #[test]
    fn test_parse_python_traceback() {
        let log = r#"Traceback (most recent call last):
  File "/workspace/venv/lib/python3.10/site-packages/django/core/handlers/base.py", line 197, in get_response
    response = wrapped_callback(request, *callback_args, **callback_kwargs)
  File "/workspace/myapp/views.py", line 42, in login
    user = authenticate(username, password)
NameError: name 'user' is not defined
"#;
        let crash = parse_runtime_log_entry(log, Some("/workspace")).expect("Should parse Python traceback");
        assert_eq!(crash.error_type, "NameError");
        assert_eq!(crash.message, "name 'user' is not defined");
        assert_eq!(crash.file_path, "/workspace/myapp/views.py");
        assert_eq!(crash.line_number, 42);
        assert_eq!(crash.snippet, Some("user = authenticate(username, password)".to_string()));
    }

    #[test]
    fn test_parse_non_error_log() {
        let log = "[2026-11-11 16:30:00] local.INFO: User 123 logged in successfully";
        assert_eq!(parse_runtime_log_entry(log, None), None);
    }

    #[test]
    fn test_parse_all_vendor_frames_fallback() {
        let log = r#"[2026-11-11 16:30:00] local.ERROR: RuntimeException: Core error in /var/www/vendor/laravel/framework/src/Kernel.php:120
[stacktrace]
#0 /var/www/vendor/laravel/framework/src/Router.php(50): error()
#1 {main}
"#;
        let crash = parse_runtime_log_entry(log, Some("/var/www")).expect("Should fallback to first frame when all are vendor");
        assert_eq!(crash.error_type, "RuntimeException");
        assert_eq!(crash.message, "Core error");
        assert_eq!(crash.file_path, "/var/www/vendor/laravel/framework/src/Kernel.php");
        assert_eq!(crash.line_number, 120);
    }
}
