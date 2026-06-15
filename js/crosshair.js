// ============================================================
//  照準の「ふるえ」を抑えるなめらか化フィルタ（EMA）
//  手はどうしても小刻みに揺れるので、これで狙いやすくします。
// ============================================================

export class Smoother {
  constructor(alpha) {
    this.alpha = alpha;   // 0に近いほどなめらか(遅い) / 1に近いほど機敏(揺れる)
    this.x = null;
    this.y = null;
  }
  setAlpha(a) { this.alpha = a; }
  push(x, y) {
    if (this.x === null) { this.x = x; this.y = y; }
    else {
      this.x += this.alpha * (x - this.x);
      this.y += this.alpha * (y - this.y);
    }
    return { x: this.x, y: this.y };
  }
  reset() { this.x = null; this.y = null; }
}

// ------------------------------------------------------------
//  One-Euro フィルター（ポインター用の定番ノイズ除去）
//  「止めている時は強くなめらか／速く動かす時は即追従」を自動で切り替えるので、
//  単純な平均化より “ブレが少ないのに遅延も少ない” 狙い心地になります。
//  参考: Casiez et al., "1€ Filter" (CHI 2012)
// ------------------------------------------------------------
function _alpha(cutoff, dt) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}
class _LowPass {
  constructor() { this.s = null; }
  filter(x, a) { this.s = (this.s === null) ? x : a * x + (1 - a) * this.s; return this.s; }
  reset() { this.s = null; }
}
class _OneEuro {
  constructor(minCutoff, beta, dCutoff = 1.0) {
    this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff;
    this.xf = new _LowPass(); this.dxf = new _LowPass();
    this.lastX = null;
  }
  filter(x, dt) {
    if (!(dt > 0)) dt = 1 / 60;
    const dx = (x - (this.lastX ?? x)) / dt;
    this.lastX = x;
    const edx = this.dxf.filter(dx, _alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.xf.filter(x, _alpha(cutoff, dt));
  }
  reset() { this.xf.reset(); this.dxf.reset(); this.lastX = null; }
}

// 照準用の2D One-Euro フィルター。Smoother と同じ使い勝手（push/setAlpha/reset）。
export class AimFilter {
  constructor(minCutoff, beta) {
    this._minCutoff = minCutoff; this._beta = beta;
    this.fx = new _OneEuro(minCutoff, beta);
    this.fy = new _OneEuro(minCutoff, beta);
    this._last = null;
  }
  // sensitivity(0.2〜0.8)で機敏さを微調整：大きいほど即追従（ブレも少し増える）
  setAlpha(s) {
    const sv = (s == null) ? 0.45 : s;
    this.fx.minCutoff = this.fy.minCutoff = this._minCutoff * (0.6 + sv);
    this.fx.beta = this.fy.beta = this._beta * (0.5 + sv);
  }
  push(x, y) {
    const now = performance.now() / 1000;
    const dt = this._last === null ? 1 / 60 : now - this._last;
    this._last = now;
    return { x: this.fx.filter(x, dt), y: this.fy.filter(y, dt) };
  }
  reset() { this.fx.reset(); this.fy.reset(); this._last = null; }
}

// 照準を描く。radius がそのまま「当たる範囲」の大きさになります。
export function drawCrosshair(ctx, x, y, color, radius, opacity = 1) {
  const r = radius;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  // 当たり判定とぴったり同じ大きさの円
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  // 外側の小さな十字マーク
  ctx.beginPath();
  [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
    ctx.moveTo(x + dx * (r + 3), y + dy * (r + 3));
    ctx.lineTo(x + dx * (r + 11), y + dy * (r + 11));
  });
  ctx.stroke();
  // 中心点
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
