// ============================================================
//  的（ターゲット）の生成
//  奥行き d を 0=手前(近い) .. 1=奥(遠い) の連続値で持たせます。
//  手前ほど 大きい・低い位置・低得点・ゆっくり。
//  奥ほど   小さい・高い位置・高得点・速い（狙うのが難しい）。
//  → 一番手前の的から、その奥にも的が並ぶ「距離のある的の列」になります。
// ============================================================

export const NEAR_SIZE = 124; // 一番手前の的の大きさ(px)
export const FAR_SIZE = 46;   // 一番奥の的の大きさ(px)

// 的を生成。nearY/farY は「手前/奥」の的が浮かぶ画面上の高さ(px)。
export function spawnTarget(W, nearY, farY) {
  const d = Math.random();                       // 0=手前 .. 1=奥
  const size = NEAR_SIZE + (FAR_SIZE - NEAR_SIZE) * d;
  const radius = size / 2;
  const spread = 0.92 + (0.5 - 0.92) * d;        // 奥ほど横幅が狭まる(消失点へ)
  const margin = radius + 12;
  const baseY = nearY + (farY - nearY) * d;
  let x = W / 2 + (Math.random() - 0.5) * W * spread;
  x = Math.max(margin, Math.min(W - margin, x));
  return {
    d, size, radius,
    points: Math.round(10 + d * 40),             // 奥ほど高得点(10〜50)
    x,
    baseY,
    y: baseY,
    vx: (Math.random() < 0.5 ? -1 : 1) * (55 + d * 120), // 奥ほど速い
    amp: 5 + Math.random() * 12,                 // 上下のゆらぎ
    phase: Math.random() * Math.PI * 2,
    imgIndex: Math.floor(Math.random() * 6),
    pop: 0,
    dying: false,
  };
}
