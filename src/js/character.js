// VRM 少女角色：加载 + 程序化姿势/动画引擎
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, VRMSpringBoneCollider, VRMSpringBoneColliderShapePlane, VRMSpringBoneColliderShapeSphere } from '@pixiv/three-vrm';

// 模型朝向补偿：如果截图发现小人背对镜头，把它改成 Math.PI
const FACING_OFFSET = 0;

const BLEND_SPEED = 7;      // 姿势混合速度
const POS_SPEED = 6;        // 根位置混合速度

// ---------- 姿势库 ----------
// 每个姿势: bones: {骨骼: {x,y,z}}，可带 rootPos/rootEuler/expr/lookAt
// dyn(t, ph) 返回随时间变化的附加旋转
const deg = d => (d * Math.PI) / 180;

// 符号约定（经截图实测）：左臂放下 z=+，右臂放下 z=-；抬起相反
const ARMS_DOWN = {
  leftUpperArm: { z: 1.18 },
  rightUpperArm: { z: -1.18 },
  leftLowerArm: { z: 0.12 },
  rightLowerArm: { z: -0.12 },
};

export const POSES = {
  idle: {
    bones: { ...ARMS_DOWN, spine: { x: 0.03 } },
    expr: { relaxed: 0.25 },
    dyn: t => ({
      chest: { x: 0.025 * Math.sin(t * 1.9) },
      head: { y: 0.07 * Math.sin(t * 0.55), x: 0.03 * Math.sin(t * 1.1) },
      leftUpperArm: { z: 1.18 - 0.02 * Math.sin(t * 1.9) },
      rightUpperArm: { z: -1.18 + 0.02 * Math.sin(t * 1.9) },
    }),
  },

  walk: {
    // 走路的摆动频率高，普通混合速度会把动作滤没，单独提速
    blendSpeed: 22,
    bones: {
      ...ARMS_DOWN,
      spine: { x: 0.08 },
      leftLowerArm: { y: -0.35, z: 0.12 },
      rightLowerArm: { y: 0.35, z: -0.12 },
    },
    expr: {},
    // 符号标定（d-knee 定格图实测）：upperLeg + = 大腿前摆；
    // lowerLeg + = 小腿前甩（反关节！），所以屈膝一律用负值
    dyn: (t, ph) => ({
      leftUpperLeg: { x: 0.55 * Math.sin(ph) },
      rightUpperLeg: { x: -0.55 * Math.sin(ph) },
      leftLowerLeg: { x: -(0.12 + 0.85 * Math.max(0, Math.cos(ph))) },
      rightLowerLeg: { x: -(0.12 + 0.85 * Math.max(0, -Math.cos(ph))) },
      leftFoot: { x: -0.08 * Math.sin(ph) },
      rightFoot: { x: 0.08 * Math.sin(ph) },
      leftUpperArm: { z: 1.15, x: -0.45 * Math.sin(ph) },
      rightUpperArm: { z: -1.15, x: 0.45 * Math.sin(ph) },
      head: { y: 0.05 * Math.sin(ph), x: 0.03 * Math.sin(ph * 2) },
      spine: { x: 0.08, y: 0.05 * Math.sin(ph) },
    }),
    bob: ph => 0.024 * Math.abs(Math.cos(ph)),
  },

  // 打字：坐在工学椅上，前臂朝键盘
  // 大腿前抬 ~83°，膝盖负向屈曲 ~80° => 小腿垂直朝下，脚自然垂放
  type: {
    bones: {
      leftUpperLeg: { x: 1.45, y: 0.06 },
      rightUpperLeg: { x: 1.45, y: -0.06 },
      leftLowerLeg: { x: -1.4 },
      rightLowerLeg: { x: -1.4 },
      leftFoot: { x: -0.08 },
      rightFoot: { x: -0.08 },
      spine: { x: 0.12 },
      neck: { x: 0.08 },
      leftUpperArm: { z: 0.98, x: -0.2 },
      rightUpperArm: { z: -0.98, x: -0.2 },
      leftLowerArm: { y: -1.25 },
      rightLowerArm: { y: 1.25 },
    },
    expr: { ih: 0.15 },
    dyn: t => ({
      leftHand: { y: -0.15 + 0.2 * Math.sin(t * 13) },
      rightHand: { y: 0.15 - 0.2 * Math.sin(t * 13 + Math.PI) },
      head: { x: 0.05 * Math.sin(t * 0.8), y: 0.10 * Math.sin(t * 0.33) },
    }),
  },

  // 站着 querying：仰头看全息屏，右手托腮
  query: {
    bones: {
      ...ARMS_DOWN,
      head: { x: -0.38 },
      neck: { x: -0.15 },
      spine: { x: -0.04 },
      rightUpperArm: { z: -0.5, x: -0.35 },
      rightLowerArm: { y: 2.0 },
    },
    expr: { surprised: 0.2 },
    dyn: t => ({
      head: { x: -0.38, y: 0.04 * Math.sin(t * 1.4) },
    }),
  },

  // 伸懒腰：双臂高举
  stretch: {
    bones: {
      leftUpperArm: { z: -1.25, x: 0.15 },
      rightUpperArm: { z: 1.25, x: 0.15 },
      leftLowerArm: { z: -0.2 },
      rightLowerArm: { z: 0.2 },
      spine: { x: -0.16 },
      head: { x: -0.3 },
    },
    expr: { ou: 0.6, blink: 0.65 },
    dyn: t => ({
      spine: { x: -0.16 + 0.03 * Math.sin(t * 2.4) },
    }),
  },

  // 庆祝：万岁跳
  celebrate: {
    bones: {
      leftUpperArm: { z: -1.2, x: -0.15 },
      rightUpperArm: { z: 1.2, x: -0.15 },
      leftLowerArm: { z: -0.25 },
      rightLowerArm: { z: 0.25 },
      spine: { x: -0.08 },
      head: { x: -0.15 },
    },
    expr: { happy: 1.0, aa: 0.5 },
    dyn: t => ({
      leftUpperArm: { z: -1.2 - 0.25 * Math.abs(Math.sin(t * 9)), x: -0.15 },
      rightUpperArm: { z: 1.2 + 0.25 * Math.abs(Math.sin(t * 9)), x: -0.15 },
    }),
    hop: t => 0.09 * Math.abs(Math.sin(t * 5.5)),
  },

  // 睡舱躺平（仰卧，靠根旋转放倒）
  sleep: {
    bones: {
      leftUpperArm: { z: 1.3, x: 0.1 },
      rightUpperArm: { z: -1.3, x: 0.1 },
      leftLowerArm: { y: -0.4 },
      rightLowerArm: { y: 0.4 },
      leftUpperLeg: { x: 0.22, y: 0.04 },
      rightUpperLeg: { x: 0.22, y: -0.04 },
      leftLowerLeg: { x: -0.2 },
      rightLowerLeg: { x: -0.2 },
      head: { x: 0.06 },
    },
    expr: { blink: 1.0, relaxed: 0.5 },
    dyn: t => ({
      chest: { x: 0.03 * Math.sin(t * 1.3) },
    }),
  },

  // 沙滩椅开摆：躯干后仰靠根节点俯仰（不能转 hips 骨骼，会炸），腿沿椅面伸直
  // 具体角度运行时由 app.js 的 TUNE 覆盖
  lounge: {
    bones: {
      spine: { x: 0.18 },
      neck: { x: 0.2 },
      head: { x: 0.28 },
      leftUpperArm: { z: 1.05, x: -0.2 },
      rightUpperArm: { z: -1.05, x: -0.2 },
      leftLowerArm: { y: -1.35 },
      rightLowerArm: { y: 1.35 },
      leftUpperLeg: { x: 0.88, y: 0.05 },
      rightUpperLeg: { x: 0.88, y: -0.05 },
      leftLowerLeg: { x: -0.25 },
      rightLowerLeg: { x: -0.25 },
      leftFoot: { x: -0.2 },
      rightFoot: { x: -0.2 },
    },
    expr: { relaxed: 0.9, happy: 0.35 },
    dyn: (t, _ph, self) => ({
      leftFoot: { x: (self?.bones.leftFoot?.x ?? -0.4) - 0.18 * (0.5 + 0.5 * Math.sin(t * 1.6)) },
      rightFoot: { x: (self?.bones.rightFoot?.x ?? -0.4) - 0.18 * (0.5 + 0.5 * Math.sin(t * 1.6 + 1.2)) },
      head: { x: self?.bones.head?.x ?? 0.28, y: 0.06 * Math.sin(t * 0.5) },
    }),
  },

  // 端着咖啡走/站：右前臂端到胸前
  coffee: {
    bones: {
      ...ARMS_DOWN,
      rightUpperArm: { z: -0.92, x: -0.15 },
      rightLowerArm: { y: 1.75 },
      head: { x: 0.1 },
    },
    expr: { relaxed: 0.6 },
    dyn: t => ({
      head: { x: 0.1 + 0.03 * Math.sin(t * 2) },
    }),
  },
};

const ALL_BONES = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'leftShoulder', 'rightShoulder',
  'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm',
  'leftHand', 'rightHand',
  'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg',
  'leftFoot', 'rightFoot',
];

const EXPRS = ['happy', 'angry', 'sad', 'relaxed', 'surprised', 'aa', 'ih', 'ou', 'ee', 'oh', 'blink'];

export class Character {
  constructor() {
    this.vrm = null;
    this.root = new THREE.Group();
    this.pos = new THREE.Vector3(0, 0, 0.9);
    this.posTarget = this.pos.clone();
    this.heading = 0;               // 期望朝向（弧度，绕Y）
    this.poseName = 'idle';
    this.walkPhase = 0;
    this.moveTask = null;           // {tx, tz, speed, resolve}
    this.exprCur = {};
    this.exprTarget = {};
    this.blinkTimer = 1.5 + Math.random() * 3;
    this.blinkVal = 0;
    this.t = 0;
    this._boneQTmp = new THREE.Quaternion();
    this._eTmp = new THREE.Euler();
    this._rootQTarget = new THREE.Quaternion();
    this.rootEulerOverride = null;  // 姿势指定的根旋转（如躺下）
    this.rootPosOverride = null;    // 姿势指定的根位置
    this.hitProxy = null;
    this.attachments = {};          // 手持物
    this.lookTarget = new THREE.Object3D();
    this.lookTargetPos = new THREE.Vector3(0, 1.4, 6);
  }

  async load(url) {
    const loader = new GLTFLoader();
    loader.register(parser => new VRMLoaderPlugin(parser));
    const gltf = await loader.loadAsync(url);
    const vrm = gltf.userData.vrm;
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    if (vrm.meta?.metaVersion === '0') VRMUtils.rotateVRM0(vrm);
    vrm.scene.traverse(o => {
      o.frustumCulled = false;
      if (o.isMesh) o.castShadow = true;
    });
    this.vrm = vrm;
    this.root.add(vrm.scene);

    // 视线目标
    this.root.parent?.add?.(this.lookTarget);
    if (vrm.lookAt) vrm.lookAt.target = this.lookTarget;

    // 点击命中盒（不可见）
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 1.5, 0.5),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.position.y = 0.75;
    this.hitProxy = hit;
    this.root.add(hit);

    // 放松手指（微握拳），去掉僵硬张开的"木板手"
    const CURL = [['Proximal', 0.4], ['Intermediate', 0.55], ['Distal', 0.28]];
    for (const side of ['left', 'right']) {
      const sgn = side === 'left' ? 1 : -1;
      for (const finger of ['Index', 'Middle', 'Ring', 'Little']) {
        for (const [seg, amt] of CURL) {
          const n = vrm.humanoid.getNormalizedBoneNode(`${side}${finger}${seg}`);
          if (n) n.rotation.z = sgn * amt;
        }
      }
      const thumb = vrm.humanoid.getNormalizedBoneNode(`${side}ThumbProximal`);
      if (thumb) thumb.rotation.y = sgn * -0.25;
    }

    return vrm;
  }

  // 弹簧骨（头发/裙摆）复位到当前姿态的静止状态
  settleHair() {
    this.vrm?.springBoneManager?.reset?.();
  }

  // 全局地面碰撞（防止头发/裙摆穿到平台下面）
  addGroundCollider(parent, y = 0.02) {
    const mgr = this.vrm?.springBoneManager;
    if (!mgr || !VRMSpringBoneColliderShapePlane) return;
    try {
      const shape = new VRMSpringBoneColliderShapePlane({
        offset: new THREE.Vector3(0, y, 0),
        normal: new THREE.Vector3(0, 1, 0),
      });
      const collider = new VRMSpringBoneCollider(shape);
      parent.add(collider);
      const group = { colliders: [collider], name: 'ground' };
      for (const joint of mgr.joints) joint.colliderGroups.push(group);
    } catch (e) {
      console.warn('地面碰撞体不可用：', e.message);
    }
  }

  // 场景静态球碰撞体（如躺椅椅面/椅背），防止长发穿过家具
  addSphereColliders(parent, spheres) {
    const mgr = this.vrm?.springBoneManager;
    if (!mgr || !VRMSpringBoneColliderShapeSphere) return;
    const group = { colliders: [], name: 'furniture' };
    for (const s of spheres) {
      const shape = new VRMSpringBoneColliderShapeSphere({
        offset: new THREE.Vector3(...s.pos),
        radius: s.r,
      });
      const collider = new VRMSpringBoneCollider(shape);
      parent.add(collider);
      group.colliders.push(collider);
    }
    for (const joint of mgr.joints) joint.colliderGroups.push(group);
  }

  // 手持物挂到手骨骼
  attach(name, obj, side = 'right', offset = [0.02, -0.06, 0.03]) {
    const hand = this.vrm.humanoid.getRawBoneNode(`${side}Hand`);
    if (!hand) return;
    obj.position.set(...offset);
    hand.add(obj);
    this.attachments[name] = obj;
  }
  detach(name) {
    const obj = this.attachments[name];
    if (obj) { obj.parent?.remove(obj); delete this.attachments[name]; }
  }

  setPose(name) { this.poseName = name; }

  // 立即应用姿势（跳过混合），用于摆拍式落位
  snapPose(name) {
    this.poseName = name;
    if (!this.vrm) return;
    const pose = POSES[name] || POSES.idle;
    const dynMap = pose.dyn ? pose.dyn(this.t, this.walkPhase, pose) : null;
    for (const b of ALL_BONES) {
      const node = this.vrm.humanoid.getNormalizedBoneNode(b);
      if (!node) continue;
      const base = pose.bones[b];
      const dyn = dynMap?.[b];
      this._eTmp.set(dyn?.x ?? base?.x ?? 0, dyn?.y ?? base?.y ?? 0, dyn?.z ?? base?.z ?? 0, 'XYZ');
      node.quaternion.setFromEuler(this._eTmp);
    }
    if (this.rootEulerOverride) {
      const e = this.rootEulerOverride;
      this._eTmp.set(e.x || 0, e.y || 0, e.z || 0, e.order || 'YXZ');
    } else {
      this._eTmp.set(0, this.heading + FACING_OFFSET, 0, 'YXZ');
    }
    this.root.quaternion.setFromEuler(this._eTmp);
    const tp = this.rootPosOverride || this.pos;
    this.root.position.set(tp.x, tp.y || 0, tp.z);
    this.vrm.humanoid.update();
    this.root.updateMatrixWorld(true);
    this.vrm.springBoneManager?.reset?.();
  }

  // 把髋部世界坐标对齐到目标点（需先 snapPose）
  alignHips(target) {
    if (!this.vrm) return;
    const hips = this.vrm.humanoid.getNormalizedBoneNode('hips').getWorldPosition(new THREE.Vector3());
    const delta = new THREE.Vector3().copy(target).sub(hips);
    const p = this.rootPosOverride || this.pos;
    if (p.isVector3) p.add(delta);
    this.pos.x = (this.rootPosOverride || this.pos).x;
    this.pos.z = (this.rootPosOverride || this.pos).z;
    this.root.position.add(delta);
    this.root.updateMatrixWorld(true);
  }

  setRootOverride(euler, pos) {
    this.rootEulerOverride = euler; // {x,y,z,order}
    this.rootPosOverride = pos;     // THREE.Vector3 | null
  }

  face(headingRad) { this.heading = headingRad; }
  lookAt(x, y, z) { this.lookTargetPos.set(x, y, z); }

  walkTo(tx, tz, speed) {
    return new Promise(resolve => {
      this.moveTask = { tx, tz: tz ?? this.pos.z, speed, resolve };
    });
  }
  cancelMove() {
    if (this.moveTask) { this.moveTask.resolve(false); this.moveTask = null; }
  }
  teleport(tx, tz) {
    this.cancelMove();
    this.pos.x = tx;
    if (tz !== undefined) this.pos.z = tz;
  }

  setExpr(map) { this.exprTarget = map || {}; }

  update(dt) {
    if (!this.vrm) return;
    this.t += dt;
    const t = this.t;
    const pose = POSES[this.poseName] || POSES.idle;

    // ---- 移动 ----
    let moving = false;
    if (this.moveTask) {
      const { tx, tz, speed, resolve } = this.moveTask;
      const dx = tx - this.pos.x, dz = tz - this.pos.z;
      const dist = Math.hypot(dx, dz);
      const step = (speed || 1.05) * dt;
      if (dist < Math.max(0.02, step)) {
        this.pos.x = tx; this.pos.z = tz;
        this.moveTask = null;
        resolve(true);
      } else {
        this.pos.x += (dx / dist) * step;
        this.pos.z += (dz / dist) * step;
        this.heading = Math.atan2(dx, dz);
        this.walkPhase += dt * (speed || 1.05) * 7.6;
        moving = true;
      }
    }

    // ---- 根位置 ----
    const targetPos = this.rootPosOverride || this.pos;
    this.root.position.x += (targetPos.x - this.root.position.x) * Math.min(1, dt * POS_SPEED);
    this.root.position.z += (targetPos.z - this.root.position.z) * Math.min(1, dt * POS_SPEED);
    let baseY = targetPos.y || 0;
    if (moving && pose.bob) baseY += pose.bob(this.walkPhase);
    if (pose.hop) baseY += pose.hop(t);
    this.root.position.y += (baseY - this.root.position.y) * Math.min(1, dt * POS_SPEED);

    // ---- 根旋转 ----
    if (this.rootEulerOverride) {
      const e = this.rootEulerOverride;
      this._eTmp.set(e.x || 0, e.y || 0, e.z || 0, e.order || 'YXZ');
      this._rootQTarget.setFromEuler(this._eTmp);
    } else {
      this._eTmp.set(0, this.heading + FACING_OFFSET, 0, 'YXZ');
      this._rootQTarget.setFromEuler(this._eTmp);
    }
    this.root.quaternion.slerp(this._rootQTarget, Math.min(1, dt * BLEND_SPEED));

    // ---- 骨骼姿势 ----
    const dynMap = pose.dyn ? pose.dyn(t, this.walkPhase, pose) : null;
    const blend = Math.min(1, dt * (pose.blendSpeed || BLEND_SPEED));
    for (const b of ALL_BONES) {
      const node = this.vrm.humanoid.getNormalizedBoneNode(b);
      if (!node) continue;
      const base = pose.bones[b];
      const dyn = dynMap?.[b];
      const rx = dyn?.x ?? base?.x ?? 0;
      const ry = dyn?.y ?? base?.y ?? 0;
      const rz = dyn?.z ?? base?.z ?? 0;
      this._eTmp.set(rx, ry, rz, 'XYZ');
      this._boneQTmp.setFromEuler(this._eTmp);
      node.quaternion.slerp(this._boneQTmp, blend);
    }

    // ---- 表情 ----
    const em = this.vrm.expressionManager;
    if (em) {
      const poseExpr = pose.expr || {};
      for (const name of EXPRS) {
        const target = this.exprTarget[name] ?? poseExpr[name] ?? 0;
        const cur = this.exprCur[name] ?? 0;
        const next = cur + (target - cur) * Math.min(1, dt * 8);
        this.exprCur[name] = next;
        if (name !== 'blink') em.setValue(name, next);
      }
      // 眨眼（睡觉时闭眼优先）
      const sleepBlink = (this.exprTarget.blink ?? poseExpr.blink ?? 0);
      if (sleepBlink > 0.5) {
        this.blinkVal += (sleepBlink - this.blinkVal) * Math.min(1, dt * 6);
      } else {
        this.blinkTimer -= dt;
        if (this.blinkTimer <= 0) this.blinkTimer = 1.8 + Math.random() * 3.4;
        const k = this.blinkTimer;
        this.blinkVal = k < 0.13 ? Math.sin((0.13 - k) / 0.13 * Math.PI) : Math.max(sleepBlink, 0);
      }
      em.setValue('blink', this.blinkVal);
    }

    // ---- 视线 ----
    this.lookTarget.position.lerp(this.lookTargetPos, Math.min(1, dt * 4));

    this.vrm.update(dt);
  }

  get headWorldPos() {
    if (!this.vrm) return new THREE.Vector3();
    return this.vrm.humanoid.getNormalizedBoneNode('head').getWorldPosition(new THREE.Vector3());
  }
}
