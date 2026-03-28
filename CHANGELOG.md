# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] — 2026-03-28

### Added
- **Matrix Rain** screensaver mode with falling katakana/hex characters
  - Configurable letter size (8–16px) and rain speed (20–200%)
  - PNG mask support with density-based retention effect and 4-second reveal delay
  - Adjustable mask intensity (10–100%)
- **Starfield** screensaver mode — 300-star warp effect with depth-based rendering
- **Clock** screensaver mode — centered digital time with date
- **Auto lock screen** on any input (keyboard, mouse, scroll, touch)
  - Catches all keys including lone modifier keys (Shift, Alt, Ctrl, Win)
  - Mouse movement with 5px jitter threshold to avoid false triggers
  - Uses `rundll32.exe user32.dll,LockWorkStation` (no admin required)
- **Idle detection** — activates screensaver after configurable timeout (1–30 min)
- **Keep screen awake** — prevents display sleep while screensaver runs (0–60 min, configurable)
- **Power-aware** — optional "only when plugged in" mode (skips on battery)
- **Multi-monitor** — spawns fullscreen window on every connected display
- **System tray** — runs silently in background with context menu
- **Settings window** — configure all options via a native-feeling UI
- **Single instance** — prevents duplicate processes; second launch opens settings
- **Fullscreen with `alwaysOnTop('screen-saver')`** — highest z-level to cover taskbar and other windows
