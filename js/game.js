// ============================================================
//  ゲーム本体：部屋シーン・的(擬似3D・奥行きz)・投球(前方へ投げ重力で落ちる)・命中・描画
//  距離感：床が手前から奥(消失点)へ伸び、的は奥ほど小さく・高く・速く・高得点。
//  弾は「前方(奥)へ投げ出し、上がって重力で落ちる」本物の放物線（ワールド空間で物理計算）。
//  毎フレーム players = [{x, y, shoot, visible}] を受け取って動きます。
//  assets/background.jpg, assets/target1..6.png があれば自動使用（無ければ自前描画）。
// ============================================================

import { CONFIG } from './config.js';
import { spawnTarget } from './targets.js';
import { drawCrosshair } from './crosshair.js';

const Z_NEAR = 0.12;          // 一番手前の的の奥行き
const Z_FAR = 2.6;            // 一番奥の的の奥行き

export class Game {
  constructor(canvas, audio) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audio = audio;
    this.targets = [];
    this.bullets = [];
    this.popups = [];
    this.flashes = [];
    this.score = 0;
    this.timeLeft = CONFIG.GAME_DURATION;
    this.mode = '1P';
    this.running = false;
    this.onEnd = null;
    this.bgImage = null;
    this.targetImages = [];
    this._t = 0;
  }

  get W() { return this.canvas.width; }
  get H() { return this.canvas.height; }
  // --- 遠近法の基準 ---
  get horizonY() { return this.H * 0.34; }            // 消失点(床の奥のはて)の高さ
  get groundNearY() { return this.H * 1.04; }         // 一番手前の床の高さ(画面下の外)
  get floorSpan() { return this.groundNearY - this.horizonY; }
  get hFloat() { return this.floorSpan * 0.34; }      // 的が床から浮く高さ(ワールド)
  get A() { return this.floorSpan - this.hFloat; }
  get laneMax() { return this.W * 0.42; }

  // ワールド(worldX, z, h) → 画面(x, y) と 縮尺 s
  _project(worldX, z, h) {
    const s = 1 / (1 + Math.max(0, z));
    return {
      x: this.W / 2 + worldX * s,
      y: this.horizonY + this.floorSpan * s - h * s,
      s,
    };
  }
  // 画面(cx, cy)（的が浮く高さ hFloat と仮定）→ ワールド(worldX, z)
  _invert(cx, cy) {
    let s = (cy - this.horizonY) / this.A;
    s = Math.max(0.16, Math.min(1.25, s));
    return { z: 1 / s - 1, worldX: (cx - this.W / 2) / s, s };
  }

  reset(mode) {
    this.mode = mode;
    this.score = 0;
    this.timeLeft = CONFIG.GAME_DURATION;
    this.bullets = [];
    this.popups = [];
    this.flashes = [];
    this.targets = [];
    for (let i = 0; i < CONFIG.TARGET_COUNT; i++) {
      const t = spawnTarget(Z_NEAR, Z_FAR, this.laneMax);
      this._projectTarget(t);
      this.targets.push(t);
    }
    this.running = true;
  }

  _projectTarget(t) {
    const h = this.hFloat + t.amp * Math.sin(this._t * 2 + t.phase);
    const pr = this._project(t.worldX, t.z, h);
    t.x = pr.x; t.y = pr.y; t.s = pr.s; t.radius = t.rWorld * pr.s;
  }

  update(dt, players) {
    if (!this.running) return;
    this._t += dt;

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.running = false;
      if (this.onEnd) this.onEnd(this.score);
      return;
    }

    // 的：左右に動いてゆらゆら（止まらず常に動く）。毎フレーム射影して画面座標を更新
    for (const t of this.targets) {
      t.worldX += t.vx * dt;
      this._projectTarget(t);
      if (t.x < t.radius + 8 && t.vx < 0) t.vx *= -1;
      else if (t.x > this.W - t.radius - 8 && t.vx > 0) t.vx *= -1;
      if (t.pop < 1) t.pop = Math.min(1, t.pop + dt * 4);
    }

    // 発射
    players.forEach((p, idx) => {
      if (p && p.shoot) this._fire(p, idx);
    });

    // 弾：弧を描いて飛ぶ。飛行中の弾が「動いている的」に当たった瞬間だけ命中。
    //     当たらなければそのまま落ちて(前に落ちる/通り過ぎる)画面外で消える。
    for (const b of this.bullets) b.t += dt;
    const survivors = [];
    for (const b of this.bullets) {
      const pos = this._ballXY(b);
      const br = b.baseR * this._ballScale(b);
      let hitT = null, bestD = Infinity;
      for (const t of this.targets) {
        const d = Math.hypot(pos.x - t.x, pos.y - t.y);
        if (d <= t.radius + br * 0.5 && d < bestD) { hitT = t; bestD = d; }
      }
      if (hitT) {
        this.score += hitT.points;
        this.audio.playHit();
        this.flashes.push({ x: pos.x, y: pos.y, r: 6, life: 0.4, color: b.color });
        this.popups.push({ x: hitT.x, y: hitT.y - hitT.radius, text: `+${hitT.points}`, color: b.color, life: 0.9, vy: -60 });
        Object.assign(hitT, spawnTarget(Z_NEAR, Z_FAR, this.laneMax));
        this._projectTarget(hitT);
        continue; // 弾は消費
      }
      if (pos.y < this.H + 160 && pos.x > -120 && pos.x < this.W + 120 && b.t < 2.2) survivors.push(b);
    }
    this.bullets = survivors;

    this.popups = this.popups.filter(pp => (pp.life -= dt) > 0);
    this.popups.forEach(pp => { pp.y += pp.vy * dt; });
    this.flashes = this.flashes.filter(f => (f.life -= dt) > 0);
    this.flashes.forEach(f => { f.r += dt * 240; });
  }

  // 1球投げる：狙った点(照準)へ弧を投げるだけ。命中は飛行中の当たり判定で決まる。
  _fire(p, idx) {
    const color = CONFIG.PLAYER_COLORS[idx] || '#ffffff';
    const ex = p.x, ey = p.y;
    const endScale = Math.max(0.25, Math.min(1, this._invert(ex, ey).s));
    const dist = Math.hypot(ex - this.W / 2, ey - (this.H - 6));
    const T = Math.max(0.30, Math.min(0.70, 0.30 + dist / 1500));
    this.bullets.push({
      sx: this.W / 2, sy: this.H - 6, ex, ey,
      arc: CONFIG.BULLET_ARC, endScale, T, t: 0,
      color, baseR: CONFIG.BULLET_RADIUS,
    });
  }

  // 弾の画面位置：P0=手前下, P1=的の少し上(制御点), P2=的。u>1は的を越えて落下。
  _ballXY(b, t = b.t) {
    const u = t / b.T;
    const cu = Math.min(1, u);
    const p1x = b.ex, p1y = b.ey - b.arc;       // 制御点＝的の少し上
    const mu = 1 - cu;
    const x = mu * mu * b.sx + 2 * mu * cu * p1x + cu * cu * b.ex;
    const y = mu * mu * b.sy + 2 * mu * cu * p1y + cu * cu * b.ey;
    if (u <= 1) return { x, y };
    // 外れ：的を越えてから重力で落ちていく
    const evy = 2 * (b.ey - p1y); // u=1での下向き速度
    const k = u - 1;
    return { x, y: b.ey + evy * k + 420 * k * k };
  }

  _ballScale(b) {
    const u = Math.min(1, b.t / b.T);
    return 1 + (b.endScale - 1) * u;
  }

  render(players) {
    const ctx = this.ctx;
    this._drawScene(ctx);

    // 的：奥(z大)から先に、手前(z小)を後に描く
    const ordered = [...this.targets].sort((a, b) => b.z - a.z);
    for (const t of ordered) this._drawTarget(ctx, t);

    // 弾（前方へ投げて落ちる球。奥へ行くほど小さく。立体的な陰影＋尾）
    for (const b of this.bullets) {
      const cur = this._ballXY(b);
      const prev = this._ballXY(b, Math.max(0, b.t - 0.04));
      const r = b.baseR * this._ballScale(b);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = Math.max(2, r * 0.7);
      ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(cur.x, cur.y); ctx.stroke();
      ctx.globalAlpha = 1;
      const grad = ctx.createRadialGradient(cur.x - r * 0.35, cur.y - r * 0.4, r * 0.1, cur.x, cur.y, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(0.35, b.color);
      grad.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(cur.x, cur.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    for (const f of this.flashes) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, f.life / 0.4) * 0.7;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    for (const pp of this.popups) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, pp.life / 0.9);
      ctx.fillStyle = pp.color;
      ctx.font = 'bold 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.strokeText(pp.text, pp.x, pp.y);
      ctx.fillText(pp.text, pp.x, pp.y);
      ctx.restore();
    }

    players.forEach((p, idx) => {
      if (!p || !p.visible) return;
      drawCrosshair(ctx, p.x, p.y, CONFIG.PLAYER_COLORS[idx] || '#fff', CONFIG.CROSSHAIR_RADIUS, p.opacity ?? 1);
    });

    this._drawHUD(ctx);
  }

  _drawTarget(ctx, t) {
    const r = t.radius * (0.65 + 0.35 * t.pop);
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(t.x, t.y + r * 0.95, r * 0.8, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    const img = this.targetImages.length ? this.targetImages[t.imgIndex % this.targetImages.length] : null;
    if (img) {
      ctx.save();
      ctx.beginPath(); ctx.arc(t.x, t.y, r, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(img, t.x - r, t.y - r, r * 2, r * 2);
      ctx.restore();
      ctx.lineWidth = 3; ctx.strokeStyle = '#fff';
      ctx.beginPath(); ctx.arc(t.x, t.y, r, 0, Math.PI * 2); ctx.stroke();
    } else {
      const dn = Number.isFinite(t.dn) ? t.dn : 0;
      const col = `hsl(${Math.round(dn * 210)}, 75%, 58%)`; // 手前=赤 .. 奥=青
      const g = ctx.createRadialGradient(t.x - r * 0.3, t.y - r * 0.3, r * 0.1, t.x, t.y, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.25, col);
      g.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(t.x, t.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = Math.max(3, r * 0.12); ctx.strokeStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(t.x, t.y, r * 0.82, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#2a2a2a';
      ctx.font = `bold ${Math.round(r * 0.7)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(t.points), t.x, t.y + 1);
    }
    ctx.restore();
  }

  // 部屋シーン（手前=木の床／奥=雲の壁、床は消失点へ伸びる）
  _drawScene(ctx) {
    const W = this.W, H = this.H, horizonY = this.horizonY;
    if (this.bgImage) {
      const iw = this.bgImage.width, ih = this.bgImage.height;
      const s = Math.max(W / iw, H / ih);
      ctx.drawImage(this.bgImage, (W - iw * s) / 2, (H - ih * s) / 2, iw * s, ih * s);
      return;
    }
    // 壁（雲の空）
    ctx.fillStyle = '#5db4d4';
    ctx.fillRect(0, 0, W, horizonY);
    this._drawClouds(ctx, W, horizonY);
    // 巾木
    ctx.fillStyle = '#eef3f6';
    ctx.fillRect(0, horizonY - 8, W, 12);
    // 床（消失点へ伸びる木目）
    const fg = ctx.createLinearGradient(0, horizonY, 0, H);
    fg.addColorStop(0, '#caa066');
    fg.addColorStop(1, '#8f6230');
    ctx.fillStyle = fg;
    ctx.fillRect(0, horizonY, W, H - horizonY);
    ctx.save();
    ctx.strokeStyle = 'rgba(70,45,18,0.28)';
    ctx.lineWidth = 2;
    const vpx = W / 2;
    for (let i = -10; i <= 10; i++) {
      const bx = W / 2 + i * (W / 7);
      ctx.beginPath(); ctx.moveTo(vpx, horizonY); ctx.lineTo(bx, H); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(70,45,18,0.16)';
    for (let k = 1; k <= 5; k++) {
      const s = k / 6;                          // 奥(消失点)に向かって間隔が詰まる
      const y = horizonY + (H - horizonY) * (s * s);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.restore();
  }

  _drawClouds(ctx, W, wallBottom) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    const cols = 7, rows = 3;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c + (r % 2 ? 0.5 : 0)) * (W / cols) + 20;
        const y = 34 + r * (wallBottom / (rows + 0.3));
        this._cloud(ctx, x, y, 28 + (r % 2 ? 8 : 0));
      }
    }
    ctx.restore();
  }

  _cloud(ctx, x, y, s) {
    ctx.beginPath();
    ctx.arc(x, y, s * 0.6, 0, Math.PI * 2);
    ctx.arc(x + s * 0.6, y + 4, s * 0.5, 0, Math.PI * 2);
    ctx.arc(x - s * 0.6, y + 6, s * 0.45, 0, Math.PI * 2);
    ctx.arc(x, y + s * 0.28, s * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - s * 1.05, y + s * 0.18, s * 2.1, s * 0.5);
  }

  _drawHUD(ctx) {
    const t = Math.ceil(this.timeLeft);
    const warn = t <= 10;
    panel(ctx, 24, 20, 200, 64);
    ctx.fillStyle = warn ? '#ff5e5e' : '#ffffff';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`⏱ ${t}`, 44, 54);

    const sw = 280;
    panel(ctx, this.W - sw - 24, 20, sw, 64);
    ctx.fillStyle = '#ffd23b';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${this.score}`, this.W - 44, 54);
    ctx.fillStyle = '#cfe0ff';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('SCORE', this.W - sw - 4, 54);

    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.mode === '2P' ? '🤝 2人協力プレイ' : '🙋 1人プレイ', this.W / 2, 50);
  }
}

function panel(ctx, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, x, y, w, h, 14);
  ctx.fill();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
