use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FloodAction {
    /// First time or cooled down error: proceed with fresh AI analysis
    ProcessFresh,
    /// Detected as rapid repeat (> 2 hits within 5 seconds, e.g. setInterval / polling loop):
    /// Do NOT call AI again; update counter on existing card
    LoopThrottled { hit_count: u32 },
    /// Redundant hit within short debounce: ignore completely
    CachedOrIgnored,
}

#[derive(Debug, Clone)]
pub struct ErrorHistory {
    pub file: String,
    pub hit_count: u32,
    pub first_seen: Instant,
    pub last_seen: Instant,
}

pub struct FloodGuard {
    entries: HashMap<String, ErrorHistory>,
    cooldown_window: Duration,
}

impl Default for FloodGuard {
    fn default() -> Self {
        Self::new()
    }
}

impl FloodGuard {
    pub fn new() -> Self {
        Self {
            entries: HashMap::new(),
            cooldown_window: Duration::from_secs(5),
        }
    }

    pub fn with_cooldown(window: Duration) -> Self {
        Self {
            entries: HashMap::new(),
            cooldown_window: window,
        }
    }

    /// Computes a stable fingerprint across whitespaces and formatting quirks
    pub fn compute_fingerprint(
        file: &str,
        line: Option<usize>,
        err_type: &str,
        msg: &str,
    ) -> String {
        let mut hasher = DefaultHasher::new();
        let norm_file = file.trim().replace('\\', "/");
        norm_file.hash(&mut hasher);
        line.hash(&mut hasher);
        err_type.trim().to_lowercase().hash(&mut hasher);

        let normalized_msg: String = msg
            .split_whitespace()
            .collect::<Vec<&str>>()
            .join(" ");
        normalized_msg.trim().to_lowercase().hash(&mut hasher);

        format!("{:016x}", hasher.finish())
    }

    /// Evaluate incoming error. Generates fingerprint from file, line, error_type, and normalized message.
    pub fn evaluate(
        &mut self,
        file: &str,
        line: Option<usize>,
        err_type: &str,
        msg: &str,
    ) -> FloodAction {
        let now = Instant::now();

        // Prune stale entries older than 60 seconds
        self.entries.retain(|_, history| {
            now.duration_since(history.last_seen) < Duration::from_secs(60)
        });

        let fingerprint = Self::compute_fingerprint(file, line, err_type, msg);

        if let Some(history) = self.entries.get_mut(&fingerprint) {
            let elapsed = now.duration_since(history.last_seen);
            if elapsed <= self.cooldown_window {
                history.hit_count = history.hit_count.saturating_add(1);
                history.last_seen = now;
                FloodAction::LoopThrottled {
                    hit_count: history.hit_count,
                }
            } else {
                // Cooled down: reset count and treat as fresh
                history.hit_count = 1;
                history.first_seen = now;
                history.last_seen = now;
                FloodAction::ProcessFresh
            }
        } else {
            let norm_file = file.trim().replace('\\', "/");
            self.entries.insert(
                fingerprint,
                ErrorHistory {
                    file: norm_file,
                    hit_count: 1,
                    first_seen: now,
                    last_seen: now,
                },
            );
            FloodAction::ProcessFresh
        }
    }

    /// Reset error history for a file when the file is modified or fixed
    pub fn reset_file(&mut self, file: &str) {
        let norm = file.trim().replace('\\', "/");
        self.entries.retain(|_, history| {
            let f1 = &history.file;
            let f2 = &norm;
            if f1 == f2 {
                return false;
            }
            if f1.ends_with(f2) && f1[..f1.len() - f2.len()].ends_with('/') {
                return false;
            }
            if f2.ends_with(f1) && f2[..f2.len() - f1.len()].ends_with('/') {
                return false;
            }
            true
        });
    }

    /// Optional lookup for current hit count of an error
    pub fn get_hit_count(
        &self,
        file: &str,
        line: Option<usize>,
        err_type: &str,
        msg: &str,
    ) -> Option<u32> {
        let fingerprint = Self::compute_fingerprint(file, line, err_type, msg);
        self.entries.get(&fingerprint).map(|h| h.hit_count)
    }

    /// Clear all active histories
    pub fn clear(&mut self) {
        self.entries.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fresh_error_returns_process_fresh() {
        let mut guard = FloodGuard::new();
        let action = guard.evaluate("src/App.tsx", Some(10), "TypeError", "Cannot read properties of undefined");
        assert_eq!(action, FloodAction::ProcessFresh);
    }

    #[test]
    fn test_repeat_error_within_5s_returns_loop_throttled() {
        let mut guard = FloodGuard::new();
        let action1 = guard.evaluate("src/App.tsx", Some(10), "TypeError", "Cannot read properties of undefined");
        assert_eq!(action1, FloodAction::ProcessFresh);

        let action2 = guard.evaluate("src/App.tsx", Some(10), "TypeError", "Cannot read properties of undefined");
        assert_eq!(action2, FloodAction::LoopThrottled { hit_count: 2 });
    }

    #[test]
    fn test_multiple_rapid_bursts_increment_hit_count_without_fresh() {
        let mut guard = FloodGuard::new();
        let _ = guard.evaluate("api/fetch.js", Some(42), "NetworkError", "Fetch failed: 404 Not Found");

        for i in 2..=10 {
            let action = guard.evaluate("api/fetch.js", Some(42), "NetworkError", "Fetch failed: 404 Not Found");
            assert_eq!(action, FloodAction::LoopThrottled { hit_count: i });
        }
    }

    #[test]
    fn test_reset_file_clears_fingerprint_history() {
        let mut guard = FloodGuard::new();
        let _ = guard.evaluate("src/App.tsx", Some(10), "TypeError", "Cannot read properties of undefined");
        let action_repeat = guard.evaluate("src/App.tsx", Some(10), "TypeError", "Cannot read properties of undefined");
        assert_eq!(action_repeat, FloodAction::LoopThrottled { hit_count: 2 });

        // Reset file
        guard.reset_file("src/App.tsx");

        // Next evaluation for that file must be ProcessFresh again
        let action_after_reset = guard.evaluate("src/App.tsx", Some(10), "TypeError", "Cannot read properties of undefined");
        assert_eq!(action_after_reset, FloodAction::ProcessFresh);
    }

    #[test]
    fn test_whitespace_normalization_in_fingerprint() {
        let mut guard = FloodGuard::new();
        let _ = guard.evaluate("src/App.tsx", Some(10), "TypeError", "Cannot read properties of undefined\n  ");
        // Same error with different whitespace
        let action = guard.evaluate("src/App.tsx", Some(10), "TypeError", "Cannot   read properties of undefined");
        assert_eq!(action, FloodAction::LoopThrottled { hit_count: 2 });
    }

    #[test]
    fn test_cooldown_window_resets_to_fresh() {
        // Use a short cooldown window for testing
        let mut guard = FloodGuard::with_cooldown(Duration::from_millis(50));
        let action1 = guard.evaluate("src/timer.ts", Some(5), "RangeError", "Maximum call stack size exceeded");
        assert_eq!(action1, FloodAction::ProcessFresh);

        std::thread::sleep(Duration::from_millis(60));

        let action2 = guard.evaluate("src/timer.ts", Some(5), "RangeError", "Maximum call stack size exceeded");
        assert_eq!(action2, FloodAction::ProcessFresh);
    }
}
