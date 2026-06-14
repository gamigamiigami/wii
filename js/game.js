// ============================================================
//  ゲーム本体：的の動き・発射・弾(放物線)・当たり判定・スコア・タイマー・描画
//  入力方式(カメラ/マウス/タップ)に依存しません。
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
    this.bullets = [];  // 投げた弾（放物線で飛ぶ・見える）
    this.popups = [];   // 「+20」などの浮き上がる得点表示
    this.flashes = [];  // 命中の波紋
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

    // 的の移動（壁で反射）＋出現アニメ。命中待ち(dying)の的は止める
    for (const t of this.targets) {
      if (!t.dying) {
        t.x += t.vx * dt;
        t.y += t.vy * dt;
        if (t.x < t.radius) { t.x = t.radius; t.vx *= -1; }
        if (t.x > this.W - t.radius) { t.x = this.W - t.radius; t.vx *= -1; }
        if (t.y < t.radius) { t.y = t.radius; t.vy *= -1; }
        if (t.y > this.H - t.radius) { t.y = this.H - t.radius; t.vy *= -1; }
      }
      if (t.pop < 1) t.pop = Math.min(1, t.pop + dt * 4);
    }

    // 発射（グー or タップ/クリックのたびに必ず弾を投げる）
    players.forEach((p, idx) => {
      if (p && p.shoot) this._fire(p, idx);
    });

    // 弾の物理（重力で放物線）と着弾・消滅
    for (const b of this.bullets) {
      b.elapsed += dt;
      b.vy += b.g * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    this.bullets = this.bullets.filter(b => {
      if (b.hit) {
        if (b.elapsed >= b.T) {          // 的に着弾した瞬間
          this.score += b.points;
          this.audio.playHit();
          this.flashes.push({ x: b.tx, y: b.ty, r: 6, life: 0.35, color: b.color });
          this.popups.push({ x: b.tx, y: b.ty, text: `+${b.points}`, color: b.color, life: 0.9, vy: -60 });
          if (b.deadTarget) {
            Object.assign(b.deadTarget, spawnTarget(this.W, this.H)); // 的を入れ替え
            b.deadTarget.dying = false;                                // 命中待ち状態を解除
          }
          return false;
        }
        return true;
      }
      // 外れ弾はそのまま飛んで画面外で消える
      return b.x > -80 && b.x < this.W + 80 && b.y > -80 && b.y < this.H + 140;
    });

    // 演出の寿命更新
    this.popups = this.popups.filter(pp => (pp.life -= dt) > 0);
    this.popups.forEach(pp => { pp.y += pp.vy * dt; });
    this.flashes = this.flashes.filter(f => (f.life -= dt) > 0);
    this.flashes.forEach(f => { f.r += dt * 220; });
  }

  // 1発投げる：画面下から放物線で飛ばす。命中ならその的に着弾、外れなら飛び去る
  _fire(p, idx) {
    const color = CONFIG.PLAYER_COLORS[idx] || '#ffffff';
    const mx = this.W / 2, my = this.H + 10;   // 発射口＝画面下の中央
    const dx = p.x - mx, dy = p.y - my;
    const dist = Math.hypot(dx, dy) || 1;
    const g = CONFIG.BULLET_GRAVITY;
    const T = Math.max(0.22, Math.min(0.5, dist / 1500)); // 飛行時間（遠いほど長い）
    // 時刻Tで照準点(p.x,p.y)に届くよう初速を計算（重力つき放物線）
    const vx = dx / T;
    const vy = (dy - 0.5 * g * T * T) / T;

    const hit = this._hitTest(p.x, p.y);
    const bullet = {
      x: mx, y: my, vx, vy, g, elapsed: 0, T,
      color, baseR: CONFIG.BULLET_RADIUS,
      hit: !!hit, tx: p.x, ty: p.y,
      points: hit ? hit.points : 0,
      deadTarget: hit || null,
    };
    this.bullets.push(bullet);

    if (hit) { hit.dying = true; hit.vx = 0; hit.vy = 0; } // 着弾まで的をその場で待たせる
  }

  // 照準(x,y)の当たり判定。的の中心が HIT_RADIUS 以内なら命中（一番近いもの）
  _hitTest(x, y) {
    let best = null, bestD = Infinity;
    for (const t of this.targets) {
      if (t.dying) continue; // 命中待ちの的は二重に当てない
      const d = Math.hypot(t.x - x, t.y - y);
      if (d <= CONFIG.HIT_RADIUS && d < bestD) { best = t; bestD = d; }
    }
    return best;
  }

  render(players) {
    const ctx = this.ctx;
    this._drawBackground(ctx);

    // 的
    for (const t of this.targets) {
      const s = 0.6 + 0.4 * t.pop;
      const r = t.radius * s;
      ctx.save();
      ctx.beginPath();
      ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
      ctx.fillStyle = t.type.color;
      ctx.globalAlpha = 0.35;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 4;
      ctx.strokeStyle = t.type.color;
      ctx.stroke();
      // 命中待ちの的は白いリングで「狙われている」表示
      if (t.dying) {
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(t.x, t.y, r + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.font = `${Math.round(r * 1.3)}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.type.emoji, t.x, t.y + 2);
      ctx.restore();
    }

    // 弾（投げた球。上=遠くにいくほど小さく描画）
    for (const b of this.bullets) {
      const scale = Math.max(0.3, Math.min(1, 0.3 + 0.7 * (b.y / this.H)));
      const r = b.baseR * scale;
      const n = Math.hypot(b.vx, b.vy) || 1;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = Math.max(2, r * 0.8);
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx / n * r * 1.8, b.y - b.vy / n * r * 1.8);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(b.x - r * 0.3, b.y - r * 0.3, r * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 命中の波紋
    for (const f of this.flashes) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, f.life / 0.35) * 0.7;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 4;
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

    // 照準（大きさ＝当たり判定）
    players.forEach((p, idx) => {
      if (!p || !p.visible) return;
      drawCrosshair(ctx, p.x, p.y, CONFIG.PLAYER_COLORS[idx] || '#fff', CONFIG.CROSSHAIR_RADIUS, p.opacity ?? 1);
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
