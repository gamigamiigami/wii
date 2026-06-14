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

// 照準を描く（プレイヤー色の丸い的マーク）
export function drawCrosshair(ctx, x, y, color, opacity = 1) {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.lineWidth = 4;
  ctx.strokeStyle = color;
  // 外円
  ctx.beginPath();
  ctx.arc(x, y, 26, 0, Math.PI * 2);
  ctx.stroke();
  // 十字
  ctx.beginPath();
  ctx.moveTo(x - 34, y); ctx.lineTo(x - 12, y);
  ctx.moveTo(x + 12, y); ctx.lineTo(x + 34, y);
  ctx.moveTo(x, y - 34); ctx.lineTo(x, y - 12);
  ctx.moveTo(x, y + 12); ctx.lineTo(x, y + 34);
  ctx.stroke();
  // 中心点
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
