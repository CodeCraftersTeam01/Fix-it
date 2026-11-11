use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::mpsc::channel;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub struct SmartIdleWatcher {
    idle_delay: Duration,
    last_event_time: Arc<Mutex<Option<(PathBuf, Instant)>>>,
}

impl SmartIdleWatcher {
    pub fn new(idle_delay_ms: u64) -> Self {
        Self {
            idle_delay: Duration::from_millis(idle_delay_ms),
            last_event_time: Arc::new(Mutex::new(None)),
        }
    }

    /// Starts watching paths with smart idle debounce and real-time writing detection
    pub fn watch_paths<F1, F2>(
        &self,
        paths: Vec<PathBuf>,
        on_writing: F1,
        on_idle_detected: F2,
    ) -> Result<(), String>
    where
        F1: Fn(PathBuf) + Send + Sync + 'static,
        F2: Fn(PathBuf) + Send + Sync + 'static,
    {
        let (tx, rx) = channel();
        let mut watcher = RecommendedWatcher::new(tx, notify::Config::default())
            .map_err(|e| format!("Failed to create watcher: {}", e))?;

        for p in &paths {
            if p.exists() {
                let _ = watcher.watch(p, RecursiveMode::Recursive);
            }
        }

        let state = Arc::clone(&self.last_event_time);
        let idle_delay = self.idle_delay;
        let writing_cb = Arc::new(on_writing);
        let idle_cb = Arc::new(on_idle_detected);

        // Background worker thread that collects file change events and debounces typing
        std::thread::spawn(move || {
            let _watcher = watcher; // Keep watcher alive in this thread
            while let Ok(event_res) = rx.recv() {
                if let Ok(Event { paths, .. }) = event_res {
                    if let Some(first_path) = paths.into_iter().next() {
                        // Skip non-files, temporary files, git folders, target, and node_modules
                        let path_str = first_path.to_string_lossy();
                        if path_str.contains(".git")
                            || path_str.contains("node_modules")
                            || path_str.contains("/target/")
                            || path_str.contains(".tmp")
                            || path_str.ends_with('~')
                            || path_str.ends_with(".swp")
                        {
                            continue;
                        }

                        // Only watch supported code files
                        let is_code = first_path.extension().map_or(false, |ext| {
                            let e = ext.to_string_lossy().to_lowercase();
                            matches!(e.as_str(), "php" | "py" | "js" | "mjs" | "cjs" | "ts" | "tsx" | "jsx" | "json")
                        });
                        if !is_code {
                            continue;
                        }

                        if let Ok(mut lock) = state.lock() {
                            *lock = Some((first_path.clone(), Instant::now()));
                        }

                        // Immediately notify that student is writing to this file
                        writing_cb(first_path);
                    }
                }
            }
        });

        // Dedicated ticker thread checking for the quiet "idle" window after typing stops
        let state_checker = Arc::clone(&self.last_event_time);
        std::thread::spawn(move || {
            loop {
                std::thread::sleep(Duration::from_millis(250));
                let to_notify = {
                    if let Ok(mut lock) = state_checker.lock() {
                        if let Some((path, recorded_at)) = lock.take() {
                            if recorded_at.elapsed() >= idle_delay {
                                // Idle window achieved! Student stopped typing for idle_delay.
                                Some(path)
                            } else {
                                // Debounce not elapsed yet, put it back
                                *lock = Some((path, recorded_at));
                                None
                            }
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                };

                if let Some(path) = to_notify {
                    idle_cb(path);
                }
            }
        });

        Ok(())
    }
}

