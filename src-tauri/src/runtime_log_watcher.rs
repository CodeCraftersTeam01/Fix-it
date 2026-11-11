use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

/// Default maximum file size (5 MB) for initial discovery.
/// Files larger than this threshold on initial read will have their offset
/// initialized at the end of file (EOF) to avoid processing days of historical logs.
pub const MAX_INITIAL_FILE_SIZE: u64 = 5 * 1024 * 1024;

/// Incremental, zero-privilege byte-offset log reader.
pub struct LogTailer {
    pub file_offsets: HashMap<PathBuf, u64>,
}

impl LogTailer {
    pub fn new() -> Self {
        Self {
            file_offsets: HashMap::new(),
        }
    }

    /// Reads newly appended entries from the log file using the default 5 MB initial threshold.
    pub fn read_new_entries(&mut self, path: &Path) -> std::io::Result<Vec<String>> {
        self.read_new_entries_with_limit(path, MAX_INITIAL_FILE_SIZE)
    }

    /// Reads newly appended entries from the log file with a customizable initial threshold.
    pub fn read_new_entries_with_limit(
        &mut self,
        path: &Path,
        max_initial_size: u64,
    ) -> std::io::Result<Vec<String>> {
        let mut file = std::fs::File::open(path)?;
        let file_len = file.metadata()?.len();
        let path_buf = path.to_path_buf();

        let saved_offset = self.file_offsets.get(&path_buf).copied();

        let offset = match saved_offset {
            Some(saved) => {
                if file_len < saved {
                    // Truncation / rotation detected (e.g. php artisan log:clear or logrotate).
                    // Reset offset to 0 to read from the beginning.
                    0
                } else {
                    saved
                }
            }
            None => {
                // Newly encountered file
                if file_len > max_initial_size {
                    // Large Initial File Guard: skip historical logs and bookmark EOF.
                    self.file_offsets.insert(path_buf, file_len);
                    return Ok(Vec::new());
                }
                0
            }
        };

        if file_len <= offset {
            self.file_offsets.insert(path_buf, offset);
            return Ok(Vec::new());
        }

        file.seek(SeekFrom::Start(offset))?;

        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)?;

        let bytes_read = buffer.len() as u64;
        let new_offset = offset + bytes_read;
        self.file_offsets.insert(path_buf, new_offset);

        // Lossy UTF-8 decoding ensures invalid or binary bytes do not crash the reader.
        let content = String::from_utf8_lossy(&buffer);
        Ok(split_log_entries(&content))
    }
}

impl Default for LogTailer {
    fn default() -> Self {
        Self::new()
    }
}

/// Splits appended log text into logical log entries, keeping multiline stack traces together.
pub fn split_log_entries(content: &str) -> Vec<String> {
    let mut entries: Vec<String> = Vec::new();
    let mut current_entry: Vec<&str> = Vec::new();
    let mut in_python_traceback = false;
    let mut python_traceback_has_error_line = false;

    for line in content.lines() {
        if line.trim().is_empty() {
            if !current_entry.is_empty() {
                current_entry.push(line);
            }
            continue;
        }

        let is_continuation = is_line_continuation(
            line,
            in_python_traceback,
            python_traceback_has_error_line,
        );

        if is_continuation && !current_entry.is_empty() {
            current_entry.push(line);
            if in_python_traceback && !line.starts_with(' ') && !line.starts_with('\t') {
                if line.starts_with("During handling of the above exception")
                    || line.starts_with("The above exception was the direct cause")
                {
                    python_traceback_has_error_line = false;
                } else if !line.starts_with("Traceback (most recent call last):") {
                    python_traceback_has_error_line = true;
                }
            }
        } else {
            // Flush preceding entry
            if !current_entry.is_empty() {
                let entry_str = current_entry.join("\n").trim().to_string();
                if !entry_str.is_empty() {
                    entries.push(entry_str);
                }
                current_entry.clear();
            }

            in_python_traceback = line.starts_with("Traceback (most recent call last):");
            python_traceback_has_error_line = false;
            current_entry.push(line);
        }
    }

    if !current_entry.is_empty() {
        let entry_str = current_entry.join("\n").trim().to_string();
        if !entry_str.is_empty() {
            entries.push(entry_str);
        }
    }

    entries
}

fn is_line_continuation(
    line: &str,
    in_python_traceback: bool,
    python_traceback_has_error_line: bool,
) -> bool {
    // Indented lines (spaces or tabs) are standard stack trace / multiline continuations
    if line.starts_with(' ') || line.starts_with('\t') {
        return true;
    }

    // PHP / Laravel stack trace headers and numbered frames
    if line.starts_with("[stacktrace]")
        || line.starts_with('#')
        || line.starts_with("Stack trace:")
        || line.starts_with("Stack Trace:")
        || line.starts_with("thrown in ")
    {
        return true;
    }

    // Generic chained exceptions and continuations
    if line.starts_with("Caused by:")
        || line.starts_with("nested exception is")
        || line.starts_with("...")
        || line.starts_with("---")
        || line.starts_with('^')
        || line == "}"
        || line == "]"
        || line == ");"
        || line == ")"
        || line == "};"
    {
        return true;
    }

    // Python traceback: include the final unindented exception line (e.g. ValueError: ...)
    // or chained exception separators
    if in_python_traceback {
        if !python_traceback_has_error_line {
            return true;
        }
        if line.starts_with("During handling of the above exception")
            || line.starts_with("The above exception was the direct cause")
            || line.starts_with("Traceback (most recent call last):")
        {
            return true;
        }
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_incremental_appending() {
        let mut tailer = LogTailer::new();
        let mut tmp = NamedTempFile::new().unwrap();

        // 1. First write: single entry
        writeln!(tmp, "[2026-11-11 10:00:00] local.INFO: Server started").unwrap();
        tmp.flush().unwrap();

        let entries1 = tailer.read_new_entries(tmp.path()).unwrap();
        assert_eq!(entries1.len(), 1);
        assert!(entries1[0].contains("Server started"));

        // 2. Second write: append multiline error
        writeln!(tmp, "[2026-11-11 10:01:00] local.ERROR: Call to undefined method").unwrap();
        writeln!(tmp, "[stacktrace]").unwrap();
        writeln!(tmp, "#0 /app/Http/Controllers/TestController.php:15").unwrap();
        tmp.flush().unwrap();

        let entries2 = tailer.read_new_entries(tmp.path()).unwrap();
        // Should only read the newly appended entry, not the first entry!
        assert_eq!(entries2.len(), 1);
        assert!(entries2[0].contains("Call to undefined method"));
        assert!(entries2[0].contains("#0 /app/Http/Controllers/TestController.php:15"));

        // 3. Third read without writes: should return empty
        let entries3 = tailer.read_new_entries(tmp.path()).unwrap();
        assert!(entries3.is_empty());
    }

    #[test]
    fn test_file_truncation_or_clearing_reset() {
        let mut tailer = LogTailer::new();
        let mut tmp = NamedTempFile::new().unwrap();

        // Write initial data
        writeln!(tmp, "Line 1: Some long log output here to establish high offset").unwrap();
        writeln!(tmp, "Line 2: Another line").unwrap();
        tmp.flush().unwrap();

        let entries = tailer.read_new_entries(tmp.path()).unwrap();
        assert!(!entries.is_empty());
        let initial_offset = *tailer.file_offsets.get(tmp.path()).unwrap();
        assert!(initial_offset > 0);

        // Truncate file (e.g. php artisan log:clear or file overwrite)
        let file = std::fs::OpenOptions::new()
            .write(true)
            .truncate(true)
            .open(tmp.path())
            .unwrap();
        drop(file);

        // Now write short data
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .open(tmp.path())
            .unwrap();
        writeln!(file, "New Line After Clear").unwrap();
        file.flush().unwrap();

        // Read again: should detect truncation, reset offset to 0, and read the new line
        let entries_after_clear = tailer.read_new_entries(tmp.path()).unwrap();
        assert_eq!(entries_after_clear.len(), 1);
        assert_eq!(entries_after_clear[0], "New Line After Clear");
    }

    #[test]
    fn test_large_file_initial_offset_at_eof() {
        let mut tailer = LogTailer::new();
        let mut tmp = NamedTempFile::new().unwrap();

        // Write > 5MB of dummy historical log
        let dummy_chunk = vec![b'A'; 1024 * 1024]; // 1MB
        for _ in 0..6 {
            tmp.write_all(&dummy_chunk).unwrap();
        }
        tmp.flush().unwrap();

        let file_len = tmp.path().metadata().unwrap().len();
        assert!(file_len > MAX_INITIAL_FILE_SIZE);

        // First encounter of large file: should skip historical entries and set offset to EOF
        let entries = tailer.read_new_entries(tmp.path()).unwrap();
        assert!(entries.is_empty());
        assert_eq!(*tailer.file_offsets.get(tmp.path()).unwrap(), file_len);

        // Now append a new log entry
        writeln!(tmp, "[2026-11-11 12:00:00] local.ERROR: New Crash").unwrap();
        tmp.flush().unwrap();

        let new_entries = tailer.read_new_entries(tmp.path()).unwrap();
        assert_eq!(new_entries.len(), 1);
        assert!(new_entries[0].contains("New Crash"));
    }

    #[test]
    fn test_lossy_utf8_binary_bytes() {
        let mut tailer = LogTailer::new();
        let mut tmp = NamedTempFile::new().unwrap();

        // Write non-utf8 invalid bytes mixed with text
        tmp.write_all(&[0xFF, 0xFE, 0xFD, b'H', b'e', b'l', b'l', b'o', b'\n']).unwrap();
        tmp.flush().unwrap();

        let entries = tailer.read_new_entries(tmp.path()).unwrap();
        assert_eq!(entries.len(), 1);
        assert!(entries[0].contains("Hello"));
    }

    #[test]
    fn test_group_multiline_entries() {
        let content = r#"[2026-11-11 16:30:00] local.ERROR: Call to undefined method in /app/Http/Controllers/AuthController.php:42
[stacktrace]
#0 /app/Http/Controllers/AuthController.php(42): App\Models\User::authentikasi()
#1 /vendor/laravel/framework/src/Illuminate/Routing/Controller.php(54): App\Http\Controllers\AuthController->login()
[2026-11-11 16:31:00] local.INFO: User logged in
Traceback (most recent call last):
  File "app.py", line 10, in <module>
    foo()
ZeroDivisionError: division by zero
[2026-11-11 16:32:00] local.INFO: Request completed
"#;

        let entries = split_log_entries(content);
        assert_eq!(entries.len(), 4);

        // Entry 0: Laravel error + stack trace
        assert!(entries[0].contains("local.ERROR: Call to undefined method"));
        assert!(entries[0].contains("#0 /app/Http/Controllers/AuthController.php"));
        assert!(entries[0].contains("#1 /vendor/laravel"));

        // Entry 1: Info log
        assert_eq!(entries[1], "[2026-11-11 16:31:00] local.INFO: User logged in");

        // Entry 2: Python traceback
        assert!(entries[2].contains("Traceback (most recent call last):"));
        assert!(entries[2].contains("ZeroDivisionError: division by zero"));

        // Entry 3: Final Info log
        assert_eq!(entries[3], "[2026-11-11 16:32:00] local.INFO: Request completed");
    }

    #[test]
    fn test_group_nodejs_multiline_entry() {
        let content = r#"ReferenceError: token is not defined
    at login (/app/server.js:25:9)
    at Layer.handle [as handle_request] (/app/router.js:45:12)
Server listening on port 3000
"#;

        let entries = split_log_entries(content);
        assert_eq!(entries.len(), 2);
        assert!(entries[0].contains("ReferenceError: token is not defined"));
        assert!(entries[0].contains("at login (/app/server.js:25:9)"));
        assert_eq!(entries[1], "Server listening on port 3000");
    }
}
