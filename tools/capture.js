// 离屏截图：electron tools/capture.js --tabs=sit,sleep,lounge,query,walk,celebrate
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

// 两种用法：
//   --tabs=sit,sleep          （简单模式，query 只有 tab=xxx）
//   --shots=name:qs;name2:qs2 （每张图自定义完整 query string）
const tabsArg = process.argv.find(a => a.startsWith('--tabs='));
const shotsArg = process.argv.find(a => a.startsWith('--shots='));
let shots = [];
if (shotsArg) {
  shots = shotsArg.slice(8).split(';').filter(Boolean).map(s => {
    const i = s.indexOf(':');
    return { name: s.slice(0, i), qs: s.slice(i + 1) };
  });
} else {
  const tabs = (tabsArg || '--tabs=sit').split('=')[1].split(/[,\s]+/).filter(Boolean);
  shots = tabs.map(t => ({ name: t, qs: 'tab=' + t }));
}
const waitArg = process.argv.find(a => a.startsWith('--wait='));
const waitMs = waitArg ? parseInt(waitArg.split('=')[1]) : 5000;
const outDir = path.join(__dirname, '..', 'shots');
fs.mkdirSync(outDir, { recursive: true });

app.disableHardwareAcceleration?.call?.(app); // 用软件渲染更稳，截图足够

app.commandLine.appendSwitch('enable-unsafe-swiftshader');
// 截图窗口逐个销毁时不要触发默认退出
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  const indexPath = path.join(__dirname, '..', 'src', 'index.html').replace(/\\/g, '/');
  // 每张图开新窗口：同窗口反复 load 会耗尽软件 WebGL 上下文导致白屏
  for (const shot of shots) {
    const win = new BrowserWindow({
      width: 1500,
      height: 440,
      show: false,
      frame: false,
      webPreferences: {
        contextIsolation: true,
        webSecurity: false,
        offscreen: true,
        backgroundThrottling: false,
      },
    });
    win.webContents.setFrameRate(30);
    win.webContents.on('console-message', (_e, _l, m) => console.log('[console]', m));
    await win.loadURL('file:///' + indexPath + '?' + shot.qs);
    await new Promise(r => setTimeout(r, waitMs));
    try {
      const state = await win.webContents.executeJavaScript(
        `JSON.stringify({pose: PET.char.poseName, pos: {x:+PET.char.pos.x.toFixed(2), z:+PET.char.pos.z.toFixed(2)}, root: {x:+PET.char.root.position.x.toFixed(2), y:+PET.char.root.position.y.toFixed(2), z:+PET.char.root.position.z.toFixed(2)}, ovr: PET.char.rootPosOverride ? {x:+PET.char.rootPosOverride.x.toFixed(2), y:+PET.char.rootPosOverride.y.toFixed(2), z:+PET.char.rootPosOverride.z.toFixed(2)} : null, moving: !!PET.char.moveTask})`
      );
      console.log('STATE', shot.name, state);
    } catch (e) { console.log('STATE_ERR', e.message); }
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, shot.name + '.png'), img.toPNG());
    console.log('SAVED', shot.name);
    win.destroy();
  }
  console.log('CAPTURE_DONE');
  app.quit();
});
