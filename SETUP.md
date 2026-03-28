# Setup Guide

Step-by-step instructions to get the Matrix Screensaver running on your Windows machine.

## Prerequisites

- **Node.js 18+** — [Download](https://nodejs.org/)
  - Verify: `node --version`
- **Windows 10 or 11**
- **No admin rights required**

## Installation

### 1. Clone or copy the project

```bash
git clone <repo-url> matrix-screensaver
cd matrix-screensaver
```

Or copy the folder to a location of your choice (e.g., `C:\Users\<you>\Apps\matrix-screensaver`).

### 2. Install dependencies

```bash
npm install
```

This installs Electron (~150MB). It's the only dependency.

### 3. Run the app

```bash
npm start
```

The app starts **silently in the system tray** (small green "M" icon near the clock). It will automatically launch the screensaver when your PC is idle.

## Configuration

Double-click the tray icon to open Settings, or run:

```bash
npm run config
```

### Recommended first-time settings

1. **Mode** — Pick your screensaver: Matrix Rain (default), Starfield, or Clock
2. **Idle Timeout** — How many minutes of inactivity before the screensaver starts (default: 5 min)
3. **Keep Screen Awake** — How long the screensaver runs before allowing Windows to sleep the display (default: 15 min). Set to 0 for indefinite.
4. **Only When Plugged In** — Enabled by default. Disable if you want the screensaver on battery too.

### Matrix-specific settings

- **Letter Size** — Character size in the rain (8–16px)
- **Rain Speed** — Animation speed (20–200%)
- **Mask Effect** — Toggle on, then upload a PNG with a transparent background. Opaque areas create a ghostly retention pattern in the rain.

## Testing the screensaver

To launch immediately without waiting for idle timeout:

```bash
npm run screensaver
```

Any input (keypress, mouse move, click) will lock the screen and dismiss the screensaver.

## Auto-start on Login

To have the app launch automatically when you log in to Windows:

### Option A: Windows Startup folder (no admin)

1. Press `Win+R`, type `shell:startup`, press Enter
2. Create a shortcut in that folder pointing to a `.bat` file:

**Create `start-screensaver.bat`** in the project folder:
```bat
@echo off
cd /d "%~dp0"
start /min "" npx electron .
```

3. Create a shortcut to `start-screensaver.bat` in the Startup folder

### Option B: Task Scheduler (no admin for user-level tasks)

1. Open Task Scheduler (`taskschd.msc`)
2. Click **Create Basic Task**
3. Name: `Matrix Screensaver`
4. Trigger: **When I log on**
5. Action: **Start a program**
   - Program: `cmd.exe`
   - Arguments: `/c cd /d "C:\path\to\matrix-screensaver" && npx electron .`
6. Finish

## Portable Deployment (No Node.js on target machine)

If the target machine doesn't have Node.js installed, you can package the app into a standalone executable:

```bash
# Install electron-builder
npm install --save-dev electron-builder

# Build portable exe
npx electron-builder --win portable
```

The output in `dist/` will be a single `.exe` that runs without Node.js.

## Uninstallation

1. Close the app from the system tray (right-click → Quit)
2. Remove any startup shortcuts you created
3. Delete the project folder
4. (Optional) Delete config: `%APPDATA%/matrix-screensaver`

## Troubleshooting

### Screensaver doesn't activate
- Check that the app is running in the system tray (green "M" icon)
- Verify idle timeout hasn't been set too high
- If "Only when plugged in" is enabled, make sure you're on AC power

### Taskbar visible over screensaver
- The app uses fullscreen + `alwaysOnTop('screen-saver')`. If the taskbar still appears, try restarting the app — some Windows versions need the window to be created after the taskbar is loaded.

### Screen doesn't lock on input
- Verify `rundll32.exe` is accessible (it's in `C:\Windows\System32\` on all Windows machines)
- Some corporate group policies may disable `LockWorkStation`. Test with `Win+L` manually — if that works, the app will too.

### High CPU usage
- Reduce rain speed in settings
- Increase letter size (fewer columns = fewer characters to render)
- Switch to Clock mode for minimal CPU usage
