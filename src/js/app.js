// mxifund-pet 主入口：渲染循环 + 流程图状态机
//
//   开始 → 起 → 干凯读 → 是否干翻凯读？
//                ↑           ├─ Y → 结束（永久开摆）
//                │           └─ N → 必须躺了？
//                │                   ├─ N → 干凯读（继续卷）
//                └──────── 起 ← 躺 ← Y
import * as THREE from 'three';
import { CONFIG, LINES } from './config.js';
import { buildWorld } from './scene3d.js';
import { Character, POSES } from './character.js';

const isElectron = !!window.petAPI;
if (!isElectron) {
  // 浅色/深色预览背景，模拟不同桌面：?bg=light
  const bg = new URLSearchParams(location.search).get('bg');
  document.body.classList.add(bg === 'light' ? 'preview-light' : 'preview');
}

const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
// 随机取台词，但不和上一条重复（台词库大了以后连击同一句很出戏）
const _lastPick = new WeakMap();
const pick = arr => {
  if (arr.length < 2) return arr[0];
  let v;
  do { v = arr[Math.floor(Math.random() * arr.length)]; } while (v === _lastPick.get(arr));
  _lastPick.set(arr, v);
  return v;
};

// ============ 渲染器 / 相机 ============
const canvas = $('three-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const SCENE_W = 12.2;         // 需要装进画面的世界宽度
const FOV = 15;
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 80);

const CAM_QP = new URLSearchParams(location.search);
function layout() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(w, h);
  camera.aspect = w / h;
  // 调试特写：?camx=-4.9&camy=0.6&camd=4&camaz=90（camaz=环绕角度，0=正面）
  if (CAM_QP.has('camx')) {
    const cx = parseFloat(CAM_QP.get('camx'));
    const cyy = parseFloat(CAM_QP.get('camy') || '0.7');
    const cd = parseFloat(CAM_QP.get('camd') || '5');
    const az = THREE.MathUtils.degToRad(parseFloat(CAM_QP.get('camaz') || '0'));
    camera.position.set(cx + cd * Math.sin(az), cyy + 0.6, cd * Math.cos(az));
    camera.lookAt(cx, cyy, 0);
    camera.updateProjectionMatrix();
    return;
  }
  const visH = SCENE_W / camera.aspect;
  const dist = visH / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
  const cy = visH / 2 - 0.32;          // 让地面贴近窗口底部
  camera.position.set(0, cy + 0.55, dist);
  camera.lookAt(0, cy - 0.05, 0);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', layout);
layout();

const scene = new THREE.Scene();
const world = buildWorld();
scene.add(world.root);

const char = new Character();
scene.add(char.root);
scene.add(char.lookTarget);

// ============ HUD / 气泡 ============
const bubble = $('bubble');
let bubbleTimer = null;
function say(text, ms = CONFIG.bubble.holdMs) {
  bubble.textContent = text;
  bubble.classList.add('show');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => bubble.classList.remove('show'), ms);
}

const holo = $('holo');
const scanFill = $('scan-fill');
const scanLog = $('scan-log');
const verdict = $('verdict');
const stamp = $('stamp');
const banner = $('banner');

function setState(s) { $('hud-state').textContent = s; }
function setKaidu(dead) {
  const el = $('hud-kaidu');
  el.textContent = dead ? '已干翻' : '存活';
  el.className = dead ? 'kaidu-dead' : 'kaidu-alive';
}

// ============ 存档 ============
const store = {
  day: 0, energy: CONFIG.energyMax, dead: false, grinds: 0,
  load() {
    try { Object.assign(this, JSON.parse(localStorage.getItem('mxpet') || '{}')); } catch {}
  },
  save() {
    localStorage.setItem('mxpet', JSON.stringify({ day: this.day, energy: this.energy, dead: this.dead, grinds: this.grinds }));
  },
};
store.load();

function refreshHud() {
  $('hud-day').textContent = store.day;
  const fill = $('energy-fill');
  fill.style.width = `${Math.max(0, store.energy)}%`;
  fill.classList.toggle('low', store.energy < CONFIG.mustLieBelow);
  setKaidu(store.dead);
}

// ============ 可中断等待 ============
let onSkip = null;
let forceQuery = false;

function wait(ms) {
  return new Promise(res => {
    const to = setTimeout(() => { onSkip = null; res(false); }, ms);
    onSkip = () => { clearTimeout(to); onSkip = null; res(true); };
  });
}
async function walkGo(x, z, speed = CONFIG.walkSpeed) {
  char.setRootOverride(null, null);
  char.setPose('walk');
  const p = char.walkTo(x, z, speed);
  onSkip = () => char.teleport(x, z);
  await p;
  onSkip = null;
  char.setPose('idle');
}

// ============ 固定姿势布置（状态机与调试共用） ============
const S = CONFIG.spots;
const TUNE = {
  // 髋骨节点恒定在根上方 0.97：座垫顶 0.45 + 半个骨盆厚 => sitY ≈ 0.55-0.97
  sitY: -0.42, sitZ: 0.24,
  podX: -5.74, podY: 0.22, podTilt: 0.22, podYaw: -Math.PI / 2,
  // 沙滩椅：躯干俯仰匹配椅背倾角(~0.6rad)，髋部锚到座面后缘上方
  loungeX: 4.35, lgAnchorY: 0.50, lgAnchorZ: -0.16, loungePitch: -0.62,
  lgThigh: 0.92, lgKnee: -0.18, lgFoot: -0.15,
};
// 调试：URL 参数可覆盖任意 TUNE 值，如 ?tab=sleep&podX=-5.4
{
  const qp = new URLSearchParams(location.search);
  for (const k of Object.keys(TUNE)) if (qp.has(k)) TUNE[k] = parseFloat(qp.get(k));
}

function poseSitAtDesk() {
  char.teleport(S.deskChair, TUNE.sitZ);
  char.setRootOverride({ y: Math.PI }, new THREE.Vector3(S.deskChair, TUNE.sitY, TUNE.sitZ));
  char.setPose('type');
  char.lookAt(0, 1.25, -0.6);
}
function poseSleepInPod() {
  char.teleport(S.pod, 0);
  char.setRootOverride(
    { z: TUNE.podTilt, y: TUNE.podYaw, x: -Math.PI / 2, order: 'ZYX' },
    new THREE.Vector3(TUNE.podX, TUNE.podY, 0)
  );
  char.setPose('sleep');
  // 躺下的大幅旋转会把头发物理甩乱（缠在地面碰撞体上竖起来），
  // 等混合完成后把弹簧骨复位到当前朝向的静止状态
  setTimeout(() => char.settleHair(), 1600);
}
function poseLoungeChair() {
  // 躺姿细节由 TUNE 驱动；落位靠髋部锚点对齐到椅面
  const b = POSES.lounge.bones;
  b.spine = { x: 0.05 };
  b.neck = { x: -0.05 };
  b.head = { x: -0.02 };
  b.leftUpperLeg = { x: TUNE.lgThigh, y: 0.05 };
  b.rightUpperLeg = { x: TUNE.lgThigh, y: -0.05 };
  b.leftLowerLeg = { x: TUNE.lgKnee };
  b.rightLowerLeg = { x: TUNE.lgKnee };
  b.leftFoot = { x: TUNE.lgFoot };
  b.rightFoot = { x: TUNE.lgFoot };
  char.teleport(S.lounge, 0);
  char.setRootOverride({ x: TUNE.loungePitch, y: 0, order: 'YXZ' }, new THREE.Vector3(TUNE.loungeX, 0, 0));
  char.snapPose('lounge');
  // 髋部贴到椅面靠背根部：座面顶 0.375，靠背根 z≈-0.12
  char.alignHips(new THREE.Vector3(S.lounge, TUNE.lgAnchorY, TUNE.lgAnchorZ));
  char.alignHips(new THREE.Vector3(TUNE.loungeX, TUNE.lgAnchorY, TUNE.lgAnchorZ));
  char.lookAt(camera.position.x, camera.position.y, camera.position.z);
}
function poseQueryAtDais() {
  char.setRootOverride(null, null);
  char.teleport(S.query, 0.42);
  char.face(0);
  char.setPose('query');
  char.lookAt(S.query, 2.1, 0.3);
}

// ============ 全息查询面板 ============
// 头尾固定，中间每次从梗池里随机抽 3 条
const SCAN_MID_POOL = [
  '> 扫描对方 alpha 信号…',
  '> 解密持仓数据流…',
  '> 对比夏普 / 回撤 / 胜率…',
  '> 检测到大量祖传因子…',
  '> 对方咖啡浓度：严重超标',
  '> 对方显卡：也在燃烧',
  '> 窃听晨会内容…全是黑话',
  '> 分析对方回测：也过拟合了',
  '> 检索对方招聘页：还在扩张(可恶)',
  '> 干扰对方随机种子…',
];
function scanTexts() {
  const pool = [...SCAN_MID_POOL].sort(() => Math.random() - 0.5).slice(0, 3);
  return ['> ping kendallsquarecap.com', ...pool, '> 结算今日战况…'];
}
async function runQueryPanel() {
  world.queryActive = true;
  holo.classList.add('show');
  verdict.classList.remove('show');
  scanFill.style.width = '0%';
  scanLog.innerHTML = '';
  const texts = scanTexts();
  const t0 = performance.now();
  let li = 0;
  while (performance.now() - t0 < CONFIG.queryMs) {
    const p = Math.min(100, ((performance.now() - t0) / CONFIG.queryMs) * 100);
    scanFill.style.width = p + '%';
    if (li < texts.length && p > (li + 0.5) * (100 / texts.length)) {
      scanLog.innerHTML += texts[li++] + '<br>';
    }
    if (await wait(60)) break;
  }
  scanFill.style.width = '100%';
  const win = Math.random() < CONFIG.winRate;
  stamp.textContent = win ? '是！' : '否';
  stamp.className = 'stamp ' + (win ? 'yes' : 'no');
  verdict.classList.add('show');
  await wait(CONFIG.resultHoldMs);
  holo.classList.remove('show');
  verdict.classList.remove('show');
  world.queryActive = false;
  return win;
}

// ============ 流程图状态机 ============
async function phaseWake() {
  store.day++;
  store.save();
  refreshHud();
  setState('起');
  world.setNight(false);
  world._zzzOn = false;
  char.setRootOverride(null, null);
  char.teleport(S.pod + 0.75, 0.7);
  char.face(0.4);
  char.setPose('stretch');
  char.lookAt(camera.position.x, camera.position.y * 0.9, camera.position.z);
  say(pick(LINES.wake));
  await wait(CONFIG.wakeStretchMs);
}

async function phaseCoffee() {
  setState('干凯读');
  await walkGo(S.coffee, 0.32);
  char.face(Math.PI);              // 面向咖啡机
  char.setPose('coffee');
  world.steamOn = false;
  world.coffeeCup.visible = false;
  say(pick(LINES.coffee));
  await wait(CONFIG.coffeeSipMs);
  world.coffeeCup.visible = true;
  world.steamOn = true;
}

async function phaseGrind() {
  setState('干凯读');
  await walkGo(S.deskChair, 0.85);
  poseSitAtDesk();
  say(pick(LINES.grind));
  store.grinds++;
  const dur = rand(CONFIG.grindMinMs, CONFIG.grindMaxMs);
  const end = performance.now() + dur;
  let nextChat = performance.now() + rand(CONFIG.bubble.minGapMs, CONFIG.bubble.maxGapMs);
  forceQuery = false;
  while (performance.now() < end && !forceQuery) {
    if (performance.now() > nextChat) {
      say(pick(LINES.grind));
      nextChat = performance.now() + rand(CONFIG.bubble.minGapMs, CONFIG.bubble.maxGapMs);
    }
    if (await wait(400)) break;   // ⏩ 跳过本轮开卷
  }
  forceQuery = false;
  store.energy = Math.max(0, store.energy - rand(CONFIG.energyCostMin, CONFIG.energyCostMax));
  store.save();
  refreshHud();
}

async function phaseQuery() {
  setState('查询战况');
  char.setRootOverride(null, null);
  await walkGo(S.query, 0.42);
  poseQueryAtDais();
  say(pick(LINES.queryStart));
  const win = await runQueryPanel();
  return win;
}

async function phaseSleep() {
  setState('躺');
  say(pick(LINES.mustLie));
  await walkGo(S.pod + 0.55, 0.55);
  poseSleepInPod();
  world.setNight(true);
  world._zzzOn = true;
  say(pick(LINES.night));
  const t0 = performance.now();
  const e0 = store.energy;
  while (performance.now() - t0 < CONFIG.sleepMs) {
    const k = (performance.now() - t0) / CONFIG.sleepMs;
    store.energy = Math.min(CONFIG.energyMax, e0 + (CONFIG.energyMax - e0) * k);
    refreshHud();
    if (await wait(500)) break;
  }
  store.energy = CONFIG.energyMax;
  store.save();
  refreshHud();
}

async function phaseVictory() {
  setState('结束！');
  store.dead = true;
  store.save();
  refreshHud();
  banner.classList.add('show');
  world.setParty(true);
  char.setRootOverride(null, null);
  char.setPose('celebrate');
  char.face(0);
  say(pick(LINES.win), 5000);
  for (let i = 0; i < 3; i++) {
    world.burstConfetti(S.query, 1.4, 0.2, 120);
    if (await wait(CONFIG.celebrateMs / 3)) break;
  }
  banner.classList.remove('show');
  await walkGo(S.lounge - 0.6, 0.5, CONFIG.runSpeed);
  poseLoungeChair();
}

async function eternalSlack() {
  setState('永久开摆');
  world.setParty(true);
  poseLoungeChair();
  $('btn-rebirth').style.display = 'grid';
  while (true) {
    if (await wait(rand(7000, 12000))) { /* skip 也无所谓，继续摆 */ }
    say(pick(LINES.slack));
    if (Math.random() < 0.3) world.burstConfetti(S.lounge, 1.8, 0.2, 50);
  }
}

async function fsm() {
  // 开场：在睡舱里躺着，1.5s 后开始新的一天
  if (store.dead) { await eternalSlack(); return; }
  poseSleepInPod();
  world.setNight(true);
  world._zzzOn = true;
  await wait(1600);

  while (true) {
    await phaseWake();                    // 起
    await phaseCoffee();                  // 起床先来一杯
    let grinding = true;
    while (grinding) {
      await phaseGrind();                 // 干凯读
      const win = await phaseQuery();     // 是否干翻凯读？
      if (win) {
        await phaseVictory();             // Y → 结束（开摆）
        await eternalSlack();
        return;
      }
      say(pick(LINES.fail));
      await wait(1400);
      if (store.energy < CONFIG.mustLieBelow) {
        grinding = false;                 // 必须躺了 → 躺
      } else {
        say(pick(LINES.mustGrind));       // 不用躺 → 继续干凯读
        await wait(1200);
        if (Math.random() < 0.45) await phaseCoffee();
      }
    }
    await phaseSleep();                   // 躺 → 回到 起
  }
}

// ============ 鼠标交互 / 点击穿透 ============
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let interactive = false;
let lastPoke = 0;

function pickChar(ev) {
  if (!char.hitProxy) return false;
  pointer.x = (ev.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(ev.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObject(char.hitProxy, false).length > 0;
}

function updateHover(cx, cy) {
  const el = cx >= 0 ? document.elementFromPoint(cx, cy) : null;
  const overHud = !!el?.closest?.('#hud');
  const overChar = cx >= 0 && pickChar({ clientX: cx, clientY: cy });
  const next = overHud || overChar;
  document.body.style.cursor = overChar ? 'pointer' : 'default';
  if (next !== interactive) {
    interactive = next;
    window.petAPI?.setInteractive(next);
  }
}

// 两个来源喂同一套命中检测：
// 1) 主进程光标轮询（穿透状态下唯一可靠的来源）
// 2) 窗口自身 mousemove（交互态下的即时响应）
window.petAPI?.onCursor?.(updateHover);
window.addEventListener('mousemove', ev => updateHover(ev.clientX, ev.clientY));

// 隐藏后恢复时主进程会重置鼠标穿透，本地状态必须跟着复位，
// 否则 interactive 卡在 true，悬停 HUD 不会再发开启交互的指令
window.petAPI?.onRestored?.(() => { interactive = false; });

// 诊断模式（?diag=1）：把每次鼠标事件的落点/目标/穿透状态转发到主进程日志
if (new URLSearchParams(location.search).has('diag')) {
  for (const type of ['mousedown', 'mouseup', 'click']) {
    window.addEventListener(type, ev => {
      const el = ev.target;
      console.warn(`DIAG ${type} @${ev.clientX},${ev.clientY} target=${el.id || el.tagName} interactive=${interactive}`);
    }, { capture: true });
  }
}

window.addEventListener('mousedown', ev => {
  if (!pickChar(ev)) return;
  const now = performance.now();
  if (now - lastPoke < 700) return;
  lastPoke = now;
  const h = document.createElement('div');
  h.className = 'heart';
  h.textContent = pick(['💗', '✨', '💢', '⭐']);
  h.style.left = ev.clientX + 'px';
  h.style.top = (ev.clientY - 14) + 'px';
  document.getElementById('stage').appendChild(h);
  setTimeout(() => h.remove(), 1200);
  const state = $('hud-state').textContent;
  if (state === '躺') say(pick(LINES.sleepPoke));
  else say(pick(LINES.poke));
});

// HUD 按钮
$('btn-skip').addEventListener('click', () => onSkip?.());
$('btn-query').addEventListener('click', () => {
  forceQuery = true;
  say('好！现在就去查！');
});
$('btn-quit').addEventListener('click', () => {
  if (isElectron) window.petAPI.quit();
  else say('预览模式没法退出啦');
});
// HUD 操作反馈：固定显示在按钮正下方，不会被小人的碎碎念顶掉
const toastEl = document.getElementById('toast');
let toastTimer = 0;
function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}
// 一键隐藏：桌宠缩进悬浮球，点球或 Ctrl+Alt+H 召回
$('btn-hide').addEventListener('click', () => {
  if (isElectron) window.petAPI.hide();
  else toast('预览模式没有悬浮球哦');
});
// 开机启动开关：本地乐观切换（点击瞬间就有反馈），后台写注册表并回读校准
const btnAuto = $('btn-autostart');
let autoOn = false;
function paintAutostart() {
  btnAuto.classList.toggle('on', autoOn);
  btnAuto.title = autoOn ? '开机启动：已开启（点击关闭）' : '开机启动：已关闭（点击开启）';
}
async function refreshAutostart() {
  if (!isElectron) return;
  autoOn = await window.petAPI.getAutostart();
  paintAutostart();
}
// 托盘菜单里切换开机启动时，同步 HUD 按钮状态
window.petAPI?.onAutostartChanged?.(on => { autoOn = on; paintAutostart(); });
btnAuto.addEventListener('click', () => {
  if (!isElectron) { toast('预览模式改不了开机启动'); return; }
  autoOn = !autoOn;
  window.petAPI.setAutostart(autoOn);
  paintAutostart();
  toast(autoOn ? '🚀 开机启动已开启，以后开机自动来上班！' : '开机启动已关闭');
  refreshAutostart().catch(e => console.error('回读开机启动状态失败', e));
});
refreshAutostart().catch(e => console.error('读取开机启动状态失败', e));
// 一键桌面快捷方式
$('btn-shortcut').addEventListener('click', async () => {
  if (!isElectron) { toast('预览模式创建不了快捷方式'); return; }
  try {
    const ok = await window.petAPI.makeShortcut();
    toast(ok ? '📌 已钉到桌面！双击图标随时叫我' : '呜…快捷方式创建失败了');
  } catch (e) {
    console.error('创建快捷方式失败', e);
    toast('呜…快捷方式创建失败了');
  }
});
// 轮回按钮（干翻凯读后出现）
const rebirth = document.createElement('button');
rebirth.id = 'btn-rebirth';
rebirth.title = '轮回：凯读复活，重新开卷';
rebirth.textContent = '🔄';
rebirth.style.display = 'none';
$('btn-quit').before(rebirth);
rebirth.addEventListener('click', () => {
  localStorage.removeItem('mxpet');
  location.reload();
});

// ============ 气泡 / 面板跟随 ============
const HOLO_ANCHOR = new THREE.Vector3(S.query, 1.92, -0.1);
const v3tmp = new THREE.Vector3();
function toScreen(v) {
  v3tmp.copy(v).project(camera);
  return { x: (v3tmp.x + 1) / 2 * window.innerWidth, y: (1 - v3tmp.y) / 2 * window.innerHeight };
}
function syncOverlays() {
  if (bubble.classList.contains('show') && char.vrm) {
    const p = toScreen(char.headWorldPos);
    bubble.style.left = Math.min(window.innerWidth - 130, Math.max(130, p.x + 30)) + 'px';
    bubble.style.top = Math.max(8, p.y - 78) + 'px';
  }
  if (holo.classList.contains('show')) {
    const p = toScreen(HOLO_ANCHOR);
    holo.style.left = Math.min(window.innerWidth - 160, Math.max(160, p.x)) + 'px';
    holo.style.top = Math.max(46, p.y - holo.offsetHeight) + 'px';
  }
}

// 调试：输出关键骨骼世界坐标（供截图工具的控制台日志读取）
function logAnchors(label) {
  if (!char.vrm) return;
  const p = b => {
    const v = char.vrm.humanoid.getNormalizedBoneNode(b).getWorldPosition(new THREE.Vector3());
    return `${b}=(${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)})`;
  };
  console.log(`[anchors:${label}] ${p('hips')} ${p('head')} ${p('leftFoot')} ${p('rightFoot')} ${p('leftLowerLeg')}`);
}

// ============ 调试布景（?tab=sit|sleep|lounge|query|walk|celebrate） ============
function tableau(tab) {
  world.setNight(false);
  // 骨骼标定：?tab=cal&bone=leftUpperLeg&val=-1.2（站在查询台，侧拍看方向）
  if (tab === 'cal') {
    const qp = new URLSearchParams(location.search);
    const bone = qp.get('bone') || 'leftUpperLeg';
    const val = parseFloat(qp.get('val') || '-1.2');
    const axis = qp.get('axis') || 'x';
    POSES.cal = {
      bones: { leftUpperArm: { z: 1.18 }, rightUpperArm: { z: -1.18 }, [bone]: { [axis]: val } },
      expr: {},
    };
    char.teleport(S.query, 0.3);
    char.face(0);
    char.setPose('cal');
    return;
  }
  // 走路定格帧：?tab=freeze&ph=1.57（walkPhase 弧度）&pose=walk
  if (tab === 'freeze') {
    const qp2 = new URLSearchParams(location.search);
    char.teleport(S.query, 0.3);
    char.face(0);
    char.walkPhase = parseFloat(qp2.get('ph') || '0');
    char.snapPose(qp2.get('pose') || 'walk');
    logAnchors('freeze ph=' + char.walkPhase);
    return;
  }
  switch (tab) {
    case 'sit': poseSitAtDesk(); char.snapPose('type'); logAnchors('sit'); break;
    case 'sleep': poseSleepInPod(); char.snapPose('sleep'); world.setNight(true); world._zzzOn = true; logAnchors('sleep'); break;
    case 'lounge': world.setParty(true); poseLoungeChair(); break;
    case 'query':
      poseQueryAtDais();
      holo.classList.add('show');
      scanFill.style.width = '62%';
      scanLog.innerHTML = scanTexts().slice(0, 3).join('<br>');
      break;
    case 'celebrate':
      char.teleport(S.query, 0.42); char.face(0); char.setPose('celebrate');
      banner.classList.add('show');
      setInterval(() => world.burstConfetti(S.query, 1.4, 0.2, 80), 1600);
      break;
    case 'walk': {
      const ping = async () => {
        while (true) {
          await walkGo(3.5, 0.75); await wait(400);
          await walkGo(-3.5, 0.75); await wait(400);
        }
      };
      ping();
      break;
    }
    case 'pace': {
      // 小范围来回踱步，方便特写镜头拍步态
      char.teleport(1.1, 0.75);
      const pace = async () => {
        while (true) {
          await walkGo(2.4, 0.75, 0.62);
          await walkGo(1.1, 0.75, 0.62);
        }
      };
      pace();
      break;
    }
    // live-*：走真实 fsm 的平滑混合路径（走过去→入位），验证运行时落位
    case 'live-sit':
      (async () => {
        char.teleport(1.2, 0.75);
        await walkGo(S.deskChair, 0.85);
        poseSitAtDesk();
      })();
      break;
    case 'live-sleep':
      (async () => {
        char.teleport(-4.0, 0.7);
        await walkGo(S.pod + 0.55, 0.55);
        poseSleepInPod();
        world.setNight(true);
        world._zzzOn = true;
      })();
      break;
    case 'live-lounge':
      (async () => {
        char.teleport(3.4, 0.6);
        world.setParty(true);
        await walkGo(S.lounge - 0.6, 0.5, CONFIG.runSpeed);
        poseLoungeChair();
      })();
      break;
  }
}

// ============ 启动 ============
const clock = new THREE.Clock();
function tick() {
  const dt = Math.min(0.05, clock.getDelta());
  char.update(dt);
  world.update(dt, performance.now());
  syncOverlays();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

async function main() {
  refreshHud();
  tick();   // 先跑渲染循环，场景即刻可见，模型加载完自动出现
  try {
    await char.load(new URL('../../assets/model.vrm', import.meta.url).href);
    char.addGroundCollider(scene);
    // 躺椅椅面/椅背碰撞球：防止双马尾和裙摆穿透椅子
    {
      const LX = S.lounge, seat = [], back = [];
      for (const sx of [-0.16, 0.16]) {
        for (const sz of [0.05, 0.35, 0.65]) seat.push({ pos: [LX + sx, 0.20, sz], r: 0.17 });
        for (const [by, bz] of [[0.46, -0.46], [0.62, -0.56], [0.78, -0.68]]) back.push({ pos: [LX + sx, by, bz], r: 0.13 });
      }
      char.addSphereColliders(scene, [...seat, ...back]);
    }
  } catch (e) {
    console.error('VRM 加载失败', e);
    say('模型加载失败：' + e.message, 10000);
  }
  const qpMain = new URLSearchParams(location.search);
  if (qpMain.has('bones') && char.vrm) {
    scene.add(new THREE.SkeletonHelper(char.vrm.scene));
  }
  const tab = qpMain.get('tab');
  if (tab) tableau(tab);
  else fsm();
}

window.PET = { char, world, camera, TUNE, say, tableau, THREE };
main();
