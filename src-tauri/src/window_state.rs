use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct WindowSize {
    pub width: u32,
    pub height: u32,
}

#[allow(dead_code)]
#[derive(Debug, Default)]
pub struct WindowStateTracker {
    pending: Option<WindowSize>,
    last_normal: Option<WindowSize>,
    maximized: bool,
}

// Keep the event rules independent from Tauri so resize and close edge cases stay unit-testable.
#[allow(dead_code)]
impl WindowStateTracker {
    pub fn record_resize(&mut self, size: WindowSize) {
        if self.maximized {
            return;
        }
        self.pending = Some(size);
        self.last_normal = Some(size);
    }

    pub fn set_maximized(&mut self, maximized: bool) {
        self.maximized = maximized;
    }

    pub fn take_pending(&mut self) -> Option<WindowSize> {
        self.pending.take()
    }

    pub fn last_normal_size(&self) -> Option<WindowSize> {
        self.last_normal
    }

    pub fn close_size(&mut self) -> Option<WindowSize> {
        self.pending.take().or(self.last_normal)
    }
}

pub fn physical_to_logical(width: u32, height: u32, scale_factor: f64) -> WindowSize {
    let scale = if scale_factor.is_finite() && scale_factor > 0.0 {
        scale_factor
    } else {
        1.0
    };
    WindowSize {
        width: (f64::from(width) / scale).round().max(1.0) as u32,
        height: (f64::from(height) / scale).round().max(1.0) as u32,
    }
}

#[cfg(test)]
mod tests {
    use super::{physical_to_logical, WindowSize, WindowStateTracker};

    #[test]
    fn physical_size_is_converted_to_logical_size() {
        assert_eq!(
            physical_to_logical(1600, 900, 1.25),
            WindowSize {
                width: 1280,
                height: 720
            }
        );
    }

    #[test]
    fn resize_tracker_keeps_only_the_latest_size() {
        let mut tracker = WindowStateTracker::default();
        tracker.record_resize(WindowSize {
            width: 1000,
            height: 700,
        });
        tracker.record_resize(WindowSize {
            width: 1200,
            height: 800,
        });
        assert_eq!(
            tracker.take_pending(),
            Some(WindowSize {
                width: 1200,
                height: 800
            })
        );
        assert_eq!(tracker.take_pending(), None);
    }

    #[test]
    fn maximized_resize_does_not_replace_last_normal_size() {
        let mut tracker = WindowStateTracker::default();
        tracker.record_resize(WindowSize {
            width: 1200,
            height: 800,
        });
        tracker.set_maximized(true);
        tracker.record_resize(WindowSize {
            width: 1920,
            height: 1080,
        });
        assert_eq!(
            tracker.last_normal_size(),
            Some(WindowSize {
                width: 1200,
                height: 800
            })
        );
    }

    #[test]
    fn close_flushes_pending_size_immediately() {
        let mut tracker = WindowStateTracker::default();
        tracker.record_resize(WindowSize {
            width: 1200,
            height: 800,
        });
        assert_eq!(
            tracker.close_size(),
            Some(WindowSize {
                width: 1200,
                height: 800
            })
        );
        assert_eq!(tracker.take_pending(), None);
    }
}
