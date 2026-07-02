const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  setInteractive(v) {
    ipcRenderer.send('pet:set-interactive', !!v);
  },
  quit() {
    ipcRenderer.send('pet:quit');
  },
});
