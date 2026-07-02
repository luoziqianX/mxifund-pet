// 四块显示器的动态画面：全部用 CanvasTexture 实时绘制
// mode: 'work' | 'night' | 'party'
import * as THREE from 'three';
import { TERM_LINES } from './config.js';

const W = 512, H = 300;

function makeCanvas() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  return c;
}

function bgGrid(ctx, base = '#0a1226') {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(80, 160, 220, 0.10)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 42) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += 42) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
}

function nightScreen(ctx, t) {
  ctx.fillStyle = '#04060d';
  ctx.fillRect(0, 0, W, H);
  // 待机呼吸灯
  const a = 0.35 + 0.3 * Math.sin(t * 0.0016);
  ctx.fillStyle = `rgba(90, 200, 255, ${a})`;
  ctx.beginPath();
  ctx.arc(W - 26, H - 22, 5, 0, Math.PI * 2);
  ctx.fill();
}

// ---------- 屏幕1：K线 ----------
export class CandleScreen {
  constructor() {
    this.canvas = makeCanvas();
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.candles = [];
    let p = 100;
    for (let i = 0; i < 40; i++) this.candles.push(this.next(p, (p = p + (Math.random() - 0.48) * 4)));
  }
  next(o, c) {
    return { o, c, h: Math.max(o, c) + Math.random() * 2, l: Math.min(o, c) - Math.random() * 2 };
  }
  draw(mode, t) {
    const { ctx } = this;
    if (mode === 'night') { nightScreen(ctx, t); this.tex.needsUpdate = true; return; }
    if (mode === 'party') {
      // 涨停庆祝：全屏大阳线
      bgGrid(ctx, '#1a0d20');
      ctx.font = 'bold 66px Consolas';
      ctx.fillStyle = '#ff5f7a';
      ctx.textAlign = 'center';
      ctx.fillText('涨停', W / 2, H / 2 - 14);
      ctx.font = 'bold 30px Consolas';
      ctx.fillStyle = '#ffd76a';
      ctx.fillText('+∞ %', W / 2, H / 2 + 40);
      this.tex.needsUpdate = true;
      return;
    }
    const last = this.candles[this.candles.length - 1];
    this.candles.push(this.next(last.c, last.c + (Math.random() - 0.48) * 4));
    if (this.candles.length > 40) this.candles.shift();
    bgGrid(ctx);
    const vals = this.candles.flatMap(k => [k.h, k.l]);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const y = v => H - 26 - ((v - lo) / (hi - lo + 1e-6)) * (H - 60);
    const bw = W / 40;
    this.candles.forEach((k, i) => {
      const x = i * bw + bw / 2;
      const up = k.c >= k.o;
      ctx.strokeStyle = ctx.fillStyle = up ? '#ff6b81' : '#41e8a0';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y(k.h)); ctx.lineTo(x, y(k.l)); ctx.stroke();
      const top = y(Math.max(k.o, k.c)), bot = y(Math.min(k.o, k.c));
      ctx.fillRect(x - bw * 0.32, top, bw * 0.64, Math.max(2.5, bot - top));
    });
    ctx.font = 'bold 17px Consolas';
    ctx.fillStyle = '#7fd4ff';
    ctx.textAlign = 'left';
    ctx.fillText('MX-ALPHA-01 · 5m', 12, 24);
    this.tex.needsUpdate = true;
  }
}

// ---------- 屏幕2：净值曲线 ----------
export class EquityScreen {
  constructor() {
    this.canvas = makeCanvas();
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.pts = [50];
  }
  draw(mode, t) {
    const { ctx } = this;
    if (mode === 'night') { nightScreen(ctx, t); this.tex.needsUpdate = true; return; }
    if (mode === 'party') {
      bgGrid(ctx, '#0d1a18');
      // 一条直冲天际的净值线
      ctx.strokeStyle = '#ffd76a';
      ctx.lineWidth = 5;
      ctx.shadowColor = '#ffd76a'; ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.moveTo(10, H - 20);
      ctx.quadraticCurveTo(W * 0.55, H - 40, W - 18, 16);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.font = 'bold 24px Consolas';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.fillText('NAV: TO THE MOON', 16, 34);
      this.tex.needsUpdate = true;
      return;
    }
    const last = this.pts[this.pts.length - 1];
    this.pts.push(Math.max(15, last + (Math.random() - 0.44) * 5));
    if (this.pts.length > 70) this.pts.shift();
    bgGrid(ctx, '#081020');
    const lo = Math.min(...this.pts), hi = Math.max(...this.pts);
    const px = i => (i / 69) * (W - 20) + 10;
    const py = v => H - 24 - ((v - lo) / (hi - lo + 1e-6)) * (H - 70);
    // 面积
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(75,225,255,0.35)');
    grad.addColorStop(1, 'rgba(75,225,255,0)');
    ctx.beginPath();
    ctx.moveTo(px(0), H - 24);
    this.pts.forEach((v, i) => ctx.lineTo(px(i), py(v)));
    ctx.lineTo(px(this.pts.length - 1), H - 24);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    // 线
    ctx.beginPath();
    this.pts.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v))));
    ctx.strokeStyle = '#4be1ff';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#4be1ff'; ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.font = 'bold 17px Consolas';
    ctx.fillStyle = '#9fe8ff';
    ctx.textAlign = 'left';
    const pnl = ((this.pts[this.pts.length - 1] / this.pts[0] - 1) * 100).toFixed(2);
    ctx.fillText(`策略净值  PnL ${pnl >= 0 ? '+' : ''}${pnl}%`, 12, 24);
    this.tex.needsUpdate = true;
  }
}

// ---------- 屏幕3：代码编辑器 ----------
const CODE_COLORS = ['#c792ea', '#82aaff', '#c3e88d', '#ffcb6b', '#89ddff', '#f07178'];
export class CodeScreen {
  constructor() {
    this.canvas = makeCanvas();
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.lines = [];
    for (let i = 0; i < 14; i++) this.lines.push(this.genLine());
  }
  genLine() {
    const segs = [];
    let x = 26 + Math.floor(Math.random() * 3) * 22;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const w = 24 + Math.random() * 70;
      segs.push({ x, w, c: CODE_COLORS[Math.floor(Math.random() * CODE_COLORS.length)] });
      x += w + 10;
      if (x > W - 60) break;
    }
    return segs;
  }
  draw(mode, t) {
    const { ctx } = this;
    if (mode === 'night') { nightScreen(ctx, t); this.tex.needsUpdate = true; return; }
    if (mode === 'party') {
      ctx.fillStyle = '#0d1117';
      ctx.fillRect(0, 0, W, H);
      ctx.font = 'bold 30px "Microsoft YaHei"';
      ctx.fillStyle = '#58f7b2';
      ctx.textAlign = 'center';
      ctx.fillText('// TODO: 没有 TODO 了', W / 2, H / 2 - 12);
      ctx.font = '20px "Microsoft YaHei"';
      ctx.fillStyle = '#8b949e';
      ctx.fillText('git commit -m "干翻凯读 🎉"', W / 2, H / 2 + 32);
      this.tex.needsUpdate = true;
      return;
    }
    if (Math.random() < 0.5) {
      this.lines.push(this.genLine());
      if (this.lines.length > 14) this.lines.shift();
    }
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);
    // 行号栏
    ctx.fillStyle = '#161d28';
    ctx.fillRect(0, 0, 20, H);
    this.lines.forEach((segs, i) => {
      const y = 18 + i * 20;
      ctx.fillStyle = '#39465a';
      ctx.font = '11px Consolas';
      ctx.textAlign = 'left';
      ctx.fillText(String(i + 1), 4, y + 4);
      segs.forEach(s => {
        ctx.fillStyle = s.c;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.roundRect(s.x, y - 6, s.w, 11, 5);
        ctx.fill();
        ctx.globalAlpha = 1;
      });
    });
    // 光标
    if (Math.floor(t / 450) % 2 === 0) {
      const lastY = 18 + (this.lines.length - 1) * 20;
      ctx.fillStyle = '#e6edf3';
      ctx.fillRect(30, lastY - 7, 2.5, 14);
    }
    ctx.font = 'bold 13px Consolas';
    ctx.fillStyle = '#4be1ff';
    ctx.fillText('model_v47_final_FINAL2.py ●', 26, H - 10);
    this.tex.needsUpdate = true;
  }
}

// ---------- 屏幕4：终端 ----------
export class TermScreen {
  constructor() {
    this.canvas = makeCanvas();
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.buf = [];
    this.idx = 0;
    this.prog = 0;
  }
  draw(mode, t) {
    const { ctx } = this;
    if (mode === 'night') { nightScreen(ctx, t); this.tex.needsUpdate = true; return; }
    if (mode === 'party') {
      ctx.fillStyle = '#02060a';
      ctx.fillRect(0, 0, W, H);
      ctx.font = 'bold 22px Consolas';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#41e8a0';
      ctx.fillText('$ kaidu --status', 20, 60);
      ctx.font = 'bold 34px Consolas';
      ctx.fillStyle = '#ff5f7a';
      ctx.fillText('DEFEATED ☠', 20, 116);
      ctx.font = '18px Consolas';
      ctx.fillStyle = '#8b949e';
      ctx.fillText('process exited with code 0', 20, 158);
      this.tex.needsUpdate = true;
      return;
    }
    this.buf.push(TERM_LINES[this.idx++ % TERM_LINES.length]);
    if (this.buf.length > 11) this.buf.shift();
    this.prog = (this.prog + 2 + Math.random() * 5) % 100;
    ctx.fillStyle = '#02060a';
    ctx.fillRect(0, 0, W, H);
    ctx.font = '15px Consolas';
    ctx.textAlign = 'left';
    this.buf.forEach((l, i) => {
      ctx.fillStyle = l.includes('warn') ? '#ffcb6b' : l.includes('kaidu') ? '#ff6b81' : '#41e8a0';
      ctx.fillText(l, 14, 24 + i * 21);
    });
    // 训练进度条
    ctx.fillStyle = 'rgba(75,225,255,0.15)';
    ctx.fillRect(14, H - 30, W - 28, 14);
    ctx.fillStyle = '#4be1ff';
    ctx.fillRect(14, H - 30, (W - 28) * this.prog / 100, 14);
    ctx.fillStyle = '#cfefff';
    ctx.font = 'bold 12px Consolas';
    ctx.fillText(`training epoch ∞  ${this.prog.toFixed(0)}%`, 20, H - 19);
    this.tex.needsUpdate = true;
  }
}

// ---------- 杂项贴图 ----------
export function makeSignTexture(text, sub) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#101a30';
  ctx.beginPath();
  ctx.roundRect(0, 0, 256, 128, 18);
  ctx.fill();
  ctx.strokeStyle = '#ffd76a';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(5, 5, 246, 118, 14);
  ctx.stroke();
  ctx.fillStyle = '#ffd76a';
  ctx.font = 'bold 34px "Microsoft YaHei"';
  ctx.textAlign = 'center';
  ctx.fillText(text, 128, 56);
  ctx.fillStyle = '#9fdcff';
  ctx.font = '20px "Microsoft YaHei"';
  ctx.fillText(sub, 128, 96);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeZzzTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 84px "Comic Sans MS", "Microsoft YaHei"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(40,60,110,0.9)';
  ctx.lineWidth = 10;
  ctx.strokeText('Z', 64, 66);
  ctx.fillStyle = '#bfe3ff';
  ctx.fillText('Z', 64, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeGlowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
