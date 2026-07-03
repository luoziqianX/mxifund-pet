const { app, BrowserWindow, ipcMain, screen, globalShortcut, shell, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let win = null;
let ball = null;
let tray = null;
let petHidden = false;
const WIN_HEIGHT = 440;
const BALL_SIZE = 72;
const DIAG = process.argv.includes('--diag');

// 防止开机自启 + 手动双开出现两只桌宠
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

// ---------- 设置持久化（显示器选择等） ----------
let settings = {};
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  try { settings = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { settings = {}; }
}
function saveSettings() {
  try { fs.writeFileSync(settingsFile(), JSON.stringify(settings)); } catch (e) { console.warn('保存设置失败:', e.message); }
}

// 桌宠所在显示器（默认主屏；记住的屏被拔掉后自动回主屏）
function targetDisplay() {
  return screen.getAllDisplays().find(d => d.id === settings.displayId) || screen.getPrimaryDisplay();
}

function placeWindow() {
  if (!win) return;
  const { workArea } = targetDisplay();
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
  // 默认整窗鼠标穿透，悬停到可交互元素时再打开
  win.setIgnoreMouseEvents(true, { forward: true });

  placeWindow();
  win.loadFile(path.join(__dirname, 'index.html'), {
    query: DIAG ? { diag: '1' } : {},
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  ball.setAlwaysOnTop(true, 'screen-saver');
  // 和主窗一样：不用 hide/show（会永久拆掉输入通道），用透明度+穿透来隐藏
  ball.setOpacity(0);
  ball.setIgnoreMouseEvents(true);
  moveBallToEdge();
  ball.loadFile(path.join(__dirname, 'ball.html'));
  // 球的渲染进程若意外挂掉就自动复活，保证召回入口永远可用
  ball.webContents.on('render-process-gone', () => ball.webContents.reload());
  ball.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) console.log('[ball]', message);
  });
}

function moveBallToEdge() {
  if (!ball) return;
  const { workArea } = targetDisplay();
  ball.setPosition(
    workArea.x + workArea.width - BALL_SIZE - 14,
    workArea.y + Math.round(workArea.height * 0.55)
  );
}

function clampToWorkArea(x, y) {
  const { workArea } = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) });
  return {
    x: Math.round(Math.min(Math.max(x, workArea.x), workArea.x + workArea.width - BALL_SIZE)),
    y: Math.round(Math.min(Math.max(y, workArea.y), workArea.y + workArea.height - BALL_SIZE)),
  };
}

// ---------- 隐藏 / 召回 ----------
// 关键：绝不调用 win.hide()。穿透窗口被 hide/show 一次后，Windows 会把
// forward:true 依赖的低级鼠标钩子摘掉且不恢复，之后按钮永久失灵。
// 改用"透明度 0 + 强制穿透"来隐藏：窗口对系统始终存活，输入链路不会被拆。
function showBall() {
  if (!ball) return;
  ball.setOpacity(1);
  ball.setIgnoreMouseEvents(false);
  ball.moveTop();
}
function hideBall() {
  if (!ball) return;
  ball.setOpacity(0);
  ball.setIgnoreMouseEvents(true);
}

function hidePet() {
  if (!win || petHidden) return;
  petHidden = true;
  win.setOpacity(0);
  win.setIgnoreMouseEvents(true, { forward: true });
  showBall();
  rebuildTray();
  if (DIAG) console.log('PET_HIDDEN opacity=' + win.getOpacity() + ' ballOpacity=' + ball?.getOpacity());
}
function showPet() {
  if (!win || petHidden === false) return;
  petHidden = false;
  placeWindow();
  win.setOpacity(1);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  // 让 renderer 复位本地 interactive 状态，与主进程保持一致
  win.webContents.send('pet:restored');
  hideBall();
  rebuildTray();
  if (DIAG) console.log('PET_SHOWN opacity=' + win.getOpacity() + ' ballOpacity=' + ball?.getOpacity());
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
  win?.webContents.send('pet:autostart-changed', !!on);
  rebuildTray();
}

// ---------- 桌面快捷方式 ----------
function createDesktopShortcut() {
  const lnk = path.join(app.getPath('desktop'), 'mxifund桌宠.lnk');
  const opts = app.isPackaged
    ? { target: process.execPath, cwd: path.dirname(process.execPath) }
    : { target: process.execPath, args: `"${app.getAppPath()}"`, cwd: app.getAppPath() };
  return shell.writeShortcutLink(lnk, 'create', { ...opts, description: 'mxifund 干凯读桌宠' });
}

// ---------- 系统托盘（任务栏右下角） ----------
function setDisplay(id) {
  settings.displayId = id;
  saveSettings();
  placeWindow();
  moveBallToEdge();
  rebuildTray();
}

function rebuildTray() {
  if (!tray) return;
  const displays = screen.getAllDisplays();
  const cur = targetDisplay();
  const primaryId = screen.getPrimaryDisplay().id;
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: petHidden ? '召回桌宠' : '隐藏桌宠（缩成悬浮球）',
      click: () => (petHidden ? showPet() : hidePet()),
    },
    { type: 'separator' },
    {
      label: '桌宠所在显示器',
      submenu: displays.map((d, i) => ({
        label: `显示器 ${i + 1}：${d.size.width}×${d.size.height}${d.id === primaryId ? '（主屏）' : ''}`,
        type: 'radio',
        checked: d.id === cur.id,
        click: () => setDisplay(d.id),
      })),
    },
    { type: 'separator' },
    {
      label: '开机启动',
      type: 'checkbox',
      checked: getAutostart(),
      click: mi => setAutostart(mi.checked),
    },
    { label: '创建桌面快捷方式', click: () => createDesktopShortcut() },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]));
}

async function createTray() {
  try {
    const icon = await app.getFileIcon(process.execPath, { size: 'small' });
    tray = new Tray(icon);
    tray.setToolTip('mxifund 干凯读桌宠（点击隐藏/召回）');
    tray.on('click', () => (petHidden ? showPet() : hidePet()));
    rebuildTray();
    if (DIAG || process.argv.includes('--test-display')) console.log('TRAY_READY');
  } catch (e) {
    console.warn('托盘创建失败:', e.message);
  }
}

app.whenReady().then(() => {
  loadSettings();
  createWindow();
  createBall();
  createTray();
  screen.on('display-metrics-changed', () => { placeWindow(); rebuildTray(); });
  screen.on('primary-display-changed', () => { placeWindow(); rebuildTray(); });
  screen.on('display-added', () => { placeWindow(); rebuildTray(); });
  screen.on('display-removed', () => { placeWindow(); moveBallToEdge(); rebuildTray(); });

  // 全局热键兜底：悬浮球被挡住/拖丢时也能一键隐藏或召回
  const hotkeyOK = globalShortcut.register('Control+Alt+H', () => {
    if (DIAG) console.log('HOTKEY_FIRED');
    if (petHidden) showPet(); else hidePet();
  });
  if (DIAG) console.log('HOTKEY_REGISTERED=' + hotkeyOK);

  // 悬停检测不依赖 setIgnoreMouseEvents 的 forward 转发（其底层鼠标钩子不可靠），
  // 由主进程轮询光标推给 renderer 做命中检测
  let wasInside = false;
  setInterval(() => {
    if (!win || win.isDestroyed() || petHidden) return;
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
          fs.writeFileSync(path.join(app.getAppPath(), 'shots', 'ball.png'), img.toPNG());
          console.log('BALL_SHOT_SAVED', JSON.stringify(ball.getBounds()),
            'petOpacity=' + win.getOpacity(), 'ballOpacity=' + ball.getOpacity());
        } catch (e) { console.log('BALL_SHOT_FAIL', e.message); }
        showPet();
        console.log('AFTER_RESTORE petOpacity=' + win.getOpacity() + ' ballOpacity=' + ball.getOpacity());
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
  // 显示器枚举与选择流程自检
  if (process.argv.includes('--test-display')) {
    setTimeout(() => {
      const ds = screen.getAllDisplays();
      console.log('DISPLAYS', JSON.stringify(ds.map(d => ({ id: d.id, size: d.size, wa: d.workArea }))));
      console.log('TARGET_BEFORE', targetDisplay().id, JSON.stringify(win.getBounds()));
      for (const d of ds) {
        setDisplay(d.id);
        console.log('PLACED_ON', d.id, JSON.stringify(win.getBounds()), 'ball=' + JSON.stringify(ball.getBounds()));
      }
      setDisplay(ds[0].id);
      console.log('SETTINGS_FILE', settingsFile(), fs.readFileSync(settingsFile(), 'utf8'));
      app.quit();
    }, 3000);
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
  if (!win || petHidden) return;
  win.setIgnoreMouseEvents(!interactive, { forward: true });
  if (process.argv.includes('--log-hud-rect')) console.log('SET_INTERACTIVE', interactive);
});

ipcMain.on('pet:hide', () => {
  if (DIAG) console.log('MAIN_GOT_HIDE');
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
ipcMain.on('ball:restore', () => {
  if (DIAG) console.log('BALL_RESTORE_CLICKED');
  showPet();
});

app.on('window-all-closed', () => app.quit());
