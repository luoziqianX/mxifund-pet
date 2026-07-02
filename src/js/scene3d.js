// 3D 环境：赛博工位 diorama
// 布局（x 轴）：睡舱(-4.9) → 咖啡角(-2.55) → 工位(0) → 查询台(1.75) → 躺平区(4.35)
import * as THREE from 'three';
import { CandleScreen, EquityScreen, CodeScreen, TermScreen, makeSignTexture, makeZzzTexture, makeGlowTexture } from './screens.js';
import { CONFIG } from './config.js';

const PASTEL = {
  white: 0xf4f6fc,
  metal: 0xb9c6de,
  dark: 0x1a2236,
  mint: 0x8fe8d0,
  pink: 0xffa8cf,
  violet: 0xb99cff,
  cyan: 0x4be1ff,
  wood: 0xf0d9b8,
  gold: 0xffd76a,
};

function std(color, opt = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.08, ...opt });
}
function unlit(color, opt = {}) {
  return new THREE.MeshBasicMaterial({ color, ...opt });
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function cyl(rt, rb, h, material, x = 0, y = 0, z = 0, seg = 24) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ============ 显示器组 ============
function buildMonitorWall(screens) {
  const g = new THREE.Group();
  const bezelMat = std(0x161d2e, { roughness: 0.4, metalness: 0.3 });
  const armMat = std(0x2a3450, { metalness: 0.6, roughness: 0.35 });

  const SW = 0.66, SH = 0.38;
  const defs = [
    { tex: screens.candle.tex, x: -0.345, y: 1.05, tilt: 0 },
    { tex: screens.equity.tex, x: 0.345, y: 1.05, tilt: 0 },
    { tex: screens.code.tex, x: -0.345, y: 1.46, tilt: -0.1 },
    { tex: screens.term.tex, x: 0.345, y: 1.46, tilt: -0.1 },
  ];

  // 中央立柱 + 横臂
  g.add(cyl(0.03, 0.04, 0.95, armMat, 0, 0.72 + 0.45, -0.18, 12));
  const beamB = box(1.15, 0.045, 0.045, armMat, 0, 1.05, -0.15);
  const beamT = box(1.15, 0.045, 0.045, armMat, 0, 1.46, -0.15);
  g.add(beamB, beamT);

  for (const d of defs) {
    const mon = new THREE.Group();
    const bezel = box(SW + 0.035, SH + 0.035, 0.035, bezelMat);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(SW, SH),
      new THREE.MeshBasicMaterial({ map: d.tex, toneMapped: false })
    );
    screen.position.z = 0.019;
    // 屏幕自发光的柔光
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(SW * 1.5, SH * 1.6),
      new THREE.MeshBasicMaterial({
        map: makeGlowTexture('rgba(90,190,255,0.16)', 'rgba(90,190,255,0)'),
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      })
    );
    glow.position.z = 0.06;
    mon.add(bezel, screen, glow);
    mon.position.set(d.x, d.y, -0.12);
    mon.rotation.x = d.tilt;
    g.add(mon);
  }
  return g;
}

// ============ 工位 ============
function buildDesk(screens) {
  const g = new THREE.Group();

  // 桌面（白色圆角感）+ 前缘 RGB 灯条
  const top = box(2.35, 0.055, 0.95, std(PASTEL.white, { roughness: 0.3 }), 0, 0.72, 0);
  const ledFront = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 0.018, 0.018),
    unlit(PASTEL.cyan)
  );
  ledFront.position.set(0, 0.695, 0.478);
  g.add(top, ledFront);
  g.userData.led = ledFront;

  // 金属斜腿
  const legMat = std(PASTEL.metal, { metalness: 0.65, roughness: 0.3 });
  for (const sx of [-1, 1]) {
    g.add(box(0.07, 0.7, 0.07, legMat, sx * 1.05, 0.36, 0.32));
    g.add(box(0.07, 0.7, 0.07, legMat, sx * 1.05, 0.36, -0.32));
    g.add(box(0.07, 0.05, 0.78, legMat, sx * 1.05, 0.025, 0));
  }

  g.add(buildMonitorWall(screens));

  // 键盘：暗色底 + 键帽画在贴图上
  const kbc = document.createElement('canvas');
  kbc.width = 256; kbc.height = 96;
  const kctx = kbc.getContext('2d');
  kctx.fillStyle = '#232b42';
  kctx.fillRect(0, 0, 256, 96);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 13 - (r % 2); c++) {
      const hue = (r * 40 + c * 24) % 360;
      kctx.fillStyle = `hsl(${hue}, 65%, 62%)`;
      kctx.beginPath();
      kctx.roundRect(6 + c * 19 + (r % 2) * 8, 8 + r * 21, 15, 15, 4);
      kctx.fill();
    }
  }
  const kbTex = new THREE.CanvasTexture(kbc);
  kbTex.colorSpace = THREE.SRGBColorSpace;
  const kb = new THREE.Mesh(
    new THREE.BoxGeometry(0.52, 0.03, 0.19),
    [std(0x232b42), std(0x232b42), new THREE.MeshBasicMaterial({ map: kbTex }), std(0x232b42), std(0x232b42), std(0x232b42)]
  );
  kb.position.set(0, 0.765, 0.22);
  kb.rotation.y = 0;
  g.add(kb);

  // 鼠标 + 马克杯 + 小手办
  const mouse = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), std(PASTEL.pink, { roughness: 0.35 }));
  mouse.scale.set(1, 0.55, 1.4);
  mouse.position.set(0.42, 0.765, 0.24);
  mouse.castShadow = true;
  g.add(mouse);

  const mug = new THREE.Group();
  const mugBody = cyl(0.045, 0.038, 0.1, std(PASTEL.mint, { roughness: 0.3 }), 0, 0.05, 0);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.009, 10, 20), std(PASTEL.mint, { roughness: 0.3 }));
  handle.position.set(0.05, 0.05, 0);
  mug.add(mugBody, handle);
  mug.position.set(-0.75, 0.75, 0.18);
  g.add(mug);

  // 猫猫手办
  const figu = new THREE.Group();
  const fb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 12), std(PASTEL.gold, { roughness: 0.4 }));
  fb.position.y = 0.05;
  const fh = new THREE.Mesh(new THREE.SphereGeometry(0.038, 14, 12), std(PASTEL.gold, { roughness: 0.4 }));
  fh.position.y = 0.115;
  const e1 = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.03, 8), std(PASTEL.gold));
  e1.position.set(-0.02, 0.15, 0);
  const e2 = e1.clone(); e2.position.x = 0.02;
  figu.add(fb, fh, e1, e2);
  figu.position.set(0.86, 0.745, -0.05);
  g.add(figu);

  return g;
}

// ============ 工学椅 ============
function buildChair() {
  const g = new THREE.Group();
  const frameMat = std(0x222b44, { metalness: 0.5, roughness: 0.35 });
  const meshMat = new THREE.MeshStandardMaterial({
    color: PASTEL.mint, transparent: true, opacity: 0.45,
    roughness: 0.8, side: THREE.DoubleSide,
  });

  // 五星脚 + 滚轮 + 气杆
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = box(0.3, 0.035, 0.05, frameMat, 0, 0.05, 0);
    leg.position.set(Math.cos(a) * 0.15, 0.05, Math.sin(a) * 0.15);
    leg.rotation.y = -a;
    g.add(leg);
    const wheel = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 10), std(0x111828, { roughness: 0.3 }));
    wheel.position.set(Math.cos(a) * 0.28, 0.032, Math.sin(a) * 0.28);
    wheel.castShadow = true;
    g.add(wheel);
  }
  g.add(cyl(0.026, 0.034, 0.32, frameMat, 0, 0.22, 0, 12));

  // 可旋转部分（座+背+扶手+头枕）
  const seatG = new THREE.Group();
  seatG.position.y = 0.38;
  const seat = box(0.46, 0.07, 0.44, std(0x2b3550, { roughness: 0.6 }), 0, 0.03, 0);
  // 座垫粉色滚边
  const piping = new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.012, 8, 24), std(PASTEL.pink));
  piping.rotation.x = Math.PI / 2;
  piping.position.y = 0.068;
  // 网面靠背（半透明 => 挡不住小人）
  const backFrame = new THREE.Group();
  const bf1 = box(0.05, 0.62, 0.04, frameMat, -0.21, 0.36, -0.24);
  const bf2 = box(0.05, 0.62, 0.04, frameMat, 0.21, 0.36, -0.24);
  const bf3 = box(0.44, 0.05, 0.04, frameMat, 0, 0.66, -0.24);
  const meshBack = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.56), meshMat);
  meshBack.position.set(0, 0.37, -0.235);
  backFrame.add(bf1, bf2, bf3, meshBack);
  backFrame.rotation.x = 0.12;
  // 头枕
  const head = box(0.26, 0.12, 0.05, std(0x2b3550, { roughness: 0.6 }), 0, 0.78, -0.31);
  head.rotation.x = 0.18;
  // 扶手
  const armL = new THREE.Group();
  armL.add(box(0.04, 0.22, 0.04, frameMat, 0, 0.11, 0), box(0.07, 0.03, 0.3, std(0x2b3550), 0, 0.235, -0.02));
  armL.position.set(-0.26, 0.05, 0.02);
  const armR = armL.clone();
  armR.position.x = 0.26;

  seatG.add(seat, piping, backFrame, head, armL, armR);
  g.add(seatG);
  g.userData.swivel = seatG;
  // 靠背建在局部 -z 侧，转 180° 让靠背朝向镜头(+z)、人面向显示器
  g.rotation.y = Math.PI;
  return g;
}

// ============ 睡舱 ============
function buildPod() {
  const g = new THREE.Group();
  // 底座
  const base = box(1.7, 0.18, 1.0, std(0x1c2440, { metalness: 0.4, roughness: 0.4 }), 0, 0.09, 0);
  g.add(base);
  // 床垫（微倾斜）
  const bed = new THREE.Group();
  bed.rotation.z = 0.22;
  bed.position.set(0, 0.3, 0);
  const mattress = box(1.62, 0.1, 0.8, std(PASTEL.pink, { roughness: 0.75 }), 0, 0, 0);
  // 枕头放在翘起的那一端（+x 端被 rotation.z 抬高）
  const pillow = box(0.32, 0.09, 0.42, std(PASTEL.white, { roughness: 0.9 }), 0.44, 0.09, 0);
  pillow.rotation.z = -0.08;
  bed.add(mattress, pillow);
  g.add(bed);
  g.userData.bed = bed;

  // 玻璃罩（半开的舱盖）
  const glassMat = new THREE.MeshPhongMaterial({
    color: 0x9fdcff, transparent: true, opacity: 0.16,
    shininess: 90, side: THREE.DoubleSide, depthWrite: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.85, 28, 18, 0, Math.PI), glassMat);
  dome.scale.set(1.05, 0.72, 0.62);
  dome.rotation.set(-Math.PI / 2, 0, 0.5);
  dome.position.set(0.18, 0.42, 0);
  g.add(dome);

  // LED 光环
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.018, 10, 40), unlit(PASTEL.pink));
  ring.rotation.x = Math.PI / 2;
  ring.scale.set(1.6, 1.0, 1);
  ring.position.y = 0.19;
  g.add(ring);
  g.userData.ring = ring;

  // 舱位显示牌
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.25),
    new THREE.MeshBasicMaterial({ map: makeSignTexture('睡舱-01', 'REST POD'), transparent: true })
  );
  sign.position.set(-0.62, 0.95, -0.1);
  sign.rotation.y = 0.25;
  g.add(sign);
  return g;
}

// ============ 咖啡角 ============
function buildCoffee() {
  const g = new THREE.Group();
  const counter = box(0.85, 0.72, 0.55, std(PASTEL.wood, { roughness: 0.6 }), 0, 0.36, 0);
  const counterTop = box(0.95, 0.05, 0.62, std(PASTEL.white, { roughness: 0.3 }), 0, 0.745, 0);
  g.add(counter, counterTop);

  // 咖啡机
  const machine = new THREE.Group();
  const bodyM = box(0.3, 0.34, 0.26, std(0xd94f6e, { metalness: 0.55, roughness: 0.25 }), 0, 0.17, 0);
  const headM = box(0.34, 0.08, 0.3, std(0x36405f, { metalness: 0.6, roughness: 0.3 }), 0, 0.38, 0);
  const spout = cyl(0.018, 0.018, 0.07, std(PASTEL.metal, { metalness: 0.8 }), 0, 0.3, 0.09, 10);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), unlit(0x58f7b2));
  lamp.position.set(0.11, 0.34, 0.14);
  machine.add(bodyM, headM, spout, lamp);
  machine.position.set(-0.12, 0.77, -0.05);
  g.add(machine);

  // 咖啡杯（等待被取走）
  const cup = new THREE.Group();
  cup.add(cyl(0.035, 0.028, 0.08, std(PASTEL.white, { roughness: 0.3 }), 0, 0.04, 0));
  const liquid = cyl(0.03, 0.03, 0.012, std(0x6b4226, { roughness: 0.2 }), 0, 0.076, 0);
  cup.add(liquid);
  cup.position.set(0.24, 0.77, 0.08);
  g.add(cup);
  g.userData.cup = cup;

  // 蒸汽粒子
  const steamTex = makeGlowTexture('rgba(255,255,255,0.75)', 'rgba(255,255,255,0)');
  const steams = [];
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: steamTex, transparent: true, opacity: 0, depthWrite: false,
    }));
    s.scale.setScalar(0.09);
    s.position.set(0.24, 0.85, 0.08);
    s.userData.seed = Math.random() * 10;
    g.add(s);
    steams.push(s);
  }
  g.userData.steams = steams;

  // 菜单牌
  const menuC = document.createElement('canvas');
  menuC.width = 256; menuC.height = 192;
  const mc = menuC.getContext('2d');
  mc.fillStyle = '#2a2033';
  mc.beginPath(); mc.roundRect(0, 0, 256, 192, 16); mc.fill();
  mc.strokeStyle = '#ffa8cf'; mc.lineWidth = 5;
  mc.beginPath(); mc.roundRect(6, 6, 244, 180, 12); mc.stroke();
  mc.fillStyle = '#ffd76a';
  mc.font = 'bold 30px "Microsoft YaHei"';
  mc.textAlign = 'center';
  mc.fillText('MX CAFÉ', 128, 44);
  mc.font = '21px "Microsoft YaHei"';
  mc.fillStyle = '#ffe9f4';
  mc.fillText('alpha拿铁 ···· ¥0', 128, 90);
  mc.fillText('回撤特调 ···· ¥0', 128, 124);
  mc.fillText('梭哈浓缩 ···· ¥0', 128, 158);
  const menuTex = new THREE.CanvasTexture(menuC);
  menuTex.colorSpace = THREE.SRGBColorSpace;
  const menu = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.32), new THREE.MeshBasicMaterial({ map: menuTex, transparent: true }));
  menu.position.set(0, 1.28, -0.1);
  menu.rotation.y = -0.08;
  const menuPole = cyl(0.012, 0.012, 0.42, std(PASTEL.metal, { metalness: 0.7 }), 0, 0.98, -0.1, 8);
  g.add(menu, menuPole);
  return g;
}

// ============ 查询台 ============
function buildQueryDais() {
  const g = new THREE.Group();
  const dais = cyl(0.55, 0.62, 0.07, std(0x1c2848, { metalness: 0.5, roughness: 0.3 }), 0, 0.035, 0, 32);
  g.add(dais);
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.014, 8, 48), unlit(PASTEL.cyan));
  ring1.rotation.x = Math.PI / 2;
  ring1.position.y = 0.075;
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.01, 8, 40), unlit(PASTEL.violet));
  ring2.rotation.x = Math.PI / 2;
  ring2.position.y = 0.09;
  g.add(ring1, ring2);
  g.userData.rings = [ring1, ring2];

  // 上升光柱（仅查询时亮起）
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.42, 1.5, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: PASTEL.cyan, transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    })
  );
  beam.position.y = 0.8;
  g.add(beam);
  g.userData.beam = beam;
  return g;
}

// ============ 躺平区 ============
function buildLounge() {
  const g = new THREE.Group();

  // 太阳躺椅：长椅面朝镜头（+z），靠背在 -z 侧翘起
  const chair = new THREE.Group();
  const frameMat = std(0xf7f9ff, { metalness: 0.3, roughness: 0.4 });
  const slatMat = std(PASTEL.mint, { roughness: 0.6 });
  const seatPart = new THREE.Group();
  for (let i = 0; i < 6; i++) seatPart.add(box(0.6, 0.03, 0.145, slatMat, 0, 0, -0.39 + i * 0.157));
  seatPart.position.set(0, 0.36, 0.42);
  const backPart = new THREE.Group();
  for (let i = 0; i < 4; i++) backPart.add(box(0.6, 0.03, 0.15, slatMat, 0, 0, -0.24 + i * 0.16));
  backPart.rotation.x = 1.0;                   // 顶端向 -z 倾斜立起
  backPart.position.set(0, 0.62, -0.42);
  // 侧边框条
  for (const sx of [-1, 1]) {
    chair.add(box(0.045, 0.035, 0.98, frameMat, sx * 0.325, 0.335, 0.42));
  }
  // 腿
  for (const [lx, lz] of [[-0.28, 0.78], [0.28, 0.78], [-0.28, -0.18], [0.28, -0.18]]) {
    chair.add(box(0.05, 0.34, 0.05, frameMat, lx, 0.17, lz));
  }
  chair.add(seatPart, backPart);
  g.add(chair);

  // 边桌 + 椰子饮料
  const table = cyl(0.22, 0.05, 0.5, std(PASTEL.white, { roughness: 0.4 }), 0.95, 0.25, 0.15, 20);
  g.add(table);
  const drink = new THREE.Group();
  const glass = cyl(0.055, 0.04, 0.13, new THREE.MeshPhongMaterial({ color: 0xffb56b, transparent: true, opacity: 0.75 }), 0, 0.065, 0, 14);
  const straw = cyl(0.008, 0.008, 0.16, std(0xff5f7a), 0.02, 0.16, 0, 8);
  straw.rotation.z = -0.3;
  const umb = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.05, 10), std(PASTEL.pink));
  umb.position.set(-0.03, 0.2, 0);
  const umbPole = cyl(0.004, 0.004, 0.12, std(PASTEL.wood), -0.03, 0.15, 0, 6);
  drink.add(glass, straw, umb, umbPole);
  drink.position.set(0.95, 0.5, 0.15);
  g.add(drink);

  // 遮阳伞：立在躺椅侧后方，伞杆不与椅背/人相交
  const parasolPole = cyl(0.022, 0.022, 1.7, std(PASTEL.white, { metalness: 0.3 }), 1.05, 0.85, -0.62, 10);
  const canopyC = document.createElement('canvas');
  canopyC.width = 256; canopyC.height = 64;
  const cc = canopyC.getContext('2d');
  for (let i = 0; i < 8; i++) {
    cc.fillStyle = i % 2 ? '#ffa8cf' : '#fff4fa';
    cc.fillRect(i * 32, 0, 32, 64);
  }
  const canopyTex = new THREE.CanvasTexture(canopyC);
  canopyTex.colorSpace = THREE.SRGBColorSpace;
  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(0.85, 0.4, 16, 1, true),
    new THREE.MeshStandardMaterial({ map: canopyTex, roughness: 0.7, side: THREE.DoubleSide })
  );
  canopy.position.set(1.05, 1.75, -0.62);
  canopy.rotation.z = 0.14;          // 微微向躺椅倾斜遮阳
  canopy.castShadow = true;
  g.add(parasolPole, canopy);

  // 小棕榈
  const palm = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    palm.add(cyl(0.035 - i * 0.005, 0.045 - i * 0.005, 0.2, std(0xc98d5f, { roughness: 0.8 }), Math.sin(i * 0.25) * 0.06, 0.1 + i * 0.19, 0, 8));
  }
  // 叶片内端压在树干顶点上，避免悬空断开
  const crown = { x: 0.045, y: 0.88 };
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.14), std(0x54c98a, { side: THREE.DoubleSide, roughness: 0.7 }));
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(crown.x + Math.cos(a) * 0.16, crown.y, Math.sin(a) * 0.16);
    leaf.rotation.set(0.1, -a, 0.42);
    palm.add(leaf);
  }
  palm.position.set(-1.15, 0, -0.3);
  g.add(palm);

  // 「永久开摆区」牌子
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.55, 0.28),
    new THREE.MeshBasicMaterial({ map: makeSignTexture('开摆区', 'CHILL ZONE'), transparent: true })
  );
  sign.position.set(1.0, 1.05, -0.3);
  sign.rotation.y = -0.2;
  g.add(sign);

  // 派对彩灯（win 之后才亮）
  const partyLights = new THREE.Group();
  const bulbColors = [0xff5f7a, 0xffd76a, 0x58f7b2, 0x4be1ff, 0xb99cff];
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const bx = -1.1 + t * 2.3;
    const by = 1.55 + Math.sin(t * Math.PI) * -0.28 + 0.3;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), unlit(bulbColors[i % 5]));
    bulb.position.set(bx, by, -0.4);
    partyLights.add(bulb);
  }
  partyLights.visible = false;
  g.add(partyLights);
  g.userData.partyLights = partyLights;

  return g;
}

// 亮度全局系数（调试用：?lum=0.8）
const LUM = (() => {
  const v = parseFloat(new URLSearchParams(location.search).get('lum'));
  return Number.isFinite(v) ? v : 1;
})();

// ============ 主场景 ============
export function buildWorld() {
  const root = new THREE.Group();

  const screens = {
    candle: new CandleScreen(),
    equity: new EquityScreen(),
    code: new CodeScreen(),
    term: new TermScreen(),
  };

  // --- 平台底座 ---
  const platform = box(11.4, 0.1, 2.6, new THREE.MeshStandardMaterial({
    color: 0x131a30, transparent: true, opacity: 0.82, roughness: 0.35, metalness: 0.4,
  }), -0.25, -0.05, -0.1);
  platform.receiveShadow = true;
  root.add(platform);
  const edge = new THREE.Mesh(
    new THREE.BoxGeometry(11.4, 0.02, 0.03),
    unlit(PASTEL.cyan)
  );
  edge.position.set(-0.25, 0.005, 1.19);
  root.add(edge);

  // 影子接收层
  const shadowCatcher = new THREE.Mesh(
    new THREE.PlaneGeometry(11.4, 2.5),
    new THREE.ShadowMaterial({ opacity: 0.28 })
  );
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.position.set(-0.25, 0.001, -0.1);
  shadowCatcher.receiveShadow = true;
  root.add(shadowCatcher);

  // --- 各功能区 ---
  const pod = buildPod();
  pod.position.x = CONFIG.spots.pod;
  const coffee = buildCoffee();
  coffee.position.set(CONFIG.spots.coffee, 0, -0.55);
  const desk = buildDesk(screens);
  desk.position.set(0, 0, -0.42);
  const chair = buildChair();
  chair.position.set(CONFIG.spots.deskChair, 0, 0.16);
  const dais = buildQueryDais();
  dais.position.set(CONFIG.spots.query, 0, -0.1);
  const lounge = buildLounge();
  lounge.position.set(CONFIG.spots.lounge, 0, -0.15);
  root.add(pod, coffee, desk, chair, dais, lounge);

  // --- 灯光 ---
  const hemi = new THREE.HemisphereLight(0xdfeeff, 0x4a5480, 0.62 * LUM);
  const key = new THREE.DirectionalLight(0xfff2e0, 0.85 * LUM);
  key.position.set(2.5, 5.5, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -7; key.shadow.camera.right = 7;
  key.shadow.camera.top = 5; key.shadow.camera.bottom = -2;
  key.shadow.bias = -0.0004;
  const fill = new THREE.DirectionalLight(0xbcd8ff, 0.27 * LUM);
  fill.position.set(-3, 2.5, 5);
  const monLight = new THREE.PointLight(0x4be1ff, 1.0 * LUM, 2.6, 1.8);
  monLight.position.set(0, 1.5, 0.12);
  const podLight = new THREE.PointLight(0xff8ac2, 1.35 * LUM, 2.6, 1.8);
  podLight.position.set(CONFIG.spots.pod, 0.8, 0.4);
  const loungeLight = new THREE.PointLight(0xffd76a, 0.0, 3.5, 1.6);
  loungeLight.position.set(CONFIG.spots.lounge, 1.5, 0.5);
  root.add(fill);
  root.add(hemi, key, monLight, podLight, loungeLight);

  // --- 环境漂浮光尘 ---
  const dustTex = makeGlowTexture('rgba(190,230,255,0.9)', 'rgba(190,230,255,0)');
  const dusts = [];
  for (let i = 0; i < 16; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: dustTex, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    s.scale.setScalar(0.035 + Math.random() * 0.05);
    s.position.set(-5.5 + Math.random() * 11, 0.2 + Math.random() * 2.2, -0.8 + Math.random() * 1.6);
    s.userData.seed = Math.random() * 100;
    root.add(s);
    dusts.push(s);
  }

  // --- Zzz 精灵（睡觉时冒出） ---
  const zzzTex = makeZzzTexture();
  const zzzs = [];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: zzzTex, transparent: true, opacity: 0 }));
    s.scale.setScalar(0.16);
    s.position.set(CONFIG.spots.pod - 0.4, 1.0, 0.3);
    s.userData.phase = i / 3;
    root.add(s);
    zzzs.push(s);
  }

  // --- 彩带粒子池 ---
  const confetti = [];
  const confettiG = new THREE.Group();
  root.add(confettiG);
  const confettiColors = [0xff5f7a, 0xffd76a, 0x58f7b2, 0x4be1ff, 0xb99cff, 0xffa8cf];

  const world = {
    root, screens,
    chairSwivel: chair.userData.swivel,
    deskLed: desk.userData.led,
    podRing: pod.userData.ring,
    daisRings: dais.userData.rings,
    daisBeam: dais.userData.beam,
    steams: coffee.userData.steams,
    coffeeCup: coffee.userData.cup,
    partyLights: lounge.userData.partyLights,
    lights: { hemi, key, monLight, podLight, loungeLight },
    dusts, zzzs,
    screenMode: 'work',
    night: false,
    steamOn: true,

    burstConfetti(x, y, z, n = 130) {
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(0.045, 0.028),
          new THREE.MeshBasicMaterial({
            color: confettiColors[i % confettiColors.length],
            side: THREE.DoubleSide, transparent: true,
          })
        );
        m.position.set(x, y, z);
        m.userData = {
          vx: (Math.random() - 0.5) * 3.4,
          vy: 2.2 + Math.random() * 3.2,
          vz: (Math.random() - 0.5) * 1.6,
          rx: Math.random() * 8, rz: Math.random() * 8,
          life: 3.2 + Math.random() * 1.2,
          age: 0,
        };
        confettiG.add(m);
        confetti.push(m);
      }
    },

    setNight(on) {
      world.night = on;
      world.screenMode = on ? 'night' : (world.screenMode === 'night' ? 'work' : world.screenMode);
    },
    setParty(on) {
      world.screenMode = on ? 'party' : 'work';
      lounge.userData.partyLights.visible = on;
      loungeLight.intensity = on ? 1.6 : 0;
    },

    update(dt, t) {
      // 屏幕刷新（降频到 ~6fps 够用且省电）
      world._screenAcc = (world._screenAcc || 0) + dt;
      if (world._screenAcc > 0.16) {
        world._screenAcc = 0;
        const mode = world.screenMode;
        screens.candle.draw(mode, t);
        screens.equity.draw(mode, t);
        screens.code.draw(mode, t);
        screens.term.draw(mode, t);
      }

      // 灯光昼夜
      const targetKey = (world.night ? 0.24 : 0.85) * LUM;
      const targetHemi = (world.night ? 0.34 : 0.62) * LUM;
      const targetFill = (world.night ? 0.08 : 0.27) * LUM;
      key.intensity += (targetKey - key.intensity) * Math.min(1, dt * 2);
      hemi.intensity += (targetHemi - hemi.intensity) * Math.min(1, dt * 2);
      fill.intensity += (targetFill - fill.intensity) * Math.min(1, dt * 2);
      monLight.intensity = (world.night ? 0.2 : 0.95 + Math.sin(t * 0.004) * 0.18) * LUM;

      // 桌前 LED 呼吸变色
      const hue = (t * 0.00004) % 1;
      desk.userData.led.material.color.setHSL(hue, 0.85, 0.62);

      // 睡舱光环脉动
      pod.userData.ring.material.color.setHSL(0.92, 0.8, 0.6 + Math.sin(t * 0.003) * 0.12);

      // 查询台旋转环 + 查询光柱
      dais.userData.rings[0].rotation.z = t * 0.0008;
      dais.userData.rings[1].rotation.z = -t * 0.0012;
      const beamTarget = world.queryActive ? 0.13 + Math.sin(t * 0.006) * 0.04 : 0;
      const bm = dais.userData.beam.material;
      bm.opacity += (beamTarget - bm.opacity) * Math.min(1, dt * 5);

      // 咖啡蒸汽（局部坐标，杯口上方）
      for (const s of world.steams) {
        if (!world.steamOn) { s.material.opacity = 0; continue; }
        const ph = ((t * 0.0004 + s.userData.seed) % 1);
        s.position.y = 0.85 + ph * 0.28;
        s.position.x = 0.24 + Math.sin(ph * 6 + s.userData.seed) * 0.02;
        s.material.opacity = 0.5 * Math.sin(ph * Math.PI);
      }

      // 光尘漂浮
      for (const d of world.dusts) {
        d.position.y += Math.sin(t * 0.0006 + d.userData.seed) * 0.0008;
        d.position.x += Math.cos(t * 0.0004 + d.userData.seed * 2) * 0.0006;
        d.material.opacity = 0.2 + 0.18 * Math.sin(t * 0.001 + d.userData.seed);
      }

      // Zzz（枕头端上方）
      for (const z of world.zzzs) {
        const on = world._zzzOn;
        const ph = ((t * 0.00035 + z.userData.phase) % 1);
        z.material.opacity = on ? Math.sin(ph * Math.PI) * 0.85 : 0;
        z.position.set(CONFIG.spots.pod + 0.5 + ph * 0.25, 0.9 + ph * 0.5, 0.3);
        z.scale.setScalar(0.1 + ph * 0.12);
      }

      // 派对彩灯闪烁
      if (lounge.userData.partyLights.visible) {
        lounge.userData.partyLights.children.forEach((b, i) => {
          b.material.color.offsetHSL(dt * 0.3, 0, 0);
          b.scale.setScalar(1 + 0.25 * Math.sin(t * 0.008 + i * 1.3));
        });
      }

      // 彩带物理
      for (let i = confetti.length - 1; i >= 0; i--) {
        const m = confetti[i];
        const u = m.userData;
        u.age += dt;
        u.vy -= 4.5 * dt;
        m.position.x += u.vx * dt;
        m.position.y += u.vy * dt;
        m.position.z += u.vz * dt;
        m.rotation.x += u.rx * dt;
        m.rotation.z += u.rz * dt;
        if (m.position.y < 0.02) { m.position.y = 0.02; u.vy *= -0.3; u.vx *= 0.85; }
        m.material.opacity = Math.min(1, Math.max(0, (u.life - u.age) / 0.8));
        if (u.age > u.life) {
          confettiG.remove(m);
          m.geometry.dispose();
          m.material.dispose();
          confetti.splice(i, 1);
        }
      }
    },
  };

  return world;
}
