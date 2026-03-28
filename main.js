const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, powerMonitor, powerSaveBlocker } = require('electron');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ── Config ──────────────────────────────────────────────────────────────────

const CONFIG_DIR = path.join(app.getPath('userData'), 'MatrixScreensaver');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG = {
    type: 'matrix',
    letterSize: 16,
    rainSpeed: 100,
    maskEnabled: false,
    maskImage: '',
    maskIntensity: 50,
    idleTimeout: 5,       // minutes before screensaver activates
    awakeTimeout: 15,     // minutes to keep screen on while screensaver runs (0 = indefinite)
    onlyOnPower: true     // only activate when plugged in
};

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
        }
    } catch (e) { /* ignore corrupt config */ }
    return { ...DEFAULT_CONFIG };
}

function saveConfig(cfg) {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

// ── State ───────────────────────────────────────────────────────────────────

let tray = null;
let configWindow = null;
let screensaverWindows = [];
let idleCheckInterval = null;
let screensaverActive = false;
let powerSaveBlockerId = null;
let awakeTimer = null;
const devMode = true; // DEV: set to false to re-enable Windows lock on input

// ── Parse CLI args ──────────────────────────────────────────────────────────

const args = process.argv.slice(1);
const flagScreensaver = args.includes('--screensaver');
const flagConfig = args.includes('--config');

// ── Prevent multiple instances ──────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        // If someone launches again, show config
        openConfigWindow();
    });
}

// ── App ready ───────────────────────────────────────────────────────────────

app.whenReady().then(() => {
    if (flagScreensaver) {
        launchScreensaver();
    } else if (flagConfig) {
        // Explicit --config flag: open config without tray
        openConfigWindow();
    } else {
        // Default: start silently in tray with idle monitoring
        createTray();
        startIdleMonitoring();
    }
});

app.on('window-all-closed', () => {
    // Don't quit when windows close — stay in tray
    if (!tray) app.quit();
});

// ── Tray ────────────────────────────────────────────────────────────────────

function createTray() {
    // Create a simple 16x16 green-on-black tray icon
    const icon = nativeImage.createFromBuffer(createTrayIconBuffer());
    tray = new Tray(icon);
    tray.setToolTip('Matrix Screensaver');

    const contextMenu = Menu.buildFromTemplate([
        { label: 'Launch Screensaver', click: () => launchScreensaver() },
        { label: 'Settings', click: () => openConfigWindow() },
        { type: 'separator' },
        { label: 'Quit', click: () => { stopIdleMonitoring(); app.quit(); } }
    ]);
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => openConfigWindow());
}

function createTrayIconBuffer() {
    // Generate a tiny 16x16 PNG with a green "M" on black
    // Using raw RGBA data via nativeImage
    const size = 16;
    const canvas = Buffer.alloc(size * size * 4, 0);
    // Draw a simple green M pattern
    const green = [0, 200, 0, 255];
    const setPixel = (x, y) => {
        if (x >= 0 && x < size && y >= 0 && y < size) {
            const i = (y * size + x) * 4;
            canvas[i] = green[0]; canvas[i+1] = green[1]; canvas[i+2] = green[2]; canvas[i+3] = green[3];
        }
    };
    // M shape: two vertical lines + diagonal center
    for (let y = 3; y < 13; y++) { setPixel(3, y); setPixel(12, y); }
    for (let i = 0; i < 5; i++) { setPixel(4 + i, 3 + i); setPixel(11 - i, 3 + i); }
    for (let y = 8; y < 13; y++) { setPixel(7, y); setPixel(8, y); }

    return nativeImage.createFromBuffer(canvas, { width: size, height: size }).toPNG();
}

// ── Idle Monitoring ─────────────────────────────────────────────────────────

function startIdleMonitoring() {
    stopIdleMonitoring();
    idleCheckInterval = setInterval(() => {
        if (screensaverActive) return;
        const config = loadConfig();

        // Skip if on battery and onlyOnPower is enabled
        if (config.onlyOnPower && powerMonitor.isOnBatteryPower()) return;

        const idleSeconds = powerMonitor.getSystemIdleTime();
        if (idleSeconds >= config.idleTimeout * 60) {
            launchScreensaver();
        }
    }, 5000);
}

function stopIdleMonitoring() {
    if (idleCheckInterval) {
        clearInterval(idleCheckInterval);
        idleCheckInterval = null;
    }
}

// ── Screensaver Windows ─────────────────────────────────────────────────────

function startKeepAwake() {
    stopKeepAwake();
    // Prevent display from sleeping while screensaver is running
    powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep');

    const config = loadConfig();
    const awakeMin = config.awakeTimeout ?? 15;
    if (awakeMin > 0) {
        // After timeout, stop blocking — Windows will lock the screen naturally
        awakeTimer = setTimeout(() => {
            stopKeepAwake();
        }, awakeMin * 60 * 1000);
    }
}

function stopKeepAwake() {
    if (awakeTimer) { clearTimeout(awakeTimer); awakeTimer = null; }
    if (powerSaveBlockerId !== null && powerSaveBlocker.isStarted(powerSaveBlockerId)) {
        powerSaveBlocker.stop(powerSaveBlockerId);
    }
    powerSaveBlockerId = null;
}

function launchScreensaver() {
    if (screensaverActive) return;
    screensaverActive = true;
    startKeepAwake();

    const config = loadConfig();
    const displays = screen.getAllDisplays();

    for (const display of displays) {
        const { x, y, width, height } = display.bounds;

        const win = new BrowserWindow({
            x, y, width, height,
            frame: false,
            skipTaskbar: true,
            resizable: false,
            movable: false,
            minimizable: false,
            maximizable: false,
            closable: false,
            focusable: true,
            show: false,
            opacity: 0,
            transparent: false,
            backgroundColor: '#000000',
            hasShadow: false,
            roundedCorners: false,
            thickFrame: false,
            enableLargerThanScreen: true,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: false
            }
        });

        // Set bounds and always-on-top BEFORE loading content
        win.setContentBounds({ x, y, width, height });
        win.setAlwaysOnTop(true, 'screen-saver', 1);
        win.setMenu(null);
        win.removeMenu();

        win.loadFile(path.join(__dirname, 'src', 'screensaver.html'));

        // Show once content is fully loaded, then reveal after compositor paints black
        win.webContents.once('did-finish-load', () => {
            if (win.isDestroyed()) return;
            win.webContents.send('config', config);

            // Show window (still invisible at opacity 0)
            win.show();
            win.moveTop();
            win.focus();

            // Let the compositor render the black frame, then reveal
            setTimeout(() => {
                if (win.isDestroyed()) return;
                win.setOpacity(1);
            }, 100);

            // Aggressively reassert position — taskbar fights back on show
            const reassert = () => {
                if (win.isDestroyed()) return;
                win.setContentBounds({ x, y, width, height });
                win.setAlwaysOnTop(true, 'screen-saver', 1);
                win.moveTop();
            };
            setTimeout(reassert, 50);
            setTimeout(reassert, 200);
            setTimeout(reassert, 500);
        });

        screensaverWindows.push(win);
    }
}

function closeScreensaverAndLock() {
    if (!screensaverActive) return;
    screensaverActive = false;
    stopKeepAwake();

    // Lock workstation FIRST, then close windows
    if (devMode) {
        console.log('[DEV] Skipping LockWorkStation');
    } else {
        try {
            execSync('rundll32.exe user32.dll,LockWorkStation');
        } catch (e) {
            // If lock fails, still close the screensaver
            console.error('Failed to lock workstation:', e.message);
        }
    }

    for (const win of screensaverWindows) {
        if (!win.isDestroyed()) {
            win.setAlwaysOnTop(false);
            win.closable = true;
            win.close();
        }
    }
    screensaverWindows = [];
}

// ── Config Window ───────────────────────────────────────────────────────────

function openConfigWindow() {
    if (configWindow && !configWindow.isDestroyed()) {
        configWindow.focus();
        return;
    }

    configWindow = new BrowserWindow({
        width: 480,
        height: 680,
        resizable: false,
        frame: true,
        backgroundColor: '#1a1a2e',
        title: 'Matrix Screensaver — Settings',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    configWindow.setMenuBarVisibility(false);
    configWindow.loadFile(path.join(__dirname, 'src', 'config.html'));

    configWindow.webContents.on('did-finish-load', () => {
        configWindow.webContents.send('config', loadConfig());
    });

    configWindow.on('closed', () => { configWindow = null; });
}

// ── IPC Handlers ────────────────────────────────────────────────────────────

ipcMain.on('lock-workstation', () => {
    closeScreensaverAndLock();
});

ipcMain.on('save-config', (event, cfg) => {
    saveConfig(cfg);
});

ipcMain.handle('get-config', () => {
    return loadConfig();
});

ipcMain.on('launch-screensaver', () => {
    launchScreensaver();
});

ipcMain.on('set-login-item', (event, enabled) => {
    app.setLoginItemSettings({ openAtLogin: enabled });
});
