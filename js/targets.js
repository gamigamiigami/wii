// ============================================================
//  的（ターゲット）の種類と生成
//  奥行き(z)を持たせて、遠近法で「奥にある＝小さい」を表現します。
//  z = 0 が一番奥（遠い）, z = 1 が手前（近い）。
//  ※ 文化祭で誰でも当てられるよう、的は大きめ・色わかりやすめにしています。
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

// 的を新しい場所・奥行き・速度で初期化する（奥行きは「後ろ寄り」に分布）
export function spawnTarget() {
  const type = pickType();
  return {
    type,
    fx: 0.1 + Math.random() * 0.8,   // 横位置(0..1)
    z: 0.05 + Math.random() * 0.55,  // 奥行き(0=遠..1=近) → 主に奥に置いて距離感を出す
    vfx: (Math.random() < 0.5 ? -1 : 1) * (0.05 + Math.random() * 0.13), // 横移動(1秒あたり)
    points: type.points,
    pop: 0,
    dying: false,
    // x, y, radius, scale はゲーム側で毎フレーム遠近法で計算して埋めます
    x: 0, y: 0, radius: type.radius, scale: 1,
  };
}
