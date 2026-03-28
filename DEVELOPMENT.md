# Development Guide

Architecture details, code walkthrough, and contribution notes for the Matrix Screensaver.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Main Process (main.js)              │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │   Tray   │  │  Idle    │  │  Power Save       │  │
│  │   Menu   │  │  Monitor │  │  Blocker          │  │
│  └────┬─────┘  └────┬─────┘  └───────┬───────────┘  │
│       │              │                │              │
│       ▼              ▼                ▼              │
│  ┌─────────────────────────────────────────────┐     │
│  │           Window Manager                    │     │
│  │  • Screensaver windows (one per display)    │     │
│  │  • Config window                            │     │
│  └──────────────────┬──────────────────────────┘     │
│                     │ IPC                            │
├─────────────────────┼────────────────────────────────┤
│           Preload Bridge (preload.js)                │
│           contextBridge.exposeInMainWorld()           │
├─────────────────────┼────────────────────────────────┤
│                     ▼                                │
│            Renderer Process(es)                      │
│  ┌─────────────────────────────────────────────┐     │
│  │  screensaver.html / screensaver.js          │     │
│  │  • Canvas rendering (Matrix/Starfield/Clock)│     │
│  │  • Input detection → IPC lock               │     │
│  └─────────────────────────────────────────────┘     │
│  ┌─────────────────────────────────────────────┐     │
│  │  config.html / config.js                    │     │
│  │  • Settings UI → IPC save                   │     │
│  └─────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────┘
```

## File Walkthrough

### `main.js` — Electron Main Process

The backbone of the app. Handles:

- **Config management** — Reads/writes `config.json` in `%APPDATA%`. Falls back to defaults for any missing keys.
- **CLI arg parsing** — `--screensaver` (launch immediately), `--config` (open settings), default (tray + idle monitor).
- **Single instance lock** — `app.requestSingleInstanceLock()` prevents duplicates. Second launch opens config.
- **System tray** — Green "M" icon generated programmatically (16×16 RGBA buffer). Context menu: Launch / Settings / Quit. Double-click opens settings.
- **Idle monitoring** — Polls `powerMonitor.getSystemIdleTime()` every 5 seconds. Checks power state if `onlyOnPower` is enabled.
- **Screensaver window creation** — One `BrowserWindow` per display (`screen.getAllDisplays()`). Frameless, fullscreen, `alwaysOnTop('screen-saver', 1)`, non-closable.
- **Keep-awake** — `powerSaveBlocker.start('prevent-display-sleep')` while screensaver runs. Auto-stops after `awakeTimeout` minutes.
- **Lock + cleanup** — `closeScreensaverAndLock()` calls `rundll32.exe user32.dll,LockWorkStation` synchronously, then destroys all screensaver windows.

### `preload.js` — Context Bridge

Securely exposes 6 APIs to the renderer via `contextBridge`:

| API | Direction | Purpose |
|-----|-----------|---------|
| `lock()` | Renderer → Main | Trigger workstation lock |
| `getConfig()` | Renderer → Main | Async config fetch |
| `saveConfig(cfg)` | Renderer → Main | Persist settings |
| `onConfig(cb)` | Main → Renderer | Receive pushed config on load |
| `launchScreensaver()` | Renderer → Main | Manual launch from config window |
| `setLoginItem(bool)` | Renderer → Main | Set auto-start on login |

### `src/screensaver.js` — Renderers

Standalone canvas-based renderers extracted from the original browser-based tool. Key sections:

- **Input detection** (`setupInputListeners`) — Listens for `keydown`, `mousemove` (with 5px jitter threshold), `mousedown`, `wheel`, `touchstart`, `contextmenu`. All trigger `triggerLock()` → IPC to main process.
- **`matrixRain()`** — Accumulator-based timing for speed-independent rendering. Falling katakana + hex characters. Optional density-based mask with gradual 4-second reveal.
- **`buildMask()`** — Loads a PNG, scales to 80% of canvas, samples each cell's opaque pixel density to build a grid. Density drives retention decay and alpha.
- **`starfield()`** — 300 stars with z-depth, perspective projection, size/alpha scaling.
- **`clockMode()`** — Centered time (HH:MM:SS) + date. Uses Inter font.

### `src/config.js` — Settings UI

Populates the config window from received config, wires up all inputs (selects, sliders, toggles, file picker), and calls `saveConfig()` on every change. Mask images are stored as base64 data URLs in config.

## IPC Message Flow

### Screensaver activation (idle)
```
Idle monitor (main) → launchScreensaver() → create BrowserWindow
    → ready-to-show → setFullScreen + setAlwaysOnTop + show
    → did-finish-load → send('config', {...})
    → Renderer receives config → start() → matrixRain/starfield/clock
```

### Lock on input
```
Renderer: keydown/mousemove/etc → triggerLock()
    → ipcRenderer.send('lock-workstation')
    → Main: closeScreensaverAndLock()
        → execSync('rundll32.exe user32.dll,LockWorkStation')
        → stopKeepAwake()
        → close all screensaver windows
```

### Config save
```
Renderer: slider/toggle change → config.key = value → save()
    → ipcRenderer.send('save-config', config)
    → Main: saveConfig(cfg) → write config.json
```

## Adding a New Screensaver Mode

1. **Add the renderer** in `src/screensaver.js`:
   ```js
   function myNewMode(ctx, canvas) {
       const draw = () => {
           // Your rendering logic
           raf = requestAnimationFrame(draw);
       };
       draw();
   }
   ```

2. **Wire it in `start()`**:
   ```js
   else if (type === 'mynewmode') myNewMode(ctx, canvas);
   ```

3. **Add to config UI** in `src/config.html`:
   ```html
   <option value="mynewmode">My New Mode</option>
   ```

4. No changes needed in `main.js` or `preload.js` — the mode name flows through config as a string.

## Adding a New Setting

1. Add default value in `DEFAULT_CONFIG` in `main.js`
2. Add UI control in `src/config.html`
3. Populate it in `populateUI()` in `src/config.js`
4. Wire the event listener to update `config` and call `save()`
5. Read it where needed (main.js for main-process settings, screensaver.js for renderer settings)

## Security Notes

- **Context isolation** is enabled — renderer cannot access Node.js APIs directly
- **Node integration** is disabled — no `require()` in renderer
- **Preload bridge** exposes only specific, scoped APIs
- **Mask images** are validated for MIME type (`image/png`, `image/webp`) and size (≤500KB) before storage
- **No remote content** — all pages are local files
- **`LockWorkStation`** is called synchronously (`execSync`) to minimize the window between input detection and screen lock

## Building for Distribution

```bash
# Install electron-builder
npm install --save-dev electron-builder

# Build portable Windows exe
npx electron-builder --win portable

# Build NSIS installer
npx electron-builder --win nsis
```

Output goes to `dist/`. The portable build is a single `.exe` that runs without installation.

To add electron-builder config, add to `package.json`:
```json
{
  "build": {
    "appId": "com.matrix-screensaver",
    "productName": "Matrix Screensaver",
    "win": {
      "target": ["portable"]
    }
  }
}
```
