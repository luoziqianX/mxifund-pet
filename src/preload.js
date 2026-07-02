const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  setInteractive(v) {
    ipcRenderer.send('pet:set-interactive', !!v);
  },
  quit() {
    ipcRenderer.send('pet:quit');
  },
  hide() {
    ipcRenderer.send('pet:hide');
  },
  getAutostart() {
    return ipcRenderer.invoke('pet:get-autostart');
  },
  setAutostart(on) {
    ipcRenderer.send('pet:set-autostart', !!on);
  },
  makeShortcut() {
    return ipcRenderer.invoke('pet:make-shortcut');
  },
  onRestored(cb) {
    ipcRenderer.on('pet:restored', () => cb());
  },
  onCursor(cb) {
    ipcRenderer.on('pet:cursor', (_e, x, y) => cb(x, y));
  },
  // ---- 悬浮球专用 ----
  ballMove(x, y) {
    ipcRenderer.send('ball:move', x, y);
  },
  ballRestore() {
    ipcRenderer.send('ball:restore');
  },
});
