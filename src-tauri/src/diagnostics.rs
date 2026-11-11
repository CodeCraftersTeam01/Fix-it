use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct CodeError {
    pub file_path: String,
    pub line_number: Option<usize>,
    pub error_type: String,
    pub raw_message: String,
    pub snippet: Option<String>,
    pub project_name: Option<String>,
}

pub struct DiagnosticsParser;

impl DiagnosticsParser {
    /// Parse common language error strings (PHP, Python, JavaScript/Node, Rust/Go)
    pub fn parse_log_or_terminal_output(output: &str) -> Option<CodeError> {
        // 1. PHP parse error: Parse error: syntax error, ... in /path/file.php on line 42
        let php_re = Regex::new(r"(?i)(Parse error|Fatal error|Warning):\s*(.*?)\s*in\s+(.*?)\s+on\s+line\s+(\d+)").ok()?;
        if let Some(caps) = php_re.captures(output) {
            let error_type = caps.get(1).map_or("Error", |m| m.as_str()).to_string();
            let raw_message = caps.get(2).map_or("", |m| m.as_str()).to_string();
            let file_path = caps.get(3).map_or("", |m| m.as_str()).to_string();
            let line_number = caps.get(4).and_then(|m| m.as_str().parse::<usize>().ok());

            return Some(CodeError {
                file_path,
                line_number,
                error_type,
                raw_message,
                snippet: None,
                project_name: None,
            });
        }

        // 2. Python traceback: File "app.py", line 12, in ... ZeroDivisionError: ...
        let py_re = Regex::new(r#"File\s+"(.*?)",\s+line\s+(\d+)(?:,\s+in\s+.*)?\n\s*(?:.*?\n)?\s*([A-Za-z0-9_]+Error):\s*(.*)"#).ok()?;
        if let Some(caps) = py_re.captures(output) {
            let file_path = caps.get(1).map_or("", |m| m.as_str()).to_string();
            let line_number = caps.get(2).and_then(|m| m.as_str().parse::<usize>().ok());
            let error_type = caps.get(3).map_or("Error", |m| m.as_str()).to_string();
            let raw_message = caps.get(4).map_or("", |m| m.as_str()).to_string();

            return Some(CodeError {
                file_path,
                line_number,
                error_type,
                raw_message,
                snippet: None,
                project_name: None,
            });
        }

        // 3. Node/JS stack trace: ReferenceError: x is not defined at Object.<anonymous> (/path/file.js:15:3)
        let js_re = Regex::new(r"(?i)([A-Za-z0-9_]*Error):\s*(.*?)\s+at\s+.*?\((.*?):(\d+):(\d+)\)").ok()?;
        if let Some(caps) = js_re.captures(output) {
            let error_type = caps.get(1).map_or("Error", |m| m.as_str()).to_string();
            let raw_message = caps.get(2).map_or("", |m| m.as_str()).to_string();
            let file_path = caps.get(3).map_or("", |m| m.as_str()).to_string();
            let line_number = caps.get(4).and_then(|m| m.as_str().parse::<usize>().ok());

            return Some(CodeError {
                file_path,
                line_number,
                error_type,
                raw_message,
                snippet: None,
                project_name: None,
            });
        }

        None
    }

    /// Check a single file for basic syntax issues based on its extension
    pub fn inspect_file(path: &Path) -> Option<CodeError> {
        let ext = path.extension()?.to_str()?;
        let path_str = path.to_string_lossy().to_string();

        match ext {
            "php" => {
                // Check with php -l if PHP is installed locally
                if let Ok(out) = std::process::Command::new("php").args(["-l", &path_str]).output() {
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    let stdout = String::from_utf8_lossy(&out.stdout);
                    let full_output = format!("{}\n{}", stdout, stderr);
                    if !out.status.success() || full_output.contains("Parse error") || full_output.contains("Fatal error") {
                        return Self::parse_log_or_terminal_output(&full_output);
                    }
                }
            }
            "py" => {
                // Check with python3 -m py_compile
                if let Ok(out) = std::process::Command::new("python3").args(["-m", "py_compile", &path_str]).output() {
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    if !out.status.success() {
                        return Self::parse_log_or_terminal_output(&stderr);
                    }
                }
            }
            "json" => {
                if let Ok(content) = std::fs::read_to_string(path) {
                    if let Err(e) = serde_json::from_str::<serde_json::Value>(&content) {
                        return Some(CodeError {
                            file_path: path_str,
                            line_number: Some(e.line()),
                            error_type: "JsonSyntaxError".to_string(),
                            raw_message: e.to_string(),
                            snippet: None,
                            project_name: None,
                        });
                    }
                }
            }
            _ => {}
        }

        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_php_syntax_error() {
        let sample = "Parse error: syntax error, unexpected token ';', expecting ')' in /Users/student/Herd/FixIt/app/Http/Controllers/StudentController.php on line 28";
        let parsed = DiagnosticsParser::parse_log_or_terminal_output(sample);

        assert!(parsed.is_some());
        let err = parsed.unwrap();
        assert_eq!(err.error_type, "Parse error");
        assert_eq!(err.line_number, Some(28));
        assert!(err.file_path.ends_with("StudentController.php"));
        assert_eq!(err.raw_message, "syntax error, unexpected token ';', expecting ')'");
    }

    #[test]
    fn test_parse_js_reference_error() {
        let sample = "ReferenceError: calculateTotal is not defined\n    at Object.<anonymous> (/Users/student/src/cart.js:15:3)";
        let parsed = DiagnosticsParser::parse_log_or_terminal_output(sample);

        assert!(parsed.is_some());
        let err = parsed.unwrap();
        assert_eq!(err.error_type, "ReferenceError");
        assert_eq!(err.line_number, Some(15));
        assert!(err.file_path.ends_with("cart.js"));
    }
}

