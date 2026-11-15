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

    /// Find an ancestor file (like Cargo.toml, package.json, etc.)
    pub fn find_ancestor_file(start: &Path, file_name: &str) -> Option<PathBuf> {
        let mut curr = start.parent();
        while let Some(dir) = curr {
            let candidate = dir.join(file_name);
            if candidate.exists() {
                return Some(candidate);
            }
            curr = dir.parent();
        }
        None
    }

    /// Extract project root name for multi-IDE and multi-workspace distinction
    pub fn extract_project_name(path: &Path) -> Option<String> {
        let mut curr = path.parent();
        while let Some(dir) = curr {
            if dir.join("Cargo.toml").exists()
                || dir.join("package.json").exists()
                || dir.join("composer.json").exists()
                || dir.join(".git").exists()
            {
                return dir.file_name().map(|f| f.to_string_lossy().to_string());
            }
            curr = dir.parent();
        }
        path.parent()
            .and_then(|p| p.file_name())
            .map(|f| f.to_string_lossy().to_string())
    }

    /// Find typescript compiler library from project, IDE app bundles, or global node_modules
    pub fn find_typescript_lib(start_path: &Path) -> Option<PathBuf> {
        // 1. Walk up from project node_modules
        let mut curr = start_path.parent();
        while let Some(dir) = curr {
            let candidate = dir.join("node_modules").join("typescript").join("lib").join("typescript.js");
            if candidate.exists() {
                return Some(candidate);
            }
            curr = dir.parent();
        }

        // 2. Antigravity IDE built-in typescript
        let ag_candidate = PathBuf::from("/Applications/Antigravity IDE.app/Contents/Resources/app/extensions/node_modules/typescript/lib/typescript.js");
        if ag_candidate.exists() {
            return Some(ag_candidate);
        }

        let ag2_candidate = PathBuf::from("/Applications/Antigravity.app/Contents/Resources/app/extensions/node_modules/typescript/lib/typescript.js");
        if ag2_candidate.exists() {
            return Some(ag2_candidate);
        }

        // 3. VS Code built-in typescript
        let vscode_candidate = PathBuf::from("/Applications/Visual Studio Code.app/Contents/Resources/app/extensions/node_modules/typescript/lib/typescript.js");
        if vscode_candidate.exists() {
            return Some(vscode_candidate);
        }

        // 4. Cursor built-in typescript
        let cursor_candidate = PathBuf::from("/Applications/Cursor.app/Contents/Resources/app/extensions/node_modules/typescript/lib/typescript.js");
        if cursor_candidate.exists() {
            return Some(cursor_candidate);
        }

        None
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
        let proj_name = Self::extract_project_name(path);

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
                            err.project_name = proj_name;
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
                            err.project_name = proj_name;
                            return InspectionResult::Error(err);
                        }
                    } else {
                        return InspectionResult::Valid;
                    }
                }
                InspectionResult::Unsupported
            }
            "js" | "mjs" | "cjs" | "jsx" | "ts" | "tsx" => {
                // 1. Try esbuild if available (ultra-fast 5-15ms parser for TS/TSX/JSX/JS)
                if let Some(esbuild_bin) = Self::find_local_bin(path, "esbuild") {
                    if let Ok(out) = std::process::Command::new(&esbuild_bin)
                        .args([&path_str, "--outfile=/dev/null"])
                        .output()
                    {
                        if !out.status.success() {
                            let stderr = String::from_utf8_lossy(&out.stderr);
                            let esbuild_re = Regex::new(r"(?s)✘\s+\[ERROR\]\s+(.*?)\n\s+.*?:(\d+):(\d+):").ok();
                            if let Some(caps) = esbuild_re.and_then(|re| re.captures(&stderr)) {
                                let msg = caps.get(1).map_or("Syntax error", |m| m.as_str()).trim().to_string();
                                let line = caps.get(2).and_then(|m| m.as_str().parse::<usize>().ok());
                                return InspectionResult::Error(CodeError {
                                    file_path: path_str,
                                    line_number: line,
                                    error_type: "SyntaxError".to_string(),
                                    raw_message: msg,
                                    snippet: Self::extract_snippet(path, line),
                                    project_name: proj_name,
                                });
                            }
                        } else {
                            return InspectionResult::Valid;
                        }
                    }
                }

                // 2. Try oxlint if available (super fast rust linter supporting JS/JSX/TS/TSX)
                if let Some(oxlint_bin) = Self::find_local_bin(path, "oxlint") {
                    if let Ok(out) = std::process::Command::new(&oxlint_bin)
                        .args(["-f", "json", "-D", "correctness", "-D", "no-undef", &path_str])
                        .output()
                    {
                        let stdout = String::from_utf8_lossy(&out.stdout);
                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&stdout) {
                            if let Some(diags) = v.get("diagnostics").and_then(|d| d.as_array()) {
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
                                        file_path: path_str,
                                        line_number: line,
                                        error_type,
                                        raw_message: msg,
                                        snippet: Self::extract_snippet(path, line),
                                        project_name: proj_name,
                                    });
                                } else {
                                    return InspectionResult::Valid;
                                }
                            }
                        }
                    }
                }

                // 3. Try TypeScript AST parser via Node.js
                if let Some(ts_lib) = Self::find_typescript_lib(path) {
                    let ts_script = r#"
const ts = require(process.argv[1]);
const fs = require('fs');
const fp = process.argv[2];
try {
  const code = fs.readFileSync(fp, 'utf8');
  const isTsx = fp.endsWith('.tsx') || fp.endsWith('.jsx');
  const kind = fp.endsWith('.tsx') ? ts.ScriptKind.TSX : (fp.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.TS);
  const sf = ts.createSourceFile(fp, code, ts.ScriptTarget.Latest, true, kind);
  if (sf.parseDiagnostics && sf.parseDiagnostics.length > 0) {
    const d = sf.parseDiagnostics[0];
    const pos = sf.getLineAndCharacterOfPosition(d.start);
    console.log(JSON.stringify({
      error: ts.flattenDiagnosticMessageText(d.messageText, ' '),
      line: pos.line + 1
    }));
    process.exit(1);
  }
  process.exit(0);
} catch (e) {
  process.exit(0);
}
"#;
                    if let Ok(out) = std::process::Command::new("node")
                        .args(["-e", ts_script, &ts_lib.to_string_lossy(), &path_str])
                        .output()
                    {
                        if !out.status.success() {
                            let stdout = String::from_utf8_lossy(&out.stdout);
                            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&stdout) {
                                if let Some(err_text) = v.get("error").and_then(|s| s.as_str()) {
                                    let line = v.get("line").and_then(|l| l.as_u64()).map(|l| l as usize);
                                    return InspectionResult::Error(CodeError {
                                        file_path: path_str,
                                        line_number: line,
                                        error_type: "SyntaxError".to_string(),
                                        raw_message: err_text.to_string(),
                                        snippet: Self::extract_snippet(path, line),
                                        project_name: proj_name,
                                    });
                                }
                            }
                        } else {
                            return InspectionResult::Valid;
                        }
                    }
                }

                // 4. Fallback to node -c for plain JavaScript
                if matches!(ext.as_str(), "js" | "mjs" | "cjs") {
                    if let Ok(out) = std::process::Command::new("node").args(["-c", &path_str]).output() {
                        let stderr = String::from_utf8_lossy(&out.stderr);
                        if !out.status.success() {
                            if let Some(mut err) = Self::parse_log_or_terminal_output(&stderr) {
                                err.snippet = Self::extract_snippet(path, err.line_number);
                                err.file_path = path_str;
                                err.project_name = proj_name;
                                return InspectionResult::Error(err);
                            }
                        } else {
                            return InspectionResult::Valid;
                        }
                    }
                }

                InspectionResult::Unsupported
            }
            "rs" => {
                // 1. If inside a Cargo project, check with cargo check --message-format=json
                if let Some(cargo_toml) = Self::find_ancestor_file(path, "Cargo.toml") {
                    if let Ok(out) = std::process::Command::new("cargo")
                        .args(["check", "--message-format=json", "--manifest-path", &cargo_toml.to_string_lossy()])
                        .output()
                    {
                        let stdout = String::from_utf8_lossy(&out.stdout);
                        for line in stdout.lines() {
                            if let Ok(val) = serde_json::from_str::<serde_json::Value>(line) {
                                if val.get("reason").and_then(|r| r.as_str()) == Some("compiler-message") {
                                    if let Some(msg) = val.get("message") {
                                        if msg.get("level").and_then(|l| l.as_str()) == Some("error") {
                                            let err_msg = msg.get("message").and_then(|m| m.as_str()).unwrap_or("Compilation error").to_string();
                                            let mut line_no = None;
                                            let mut is_matched = false;

                                            if let Some(spans) = msg.get("spans").and_then(|s| s.as_array()) {
                                                if let Some(span) = spans.iter().find(|s| s.get("is_primary").and_then(|p| p.as_bool()).unwrap_or(false)) {
                                                    line_no = span.get("line_start").and_then(|l| l.as_u64()).map(|l| l as usize);
                                                    if let Some(fname) = span.get("file_name").and_then(|f| f.as_str()) {
                                                        if path_str.ends_with(fname) || fname.ends_with(&path_str) {
                                                            is_matched = true;
                                                        }
                                                    }
                                                }
                                            }

                                            if is_matched {
                                                return InspectionResult::Error(CodeError {
                                                    file_path: path_str,
                                                    line_number: line_no,
                                                    error_type: "RustCompileError".to_string(),
                                                    raw_message: err_msg,
                                                    snippet: Self::extract_snippet(path, line_no),
                                                    project_name: proj_name,
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        if out.status.success() {
                            return InspectionResult::Valid;
                        }
                    }
                }

                // 2. Standalone rustc compiler check
                if let Ok(out) = std::process::Command::new("rustc")
                    .args(["--crate-type=lib", "--error-format=json", "--emit=metadata", "-o", "/dev/null", &path_str])
                    .output()
                {
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    for line in stderr.lines() {
                        if let Ok(msg) = serde_json::from_str::<serde_json::Value>(line) {
                            if msg.get("level").and_then(|l| l.as_str()) == Some("error") {
                                let err_msg = msg.get("message").and_then(|m| m.as_str()).unwrap_or("Rust error").to_string();
                                if err_msg.starts_with("aborting due to") {
                                    continue;
                                }
                                let mut line_no = None;
                                if let Some(spans) = msg.get("spans").and_then(|s| s.as_array()) {
                                    if let Some(span) = spans.iter().find(|s| s.get("is_primary").and_then(|p| p.as_bool()).unwrap_or(false)) {
                                        line_no = span.get("line_start").and_then(|l| l.as_u64()).map(|l| l as usize);
                                    }
                                }
                                return InspectionResult::Error(CodeError {
                                    file_path: path_str,
                                    line_number: line_no,
                                    error_type: "RustCompileError".to_string(),
                                    raw_message: err_msg,
                                    snippet: Self::extract_snippet(path, line_no),
                                    project_name: proj_name,
                                });
                            }
                        }
                    }
                    if out.status.success() {
                        return InspectionResult::Valid;
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
                            project_name: proj_name,
                        });
                    } else {
                        return InspectionResult::Valid;
                    }
                }
                InspectionResult::Unsupported
            }
            "html" | "htm" | "vue" | "svelte" => {
                if let Ok(content) = std::fs::read_to_string(path) {
                    // 1. Extract and check <script> tags
                    let script_re = Regex::new(r"(?is)<script\b([^>]*)>(.*?)</script>").ok();
                    if let Some(re) = script_re {
                        for caps in re.captures_iter(&content) {
                            let attrs = caps.get(1).map_or("", |m| m.as_str());
                            // Skip external scripts (<script src="...">) or JSON scripts
                            if attrs.contains("src=")
                                || attrs.contains("type=\"application/json\"")
                                || attrs.contains("type=\"application/ld+json\"")
                            {
                                continue;
                            }
                            if let Some(script_match) = caps.get(2) {
                                let script_code = script_match.as_str();
                                if script_code.trim().is_empty() {
                                    continue;
                                }
                                // Calculate starting line number by counting newlines before this script content
                                let pre_script = &content[..script_match.start()];
                                let line_offset = pre_script.chars().filter(|&c| c == '\n').count();

                                // Check script syntax using Node.js vm.Script
                                let check_script = r#"
const fs = require('fs');
const vm = require('vm');
const lineOffset = parseInt(process.argv[1], 10) || 0;
const code = fs.readFileSync(0, 'utf8');
try {
  new vm.Script(code, { lineOffset });
  process.exit(0);
} catch (e) {
  let line = lineOffset + 1;
  if (e.stack) {
    const m = e.stack.match(/:(\d+)(?::\d+)?\n/);
    if (m) line = parseInt(m[1], 10);
  }
  console.log(JSON.stringify({ error: e.message || 'SyntaxError', line }));
  process.exit(1);
}
"#;
                                if let Ok(mut child) = std::process::Command::new("node")
                                    .args(["-e", check_script, &line_offset.to_string()])
                                    .stdin(std::process::Stdio::piped())
                                    .stdout(std::process::Stdio::piped())
                                    .stderr(std::process::Stdio::null())
                                    .spawn()
                                {
                                    use std::io::Write;
                                    if let Some(mut stdin) = child.stdin.take() {
                                        let _ = stdin.write_all(script_code.as_bytes());
                                    }
                                    if let Ok(out) = child.wait_with_output() {
                                        if !out.status.success() {
                                            let stdout = String::from_utf8_lossy(&out.stdout);
                                            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&stdout) {
                                                if let Some(err_text) = v.get("error").and_then(|s| s.as_str()) {
                                                    let line = v.get("line").and_then(|l| l.as_u64()).map(|l| l as usize);
                                                    return InspectionResult::Error(CodeError {
                                                        file_path: path_str,
                                                        line_number: line,
                                                        error_type: "SyntaxError".to_string(),
                                                        raw_message: err_text.to_string(),
                                                        snippet: Self::extract_snippet(path, line),
                                                        project_name: proj_name,
                                                    });
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // 2. Check for unclosed <script> tag if developer is currently writing a script block
                    let open_scripts = content.matches("<script").count();
                    let close_scripts = content.matches("</script>").count();
                    if open_scripts > close_scripts {
                        let line = content
                            .lines()
                            .enumerate()
                            .filter(|(_, l)| l.contains("<script"))
                            .last()
                            .map(|(idx, _)| idx + 1);
                        return InspectionResult::Error(CodeError {
                            file_path: path_str,
                            line_number: line,
                            error_type: "ParseError".to_string(),
                            raw_message: "Tag <script> belum ditutup dengan </script>".to_string(),
                            snippet: Self::extract_snippet(path, line),
                            project_name: proj_name,
                        });
                    }

                    return InspectionResult::Valid;
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

    #[test]
    fn test_inspect_file_html_script_error() {
        let temp_dir = std::env::temp_dir();
        let html_err_path = temp_dir.join("fixit_test_html_err.html");
        let html_content = r#"<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <h1>Hello</h1>
  <script>
    function broken() {
      messageDiv.innerHTML = '<div class="err
    }
  </script>
</body>
</html>"#;
        std::fs::write(&html_err_path, html_content).unwrap();

        let result = DiagnosticsParser::inspect_file(&html_err_path);
        match result {
            InspectionResult::Error(err) => {
                assert_eq!(err.error_type, "SyntaxError");
                assert_eq!(err.line_number, Some(8));
                assert!(err.snippet.is_some());
            }
            other => panic!("Expected InspectionResult::Error, got {:?}", other),
        }

        let _ = std::fs::remove_file(html_err_path);
    }

    #[test]
    fn test_inspect_file_html_valid() {
        let temp_dir = std::env::temp_dir();
        let html_valid_path = temp_dir.join("fixit_test_html_valid.html");
        let html_content = r#"<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <script>
    console.log("valid code");
  </script>
</body>
</html>"#;
        std::fs::write(&html_valid_path, html_content).unwrap();

        let result = DiagnosticsParser::inspect_file(&html_valid_path);
        assert_eq!(result, InspectionResult::Valid);

        let _ = std::fs::remove_file(html_valid_path);
    }
}

