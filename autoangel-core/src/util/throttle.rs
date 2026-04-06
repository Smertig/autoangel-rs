/// Time-based throttle. Zero interval means no throttling (always allows).
pub struct Throttle {
    interval: std::time::Duration,
    last_call: web_time::Instant,
}

impl Throttle {
    pub fn new(interval_ms: u32) -> Self {
        let interval = std::time::Duration::from_millis(interval_ms as u64);
        Self {
            interval,
            last_call: web_time::Instant::now() - interval,
        }
    }

    /// Check whether enough time has elapsed; if so, record the call and return `true`.
    pub fn allow(&mut self) -> bool {
        let now = web_time::Instant::now();
        if now.duration_since(self.last_call) >= self.interval {
            self.last_call = now;
            true
        } else {
            false
        }
    }
}
