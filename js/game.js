// ============================================================
//  ゲーム本体：的(奥行きあり)・発射・弾(放物線で奥へ)・当たり判定・スコア・描画
//  疑似3D：的は奥行き(z)で遠近法配置。奥ほど小さく、上に。
//  毎フレーム players = [{x, y, shoot, visible}] を受け取って動きます。
// ============================================================

import { CONFIG } from './config.js';
import { spawnTarget } from './targets.js';
import { drawCrosshair } from './crosshair.js';

const HORIZON = 0.16;   // 消失点の高さ（画面の割合。小さいほど上）
const NEAR = 0.92;      // 一番手前の的の高さ（画面の割合）

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
  }

  get W() { return this.canvas.width; }
  get H() { return this.canvas.height; }

  reset(mode) {
    this.mode = mode;
    this.score = 0;
    this.timeLeft = CONFIG.GAME_DURATION;
    this.bullets = [];
    this.popups = [];
    this.flashes = [];
    this.targets = [];
    for (let i = 0; i < CONFIG.TARGET_COUNT; i++) {
      const t = spawnTarget();
      this._projectTarget(t);
      this.targets.push(t);
    }
    this.running = true;
  }

  // 奥行き(fx,z) → 画面座標(x,y) と 拡大率(scale) を計算（遠近法）
  _projectTarget(t) {
    const horizonY = this.H * HORIZON;
    const nearY = this.H * NEAR;
    t.y = horizonY + (nearY - horizonY) * t.z;
    t.scale = 0.32 + 0.68 * t.z;          // 奥ほど小さい
    const spread = 0.14 + 0.86 * t.z;     // 奥ほど横幅が狭まる（消失点へ）
    t.x = this.W / 2 + (t.fx - 0.5) * this.W * spread;
    t.radius = t.type.radius * t.scale;
  }

  // 画面の高さy → 奥行きの拡大率（弾の大きさ用。手前=大きい/奥=小さい）
  _depthScaleAtY(y) {
    const horizonY = this.H * HORIZON;
    const nearY = this.H * NEAR;
    const z = Math.max(0, Math.min(1, (y - horizonY) / (nearY - horizonY)));
    return 0.28 + 0.95 * z;
  }

  update(dt, players) {
    if (!this.running) return;

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.running = false;
      if (this.onEnd) this.onEnd(this.score);
      return;
    }

    // 的：横に移動（奥行きは固定）→ 遠近法で画面座標を更新
    for (const t of this.targets) {
      if (!t.dying) {
        t.fx += t.vfx * dt;
        if (t.fx < 0.06) { t.fx = 0.06; t.vfx *= -1; }
        if (t.fx > 0.94) { t.fx = 0.94; t.vfx *= -1; }
      }
      this._projectTarget(t);
      if (t.pop < 1) t.pop = Math.min(1, t.pop + dt * 4);
    }

    // 発射
    players.forEach((p, idx) => {
      if (p && p.shoot) this._fire(p, idx);
    });

    // 弾（重力で放物線。奥へ飛ぶほど小さく）
    for (const b of this.bullets) {
      b.elapsed += dt;
      b.vy += b.g * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    this.bullets = this.bullets.filter(b => {
      if (b.hit) {
        if (b.elapsed >= b.T) {
          this.score += b.points;
          this.audio.playHit();
          this.flashes.push({ x: b.tx, y: b.ty, r: 6, life: 0.35, color: b.color });
          this.popups.push({ x: b.tx, y: b.ty, text: `+${b.points}`, color: b.color, life: 0.9, vy: -60 });
          if (b.deadTarget) {
            Object.assign(b.deadTarget, spawnTarget());
            this._projectTarget(b.deadTarget);
          }
          return false;
        }
        return true;
      }
      return b.x > -80 && b.x < this.W + 80 && b.y > -80 && b.y < this.H + 140;
    });

    this.popups = this.popups.filter(pp => (pp.life -= dt) > 0);
    this.popups.forEach(pp => { pp.y += pp.vy * dt; });
    this.flashes = this.flashes.filter(f => (f.life -= dt) > 0);
    this.flashes.forEach(f => { f.r += dt * 220; });
  }

  // 1発投げる：画面下(手前)から放物線で奥の的へ。命中ならその的に着弾
  _fire(p, idx) {
    const color = CONFIG.PLAYER_COLORS[idx] || '#ffffff';
    const mx = this.W / 2, my = this.H + 10;
    const dx = p.x - mx, dy = p.y - my;
    const dist = Math.hypot(dx, dy) || 1;
    const g = CONFIG.BULLET_GRAVITY;
    const T = Math.max(0.22, Math.min(0.55, dist / 1400));
    const vx = dx / T;
    const vy = (dy - 0.5 * g * T * T) / T;

    const hit = this._hitTest(p.x, p.y);
    this.bullets.push({
      x: mx, y: my, vx, vy, g, elapsed: 0, T,
      color, baseR: CONFIG.BULLET_RADIUS,
      hit: !!hit, tx: p.x, ty: p.y,
      points: hit ? hit.points : 0,
      deadTarget: hit || null,
    });
    if (hit) { hit.dying = true; }
  }

  // 照準(x,y)の当たり判定。的の中心が HIT_RADIUS 以内なら命中（一番近いもの）
  _hitTest(x, y) {
    let best = null, bestD = Infinity;
    for (const t of this.targets) {
      if (t.dying) continue;
      const d = Math.hypot(t.x - x, t.y - y);
      if (d <= CONFIG.HIT_RADIUS && d < bestD) { best = t; bestD = d; }
    }
    return best;
  }

  render(players) {
    const ctx = this.ctx;
    this._drawBackground(ctx);

    // 奥の的から順に描く（奥行きの重なりを正しく）
    const ordered = [...this.targets].sort((a, b) => a.z - b.z);
    for (const t of ordered) {
      const r = t.radius * (0.6 + 0.4 * t.pop);
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = t.type.color;
      ctx.beginPath(); ctx.arc(t.x, t.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = Math.max(2, 4 * t.scale);
      ctx.strokeStyle = t.type.color;
      ctx.beginPath(); ctx.arc(t.x, t.y, r, 0, Math.PI * 2); ctx.stroke();
      if (t.dying) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(t.x, t.y, r + 6, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.font = `${Math.round(r * 1.3)}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.type.emoji, t.x, t.y + 2);
      ctx.restore();
    }

    // 弾（投げた球。手前=大きく/奥=小さく。立体的な陰影つき）
    for (const b of this.bullets) {
      const r = b.baseR * this._depthScaleAtY(b.y);
      const n = Math.hypot(b.vx, b.vy) || 1;
      ctx.save();
      // 軌跡
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = Math.max(2, r * 0.7);
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx / n * r * 2.2, b.y - b.vy / n * r * 2.2);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      // 立体的な玉
      ctx.globalAlpha = 1;
      const grad = ctx.createRadialGradient(b.x - r * 0.35, b.y - r * 0.4, r * 0.1, b.x, b.y, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(0.35, b.color);
      grad.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // 命中の波紋
    for (const f of this.flashes) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, f.life / 0.35) * 0.7;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // 得点ポップアップ
    for (const pp of this.popups) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, pp.life / 0.9);
      ctx.fillStyle = pp.color;
      ctx.font = 'bold 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(pp.text, pp.x, pp.y);
      ctx.restore();
    }

    // 照準（大きさ＝当たり判定）
    players.forEach((p, idx) => {
      if (!p || !p.visible) return;
      drawCrosshair(ctx, p.x, p.y, CONFIG.PLAYER_COLORS[idx] || '#fff', CONFIG.CROSSHAIR_RADIUS, p.opacity ?? 1);
    });

    this._drawHUD(ctx);
  }

  // 遠近法の背景（奥に消失点のある床）
  _drawBackground(ctx) {
    const W = this.W, H = this.H;
    const horizonY = H * HORIZON;
    // 奥（空）
    const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
    sky.addColorStop(0, '#0b1226');
    sky.addColorStop(1, '#1c2f57');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, horizonY);
    // 床（手前へ）
    const floor = ctx.createLinearGradient(0, horizonY, 0, H);
    floor.addColorStop(0, '#16294d');
    floor.addColorStop(1, '#090f1d');
    ctx.fillStyle = floor;
    ctx.fillRect(0, horizonY, W, H - horizonY);
    // 消失点グリッド
    ctx.save();
    ctx.strokeStyle = 'rgba(120,170,255,0.10)';
    ctx.lineWidth = 1;
    const vpx = W / 2, vpy = horizonY;
    for (let i = -6; i <= 6; i++) {
      const bx = W / 2 + i * (W / 9);
      ctx.beginPath(); ctx.moveTo(vpx, vpy); ctx.lineTo(bx, H); ctx.stroke();
    }
    const nearY = H * NEAR;
    for (let k = 1; k <= 6; k++) {
      const z = k / 7;
      const y = horizonY + (nearY - horizonY) * z;
      const spread = 0.14 + 0.86 * z;
      ctx.beginPath();
      ctx.moveTo(W / 2 - W * spread / 2, y);
      ctx.lineTo(W / 2 + W * spread / 2, y);
      ctx.stroke();
    }
    ctx.restore();
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

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
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
