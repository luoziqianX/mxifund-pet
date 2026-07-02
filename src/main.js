const { app, BrowserWindow, ipcMain, screen, globalShortcut, shell } = require('electron');
const path = require('path');

let win = null;
let ball = null;
const WIN_HEIGHT = 440;
const BALL_SIZE = 72;

// 防止开机自启 + 手动双开出现两只桌宠
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

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
  win.loadFile(path.join(__dirname, 'index.html'), {
    query: process.argv.includes('--diag') ? { diag: '1' } : {},
  });

  if (process.argv.includes('--devtools')) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  // 把 renderer 的报错转发到终端，便于排查
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) console.log('[renderer]', message);
  });
}

// ---------- 悬浮球（隐藏桌宠后的召回入口） ----------
function createBall() {
  ball = new BrowserWindow({
    width: BALL_SIZE,
    height: BALL_SIZE,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  ball.setAlwaysOnTop(true, 'screen-saver');
  const { workArea } = screen.getPrimaryDisplay();
  ball.setPosition(
    workArea.x + workArea.width - BALL_SIZE - 14,
    workArea.y + Math.round(workArea.height * 0.55)
  );
  ball.loadFile(path.join(__dirname, 'ball.html'));
}

function clampToWorkArea(x, y) {
  const { workArea } = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) });
  return {
    x: Math.round(Math.min(Math.max(x, workArea.x), workArea.x + workArea.width - BALL_SIZE)),
    y: Math.round(Math.min(Math.max(y, workArea.y), workArea.y + workArea.height - BALL_SIZE)),
  };
}

function hidePet() {
  if (!win || !win.isVisible()) return;
  win.hide();
  ball?.show();
}
function showPet() {
  if (!win || win.isVisible()) return;
  placeWindow();
  win.show();
  win.setAlwaysOnTop(true, 'screen-saver');
  // Windows 上 hide/show 之后 forward:true 的鼠标转发会失效，必须重挂，
  // 否则 renderer 收不到 mousemove，HUD/小人永远无法恢复交互
  win.setIgnoreMouseEvents(true, { forward: true });
  // 让 renderer 把本地 interactive 状态复位，与主进程保持一致
  win.webContents.send('pet:restored');
  ball?.hide();
}

// ---------- 开机启动 ----------
// 打包版直接注册自身 exe；开发模式注册 electron.exe + 项目目录
function loginArgs() {
  if (app.isPackaged) return {};
  return { path: process.execPath, args: [app.getAppPath()] };
}
function getAutostart() {
  return app.getLoginItemSettings(loginArgs()).openAtLogin;
}
function setAutostart(on) {
  app.setLoginItemSettings({ ...loginArgs(), openAtLogin: !!on });
}

// ---------- 桌面快捷方式 ----------
function createDesktopShortcut() {
  const lnk = path.join(app.getPath('desktop'), 'mxifund桌宠.lnk');
  const opts = app.isPackaged
    ? { target: process.execPath, cwd: path.dirname(process.execPath) }
    : { target: process.execPath, args: `"${app.getAppPath()}"`, cwd: app.getAppPath() };
  return shell.writeShortcutLink(lnk, 'create', { ...opts, description: 'mxifund 干凯读桌宠' });
}

app.whenReady().then(() => {
  createWindow();
  createBall();
  screen.on('display-metrics-changed', placeWindow);
  screen.on('primary-display-changed', placeWindow);

  // 全局热键兜底：悬浮球被挡住/拖丢时也能一键隐藏或召回
  globalShortcut.register('Control+Alt+H', () => {
    if (win?.isVisible()) hidePet(); else showPet();
  });

  // 悬停检测不依赖 setIgnoreMouseEvents 的 forward 转发——
  // 那个实现基于 Win32 低级鼠标钩子，主进程繁忙时会被系统摘除且不再恢复
  // （表现为隐藏/召回等重操作后 HUD 再也点不动）。
  // 改为主进程轮询光标推给 renderer 做命中检测，稳定可靠。
  let wasInside = false;
  setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    const p = screen.getCursorScreenPoint();
    const b = win.getBounds();
    const x = p.x - b.x, y = p.y - b.y;
    const inside = x >= 0 && y >= 0 && x < b.width && y < b.height;
    if (inside) win.webContents.send('pet:cursor', x, y);
    else if (wasInside) win.webContents.send('pet:cursor', -1, -1);
    wasInside = inside;
  }, 70);

  // ---- 自动化测试钩子 ----
  if (process.argv.includes('--test-ball')) {
    setTimeout(() => {
      hidePet();
      setTimeout(async () => {
        try {
          const img = await ball.webContents.capturePage();
          require('fs').writeFileSync(path.join(app.getAppPath(), 'shots', 'ball.png'), img.toPNG());
          console.log('BALL_SHOT_SAVED', JSON.stringify(ball.getBounds()), 'petVisible=' + win.isVisible());
        } catch (e) { console.log('BALL_SHOT_FAIL', e.message); }
        showPet();
        console.log('AFTER_RESTORE petVisible=' + win.isVisible() + ' ballVisible=' + ball.isVisible());
        app.quit();
      }, 1500);
    }, 3500);
  }
  const autoArg = process.argv.find(a => a.startsWith('--test-autostart='));
  if (autoArg) {
    setTimeout(() => {
      setAutostart(autoArg.endsWith('=1'));
      console.log('AUTOSTART_NOW=' + getAutostart());
      app.quit();
    }, 1500);
  }
  // 在渲染进程里真点一遍 HUD 按钮，验证 点击→IPC→注册表/快捷方式 全链路
  if (process.argv.includes('--test-hud')) {
    setTimeout(async () => {
      const clickBtn = id => win.webContents.executeJavaScript(
        `(async () => {
          document.getElementById('${id}').click();
          await new Promise(r => setTimeout(r, 500));
          return {
            cls: document.getElementById('${id}').className,
            toast: document.getElementById('toast')?.textContent ?? '',
          };
        })()`
      );
      console.log('HUD_AUTO_ON', JSON.stringify(await clickBtn('btn-autostart')), 'reg=' + getAutostart());
      console.log('HUD_AUTO_OFF', JSON.stringify(await clickBtn('btn-autostart')), 'reg=' + getAutostart());
      console.log('HUD_PIN', JSON.stringify(await clickBtn('btn-shortcut')));
      app.quit();
    }, 3500);
  }
  // 常驻运行，周期打印 HUD 按钮屏幕坐标（状态文字变宽会挪动按钮），供鼠标注入测试
  if (process.argv.includes('--log-hud-rect')) {
    setInterval(async () => {
      if (!win || win.isDestroyed()) return;
      const rects = await win.webContents.executeJavaScript(
        `(() => {
          if (!window.__instr) {
            window.__instr = 1;
            for (const id of ['btn-autostart', 'btn-shortcut', 'btn-hide']) {
              document.getElementById(id).addEventListener('click', () => console.warn('CLICKED ' + id), { capture: true });
            }
            window.petAPI.onRestored(() => console.warn('RENDERER_GOT_RESTORED'));
          }
          return JSON.stringify(Object.fromEntries(['btn-autostart','btn-shortcut','btn-hide'].map(id => {
            const r = document.getElementById(id).getBoundingClientRect();
            return [id, { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }];
          })));
        })()`
      ).catch(() => null);
      if (rects) console.log('HUD_RECT', rects, 'WIN', JSON.stringify(win.getBounds()));
    }, 2000);
  }
});

// 二次启动（如开机自启后手动再开）：唤醒已有实例
app.on('second-instance', () => showPet());

app.on('will-quit', () => globalShortcut.unregisterAll());

ipcMain.on('pet:set-interactive', (_e, interactive) => {
  if (!win) return;
  win.setIgnoreMouseEvents(!interactive, { forward: true });
  if (process.argv.includes('--log-hud-rect')) console.log('SET_INTERACTIVE', interactive);
});

ipcMain.on('pet:hide', () => {
  if (process.argv.includes('--diag')) console.log('MAIN_GOT_HIDE');
  hidePet();
});
ipcMain.on('pet:quit', () => app.quit());
ipcMain.handle('pet:get-autostart', () => getAutostart());
ipcMain.on('pet:set-autostart', (_e, on) => setAutostart(on));
ipcMain.handle('pet:make-shortcut', () => createDesktopShortcut());

// 悬浮球：拖动（renderer 传屏幕坐标）与点击召回
ipcMain.on('ball:move', (_e, x, y) => {
  if (!ball) return;
  const p = clampToWorkArea(x, y);
  ball.setPosition(p.x, p.y);
});
ipcMain.on('ball:restore', showPet);

app.on('window-all-closed', () => app.quit());
