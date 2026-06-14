// ============================================================
//  的（ターゲット）の種類と生成
//  距離感は「大きさ」で表現：大きい=近い=低得点 / 小さい=遠い=高得点。
//  元のトイ・ストーリー版と同じ考え方（小さく速い的ほど高得点）。
//  的は「壁(奥)」の領域に浮かび、ゆらゆら上下＋左右に動きます。
// ============================================================

export const TARGET_TIERS = [
  { size: 128, points: 10, speed: 70,  weight: 3 }, // 近い・大きい・低得点
  { size: 92,  points: 20, speed: 110, weight: 4 }, // 中くらい
  { size: 62,  points: 40, speed: 155, weight: 2 }, // 遠い・小さい・高得点（狙うのが難しい）
];

function pickTierIndex() {
  const total = TARGET_TIERS.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (let i = 0; i < TARGET_TIERS.length; i++) {
    r -= TARGET_TIERS[i].weight;
    if (r <= 0) return i;
  }
  return 0;
}

// 的を生成。wallTop〜wallBottom は的が浮かぶ「壁」領域の上下端(px)。
export function spawnTarget(W, wallTop, wallBottom) {
  const ti = pickTierIndex();
  const tier = TARGET_TIERS[ti];
  const radius = tier.size / 2;
  const margin = radius + 14;
  const top = wallTop + radius;
  const bottom = Math.max(top + 1, wallBottom - radius);
  const baseY = top + Math.random() * (bottom - top);
  return {
    tierIndex: ti,
    size: tier.size,
    radius,
    points: tier.points,
    x: margin + Math.random() * (W - margin * 2),
    baseY,
    y: baseY,
    vx: (Math.random() < 0.5 ? -1 : 1) * tier.speed,
    amp: 6 + Math.random() * 14,       // 上下のゆらぎ幅
    phase: Math.random() * Math.PI * 2,
    imgIndex: Math.floor(Math.random() * 6),
    pop: 0,
    dying: false,
  };
}
