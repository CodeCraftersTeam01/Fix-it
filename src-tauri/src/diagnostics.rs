use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct CodeError {
    pub file_path: String,
    pub line_number: Option<usize>,
    pub error_type: String,
    pub raw_message: String,
    pub snippet: Option<String>,
    pub project_name: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum InspectionResult {
    Error(CodeError),
    Valid,
    Unsupported,
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

        // 3. Node.js check syntax (node -c): /path/file.js:2\n...\nSyntaxError: Unexpected token
        if let Some(first_line) = output.lines().next() {
            if let Some((fpath, lstr)) = first_line.trim().rsplit_once(':') {
                if let Ok(line_num) = lstr.parse::<usize>() {
                    let err_re = Regex::new(r"(?m)^([A-Za-z0-9_]*Error):\s*(.*)").ok()?;
                    if let Some(caps) = err_re.captures(output) {
                        let error_type = caps.get(1).map_or("SyntaxError", |m| m.as_str()).to_string();
                        let raw_message = caps.get(2).map_or("", |m| m.as_str()).to_string();
                        return Some(CodeError {
                            file_path: fpath.to_string(),
                            line_number: Some(line_num),
                            error_type,
                            raw_message,
                            snippet: None,
                            project_name: None,
                        });
                    }
                }
            }
        }

        // 4. Node/JS stack trace: ReferenceError: x is not defined at Object.<anonymous> (/path/file.js:15:3)
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

    /// Extract code snippet context around the error line
    pub fn extract_snippet(path: &Path, error_line: Option<usize>) -> Option<String> {
        let content = std::fs::read_to_string(path).ok()?;
        let lines: Vec<&str> = content.lines().collect();
        if lines.is_empty() {
            return None;
        }

        let target_line = error_line.unwrap_or(1);
        let start_line = if target_line > 5 { target_line - 5 } else { 1 };
        let end_line = std::cmp::min(target_line + 5, lines.len());

        let mut snippet = String::new();
        for i in start_line..=end_line {
            if i > 0 && i <= lines.len() {
                let marker = if i == target_line { ">" } else { " " };
                snippet.push_str(&format!("{} {:3} | {}\n", marker, i, lines[i - 1]));
            }
        }

        Some(snippet.trim_end().to_string())
    }

    /// Find a binary in local node_modules/.bin by walking up parent directories, or fallback to PATH
    pub fn find_local_bin(start_path: &Path, bin_name: &str) -> Option<PathBuf> {
        let mut curr = start_path.parent();
        while let Some(dir) = curr {
            let candidate = dir.join("node_modules").join(".bin").join(bin_name);
            if candidate.exists() {
                return Some(candidate);
            }
            curr = dir.parent();
        }

        if let Ok(path_var) = std::env::var("PATH") {
            for dir in std::env::split_paths(&path_var) {
                let candidate = dir.join(bin_name);
                if candidate.exists() {
                    return Some(candidate);
                }
            }
        }

        None
    }

    /// Check a single file for basic syntax issues based on its extension
    pub fn inspect_file(path: &Path) -> InspectionResult {
        let ext = match path.extension().and_then(|e| e.to_str()) {
            Some(e) => e.to_lowercase(),
            None => return InspectionResult::Unsupported,
        };
        let path_str = path.to_string_lossy().to_string();

        match ext.as_str() {
            "php" => {
                // Check with php -l if PHP is installed locally
                if let Ok(out) = std::process::Command::new("php").args(["-l", &path_str]).output() {
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    let stdout = String::from_utf8_lossy(&out.stdout);
                    let full_output = format!("{}\n{}", stdout, stderr);
                    if !out.status.success() || full_output.contains("Parse error") || full_output.contains("Fatal error") {
                        if let Some(mut err) = Self::parse_log_or_terminal_output(&full_output) {
                            err.snippet = Self::extract_snippet(path, err.line_number);
                            err.file_path = path_str;
                            return InspectionResult::Error(err);
                        }
                    } else {
                        return InspectionResult::Valid;
                    }
                }
                InspectionResult::Unsupported
            }
            "py" => {
                // Check with python3 -m py_compile
                if let Ok(out) = std::process::Command::new("python3").args(["-m", "py_compile", &path_str]).output() {
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    if !out.status.success() {
                        if let Some(mut err) = Self::parse_log_or_terminal_output(&stderr) {
                            err.snippet = Self::extract_snippet(path, err.line_number);
                            err.file_path = path_str;
                            return InspectionResult::Error(err);
                        }
                    } else {
                        return InspectionResult::Valid;
                    }
                }
                InspectionResult::Unsupported
            }
            "js" | "mjs" | "cjs" | "jsx" | "ts" | "tsx" => {
                // 1. Try oxlint if available (super fast ~5-20ms rust linter supporting JS/JSX/TS/TSX)
                if let Some(oxlint_bin) = Self::find_local_bin(path, "oxlint") {
                    if let Ok(out) = std::process::Command::new(&oxlint_bin)
                        .args(["-f", "json", "-D", "correctness", "-D", "no-undef", &path_str])
                        .output()
                    {
                        let stdout = String::from_utf8_lossy(&out.stdout);
                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&stdout) {
                            if let Some(diags) = v.get("diagnostics").and_then(|d| d.as_array()) {
                                // Find critical error diagnostics (prefer syntax/undef errors over unused vars)
                                let candidate = diags.iter().find(|d| {
                                    let sev = d.get("severity").and_then(|s| s.as_str()).unwrap_or("");
                                    let code = d.get("code").and_then(|c| c.as_str()).unwrap_or("");
                                    sev == "error" && !code.contains("no-unused-vars")
                                }).or_else(|| {
                                    diags.iter().find(|d| {
                                        d.get("severity").and_then(|s| s.as_str()) == Some("error")
                                    })
                                });

                                if let Some(d) = candidate {
                                    let msg = d.get("message").and_then(|m| m.as_str()).unwrap_or("Syntax / Linter error").to_string();
                                    let code = d.get("code").and_then(|c| c.as_str()).unwrap_or("LintError").to_string();
                                    let line = d.get("labels")
                                        .and_then(|l| l.as_array())
                                        .and_then(|arr| arr.first())
                                        .and_then(|lbl| lbl.get("span"))
                                        .and_then(|sp| sp.get("line"))
                                        .and_then(|l| l.as_u64())
                                        .map(|l| l as usize);

                                    let error_type = if msg.contains("Unexpected token") || msg.to_lowercase().contains("syntax") {
                                        "SyntaxError".to_string()
                                    } else if code.contains("no-undef") {
                                        "ReferenceError".to_string()
                                    } else {
                                        code
                                    };

                                    return InspectionResult::Error(CodeError {
                                        file_path: path_str.clone(),
                                        line_number: line,
                                        error_type,
                                        raw_message: msg,
                                        snippet: Self::extract_snippet(path, line),
                                        project_name: None,
                                    });
                                } else {
                                    return InspectionResult::Valid;
                                }
                            }
                        }
                    }
                }

                // 2. Fallback to node -c for plain JavaScript
                if matches!(ext.as_str(), "js" | "mjs" | "cjs") {
                    if let Ok(out) = std::process::Command::new("node").args(["-c", &path_str]).output() {
                        let stderr = String::from_utf8_lossy(&out.stderr);
                        if !out.status.success() {
                            if let Some(mut err) = Self::parse_log_or_terminal_output(&stderr) {
                                err.snippet = Self::extract_snippet(path, err.line_number);
                                err.file_path = path_str;
                                return InspectionResult::Error(err);
                            }
                        } else {
                            return InspectionResult::Valid;
                        }
                    }
                }

                InspectionResult::Unsupported
            }
            "json" => {
                if let Ok(content) = std::fs::read_to_string(path) {
                    if let Err(e) = serde_json::from_str::<serde_json::Value>(&content) {
                        return InspectionResult::Error(CodeError {
                            file_path: path_str.clone(),
                            line_number: Some(e.line()),
                            error_type: "JsonSyntaxError".to_string(),
                            raw_message: e.to_string(),
                            snippet: Self::extract_snippet(path, Some(e.line())),
                            project_name: None,
                        });
                    } else {
                        return InspectionResult::Valid;
                    }
                }
                InspectionResult::Unsupported
            }
            _ => InspectionResult::Unsupported,
        }
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

    #[test]
    fn test_parse_node_check_syntax_error() {
        let sample = "/Users/student/Herd/FixIt/server.js:2\n  return 1;\n         ^\n\nSyntaxError: Unexpected number\n    at wrapSafe (node:internal/modules/cjs/loader:1866:18)";
        let parsed = DiagnosticsParser::parse_log_or_terminal_output(sample);

        assert!(parsed.is_some());
        let err = parsed.unwrap();
        assert_eq!(err.error_type, "SyntaxError");
        assert_eq!(err.line_number, Some(2));
        assert!(err.file_path.ends_with("server.js"));
        assert_eq!(err.raw_message, "Unexpected number");
    }

    #[test]
    fn test_inspect_file_json() {
        let temp_dir = std::env::temp_dir();
        let valid_json_path = temp_dir.join("fixit_test_valid.json");
        std::fs::write(&valid_json_path, r#"{"name": "test", "active": true}"#).unwrap();

        let result = DiagnosticsParser::inspect_file(&valid_json_path);
        assert_eq!(result, InspectionResult::Valid);

        let invalid_json_path = temp_dir.join("fixit_test_invalid.json");
        std::fs::write(&invalid_json_path, r#"{"name": "test", active: true}"#).unwrap();

        let result_err = DiagnosticsParser::inspect_file(&invalid_json_path);
        match result_err {
            InspectionResult::Error(err) => {
                assert_eq!(err.error_type, "JsonSyntaxError");
                assert_eq!(err.line_number, Some(1));
            }
            _ => panic!("Expected InspectionResult::Error"),
        }

        let _ = std::fs::remove_file(valid_json_path);
        let _ = std::fs::remove_file(invalid_json_path);
    }

    #[test]
    fn test_inspect_file_unsupported_extension() {
        let temp_dir = std::env::temp_dir();
        let txt_path = temp_dir.join("fixit_test.txt");
        std::fs::write(&txt_path, "plain text file").unwrap();

        let result = DiagnosticsParser::inspect_file(&txt_path);
        assert_eq!(result, InspectionResult::Unsupported);

        let _ = std::fs::remove_file(txt_path);
    }

    #[test]
    fn test_inspect_file_jsx_error_detection() {
        let temp_dir = std::env::temp_dir();
        let syntax_err_path = temp_dir.join("fixit_test_syntax_err.jsx");
        std::fs::write(&syntax_err_path, "const test = ( => { return 1; };").unwrap();

        // If oxlint is available, it detects the syntax error; otherwise it gracefully returns Unsupported
        let result = DiagnosticsParser::inspect_file(&syntax_err_path);
        if DiagnosticsParser::find_local_bin(&syntax_err_path, "oxlint").is_some() {
            match result {
                InspectionResult::Error(err) => {
                    assert!(err.error_type.contains("Syntax") || err.raw_message.contains("Unexpected token"));
                }
                _ => panic!("Expected InspectionResult::Error with oxlint present"),
            }
        }

        let _ = std::fs::remove_file(syntax_err_path);
    }
}

