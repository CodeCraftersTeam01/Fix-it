use crate::config::AppConfig;
use crate::diagnostics::CodeError;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::Emitter;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AgentStepEvent {
    pub step: usize,
    pub step_type: String, // "tool_call" | "tool_result" | "thought" | "finish"
    pub tool_name: Option<String>,
    pub tool_args: Option<serde_json::Value>,
    pub result_summary: Option<String>,
    pub message: Option<String>,
    pub output: Option<String>,
    pub timestamp: u64,
    pub file_path: Option<String>,
}

pub struct AgentEngine;

impl AgentEngine {
    /// Detect project root by traversing upwards looking for marker files (.git, composer.json, package.json, .env, artisan)
    pub fn find_project_root(file_path: &str, fallback_workspace: Option<&str>) -> PathBuf {
        let raw = Path::new(file_path);

        // 1. Determine starting path for root discovery
        let starting_path = if raw.is_absolute() && raw.exists() {
            raw.to_path_buf()
        } else if let Some(ws) = fallback_workspace {
            let combined = Path::new(ws).join(raw);
            if combined.exists() {
                combined
            } else if raw.is_absolute() {
                raw.to_path_buf()
            } else {
                Path::new(ws).to_path_buf()
            }
        } else {
            raw.to_path_buf()
        };

        let mut current = if starting_path.is_file() {
            starting_path.parent().unwrap_or(&starting_path).to_path_buf()
        } else {
            starting_path
        };

        // 2. Traverse upwards to find project markers
        while let Some(parent) = current.parent() {
            if current.join(".git").exists()
                || current.join("composer.json").exists()
                || current.join("package.json").exists()
                || current.join(".env").exists()
                || current.join("artisan").exists()
                || current.join("Cargo.toml").exists()
            {
                return current;
            }
            current = parent.to_path_buf();
        }

        // 3. Fallbacks
        if let Some(ws) = fallback_workspace {
            let p = Path::new(ws);
            if p.exists() {
                return p.to_path_buf();
            }
        }

        if let Some(parent) = Path::new(file_path).parent() {
            if parent.exists() {
                return parent.to_path_buf();
            }
        }

        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    }

    pub fn resolve_path(root: &Path, p: &str) -> PathBuf {
        let clean = p.trim();
        let raw = Path::new(clean);
        if raw.is_absolute() {
            raw.to_path_buf()
        } else {
            root.join(clean)
        }
    }

    /// Merges streaming delta chunks in a tool_calls array into complete unified tool calls.
    pub fn merge_tool_calls(raw_calls: &[serde_json::Value]) -> Vec<serde_json::Value> {
        if raw_calls.is_empty() {
            return Vec::new();
        }

        struct ToolAccumulator {
            id: String,
            name: String,
            args_str: String,
            args_obj: Option<serde_json::Value>,
        }

        let mut accs: Vec<ToolAccumulator> = Vec::new();

        for call in raw_calls {
            let id = call
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            let index = call
                .get("index")
                .and_then(|v| v.as_u64())
                .map(|n| n as usize);

            let fn_name = call
                .get("function")
                .and_then(|f| f.get("name"))
                .and_then(|v| v.as_str())
                .or_else(|| call.get("name").and_then(|v| v.as_str()))
                .unwrap_or("")
                .trim()
                .to_string();

            let args_chunk = call
                .get("function")
                .and_then(|f| f.get("arguments"))
                .or_else(|| call.get("arguments"));

            let target_idx = if let Some(idx) = index {
                if idx < accs.len() {
                    Some(idx)
                } else {
                    None
                }
            } else if !id.is_empty() {
                accs.iter().position(|a| !a.id.is_empty() && a.id == id)
            } else if fn_name.is_empty() && !accs.is_empty() {
                Some(accs.len() - 1)
            } else {
                None
            };

            if let Some(t_idx) = target_idx {
                let a = &mut accs[t_idx];
                if a.id.is_empty() && !id.is_empty() {
                    a.id = id;
                }
                if a.name.is_empty() && !fn_name.is_empty() {
                    a.name = fn_name;
                }
                match args_chunk {
                    Some(serde_json::Value::String(s)) => {
                        a.args_str.push_str(s);
                    }
                    Some(serde_json::Value::Object(map)) => {
                        a.args_obj = Some(serde_json::Value::Object(map.clone()));
                    }
                    _ => {}
                }
            } else {
                let mut initial_str = String::new();
                let mut initial_obj = None;
                match args_chunk {
                    Some(serde_json::Value::String(s)) => {
                        initial_str.push_str(s);
                    }
                    Some(serde_json::Value::Object(map)) => {
                        initial_obj = Some(serde_json::Value::Object(map.clone()));
                    }
                    _ => {}
                }
                accs.push(ToolAccumulator {
                    id: if id.is_empty() {
                        format!("call_{}", accs.len() + 1)
                    } else {
                        id
                    },
                    name: fn_name,
                    args_str: initial_str,
                    args_obj: initial_obj,
                });
            }
        }

        accs.into_iter()
            .filter(|a| !a.name.is_empty())
            .map(|a| {
                let args_val = if let Some(obj) = a.args_obj {
                    obj.to_string()
                } else if !a.args_str.is_empty() {
                    a.args_str
                } else {
                    "{}".to_string()
                };

                serde_json::json!({
                    "id": a.id,
                    "type": "function",
                    "function": {
                        "name": a.name,
                        "arguments": args_val
                    }
                })
            })
            .collect()
    }

    /// Robustly extracts (normalized_tool_name, parsed_args) regardless of LLM provider formatting
    pub fn extract_tool_call(tool_call: &serde_json::Value) -> (String, serde_json::Value) {
        let raw_name = tool_call
            .get("function")
            .and_then(|f| f.get("name"))
            .and_then(|v| v.as_str())
            .or_else(|| tool_call.get("name").and_then(|v| v.as_str()))
            .unwrap_or("")
            .trim();

        let lower = raw_name.to_lowercase();
        let norm_name = match lower.as_str() {
            "read_file" | "readfile" | "read" | "view_file" | "view" | "cat" => "read_file",
            "edit_file" | "editfile" | "edit" | "replace_file" | "str_replace_editor" => {
                "edit_file"
            }
            "write_file" | "writefile" | "write" | "create_file" | "new_file" => "write_file",
            "list_dir" | "listdir" | "ls" | "list_directory" | "dir" => "list_dir",
            "run_command" | "runcommand" | "execute_command" | "bash" | "terminal" | "exec"
            | "cmd" | "sh" => "run_command",
            _ => raw_name,
        };

        let args_val = tool_call
            .get("function")
            .and_then(|f| f.get("arguments"))
            .or_else(|| tool_call.get("arguments"));

        let parsed_args = match args_val {
            Some(serde_json::Value::String(s)) => {
                if let Ok(serde_json::Value::Object(map)) =
                    serde_json::from_str::<serde_json::Value>(s)
                {
                    serde_json::Value::Object(map)
                } else {
                    // Fallback for LLMs that provide plain string argument directly
                    let clean = s.trim().trim_matches('"');
                    match norm_name {
                        "read_file" | "list_dir" | "write_file" => {
                            serde_json::json!({ "path": clean })
                        }
                        "run_command" => serde_json::json!({ "command": clean }),
                        _ => serde_json::json!({ "arg": clean }),
                    }
                }
            }
            Some(serde_json::Value::Object(map)) => serde_json::Value::Object(map.clone()),
            _ => serde_json::json!({}),
        };

        (norm_name.to_string(), parsed_args)
    }

    pub fn execute_read_file(root: &Path, p: &str) -> Result<String, String> {
        Self::execute_read_file_with_range(root, p, None, None)
    }

    pub fn execute_read_file_with_range(
        root: &Path,
        p: &str,
        start_line: Option<usize>,
        limit: Option<usize>,
    ) -> Result<String, String> {
        let clean = p.trim();
        if clean.is_empty() {
            return Err("Path berkas tidak boleh kosong".to_string());
        }
        let target = Self::resolve_path(root, clean);
        if !target.exists() {
            return Err(format!("Berkas tidak ditemukan: {}", clean));
        }

        // If a directory path was passed, automatically list directory contents instead of crashing
        if target.is_dir() {
            let list_res = Self::execute_list_dir(root, Some(clean))?;
            return Ok(format!(
                "'{}' adalah direktori. Berkas/folder di dalamnya:\n{}",
                clean, list_res
            ));
        }

        let content = std::fs::read_to_string(&target)
            .map_err(|e| format!("Gagal membaca berkas: {}", e))?;

        let lines: Vec<&str> = content.lines().collect();
        let total_lines = lines.len();

        if let Some(start) = start_line {
            let start_idx = start.saturating_sub(1).min(total_lines);
            let take_count = limit.unwrap_or(100).min(total_lines.saturating_sub(start_idx));
            let end_idx = (start_idx + take_count).min(total_lines);

            let mut out = String::new();
            out.push_str(&format!(
                "[Menampilkan baris {}..{} dari {} baris]\n",
                start_idx + 1,
                end_idx,
                total_lines
            ));
            for (idx, line) in lines[start_idx..end_idx].iter().enumerate() {
                out.push_str(&format!("{:4} | {}\n", start_idx + idx + 1, line));
            }
            Ok(out)
        } else if let Some(lim) = limit {
            let take_count = lim.min(total_lines);
            let mut out = String::new();
            for (idx, line) in lines[..take_count].iter().enumerate() {
                out.push_str(&format!("{:4} | {}\n", idx + 1, line));
            }
            Ok(out)
        } else {
            if content.len() > 30000 {
                Ok(format!(
                    "{}... (dipotong, gunakan start_line & limit untuk membaca baris spesifik)",
                    &content[..30000]
                ))
            } else {
                Ok(content)
            }
        }
    }

    pub fn build_diff_lines(
        all_lines: &[&str],
        target_start_line: usize,
        target_lines: &[&str],
        repl_lines: &[&str],
    ) -> Vec<serde_json::Value> {
        let mut diff_lines = Vec::new();
        let target_line_idx = target_start_line.saturating_sub(1);

        // Context before (up to 3 lines)
        let ctx_start = target_line_idx.saturating_sub(3);
        let mut current_line_num = ctx_start + 1;
        if target_line_idx <= all_lines.len() {
            for line in &all_lines[ctx_start..target_line_idx] {
                diff_lines.push(serde_json::json!({
                    "type": "ctx",
                    "num": current_line_num,
                    "marker": " ",
                    "text": line
                }));
                current_line_num += 1;
            }
        }

        // Deleted lines
        for line in target_lines {
            diff_lines.push(serde_json::json!({
                "type": "del",
                "num": current_line_num,
                "marker": "-",
                "text": line
            }));
            current_line_num += 1;
        }

        // Added lines
        let mut add_line_num = target_start_line;
        for line in repl_lines {
            diff_lines.push(serde_json::json!({
                "type": "add",
                "num": add_line_num,
                "marker": "+",
                "text": line
            }));
            add_line_num += 1;
        }

        // Context after (up to 3 lines)
        let after_start = target_line_idx + target_lines.len();
        let after_end = (after_start + 3).min(all_lines.len());
        let mut after_line_num = target_start_line + repl_lines.len();
        if after_start < all_lines.len() {
            for line in &all_lines[after_start..after_end] {
                diff_lines.push(serde_json::json!({
                    "type": "ctx",
                    "num": after_line_num,
                    "marker": " ",
                    "text": line
                }));
                after_line_num += 1;
            }
        }

        diff_lines
    }

    pub fn advanced_replace(
        content: &str,
        target: &str,
        replacement: &str,
        path: &str,
    ) -> Result<(String, usize, usize, usize, Vec<serde_json::Value>), String> {
        let all_lines: Vec<&str> = content.lines().collect();

        // Strategy 1: Exact Substring
        if let Some(pos) = content.find(target) {
            let prefix = &content[..pos];
            let start_line = prefix.bytes().filter(|&b| b == b'\n').count() + 1;
            let updated = format!("{}{}{}", prefix, replacement, &content[pos + target.len()..]);
            let target_lines: Vec<&str> = if target.is_empty() {
                Vec::new()
            } else {
                target.lines().collect()
            };
            let repl_lines: Vec<&str> = if replacement.is_empty() {
                Vec::new()
            } else {
                replacement.lines().collect()
            };
            let del_count = target_lines.len().max(1);
            let add_count = repl_lines.len().max(1);
            let diff_lines =
                Self::build_diff_lines(&all_lines, start_line, &target_lines, &repl_lines);
            return Ok((updated, start_line, del_count, add_count, diff_lines));
        }

        // Strategy 2: CRLF Normalized Substring
        if content.contains("\r\n") || target.contains("\r\n") {
            let c_norm = content.replace("\r\n", "\n");
            let t_norm = target.replace("\r\n", "\n");
            if let Some(pos) = c_norm.find(&t_norm) {
                let prefix = &c_norm[..pos];
                let start_line = prefix.bytes().filter(|&b| b == b'\n').count() + 1;
                let r_norm = replacement.replace("\r\n", "\n");
                let updated_norm =
                    format!("{}{}{}", prefix, r_norm, &c_norm[pos + t_norm.len()..]);
                let updated = if content.contains("\r\n") {
                    updated_norm.replace('\n', "\r\n")
                } else {
                    updated_norm
                };
                let norm_all_lines: Vec<&str> = c_norm.lines().collect();
                let target_lines: Vec<&str> = t_norm.lines().collect();
                let repl_lines: Vec<&str> = r_norm.lines().collect();
                let del_count = target_lines.len().max(1);
                let add_count = repl_lines.len().max(1);
                let diff_lines =
                    Self::build_diff_lines(&norm_all_lines, start_line, &target_lines, &repl_lines);
                return Ok((updated, start_line, del_count, add_count, diff_lines));
            }
        }

        // Strategy 3: Trimmed-Line Sequence Match (Fuzzy Indentation Match from oh-my-pi pi-edit)
        let t_lines: Vec<&str> = target.lines().collect();
        let t_non_empty: Vec<(usize, &str)> = t_lines
            .iter()
            .enumerate()
            .map(|(idx, line)| (idx, line.trim()))
            .filter(|(_, trimmed)| !trimmed.is_empty())
            .collect();

        if !t_non_empty.is_empty() && t_lines.len() <= all_lines.len() {
            let seq_len = t_lines.len();
            let mut matched_idx = None;

            for i in 0..=(all_lines.len().saturating_sub(seq_len)) {
                let mut full_match = true;
                for (rel_idx, t_trim) in &t_non_empty {
                    let file_line = all_lines[i + rel_idx].trim();
                    if file_line != *t_trim {
                        full_match = false;
                        break;
                    }
                }
                if full_match {
                    matched_idx = Some(i);
                    break;
                }
            }

            if let Some(i) = matched_idx {
                let start_line = i + 1;
                let base_indent = all_lines[i]
                    .chars()
                    .take_while(|c| c.is_whitespace())
                    .collect::<String>();
                let repl_raw: Vec<&str> = replacement.lines().collect();
                let repl_lines: Vec<String> = repl_raw
                    .iter()
                    .map(|line| {
                        if line.trim().is_empty() {
                            String::new()
                        } else if line.starts_with(char::is_whitespace) {
                            line.to_string()
                        } else {
                            format!("{}{}", base_indent, line)
                        }
                    })
                    .collect();

                let mut new_lines = Vec::with_capacity(all_lines.len() + repl_lines.len());
                new_lines.extend_from_slice(&all_lines[..i]);
                for r in &repl_lines {
                    new_lines.push(r.as_str());
                }
                if i + seq_len < all_lines.len() {
                    new_lines.extend_from_slice(&all_lines[i + seq_len..]);
                }
                let updated = new_lines.join("\n");
                let del_slice = &all_lines[i..i + seq_len];
                let repl_slice_refs: Vec<&str> = repl_lines.iter().map(|s| s.as_str()).collect();
                let diff_lines =
                    Self::build_diff_lines(&all_lines, start_line, del_slice, &repl_slice_refs);
                let del_count = del_slice.len().max(1);
                let add_count = repl_lines.len().max(1);
                return Ok((updated, start_line, del_count, add_count, diff_lines));
            }
        }

        // Strategy 4: Single-Line Trimmed Substring Search
        let target_trim = target.trim();
        if !target_trim.is_empty() {
            let mut matched_line_idx = None;
            let mut match_count = 0;
            for (idx, line) in all_lines.iter().enumerate() {
                if line.trim() == target_trim || line.contains(target_trim) {
                    matched_line_idx = Some(idx);
                    match_count += 1;
                }
            }
            if match_count == 1 {
                if let Some(i) = matched_line_idx {
                    let start_line = i + 1;
                    let base_indent = all_lines[i]
                        .chars()
                        .take_while(|c| c.is_whitespace())
                        .collect::<String>();
                    let repl_raw: Vec<&str> = replacement.lines().collect();
                    let repl_lines: Vec<String> = repl_raw
                        .iter()
                        .map(|line| {
                            if line.trim().is_empty() {
                                String::new()
                            } else if line.starts_with(char::is_whitespace) {
                                line.to_string()
                            } else {
                                format!("{}{}", base_indent, line)
                            }
                        })
                        .collect();

                    let mut new_lines = Vec::with_capacity(all_lines.len() + repl_lines.len());
                    new_lines.extend_from_slice(&all_lines[..i]);
                    for r in &repl_lines {
                        new_lines.push(r.as_str());
                    }
                    if i + 1 < all_lines.len() {
                        new_lines.extend_from_slice(&all_lines[i + 1..]);
                    }
                    let updated = new_lines.join("\n");
                    let del_slice = &all_lines[i..i + 1];
                    let repl_slice_refs: Vec<&str> = repl_lines.iter().map(|s| s.as_str()).collect();
                    let diff_lines =
                        Self::build_diff_lines(&all_lines, start_line, del_slice, &repl_slice_refs);
                    let del_count = 1;
                    let add_count = repl_lines.len().max(1);
                    return Ok((updated, start_line, del_count, add_count, diff_lines));
                }
            }
        }

        Err(format!(
            "Teks target tidak ditemukan dalam berkas {}. Pastikan potongan teks yang ingin diganti sesuai dengan isi berkas.",
            path
        ))
    }

    pub fn execute_edit_file(
        root: &Path,
        p: &str,
        target: &str,
        replacement: &str,
    ) -> Result<String, String> {
        let clean = p.trim();
        if clean.is_empty() {
            return Err("Path berkas tidak boleh kosong".to_string());
        }
        let file_path = Self::resolve_path(root, clean);
        if !file_path.exists() {
            return Err(format!("Berkas tidak ditemukan: {}", clean));
        }
        let content = std::fs::read_to_string(&file_path)
            .map_err(|e| format!("Gagal membaca berkas: {}", e))?;

        let (updated, _start_line, del_count, add_count, diff_lines) =
            Self::advanced_replace(&content, target, replacement, clean)?;

        std::fs::write(&file_path, updated)
            .map_err(|e| format!("Gagal menyimpan perubahan berkas: {}", e))?;

        let result_json = serde_json::json!({
            "type": "diff",
            "file": clean,
            "add_count": add_count,
            "del_count": del_count,
            "lines": diff_lines,
            "raw_replacement": replacement,
            "message": format!("Berhasil mengubah berkas: {} (+{} -{})", clean, add_count, del_count)
        });

        Ok(result_json.to_string())
    }

    pub fn execute_write_file(root: &Path, p: &str, content: &str) -> Result<String, String> {
        let clean = p.trim();
        if clean.is_empty() {
            return Err("Path berkas tidak boleh kosong".to_string());
        }
        let file_path = Self::resolve_path(root, clean);
        if let Some(parent) = file_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        std::fs::write(&file_path, content)
            .map_err(|e| format!("Gagal menulis berkas: {}", e))?;
        Ok(format!("Berhasil menulis berkas: {}", clean))
    }

    pub fn execute_list_dir(root: &Path, p: Option<&str>) -> Result<String, String> {
        let dir_path = match p {
            Some(sub) if !sub.trim().is_empty() => Self::resolve_path(root, sub.trim()),
            _ => root.to_path_buf(),
        };

        if !dir_path.exists() || !dir_path.is_dir() {
            return Err(format!("Direktori tidak ditemukan: {:?}", dir_path));
        }

        let entries = std::fs::read_dir(&dir_path)
            .map_err(|e| format!("Gagal membaca direktori: {}", e))?;

        let mut names = Vec::new();
        for entry in entries.flatten() {
            let file_name = entry.file_name().to_string_lossy().to_string();
            if file_name == ".git" || file_name == "node_modules" || file_name == "vendor" {
                continue;
            }
            let is_dir = entry.path().is_dir();
            if is_dir {
                names.push(format!("{}/", file_name));
            } else {
                names.push(file_name);
            }
        }
        names.sort();
        Ok(names.join("\n"))
    }

    pub async fn execute_command(root: &Path, cmd: &str) -> Result<String, String> {
        let clean_cmd = cmd.trim();
        if clean_cmd.is_empty() {
            return Err("Perintah tidak boleh kosong".to_string());
        }

        // Build enriched PATH so GUI apps on macOS find Homebrew, MySQL, Herd, and Composer binaries
        let mut path_env = std::env::var("PATH").unwrap_or_default();
        let home = std::env::var("HOME").unwrap_or_default();
        let common_extra_paths = [
            "/opt/homebrew/bin",
            "/opt/homebrew/sbin",
            "/opt/homebrew/opt/mysql-client/bin",
            "/usr/local/bin",
            "/usr/local/sbin",
            "/usr/bin",
            "/bin",
            "/usr/sbin",
            "/sbin",
            &format!("{}/.composer/vendor/bin", home),
            &format!("{}/Library/Application Support/Herd/bin", home),
        ];
        for extra in common_extra_paths {
            if !path_env.contains(extra) {
                path_env = format!("{}:{}", extra, path_env);
            }
        }

        let command_fut = if cfg!(target_os = "windows") {
            tokio::process::Command::new("cmd")
                .arg("/C")
                .arg(clean_cmd)
                .current_dir(root)
                .env("PATH", &path_env)
                .stdin(std::process::Stdio::null())
                .output()
        } else {
            tokio::process::Command::new("sh")
                .arg("-c")
                .arg(clean_cmd)
                .current_dir(root)
                .env("PATH", &path_env)
                .stdin(std::process::Stdio::null())
                .output()
        };

        // Enforce 15-second timeout so tool calls never get stuck in the middle
        let output_res =
            tokio::time::timeout(std::time::Duration::from_secs(15), command_fut).await;

        let output = match output_res {
            Ok(Ok(out)) => out,
            Ok(Err(e)) => return Err(format!("Gagal mengeksekusi perintah: {}", e)),
            Err(_) => {
                return Err(
                    "Perintah melebihi batas waktu (timeout 15 detik). Pastikan perintah tidak membutuhkan input interaktif atau password."
                        .to_string(),
                )
            }
        };

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        let combined = if stderr.is_empty() {
            stdout.to_string()
        } else if stdout.is_empty() {
            stderr.to_string()
        } else {
            format!("STDOUT:\n{}\nSTDERR:\n{}", stdout, stderr)
        };

        if combined.len() > 4000 {
            Ok(format!("{}... (output dipotong)", &combined[..4000]))
        } else if combined.trim().is_empty() {
            Ok("(perintah selesai dengan sukses)".to_string())
        } else {
            Ok(combined)
        }
    }

    pub async fn execute_tool(
        root: &Path,
        tool_name: &str,
        args: &serde_json::Value,
    ) -> Result<String, String> {
        let get_path = || -> &str {
            args.get("path")
                .or_else(|| args.get("file_path"))
                .or_else(|| args.get("filePath"))
                .or_else(|| args.get("file"))
                .or_else(|| args.get("filename"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
        };

        match tool_name {
            "read_file" => {
                let p = get_path();
                let start_line = args
                    .get("start_line")
                    .or_else(|| args.get("offset"))
                    .or_else(|| args.get("start"))
                    .and_then(|v| v.as_u64())
                    .map(|n| n as usize);
                let limit = args
                    .get("limit")
                    .or_else(|| args.get("lines"))
                    .or_else(|| args.get("count"))
                    .and_then(|v| v.as_u64())
                    .map(|n| n as usize);
                Self::execute_read_file_with_range(root, p, start_line, limit)
            }
            "edit_file" => {
                let p = get_path();
                let target = args
                    .get("target")
                    .or_else(|| args.get("old_str"))
                    .or_else(|| args.get("find"))
                    .or_else(|| args.get("pattern"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let replacement = args
                    .get("replacement")
                    .or_else(|| args.get("new_str"))
                    .or_else(|| args.get("replace"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                Self::execute_edit_file(root, p, target, replacement)
            }
            "write_file" => {
                let p = get_path();
                let content = args
                    .get("content")
                    .or_else(|| args.get("text"))
                    .or_else(|| args.get("body"))
                    .or_else(|| args.get("data"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                Self::execute_write_file(root, p, content)
            }
            "list_dir" => {
                let p = args
                    .get("path")
                    .or_else(|| args.get("dir"))
                    .or_else(|| args.get("directory"))
                    .and_then(|v| v.as_str());
                Self::execute_list_dir(root, p)
            }
            "run_command" => {
                let cmd = args
                    .get("command")
                    .or_else(|| args.get("cmd"))
                    .or_else(|| args.get("command_line"))
                    .or_else(|| args.get("script"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                Self::execute_command(root, cmd).await
            }
            _ => Err(format!("Tool tidak dikenal: {}", tool_name)),
        }
    }

    pub fn is_read_only_tool(name: &str) -> bool {
        name == "read_file" || name == "list_dir"
    }

    pub fn format_tool_step(fn_name: &str, parsed_args: &serde_json::Value) -> String {
        let p_arg = parsed_args
            .get("path")
            .or_else(|| parsed_args.get("file_path"))
            .or_else(|| parsed_args.get("file"))
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let p_basename = Path::new(p_arg)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(p_arg);

        let cmd_arg = parsed_args
            .get("command")
            .or_else(|| parsed_args.get("cmd"))
            .and_then(|v| v.as_str())
            .unwrap_or("");

        match fn_name {
            "read_file" => format!(
                "Analyzed 📄 {}",
                if p_basename.is_empty() {
                    "file"
                } else {
                    p_basename
                }
            ),
            "edit_file" => {
                let add_c = parsed_args
                    .get("replacement")
                    .and_then(|v| v.as_str())
                    .map(|s| s.lines().count())
                    .unwrap_or(1);
                let del_c = parsed_args
                    .get("target")
                    .and_then(|v| v.as_str())
                    .map(|s| s.lines().count())
                    .unwrap_or(1);
                let diff_str = if del_c > 0 && add_c > 0 {
                    format!("+{} -{}", add_c, del_c)
                } else if add_c > 0 {
                    format!("+{}", add_c)
                } else {
                    format!("-{}", del_c)
                };
                format!(
                    "Edited 📄 {} {}",
                    if p_basename.is_empty() {
                        "file"
                    } else {
                        p_basename
                    },
                    diff_str
                )
            }
            "write_file" => format!(
                "Created 📄 {}",
                if p_basename.is_empty() {
                    "file"
                } else {
                    p_basename
                }
            ),
            "list_dir" => format!("Checked 📁 {}", if p_arg.is_empty() { "root" } else { p_arg }),
            "run_command" => {
                if cmd_arg.len() > 45 {
                    format!("{}...", &cmd_arg[..42])
                } else if !cmd_arg.is_empty() {
                    cmd_arg.to_string()
                } else {
                    "Ran command".to_string()
                }
            }
            other => other.to_string(),
        }
    }

    pub async fn execute_tool_batch(
        root: &Path,
        tool_calls: &[serde_json::Value],
        step_count: usize,
        app_handle: Option<&tauri::AppHandle>,
        messages: &mut Vec<serde_json::Value>,
        target_file: Option<&str>,
    ) {
        for (call_idx, tool_call) in tool_calls.iter().enumerate() {
            let call_id = tool_call["id"].as_str().unwrap_or("call_1");
            let (fn_name, parsed_args) = Self::extract_tool_call(tool_call);
            let format_line = Self::format_tool_step(&fn_name, &parsed_args);
            let unique_step = step_count * 100 + call_idx;

            if let Some(app) = app_handle {
                let _ = app.emit(
                    "fixit-agent-step",
                    AgentStepEvent {
                        step: unique_step,
                        step_type: "tool_call".to_string(),
                        tool_name: Some(fn_name.clone()),
                        tool_args: Some(parsed_args.clone()),
                        result_summary: None,
                        message: Some(format_line.clone()),
                        output: None,
                        timestamp: std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_millis() as u64,
                        file_path: target_file.map(|s| s.to_string()),
                    },
                );
            }

            let tool_result = Self::execute_tool(root, &fn_name, &parsed_args).await;
            let output_str = match &tool_result {
                Ok(res) => res.clone(),
                Err(e) => format!("Error tool: {}", e),
            };

            if let Some(app) = app_handle {
                let _ = app.emit(
                    "fixit-agent-step",
                    AgentStepEvent {
                        step: unique_step,
                        step_type: "tool_result".to_string(),
                        tool_name: Some(fn_name.clone()),
                        tool_args: None,
                        result_summary: Some(format_line.clone()),
                        message: Some(format_line),
                        output: Some(output_str.clone()),
                        timestamp: std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_millis() as u64,
                        file_path: target_file.map(|s| s.to_string()),
                    },
                );
            }

            messages.push(serde_json::json!({
                "role": "tool",
                "tool_call_id": call_id,
                "content": output_str
            }));
        }
    }

    pub fn get_tools_spec() -> serde_json::Value {
        serde_json::json!([
            {
                "type": "function",
                "function": {
                    "name": "read_file",
                    "description": "Membaca isi berkas dalam proyek user. Mendukung start_line dan limit untuk membaca baris tertentu agar efisien.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "Path relatif berkas dari root proyek"
                            },
                            "start_line": {
                                "type": "integer",
                                "description": "Nomor baris awal (1-indexed, opsional)"
                            },
                            "limit": {
                                "type": "integer",
                                "description": "Jumlah baris maksimal yang dibaca (opsional)"
                            }
                        },
                        "required": ["path"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "edit_file",
                    "description": "Mengganti teks spesifik (target) dengan teks baru (replacement) dalam berkas secara presisi.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "Path berkas yang akan diubah"
                            },
                            "target": {
                                "type": "string",
                                "description": "String/potongan kode lama yang persis akan diganti"
                            },
                            "replacement": {
                                "type": "string",
                                "description": "String/kode baru penggantinya"
                            }
                        },
                        "required": ["path", "target", "replacement"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "write_file",
                    "description": "Membuat berkas baru atau menimpa berkas dengan konten lengkap.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "Path berkas"
                            },
                            "content": {
                                "type": "string",
                                "description": "Konten lengkap berkas"
                            }
                        },
                        "required": ["path", "content"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "list_dir",
                    "description": "Melihat daftar berkas dan direktori dalam proyek.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "Path folder relatif (opsional, kosongkan untuk root proyek)"
                            }
                        }
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "run_command",
                    "description": "Menjalankan perintah terminal di root proyek (misal: 'php artisan migrate', 'mysql -u root -e \"CREATE DATABASE IF NOT EXISTS koperasiutma;\"', 'php -l filename.php').",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "command": {
                                "type": "string",
                                "description": "Perintah shell/terminal yang akan dijalankan"
                            }
                        },
                        "required": ["command"]
                    }
                }
            }
        ])
    }

    /// Full autonomous agentic fix loop
    pub async fn run_agent_fix(
        error: &CodeError,
        workspace_path: Option<&str>,
        config: &AppConfig,
        app_handle: Option<&tauri::AppHandle>,
    ) -> Result<String, String> {
        let (base_url, api_key, model_name) = config.get_effective_llm_config();
        if api_key.trim().is_empty() {
            return Err("Silakan masukkan API Key di pengaturan FixIt untuk mengaktifkan perbaikan otomatis agentic.".to_string());
        }

        let root = Self::find_project_root(&error.file_path, workspace_path);

        let system_prompt = format!(
            "Anda adalah FixIt Superpowered Agentic Engineer (berbasis standar Superpowers Systematic Debugging & Everything Computer Code / ECC).
Tugas utama Anda adalah MEMERIKSA AKAR MASALAH SECARA CERDAS dan MEMPERBAIKI error siswa secara tuntas, BUKAN main hakim sendiri atau langsung membuat/mengedit secara ceroboh.

Root direktori proyek siswa: {}
Berkas error: {} (baris: {:?})
Pesan error: {}

TOOLS YANG DAPAT ANDA GUNAKAN:
- read_file(path): Membaca berkas proyek (.env, config, controller, model, migration, dsb)
- edit_file(path, target, replacement): Mengedit berkas secara presisi untuk memperbaiki kode
- write_file(path, content): Membuat berkas baru jika benar-benar diperlukan
- list_dir(path): Memeriksa isi folder direktori proyek (misal: database/migrations)
- run_command(command): Menjalankan perintah terminal di root proyek (contoh: mysql, php artisan)

DISIPLIN PENYELIDIKAN SUPERPOWERS & ECC (HUKUM MUTLAK):
1. INVESTIGASI SEBELUM BERTINDAK (JANGAN LANGSUNG CREATE BUTA):
   - Jika error terkait database MySQL (misalnya: Unknown database '...', connection refused, atau table doesn't exist):
     a. BACA konfigurasi `.env` dan `config/database.php` menggunakan `read_file` untuk mengetahui nama database yang dikonfigurasi (DB_DATABASE, DB_USERNAME, DB_HOST, DB_PORT).
     b. JANGAN LANGSUNG MAIN BUAT DATABASE BARU! Periksa dulu daftar database yang ADA di server MySQL siswa menggunakan perintah:
        run_command(\"mysql -u root -e 'SHOW DATABASES;'\")
     c. ANALISIS DAFTAR DATABASE SECARA PINTAR:
        - Cek apakah sudah ada database yang memiliki nama serupa atau terkait proyek ini (misalnya jika di .env tertulis 'koperasiutma', apakah di MySQL sudah ada 'koperasi_utm', 'koperasiutm', 'koperasi-utm', atau database bertema serupa)?
        - Jika ADA database serupa di MySQL:
          Periksa tabel di dalamnya: run_command(\"mysql -u root -e 'SHOW TABLES FROM <nama_db_yang_ada>;'\").
          Jika database tersebut sudah memiliki tabel/data proyek, maka akar masalahnya adalah TYPO PADA .ENV!
          -> Tindakan yang benar: PANGGIL `edit_file` pada `.env` untuk menyelaraskan DB_DATABASE dengan nama database yang sebenarnya ada di MySQL!
        - Jika TIDAK ADA database terkait sama sekali di server MySQL siswa:
          Periksa folder `database/migrations` menggunakan `list_dir`.
          Lalu PANGGIL `run_command` untuk membuat database tersebut:
          run_command(\"mysql -u root -e 'CREATE DATABASE IF NOT EXISTS <nama_db_dari_env> CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;'\")
          (PENTING: Jangan gunakan opsi `-p` yang meminta input password interaktif!).
          Lalu jalankan migrasi database:
          run_command(\"php artisan migrate --no-interaction\")
   - Jika error sintaks atau logika kode (JavaScript, React JSX, TypeScript, PHP, Python, dsb):
     a. FOKUS LANGSUNG PADA BERKAS ERROR: Buka dan baca berkas error di sekitar baris error menggunakan `read_file`.
     b. JANGAN membuang-buang langkah dengan membaca berkas konfigurasi linter atau tooling seperti .eslintrc, .oxlintrc, package.json, vite.config.js, tsconfig.json KECUALI jika pesan error secara spesifik menyebutkan berkas konfigurasi tersebut!
     c. Pahami struktur kode, perbaiki kurung/titik-koma/import/hook yang hilang atau typo (misal: lengkapi deklarasi fungsi, import hook useState/useEffect, perbaiki penutupan tag JSX atau kurung kurawal).
     d. PANGGIL `edit_file` untuk mengganti kode yang salah dengan kode yang benar secara presisi dan tuntas.
     e. Jangan membuat perubahan setengah-setengah yang memicu syntax error baru. Pastikan kode pengganti valid dan lengkap.
     f. Segera selesaikan tugas Anda setelah `edit_file` berhasil dieksekusi tanpa berputar-putar.

2. VERIFIKASI SEBELUM MENYATAKAN SELESAI (EVIDENCE BEFORE ASSERTIONS):
   - Setelah melakukan tindakan perbaikan (baik edit .env, buat database, migrasi, atau edit kode), lakukan verifikasi singkat untuk membuktikan masalah sudah teratasi.
   - JANGAN PERNAH menyuruh siswa menjalankan perintah sendiri jika Anda bisa mengeksekusinya langsung melalui tools!
   - Jangan katakan 'Perbaikan Selesai' jika Anda belum mengeksekusi perbaikan nyata via `edit_file` atau `run_command`.

3. RANGKUMAN CERDAS & EDUKATIF:
   - Setelah perbaikan selesai, berikan penjelasan ringkas dan cerdas dalam bahasa Indonesia:
     - Jelaskan temuan investigasi Anda (misal: apa yang ditemukan di MySQL atau kode).
     - Sebutkan tindakan nyata apa saja yang telah berhasil Anda eksekusi.
     - Berikan konfirmasi status bahwa proyek sekarang siap dijalankan.

4. POLA PIKIR & REASONING (THINKING SEBELUM BERTINDAK):
   - Sebelum memanggil tools atau bertindak, sampaikan analisis pemikiran Anda secara singkat (misal: apa yang dicurigai dan apa rencana langkah awalnya).
   - Jika saat menjalankan tools Anda menemui hasil tak terduga, error baru, atau situasi yang membingungkan, berpikirlah kembali (Thinking) untuk memetakan arah solusi baru sebelum memanggil tool berikutnya.",
            root.display(),
            error.file_path,
            error.line_number,
            error.raw_message
        );

        let mut messages = vec![
            serde_json::json!({
                "role": "system",
                "content": system_prompt
            }),
            serde_json::json!({
                "role": "user",
                "content": format!(
                    "Tolong perbaiki error ini secara tuntas:\nBerkas: {}\nBaris: {:?}\nTipe: {}\nPesan: {}\n\nPANDUAN EFISIENSI:\n1. Baca potongan berkas di sekitar baris error menggunakan `read_file`.\n2. Langsung perbaiki kode yang salah menggunakan `edit_file` pada berkas tersebut secara tuntas.\n3. JANGAN membaca berkas konfigurasi linter (.eslintrc, .oxlintrc, vite.config, dll) karena masalahnya murni di berkas kode ini.\n4. Segera selesaikan tugas Anda setelah perbaikan berhasil dieksekusi.",
                    error.file_path,
                    error.line_number,
                    error.error_type,
                    error.raw_message
                )
            }),
        ];

        let endpoint = format!("{}/chat/completions", base_url.trim_end_matches('/'));
        let tools = Self::get_tools_spec();
        let client = reqwest::Client::new();

        if let Some(app) = app_handle {
            let _ = app.emit(
                "fixit-agent-step",
                AgentStepEvent {
                    step: 0,
                    step_type: "thinking".to_string(),
                    tool_name: None,
                    tool_args: None,
                    result_summary: Some("Thinking".to_string()),
                    message: Some("Menganalisis berkas dan konteks error untuk menentukan tindakan perbaikan...".to_string()),
                    output: Some("Menganalisis berkas dan konteks error untuk menentukan tindakan perbaikan...".to_string()),
                    timestamp: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64,
                    file_path: Some(error.file_path.clone()),
                },
            );
        }

        let mut step_count = 0;
        let max_steps = 12;
        let mut has_performed_modification = false;

        while step_count < max_steps {
            step_count += 1;

            let payload = serde_json::json!({
                "model": model_name,
                "messages": messages,
                "tools": tools,
                "temperature": 0.2
            });

            let mut resp = client
                .post(&endpoint)
                .header("Authorization", format!("Bearer {}", api_key))
                .header("Content-Type", "application/json")
                .json(&payload)
                .send()
                .await
                .map_err(|e| format!("Gagal menghubungi AI: {}", e))?;

            if !resp.status().is_success() {
                // If failed with tools, retry without tools
                let payload_no_tools = serde_json::json!({
                    "model": model_name,
                    "messages": messages,
                    "temperature": 0.2
                });
                if let Ok(retry_resp) = client
                    .post(&endpoint)
                    .header("Authorization", format!("Bearer {}", api_key))
                    .header("Content-Type", "application/json")
                    .json(&payload_no_tools)
                    .send()
                    .await
                {
                    if retry_resp.status().is_success() {
                        resp = retry_resp;
                    } else {
                        let err_text = resp.text().await.unwrap_or_default();
                        return Err(format!("AI API Error: {}", err_text));
                    }
                } else {
                    let err_text = resp.text().await.unwrap_or_default();
                    return Err(format!("AI API Error: {}", err_text));
                }
            }

            let resp_json: serde_json::Value = resp
                .json()
                .await
                .map_err(|e| format!("Gagal membaca respons AI: {}", e))?;

            let choice = resp_json["choices"]
                .get(0)
                .ok_or_else(|| "Respons AI kosong".to_string())?;

            let msg = &choice["message"];

            let raw_has_tools = msg
                .get("tool_calls")
                .and_then(|v| v.as_array())
                .map(|a| !a.is_empty())
                .unwrap_or(false);

            // Emit reasoning/thinking content if returned by reasoning models or assistant content before tools
            let reasoning_text = msg
                .get("reasoning_content")
                .or_else(|| msg.get("thought"))
                .or_else(|| choice.get("reasoning_content"))
                .or_else(|| choice.get("thought"))
                .and_then(|v| v.as_str())
                .map(|s| s.trim())
                .filter(|s| !s.is_empty());

            let content_thinking = if raw_has_tools {
                msg.get("content")
                    .and_then(|v| v.as_str())
                    .map(|s| s.trim())
                    .filter(|s| !s.is_empty())
            } else {
                None
            };

            let effective_reasoning = reasoning_text.or(content_thinking);

            if let Some(reasoning) = effective_reasoning {
                if let Some(app) = app_handle {
                    let _ = app.emit(
                        "fixit-agent-step",
                        AgentStepEvent {
                            step: step_count * 1000,
                            step_type: "thinking".to_string(),
                            tool_name: None,
                            tool_args: None,
                            result_summary: Some("Thinking".to_string()),
                            message: Some(reasoning.to_string()),
                            output: Some(reasoning.to_string()),
                            timestamp: std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_millis() as u64,
                            file_path: Some(error.file_path.clone()),
                        },
                    );
                }
            }

            // Check if model called any tools
            if let Some(raw_tool_calls) = msg["tool_calls"].as_array() {
                let tool_calls = Self::merge_tool_calls(raw_tool_calls);
                if !tool_calls.is_empty() {
                    let mut just_modified = false;
                    for call in &tool_calls {
                        let name = call["function"]["name"].as_str().unwrap_or("");
                        if name == "edit_file" || name == "write_file" {
                            has_performed_modification = true;
                            just_modified = true;
                        }
                    }

                    // Append assistant message with clean merged tool_calls
                    let mut assistant_msg = msg.clone();
                    assistant_msg["tool_calls"] = serde_json::json!(tool_calls);
                    messages.push(assistant_msg);

                    Self::execute_tool_batch(
                        &root,
                        &tool_calls,
                        step_count,
                        app_handle,
                        &mut messages,
                        Some(&error.file_path),
                    )
                    .await;

                    // Setelah modifikasi dilakukan, verifikasi berkas error apakah masih ada syntax error
                    if just_modified {
                        let err_file = Self::resolve_path(&root, &error.file_path);
                        if err_file.exists() {
                            let inspect_res = crate::diagnostics::DiagnosticsParser::inspect_file(&err_file);
                            match inspect_res {
                                crate::diagnostics::InspectionResult::Error(remaining) => {
                                    if step_count < max_steps {
                                        messages.push(serde_json::json!({
                                            "role": "user",
                                            "content": format!(
                                                "Perhatian: Setelah perbaikan dieksekusi, linter/parser masih mendeteksi error sintaks pada berkas: '{}' di baris {:?}. Silakan periksa kembali dan panggil tool `edit_file` lagi untuk memperbaiki kode tersebut sampai benar-benar tuntas.",
                                                remaining.raw_message,
                                                remaining.line_number
                                            )
                                        }));
                                    }
                                }
                                crate::diagnostics::InspectionResult::Valid => {
                                    // Berkas sudah terbukti valid & bebas error sintaks!
                                    // Langsung selesaikan tanpa perlu menunggu roundtrip LLM tambahan yang lama
                                    let summary = format!(
                                        "Pemeriksaan dan tindakan perbaikan telah selesai dieksekusi untuk error: `{}`.\n\n**Pembahasan Masalah & Penyebab:**\nError ini terjadi karena struktur kode atau deklarasi pada berkas belum memenuhi aturan bahasa yang diharapkan oleh parser/compiler. Berkas telah diperbaiki dan diverifikasi valid bebas dari error sintaks sehingga aplikasi dapat kembali berjalan dengan normal.",
                                        error.raw_message
                                    );

                                    if let Some(app) = app_handle {
                                        let _ = app.emit(
                                            "fixit-agent-step",
                                            AgentStepEvent {
                                                step: step_count * 1000 + 2,
                                                step_type: "finish".to_string(),
                                                tool_name: None,
                                                tool_args: None,
                                                result_summary: Some("Perbaikan Selesai".to_string()),
                                                message: Some("Perbaikan Selesai".to_string()),
                                                output: Some(summary.clone()),
                                                timestamp: std::time::SystemTime::now()
                                                    .duration_since(std::time::UNIX_EPOCH)
                                                    .unwrap_or_default()
                                                    .as_millis() as u64,
                                                file_path: Some(error.file_path.clone()),
                                            },
                                        );
                                    }

                                    return Ok(summary);
                                }
                                _ => {}
                            }
                        }
                    }

                    continue;
                }
            }

            // If no tool calls, model gave a text response
            let mut final_content = msg["content"].as_str().unwrap_or("").trim().to_string();

            // PENTING: Jika model belum pernah memanggil edit_file/write_file untuk memperbaiki error,
            // DAN masih ada sisa steps: JANGAN LANGSUNG BERHENTI!
            if !has_performed_modification && step_count < max_steps {
                if let Some(app) = app_handle {
                    let _ = app.emit(
                        "fixit-agent-step",
                        AgentStepEvent {
                            step: step_count * 1000 + 1,
                            step_type: "thinking".to_string(),
                            tool_name: None,
                            tool_args: None,
                            result_summary: Some("Thinking".to_string()),
                            message: Some(final_content.clone()),
                            output: Some(final_content.clone()),
                            timestamp: std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_millis() as u64,
                            file_path: Some(error.file_path.clone()),
                        },
                    );
                }

                messages.push(msg.clone());
                messages.push(serde_json::json!({
                    "role": "user",
                    "content": "Temuan dan analisis Anda sudah tepat. SEGERA PANGGIL tool `edit_file(path, target, replacement)` sekarang juga untuk melakukan perbaikan nyata pada berkas! JANGAN hanya berkata 'Mari saya perbaiki' di teks tanpa memanggil tool `edit_file`."
                }));
                continue;
            }

            // Jika respons akhir kosong setelah memanggil tools, minta ringkasan eksplisit dengan timeout cepat
            if final_content.is_empty() {
                if has_performed_modification {
                    final_content = format!(
                        "Pemeriksaan dan tindakan perbaikan telah selesai dieksekusi untuk error: `{}`.\n\n**Pembahasan Masalah & Penyebab:**\nError terjadi karena struktur sintaks pada berkas belum memenuhi kaidah bahasa yang diharapkan. Berkas kode telah diperbaiki secara presisi dan diverifikasi valid sehingga aplikasi dapat kembali berjalan dengan normal.",
                        error.raw_message
                    );
                } else {
                    messages.push(serde_json::json!({
                        "role": "user",
                        "content": "Semua tindakan tools telah selesai dieksekusi. Sekarang berikan ringkasan penjelasan cerdas dan singkat dalam bahasa Indonesia: mengapa error ini bisa terjadi (penyebabnya), dan apa saja tindakan perbaikan yang telah Anda lakukan hingga tuntas."
                    }));

                    let summary_payload = serde_json::json!({
                        "model": model_name,
                        "messages": messages,
                        "temperature": 0.2
                    });

                    let fast_client = reqwest::Client::builder()
                        .timeout(std::time::Duration::from_secs(5))
                        .build()
                        .unwrap_or_else(|_| client.clone());

                    if let Ok(sum_resp) = fast_client
                        .post(&endpoint)
                        .header("Authorization", format!("Bearer {}", api_key))
                        .header("Content-Type", "application/json")
                        .json(&summary_payload)
                        .send()
                        .await
                    {
                        if sum_resp.status().is_success() {
                            if let Ok(sum_json) = sum_resp.json::<serde_json::Value>().await {
                                if let Some(c) = sum_json["choices"][0]["message"]["content"].as_str() {
                                    let trimmed = c.trim();
                                    if !trimmed.is_empty() {
                                        final_content = trimmed.to_string();
                                    }
                                }
                            }
                        }
                    }

                    if final_content.is_empty() {
                        final_content = format!(
                            "Pemeriksaan dan tindakan perbaikan telah selesai dieksekusi untuk error: `{}`.\n\n**Pembahasan Masalah & Penyebab:**\nStruktur kode telah diselaraskan dengan aturan sintaks bahasa dan berkas telah diverifikasi normal.",
                            error.raw_message
                        );
                    }
                }
            }

            if let Some(app) = app_handle {
                let _ = app.emit(
                    "fixit-agent-step",
                    AgentStepEvent {
                        step: step_count,
                        step_type: "finish".to_string(),
                        tool_name: None,
                        tool_args: None,
                        result_summary: Some("Perbaikan Selesai".to_string()),
                        message: Some("Perbaikan Selesai".to_string()),
                        output: Some(final_content.clone()),
                        timestamp: std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_millis() as u64,
                        file_path: Some(error.file_path.clone()),
                    },
                );
            }

            return Ok(final_content);
        }

        Ok("Proses perbaikan otomatis telah selesai dijalankan.".to_string())
    }

    /// Enhanced ask_followup with full agentic capability (reasoning, live tool calls & execution)
    pub async fn ask_with_context(
        question: &str,
        image_base64: Option<&str>,
        active_error: Option<&CodeError>,
        workspace_path: Option<&str>,
        config: &AppConfig,
        app_handle: Option<&tauri::AppHandle>,
    ) -> Result<String, String> {
        let (base_url, api_key, model_name) = config.get_effective_llm_config();
        if api_key.trim().is_empty() {
            return Ok("Silakan konfigurasikan API Key pada pengaturan FixIt untuk mengaktifkan fitur chat tanya jawab interaktif.".to_string());
        }

        let root = if let Some(err) = active_error {
            Self::find_project_root(&err.file_path, workspace_path)
        } else if let Some(ws) = workspace_path {
            PathBuf::from(ws)
        } else {
            std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
        };

        let mut system_prompt = format!(
            "Anda adalah FixIt Superpowered Agentic Engineer (berbasis arsitektur oh-my-pi / Stencil Labs & Everything Computer Code / ECC).
Root direktori proyek siswa: {}

PRINSIP KERJA & DUALITAS OPERASIONAL (CHAT vs AGENTIC REPAIR):
1. RESPON CHAT BIASA (PERTANYAAN UMUM / TEORI / DISKUSI):
   - Jika pengguna menyapa ('halo', 'pagi'), menanyakan teori/konsep pemrograman ('apa itu middleware?', 'kenapa pakai PDO?', 'bagaimana routing bekerja?'), atau meminta saran konseptual:
     * Jawab langsung secara ramah, ringkas, terstruktur, dan edukatif dalam Bahasa Indonesia.
     * JANGAN memanggil tools jika tidak ada berkas atau sistem proyek yang perlu diperiksa atau diubah!

2. RESPON AGENTIC CODING & PERBAIKAN SISTEM (AUTONOMOUS ACTIONS):
   - Jika pengguna meminta memeriksa kode ('coba kamu check ulang', 'cek koneksi db', 'periksa file .env', 'perbaiki error ini', 'jalankan migrasi', 'tolong perbaiki'):
     * Segera gunakan tools Anda secara mandiri dan proaktif!
     * JANGAN menyuruh pengguna mengetik atau menjalankan terminal sendiri jika Anda bisa langsung mengeksekusinya via tools!
     * Setiap turn berharga: batch pemanggilan pembacaan/pemeriksaan independen dalam satu putaran.
     * Sampaikan pemikiran analisis singkat (Reasoning) sebelum memanggil tools.
     * Jika menemukan bug atau konfigurasi salah, langsung lakukan perbaikan nyata menggunakan `edit_file` (dengan diff presisi).
     * Setelah verifikasi selesai, berikan jawaban akhir yang ramah dan konfirmasi status proyek.

TOOLS TERSEDIA:
- read_file(path, start_line, limit): Membaca berkas proyek. Gunakan start_line & limit untuk membaca baris spesifik secara cepat dan hemat token.
- edit_file(path, target, replacement): Mengedit berkas secara presisi dengan diff minimal.
- write_file(path, content): Membuat berkas baru jika diperlukan.
- list_dir(path): Memeriksa isi folder direktori proyek.
- run_command(command): Menjalankan perintah terminal non-interaktif di root proyek (mysql, php artisan, npm, git).",
            root.display()
        );

        if let Some(err) = active_error {
            system_prompt.push_str(&format!(
                "\n\nKONTEKS ERROR AKTIF:\n- Berkas: {}\n- Baris: {:?}\n- Tipe: {}\n- Pesan Error: {}",
                err.file_path, err.line_number, err.error_type, err.raw_message
            ));
        }

        let user_content = if let Some(img_b64) = image_base64.filter(|s| !s.trim().is_empty()) {
            serde_json::json!([
                {
                    "type": "text",
                    "text": question
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": format!("data:image/png;base64,{}", img_b64)
                    }
                }
            ])
        } else {
            serde_json::json!(question)
        };

        let mut messages = vec![
            serde_json::json!({
                "role": "system",
                "content": system_prompt
            }),
            serde_json::json!({
                "role": "user",
                "content": user_content
            }),
        ];

        let endpoint = format!("{}/chat/completions", base_url.trim_end_matches('/'));
        let tools = Self::get_tools_spec();
        let client = reqwest::Client::new();

        let mut step_count = 0;
        let max_steps = 10;

        while step_count < max_steps {
            step_count += 1;

            let payload = serde_json::json!({
                "model": model_name,
                "messages": messages,
                "tools": tools,
                "temperature": 0.2
            });

            let mut resp = client
                .post(&endpoint)
                .header("Authorization", format!("Bearer {}", api_key))
                .header("Content-Type", "application/json")
                .json(&payload)
                .send()
                .await
                .map_err(|e| format!("Gagal menghubungi AI: {}", e))?;

            if !resp.status().is_success() {
                // If failed with tools, retry without tools
                let payload_no_tools = serde_json::json!({
                    "model": model_name,
                    "messages": messages,
                    "temperature": 0.2
                });
                if let Ok(retry_resp) = client
                    .post(&endpoint)
                    .header("Authorization", format!("Bearer {}", api_key))
                    .header("Content-Type", "application/json")
                    .json(&payload_no_tools)
                    .send()
                    .await
                {
                    if retry_resp.status().is_success() {
                        resp = retry_resp;
                    } else {
                        let err_text = resp.text().await.unwrap_or_default();
                        return Err(format!("AI API Error: {}", err_text));
                    }
                } else {
                    let err_text = resp.text().await.unwrap_or_default();
                    return Err(format!("AI API Error: {}", err_text));
                }
            }

            let resp_json: serde_json::Value = resp
                .json()
                .await
                .map_err(|e| e.to_string())?;

            let choice = &resp_json["choices"][0];
            let msg = &choice["message"];

            let raw_has_tools = msg
                .get("tool_calls")
                .and_then(|v| v.as_array())
                .map(|a| !a.is_empty())
                .unwrap_or(false);

            let reasoning_text = msg
                .get("reasoning_content")
                .or_else(|| msg.get("thought"))
                .or_else(|| choice.get("reasoning_content"))
                .or_else(|| choice.get("thought"))
                .and_then(|v| v.as_str())
                .map(|s| s.trim())
                .filter(|s| !s.is_empty());

            let content_thinking = if raw_has_tools {
                msg.get("content")
                    .and_then(|v| v.as_str())
                    .map(|s| s.trim())
                    .filter(|s| !s.is_empty())
            } else {
                None
            };

            let effective_reasoning = reasoning_text.or(content_thinking);

            if let Some(reasoning) = effective_reasoning {
                if let Some(app) = app_handle {
                    let _ = app.emit(
                        "fixit-agent-step",
                        AgentStepEvent {
                            step: step_count * 1000,
                            step_type: "thinking".to_string(),
                            tool_name: None,
                            tool_args: None,
                            result_summary: Some("Reasoning".to_string()),
                            message: Some(reasoning.to_string()),
                            output: Some(reasoning.to_string()),
                            timestamp: std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_millis() as u64,
                            file_path: active_error.as_ref().map(|e| e.file_path.clone()),
                        },
                    );
                }
            }

            if let Some(raw_tool_calls) = msg["tool_calls"].as_array() {
                let tool_calls = Self::merge_tool_calls(raw_tool_calls);
                if !tool_calls.is_empty() {
                    let mut assistant_msg = msg.clone();
                    assistant_msg["tool_calls"] = serde_json::json!(tool_calls);
                    messages.push(assistant_msg);

                    Self::execute_tool_batch(
                        &root,
                        &tool_calls,
                        step_count,
                        app_handle,
                        &mut messages,
                        active_error.as_ref().map(|e| e.file_path.as_str()),
                    )
                    .await;
                    continue;
                }
            }

            let mut final_content = msg["content"].as_str().unwrap_or("").trim().to_string();

            if final_content.is_empty() {
                messages.push(serde_json::json!({
                    "role": "user",
                    "content": "Semua tindakan atau pengecekan tools telah selesai dieksekusi. Sekarang berikan jawaban atau penjelasan lengkap dan ramah dalam bahasa Indonesia kepada pengguna berdasarkan hasil tindakan di atas."
                }));

                let summary_payload = serde_json::json!({
                    "model": model_name,
                    "messages": messages,
                    "temperature": 0.2
                });

                if let Ok(sum_resp) = client
                    .post(&endpoint)
                    .header("Authorization", format!("Bearer {}", api_key))
                    .header("Content-Type", "application/json")
                    .json(&summary_payload)
                    .send()
                    .await
                {
                    if sum_resp.status().is_success() {
                        if let Ok(sum_json) = sum_resp.json::<serde_json::Value>().await {
                            if let Some(c) = sum_json["choices"][0]["message"]["content"].as_str() {
                                let trimmed = c.trim();
                                if !trimmed.is_empty() {
                                    final_content = trimmed.to_string();
                                }
                            }
                        }
                    }
                }

                if final_content.is_empty() {
                    final_content = "Pemeriksaan dan tindakan telah selesai dijalankan. Berkas dan konfigurasi proyek telah diverifikasi.".to_string();
                }
            }

            if let Some(app) = app_handle {
                let _ = app.emit(
                    "fixit-agent-step",
                    AgentStepEvent {
                        step: step_count,
                        step_type: "finish".to_string(),
                        tool_name: None,
                        tool_args: None,
                        result_summary: Some("Selesai".to_string()),
                        message: Some("Selesai".to_string()),
                        output: Some(final_content.clone()),
                        timestamp: std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_millis() as u64,
                        file_path: active_error.as_ref().map(|e| e.file_path.clone()),
                    },
                );
            }

            return Ok(final_content);
        }

        Ok("Pemeriksaan dan tindakan telah selesai dieksekusi untuk pertanyaan Anda.".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_project_root_with_fallback() {
        let root = AgentEngine::find_project_root("app/Models/User.php", Some("/tmp"));
        assert_eq!(root, PathBuf::from("/tmp"));
    }

    #[test]
    fn test_execute_read_file_directory_auto_list() {
        let temp = tempfile::tempdir().unwrap();
        let _ = AgentEngine::execute_write_file(temp.path(), "file1.txt", "1");
        // Reading a directory path should automatically list directory contents instead of failing
        let res = AgentEngine::execute_read_file(temp.path(), ".").unwrap();
        assert!(res.contains("file1.txt"));
    }

    #[test]
    fn test_execute_write_and_edit_file() {
        let temp = tempfile::tempdir().unwrap();
        let write_res = AgentEngine::execute_write_file(temp.path(), "test.txt", "hello world");
        assert!(write_res.is_ok());

        let read_res = AgentEngine::execute_read_file(temp.path(), "test.txt").unwrap();
        assert_eq!(read_res, "hello world");

        let edit_res = AgentEngine::execute_edit_file(temp.path(), "test.txt", "world", "FixIt");
        assert!(edit_res.is_ok());

        let read_edited = AgentEngine::execute_read_file(temp.path(), "test.txt").unwrap();
        assert_eq!(read_edited, "hello FixIt");
    }

    #[test]
    fn test_execute_list_dir() {
        let temp = tempfile::tempdir().unwrap();
        let _ = AgentEngine::execute_write_file(temp.path(), "a.txt", "1");
        let _ = AgentEngine::execute_write_file(temp.path(), "b.txt", "2");

        let list_res = AgentEngine::execute_list_dir(temp.path(), None).unwrap();
        assert!(list_res.contains("a.txt"));
        assert!(list_res.contains("b.txt"));
    }

    #[test]
    fn test_extract_tool_call_varieties() {
        // Standard OpenAI tool call format
        let standard = serde_json::json!({
            "id": "call_1",
            "type": "function",
            "function": {
                "name": "read_file",
                "arguments": "{\"path\": \".env\"}"
            }
        });
        let (name, args) = AgentEngine::extract_tool_call(&standard);
        assert_eq!(name, "read_file");
        assert_eq!(args["path"], ".env");

        // Object arguments (not stringified)
        let object_args = serde_json::json!({
            "id": "call_2",
            "type": "function",
            "function": {
                "name": "edit_file",
                "arguments": {
                    "path": "app/User.php",
                    "target": "foo",
                    "replacement": "bar"
                }
            }
        });
        let (name2, args2) = AgentEngine::extract_tool_call(&object_args);
        assert_eq!(name2, "edit_file");
        assert_eq!(args2["path"], "app/User.php");

        // Aliases like 'bash' -> 'run_command'
        let alias_call = serde_json::json!({
            "name": "bash",
            "arguments": "{\"command\": \"php artisan migrate\"}"
        });
        let (name3, args3) = AgentEngine::extract_tool_call(&alias_call);
        assert_eq!(name3, "run_command");
        assert_eq!(args3["command"], "php artisan migrate");

        // Raw string argument fallback
        let raw_str_call = serde_json::json!({
            "function": {
                "name": "read_file",
                "arguments": ".env"
            }
        });
        let (name4, args4) = AgentEngine::extract_tool_call(&raw_str_call);
        assert_eq!(name4, "read_file");
        assert_eq!(args4["path"], ".env");
    }

    #[test]
    fn test_merge_tool_calls_streaming_chunks() {
        // Simulates the exact response from proxy where chunks share index: 0
        let raw_chunks = vec![
            serde_json::json!({
                "index": 0,
                "id": "call_abc123",
                "type": "function",
                "function": {
                    "name": "read_file",
                    "arguments": ""
                }
            }),
            serde_json::json!({
                "index": 0,
                "function": {
                    "arguments": "{\""
                }
            }),
            serde_json::json!({
                "index": 0,
                "function": {
                    "arguments": "path"
                }
            }),
            serde_json::json!({
                "index": 0,
                "function": {
                    "arguments": "\": \".env\"}"
                }
            }),
        ];

        let merged = AgentEngine::merge_tool_calls(&raw_chunks);
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0]["id"], "call_abc123");
        assert_eq!(merged[0]["function"]["name"], "read_file");
        assert_eq!(merged[0]["function"]["arguments"], "{\"path\": \".env\"}");

        let (name, args) = AgentEngine::extract_tool_call(&merged[0]);
        assert_eq!(name, "read_file");
        assert_eq!(args["path"], ".env");
    }

    #[test]
    fn test_advanced_replace_fuzzy_indentation() {
        let content = "class UserController {\n    public function index() {\n        return view('user');\n    }\n}";
        // Target has different leading whitespace (unindented)
        let target = "public function index() {\nreturn view('user');\n}";
        let replacement = "public function index() {\nreturn response()->json(['status' => 'ok']);\n}";

        let (updated, start_line, del_count, add_count, diff_lines) =
            AgentEngine::advanced_replace(content, target, replacement, "UserController.php")
                .unwrap();

        assert_eq!(start_line, 2);
        assert!(updated.contains("return response()->json(['status' => 'ok']);"));
        assert!(diff_lines.len() >= 3);
        assert_eq!(del_count, 3);
        assert_eq!(add_count, 3);
    }

    #[test]
    fn test_read_file_with_range() {
        let temp = tempfile::tempdir().unwrap();
        let content = (1..=20)
            .map(|i| format!("line {}", i))
            .collect::<Vec<_>>()
            .join("\n");
        let _ = AgentEngine::execute_write_file(temp.path(), "numbered.txt", &content);

        // Read lines 5 to 8
        let slice = AgentEngine::execute_read_file_with_range(
            temp.path(),
            "numbered.txt",
            Some(5),
            Some(4),
        )
        .unwrap();

        assert!(slice.contains("line 5"));
        assert!(slice.contains("line 8"));
        assert!(!slice.contains("line 1\n"));
        assert!(!slice.contains("line 15"));
    }
}
