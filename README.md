# Matrix Screensaver

A lightweight Electron desktop app that runs a Matrix Rain screensaver when your PC is idle and **automatically locks the screen** on any input. No admin privileges required.

![Windows](https://img.shields.io/badge/platform-Windows-blue)
![Electron](https://img.shields.io/badge/electron-33+-green)
![License](https://img.shields.io/badge/license-MIT-yellow)

## Features

- **Three screensaver modes** — Matrix Rain, Starfield, Clock
- **Auto lock screen** — any keypress (including lone modifiers like Shift, Alt, Ctrl, Win), mouse movement, click, scroll, or touch instantly locks the workstation via `Win+L`
- **Idle detection** — activates automatically after a configurable idle timeout (1–30 min)
- **Keep screen awake** — prevents Windows from sleeping the display while the screensaver runs, with a configurable awake timeout (0–60 min)
- **Power-aware** — optionally only activates when plugged in (skips on battery)
- **Multi-monitor** — covers all connected displays
- **Matrix mask** — upload a PNG with transparency to create a ghostly retention pattern in the rain
- **System tray** — runs silently in the background, accessible via tray icon
- **No admin required** — runs from any folder, no installation needed
- **Single instance** — prevents duplicate processes; re-launching opens settings

## Quick Start

```bash
# Install dependencies
npm install

# Run (starts silently in system tray)
npm start

# Open settings window directly
npm run config

# Launch screensaver immediately (for testing)
npm run screensaver
```

## Screensaver Modes

### Matrix Rain
Classic falling green characters (katakana + hex). Configurable letter size (8–16px) and rain speed (20–200%). Supports an optional **mask image** — upload a PNG with a transparent background and opaque areas will create a ghostly character retention pattern that fades in after 4 seconds.

### Starfield
300-star warp-speed effect with depth-based sizing and alpha.

### Clock
Centered digital clock (HH:MM:SS) with the full date below. White on black.

## Settings

All settings are accessible via the config window (double-click the tray icon, or `npm run config`):

| Setting | Range | Default | Description |
|---------|-------|---------|-------------|
| Mode | Matrix / Starfield / Clock | Matrix | Screensaver animation type |
| Idle Timeout | 1–30 min | 5 min | Time of inactivity before screensaver activates |
| Keep Screen Awake | 0–60 min | 15 min | How long to prevent display sleep (0 = indefinite) |
| Only When Plugged In | on/off | on | Skip activation when on battery power |
| Letter Size | 8–16 px | 16 px | Matrix rain character size |
| Rain Speed | 20–200% | 100% | Matrix rain animation speed |
| Mask Effect | on/off | off | Enable PNG mask retention pattern |
| Mask Image | PNG/WebP ≤500KB | — | Transparency-based mask for matrix rain |
| Mask Intensity | 10–100% | 50% | How visible/persistent the mask pattern is |

Settings are stored in `%APPDATA%/matrix-screensaver/MatrixScreensaver/config.json`.

## Security Model

The app locks your workstation by calling:
```
rundll32.exe user32.dll,LockWorkStation
```

This is the programmatic equivalent of pressing `Win+L`. It does **not** require admin privileges and works on all Windows 10/11 machines.

### Input coverage

| Input | Action |
|-------|--------|
| Any key (A–Z, F1–F12, Space, Enter, etc.) | Lock screen |
| Modifier keys alone (Shift, Alt, Ctrl, Win) | Lock screen |
| Mouse movement (>5px threshold) | Lock screen |
| Mouse click / scroll / touch | Lock screen |
| Right-click (context menu) | Lock screen |
| Alt+F4 | Keydown fires first → lock screen |
| Ctrl+Alt+Del | Windows kernel intercepts → Security screen |

The screensaver window runs fullscreen with `alwaysOnTop` at `'screen-saver'` z-level (the highest Windows supports), covering all monitors.

## CLI Flags

| Flag | Description |
|------|-------------|
| *(none)* | Start silently in system tray with idle monitoring |
| `--config` | Open the settings window |
| `--screensaver` | Launch the screensaver immediately |

## Auto-start on Login

The app supports auto-start via Electron's `app.setLoginItemSettings()`, which writes to `HKCU` (user-level registry — no admin needed). This can be wired to a toggle in the config window using the `setLoginItem` API exposed in the preload bridge.

## Project Structure

```
matrix-screensaver/
├── main.js              Electron main process — window mgmt, idle detection, tray, lock
├── preload.js           Context bridge — exposes lock/config APIs to renderer
├── package.json
├── src/
│   ├── screensaver.html Fullscreen canvas page
│   ├── screensaver.js   Matrix/Starfield/Clock renderers + input detection
│   ├── screensaver.css  Fullscreen black background, hidden cursor
│   ├── config.html      Settings window UI
│   └── config.js        Settings window logic
└── node_modules/
```

## Requirements

- **Windows 10/11** (uses `rundll32.exe` for screen lock and `powerMonitor` for idle/power detection)
- **Node.js 18+** (for development)
- No admin privileges required
