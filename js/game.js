// ============================================================
//  ゲーム本体：部屋シーン・的(連続した奥行き)・投球(平らな放物線で奥へ)・命中・描画
//  距離感は「手前の床／奥の壁」＋「的の大きさ(手前=大/奥=小)」で表現。
//  投球は直線＋ゆるい山(BULLET_ARC)で、まっすぐ平らに投げます。
//  毎フレーム players = [{x, y, shoot, visible}] を受け取って動きます。
//  assets/background.jpg, assets/target1..6.png があれば自動で使用（無ければ自前描画）。
// ============================================================

import { CONFIG } from './config.js';
import { spawnTarget } from './targets.js';
import { drawCrosshair } from './crosshair.js';

const FLOOR_RATIO = 0.72;     // 床のはじまる高さ
const NEAR_Y_RATIO = 0.60;    // 一番手前の的の高さ（投球の山あたり）
const FAR_Y_RATIO = 0.24;     // 一番奥の的の高さ

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
  get floorY() { return this.H * FLOOR_RATIO; }
  get nearY() { return this.H * NEAR_Y_RATIO; }
  get farY() { return this.H * FAR_Y_RATIO; }

  reset(mode) {
    this.mode = mode;
    this.score = 0;
    this.timeLeft = CONFIG.GAME_DURATION;
    this.bullets = [];
    this.popups = [];
    this.flashes = [];
    this.targets = [];
    for (let i = 0; i < CONFIG.TARGET_COUNT; i++) {
      this.targets.push(spawnTarget(this.W, this.nearY, this.farY));
    }
    this.running = true;
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

    // 的：左右に動いて反射、上下にゆらゆら（dyingは止める）
    for (const t of this.targets) {
      if (!t.dying) {
        t.x += t.vx * dt;
        if (t.x < t.radius + 8) { t.x = t.radius + 8; t.vx *= -1; }
        if (t.x > this.W - t.radius - 8) { t.x = this.W - t.radius - 8; t.vx *= -1; }
        t.y = t.baseY + t.amp * Math.sin(this._t * 2 + t.phase);
      }
      if (t.pop < 1) t.pop = Math.min(1, t.pop + dt * 4);
    }

    // 発射
    players.forEach((p, idx) => {
      if (p && p.shoot) this._fire(p, idx);
    });

    // 弾（直線＋ゆるい山。進むほど＝奥へ行くほど小さく）
    for (const b of this.bullets) b.elapsed += dt;
    this.bullets = this.bullets.filter(b => {
      if (b.hit) {
        if (b.elapsed >= b.T) {                 // 的に届いた瞬間
          this.score += b.points;
          this.audio.playHit();
          this.flashes.push({ x: b.ex, y: b.ey, r: 6, life: 0.4, color: b.color });
          this.popups.push({ x: b.ex, y: b.ey, text: `+${b.points}`, color: b.color, life: 0.9, vy: -60 });
          if (b.deadTarget) {
            Object.assign(b.deadTarget, spawnTarget(this.W, this.nearY, this.farY));
            b.deadTarget.dying = false;
          }
          return false;
        }
        return true;
      }
      const pos = this._ballXY(b);
      return pos.x > -90 && pos.x < this.W + 90 && pos.y > -90 && pos.y < this.H + 160;
    });

    this.popups = this.popups.filter(pp => (pp.life -= dt) > 0);
    this.popups.forEach(pp => { pp.y += pp.vy * dt; });
    this.flashes = this.flashes.filter(f => (f.life -= dt) > 0);
    this.flashes.forEach(f => { f.r += dt * 240; });
  }

  // 1球投げる：床(手前)から的へ、直線＋ゆるい山でまっすぐ平らに。進むほど小さく＝奥へ。
  _fire(p, idx) {
    const color = CONFIG.PLAYER_COLORS[idx] || '#ffffff';
    const sx = this.W / 2, sy = this.H - 6;       // 投げる位置＝画面下の中央(手前)
    const ex = p.x, ey = p.y;
    const dist = Math.hypot(ex - sx, ey - sy) || 1;
    const T = Math.max(0.22, Math.min(0.5, dist / 1100));
    // 狙った高さ＝奥行き。手前=1.0倍 / 奥=0.30倍 まで弾が縮む
    const dAim = Math.max(0, Math.min(1, (this.nearY - ey) / (this.nearY - this.farY)));
    const endScale = 1 + (0.30 - 1) * dAim;

    const hit = this._hitTest(ex, ey);
    this.bullets.push({
      sx, sy, ex, ey,
      vx: (ex - sx) / T, vy: (ey - sy) / T,
      T, elapsed: 0,
      arc: CONFIG.BULLET_ARC, endScale,
      color, baseR: CONFIG.BULLET_RADIUS,
      hit: !!hit, points: hit ? hit.points : 0, deadTarget: hit || null,
    });
    if (hit) hit.dying = true;
  }

  // 弾の現在位置（直線移動＋ u=0..1 のあいだだけ sin の山を足す）
  _ballXY(b) {
    const t = b.elapsed;
    const u = Math.min(1, t / b.T);
    return {
      x: b.sx + b.vx * t,
      y: b.sy + b.vy * t - b.arc * Math.sin(Math.PI * u),
    };
  }
  _ballScale(b) {
    const u = Math.min(1, b.elapsed / b.T);
    return 1 + (b.endScale - 1) * u;
  }

  // 当たり判定：照準が的の上(=的の半径以内)なら命中。的が小さい(遠い)ほど難しい。
  _hitTest(x, y) {
    let best = null, bestD = Infinity;
    for (const t of this.targets) {
      if (t.dying) continue;
      const d = Math.hypot(t.x - x, t.y - y);
      if (d <= t.radius && d < bestD) { best = t; bestD = d; }
    }
    return best;
  }

  render(players) {
    const ctx = this.ctx;
    this._drawScene(ctx);

    // 的：奥(小)から先に、手前(大)を後に描く
    const ordered = [...this.targets].sort((a, b) => a.radius - b.radius);
    for (const t of ordered) this._drawTarget(ctx, t);

    // 弾（投げた球。進むほど小さく＝奥へ。立体的な陰影）
    for (const b of this.bullets) {
      const pos = this._ballXY(b);
      const r = b.baseR * this._ballScale(b);
      const n = Math.hypot(b.vx, b.vy) || 1;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = Math.max(2, r * 0.7);
      ctx.beginPath();
      ctx.moveTo(pos.x - b.vx / n * r * 2.0, pos.y - b.vy / n * r * 2.0);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const grad = ctx.createRadialGradient(pos.x - r * 0.35, pos.y - r * 0.4, r * 0.1, pos.x, pos.y, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(0.35, b.color);
      grad.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2); ctx.fill();
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
    // 影
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
      const d = Number.isFinite(t.d) ? t.d : 0;
      const col = `hsl(${Math.round(d * 210)}, 75%, 58%)`; // 手前=赤 .. 奥=青
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
    if (t.dying) {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(t.x, t.y, r + 7, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  // 部屋シーン（手前=木の床／奥=雲の壁）。距離感の土台。
  _drawScene(ctx) {
    const W = this.W, H = this.H, floorY = this.floorY;
    if (this.bgImage) {
      const iw = this.bgImage.width, ih = this.bgImage.height;
      const s = Math.max(W / iw, H / ih);
      const dw = iw * s, dh = ih * s;
      ctx.drawImage(this.bgImage, (W - dw) / 2, (H - dh) / 2, dw, dh);
      return;
    }
    ctx.fillStyle = '#5db4d4';
    ctx.fillRect(0, 0, W, floorY);
    this._drawClouds(ctx, W, floorY);
    ctx.fillStyle = '#eef3f6';
    ctx.fillRect(0, floorY - 12, W, 16);
    const fg = ctx.createLinearGradient(0, floorY, 0, H);
    fg.addColorStop(0, '#d4a86b');
    fg.addColorStop(1, '#9a6a36');
    ctx.fillStyle = fg;
    ctx.fillRect(0, floorY, W, H - floorY);
    ctx.save();
    ctx.strokeStyle = 'rgba(70,45,18,0.30)';
    ctx.lineWidth = 2;
    const vpx = W / 2, vpy = floorY - 220;
    for (let i = -9; i <= 9; i++) {
      const bx = W / 2 + i * (W / 7);
      ctx.beginPath(); ctx.moveTo(vpx, vpy); ctx.lineTo(bx, H); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(70,45,18,0.18)';
    for (let k = 1; k <= 4; k++) {
      const y = floorY + (H - floorY) * (k / 5);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.restore();
  }

  _drawClouds(ctx, W, floorY) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    const cols = 7, rows = 4;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c + (r % 2 ? 0.5 : 0)) * (W / cols) + 20;
        const y = 36 + r * (floorY / (rows + 0.5));
        this._cloud(ctx, x, y, 30 + (r % 2 ? 8 : 0));
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
