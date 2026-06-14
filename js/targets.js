// ============================================================
//  的（ターゲット）の種類
//  大きい的＝当てやすい＝低得点 / 小さく速い的＝高得点
//  ※ 文化祭で誰でも当てられるよう、的は大きめ・当たり判定広めにしています。
// ============================================================

export const TARGET_TYPES = [
  { name: 'balloon', emoji: '🎈', color: '#ff6f91', radius: 64, points: 10, speed: 80,  weight: 4 },
  { name: 'apple',   emoji: '🍎', color: '#ff4d4d', radius: 54, points: 20, speed: 120, weight: 3 },
  { name: 'star',    emoji: '⭐', color: '#ffd23b', radius: 46, points: 30, speed: 165, weight: 2 },
  { name: 'ufo',     emoji: '🛸', color: '#67c7ff', radius: 40, points: 50, speed: 210, weight: 1 },
];

// 出現確率の重み付き抽選で種類を1つ選ぶ
export function pickType() {
  const total = TARGET_TYPES.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const t of TARGET_TYPES) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return TARGET_TYPES[0];
}

// 1つの的を新しい場所・速度で初期化する
export function spawnTarget(width, height) {
  const type = pickType();
  const m = type.radius + 10; // 端に寄りすぎない余白
  const angle = Math.random() * Math.PI * 2;
  return {
    type,
    x: m + Math.random() * (width - m * 2),
    y: m + Math.random() * (height - m * 2),
    vx: Math.cos(angle) * type.speed,
    vy: Math.sin(angle) * type.speed,
    radius: type.radius,
    points: type.points,
    bornAt: performance.now(),
    pop: 0, // 出現アニメ用(0→1)
  };
}
