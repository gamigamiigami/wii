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
