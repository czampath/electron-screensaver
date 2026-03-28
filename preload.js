const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('screensaverAPI', {
    // Screensaver → main: lock the workstation and close screensaver
    lock: () => ipcRenderer.send('lock-workstation'),

    // Config: get/save settings
    getConfig: () => ipcRenderer.invoke('get-config'),
    saveConfig: (cfg) => ipcRenderer.send('save-config', cfg),

    // Receive config pushed from main process
    onConfig: (callback) => ipcRenderer.on('config', (event, cfg) => callback(cfg)),

    // Launch screensaver from config window
    launchScreensaver: () => ipcRenderer.send('launch-screensaver'),

    // Auto-start on login
    setLoginItem: (enabled) => ipcRenderer.send('set-login-item', enabled)
});
