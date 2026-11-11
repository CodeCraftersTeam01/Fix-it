use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::mpsc::channel;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tokio::time::Instant;

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

    /// Starts watching paths with smart idle debounce
    pub fn watch_paths<F>(&self, paths: Vec<PathBuf>, on_idle_detected: F) -> Result<(), String>
    where
        F: Fn(PathBuf) + Send + Sync + 'static,
    {
        let (tx, rx) = channel();
        let mut watcher = RecommendedWatcher::new(tx, notify::Config::default())
            .map_err(|e| format!("Failed to create watcher: {}", e))?;

        for p in &paths {
            if p.exists() {
                watcher
                    .watch(p, RecursiveMode::Recursive)
                    .map_err(|e| format!("Failed to watch path {:?}: {}", p, e))?;
            }
        }

        let state = Arc::clone(&self.last_event_time);
        let idle_delay = self.idle_delay;
        let callback = Arc::new(on_idle_detected);

        // Background worker loop that collects events and resets the debounce timer
        std::thread::spawn(move || {
            let _watcher = watcher; // Keep watcher alive
            while let Ok(event_res) = rx.recv() {
                if let Ok(Event { paths, .. }) = event_res {
                    if let Some(first_path) = paths.into_iter().next() {
                        // Skip temporary files, git folders, and node_modules
                        let path_str = first_path.to_string_lossy();
                        if path_str.contains(".git") || path_str.contains("node_modules") || path_str.contains(".tmp") {
                            continue;
                        }

                        let state_clone = Arc::clone(&state);
                        tokio::spawn(async move {
                            let mut lock = state_clone.lock().await;
                            *lock = Some((first_path, Instant::now()));
                        });
                    }
                }
            }
        });

        // Ticker loop checking for the quiet "idle" window after typing stops
        let state_checker = Arc::clone(&self.last_event_time);
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_millis(250)).await;
                let mut lock = state_checker.lock().await;
                if let Some((path, recorded_at)) = lock.take() {
                    if recorded_at.elapsed() >= idle_delay {
                        // Idle window achieved! Mahasiswa has stopped typing for idle_delay.
                        callback(path);
                    } else {
                        // Put it back because debounce duration hasn't elapsed yet
                        *lock = Some((path, recorded_at));
                    }
                }
            }
        });

        Ok(())
    }
}

