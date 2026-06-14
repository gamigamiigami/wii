// ============================================================
//  ゲーム本体：的の動き・当たり判定・スコア・タイマー・描画
//  入力方式(カメラ/マウス)に依存しません。
//  毎フレーム players = [{x, y, shoot, visible}] を受け取って動きます。
// ============================================================

import { CONFIG } from './config.js';
import { spawnTarget } from './targets.js';
import { drawCrosshair } from './crosshair.js';

export class Game {
  constructor(canvas, audio) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audio = audio;
    this.targets = [];
    this.popups = [];   // 「+20」などの浮き上がる得点表示
    this.flashes = [];  // 発射時の波紋
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
    this.popups = [];
    this.flashes = [];
    this.targets = [];
    for (let i = 0; i < CONFIG.TARGET_COUNT; i++) {
      this.targets.push(spawnTarget(this.W, this.H));
    }
    this.running = true;
  }

  update(dt, players) {
    if (!this.running) return;

    // タイマー
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.running = false;
      if (this.onEnd) this.onEnd(this.score);
      return;
    }

    // 的の移動（壁で反射）＋出現アニメ
    for (const t of this.targets) {
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      if (t.x < t.radius) { t.x = t.radius; t.vx *= -1; }
      if (t.x > this.W - t.radius) { t.x = this.W - t.radius; t.vx *= -1; }
      if (t.y < t.radius) { t.y = t.radius; t.vy *= -1; }
      if (t.y > this.H - t.radius) { t.y = this.H - t.radius; t.vy *= -1; }
      if (t.pop < 1) t.pop = Math.min(1, t.pop + dt * 4);
    }

    // 発射と当たり判定
    players.forEach((p, idx) => {
      if (!p || !p.shoot) return;
      this.flashes.push({ x: p.x, y: p.y, r: 10, life: 0.3, color: CONFIG.PLAYER_COLORS[idx] || '#fff' });
      const hit = this._hitTest(p.x, p.y);
      if (hit) {
        this.score += hit.points;
        this.audio.playHit();
        this.popups.push({
          x: hit.x, y: hit.y, text: `+${hit.points}`,
          color: CONFIG.PLAYER_COLORS[idx] || '#fff', life: 0.9, vy: -60,
        });
        // 当たった的は別の場所に新しく出現
        Object.assign(hit, spawnTarget(this.W, this.H));
      }
    });

    // 演出の寿命更新
    this.popups = this.popups.filter(pp => (pp.life -= dt) > 0);
    this.popups.forEach(pp => { pp.y += pp.vy * dt; });
    this.flashes = this.flashes.filter(f => (f.life -= dt) > 0);
    this.flashes.forEach(f => { f.r += dt * 160; });
  }

  // 照準(x,y)に重なっている的のうち、中心が一番近いものを返す
  _hitTest(x, y) {
    let best = null, bestD = Infinity;
    for (const t of this.targets) {
      const d = Math.hypot(t.x - x, t.y - y);
      if (d <= t.radius && d < bestD) { best = t; bestD = d; }
    }
    return best;
  }

  render(players) {
    const ctx = this.ctx;
    this._drawBackground(ctx);

    // 的
    for (const t of this.targets) {
      const s = 0.6 + 0.4 * t.pop; // 出現時に少し拡大
      const r = t.radius * s;
      ctx.save();
      // 影つきの丸
      ctx.beginPath();
      ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
      ctx.fillStyle = t.type.color;
      ctx.globalAlpha = 0.35;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 4;
      ctx.strokeStyle = t.type.color;
      ctx.stroke();
      // 絵文字
      ctx.font = `${Math.round(r * 1.3)}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.type.emoji, t.x, t.y + 2);
      ctx.restore();
    }

    // 発射の波紋
    for (const f of this.flashes) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, f.life / 0.3) * 0.6;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.stroke();
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

    // 照準
    players.forEach((p, idx) => {
      if (!p || !p.visible) return;
      drawCrosshair(ctx, p.x, p.y, CONFIG.PLAYER_COLORS[idx] || '#fff', p.opacity ?? 1);
    });

    this._drawHUD(ctx);
  }

  _drawBackground(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, this.H);
    g.addColorStop(0, '#1b2a4a');
    g.addColorStop(1, '#0d1426');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.W, this.H);
  }

  _drawHUD(ctx) {
    // 残り時間（左上）
    const t = Math.ceil(this.timeLeft);
    const warn = t <= 10;
    panel(ctx, 24, 20, 200, 64);
    ctx.fillStyle = warn ? '#ff5e5e' : '#ffffff';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`⏱ ${t}`, 44, 54);

    // スコア（右上）
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

    // モード表示（上中央）
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
