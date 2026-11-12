use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::mpsc::channel;
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

pub struct SmartIdleWatcher {
    idle_delay: Duration,
    state: Arc<(Mutex<Option<(PathBuf, Instant)>>, Condvar)>,
}

impl SmartIdleWatcher {
    pub fn new(idle_delay_ms: u64) -> Self {
        Self {
            idle_delay: Duration::from_millis(idle_delay_ms),
            state: Arc::new((Mutex::new(None), Condvar::new())),
        }
    }

    /// Starts watching paths with smart idle debounce, real-time writing detection, and log change handling
    pub fn watch_paths<F1, F2, F3>(
        &self,
        paths: Vec<PathBuf>,
        on_writing: F1,
        on_idle_detected: F2,
        on_log_event: F3,
    ) -> Result<(), String>
    where
        F1: Fn(PathBuf) + Send + Sync + 'static,
        F2: Fn(PathBuf) + Send + Sync + 'static,
        F3: Fn(PathBuf) + Send + Sync + 'static,
    {
        let (tx, rx) = channel();
        let mut watcher = RecommendedWatcher::new(tx, notify::Config::default())
            .map_err(|e| format!("Failed to create watcher: {}", e))?;

        for p in &paths {
            if p.exists() {
                let _ = watcher.watch(p, RecursiveMode::Recursive);
            }
        }

        let state = Arc::clone(&self.state);
        let idle_delay = self.idle_delay;
        let writing_cb = Arc::new(on_writing);
        let idle_cb = Arc::new(on_idle_detected);
        let log_cb = Arc::new(on_log_event);

        // Background worker thread that collects file change events and debounces typing
        std::thread::spawn(move || {
            let _watcher = watcher; // Keep watcher alive in this thread
            while let Ok(event_res) = rx.recv() {
                if let Ok(Event { paths, .. }) = event_res {
                    for path in paths {
                        // Skip non-files, temporary files, git folders, target, and node_modules
                        let path_str = path.to_string_lossy();
                        if path_str.contains(".git")
                            || path_str.contains("node_modules")
                            || path_str.contains("/target/")
                            || path_str.contains(".tmp")
                            || path_str.ends_with('~')
                            || path_str.ends_with(".swp")
                        {
                            continue;
                        }

                        // Check if it's a log file
                        let is_log = path.extension().map_or(false, |ext| {
                            ext.to_string_lossy().eq_ignore_ascii_case("log")
                        }) || path_str.ends_with(".log");

                        if is_log {
                            log_cb(path);
                            continue;
                        }

                        // Only watch supported code files
                        let is_code = path.extension().map_or(false, |ext| {
                            let e = ext.to_string_lossy().to_lowercase();
                            matches!(e.as_str(), "php" | "py" | "js" | "mjs" | "cjs" | "ts" | "tsx" | "jsx" | "json")
                        });
                        if !is_code {
                            continue;
                        }

                        if let Ok(mut lock) = state.0.lock() {
                            *lock = Some((path.clone(), Instant::now()));
                            state.1.notify_one();
                        }

                        // Immediately notify that student is writing to this file
                        writing_cb(path);
                    }
                }
            }
        });

        // Dedicated event-driven waiter thread checking for the quiet "idle" window after typing stops
        // Uses Condvar to achieve zero CPU wakeups and deep sleep when no typing is occurring
        let state_checker = Arc::clone(&self.state);
        std::thread::spawn(move || {
            let (lock, cvar) = &*state_checker;
            let mut current = match lock.lock() {
                Ok(guard) => guard,
                Err(poisoned) => poisoned.into_inner(),
            };

            loop {
                match current.take() {
                    None => {
                        // Deep sleep - zero CPU ticking while user is idle or in background
                        current = match cvar.wait(current) {
                            Ok(g) => g,
                            Err(p) => p.into_inner(),
                        };
                    }
                    Some((path, recorded_at)) => {
                        let elapsed = recorded_at.elapsed();
                        if elapsed >= idle_delay {
                            // Idle window achieved! Student stopped typing for idle_delay.
                            drop(current);
                            idle_cb(path);
                            current = match lock.lock() {
                                Ok(g) => g,
                                Err(p) => p.into_inner(),
                            };
                        } else {
                            let remaining = idle_delay - elapsed;
                            *current = Some((path, recorded_at));
                            let (guard, _) = match cvar.wait_timeout(current, remaining) {
                                Ok(res) => res,
                                Err(p) => p.into_inner(),
                            };
                            current = guard;
                        }
                    }
                }
            }
        });

        Ok(())
    }
}

