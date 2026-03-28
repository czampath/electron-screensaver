# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] — 2026-03-28

### Added
- **Matrix Rain** screensaver mode
  - **WebGL2 GPU renderer** — instanced draw calls with a pre-built glyph atlas (R8 luminance texture), ping-pong framebuffers for the fade trail, and a fullscreen blit to the canvas each frame
  - **Canvas 2D fallback** — automatic fallback when WebGL2 is unavailable
  - Configurable letter size (8–16px), rain speed (20–200%), and rain opacity (20–100%)
  - **11 color styles** — Classic Green, Neon Blue, Amber Terminal, Random (per-char/per-column), RGB (per-char/per-column), Green Rain + Rainbow Mask, Green Rain + RGB Mask, Green Rain + Scrolling Rainbow Mask
  - PNG mask support with density-based retention effect and 4-second reveal delay (2-second opacity ramp); mask image scales to fit 80% screen width / 70% screen height
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
- **Multi-monitor** — spawns fullscreen window on every connected display; taskbar position aggressively reasserted on show
- **System tray** — runs silently in background with context menu
- **Settings window** — configure all options via a native-feeling dark UI
  - Sliders for idle timeout, awake timeout, letter size, rain speed, rain opacity, mask intensity
  - Color style dropdown with 11 options
  - Mask image picker (PNG/WebP ≤500KB), inline preview, and clear button
- **Single instance** — prevents duplicate processes; second launch opens settings
- **Fullscreen with `alwaysOnTop('screen-saver')`** — highest z-level to cover taskbar and other windows; opacity fades in after 100ms black frame to avoid flash
