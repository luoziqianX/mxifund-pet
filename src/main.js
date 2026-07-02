const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

let win = null;
const WIN_HEIGHT = 440;

function placeWindow() {
  if (!win) return;
  const { workArea } = screen.getPrimaryDisplay();
  win.setBounds({
    x: workArea.x,
    y: workArea.y + workArea.height - WIN_HEIGHT,
    width: workArea.width,
    height: WIN_HEIGHT,
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: WIN_HEIGHT,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // 本地纯离线应用：放开 file:// 的模块加载与 VRM fetch
      webSecurity: false,
      // 桌宠必须在用户干别的时也持续动画
      backgroundThrottling: false,
    },
  });

  // 桌宠层级：盖在普通窗口上方，但不挡住开始菜单等系统层
  win.setAlwaysOnTop(true, 'screen-saver');
  // 默认整窗鼠标穿透，renderer 里悬停到可交互元素时再打开
  win.setIgnoreMouseEvents(true, { forward: true });

  placeWindow();
  win.loadFile(path.join(__dirname, 'index.html'));

  if (process.argv.includes('--devtools')) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  // 把 renderer 的报错转发到终端，便于排查
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) console.log('[renderer]', message);
  });
}

app.whenReady().then(() => {
  createWindow();
  screen.on('display-metrics-changed', placeWindow);
  screen.on('primary-display-changed', placeWindow);
});

ipcMain.on('pet:set-interactive', (_e, interactive) => {
  if (!win) return;
  win.setIgnoreMouseEvents(!interactive, { forward: true });
});

ipcMain.on('pet:quit', () => app.quit());

app.on('window-all-closed', () => app.quit());
