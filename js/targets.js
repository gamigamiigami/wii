// ============================================================
//  的（ターゲット）の生成（擬似3D：奥行き z を持つ）
//  z = 0 が一番手前(近い), z が大きいほど奥(遠い)。
//  的は床から一定の高さ(hFloat)に浮かび、奥ほど小さく・高い位置・高得点に見えます。
//  画面座標(x,y,radius)は game 側で毎フレーム「遠近法で射影」して埋めます。
// ============================================================

export const R_WORLD = 84;   // 的の基準サイズ（手前での半径の元）

// 的を生成。zNear〜zFar の範囲に奥行きを散らし、laneMax で左右の広がりを決める。
export function spawnTarget(zNear, zFar, laneMax) {
  const z = zNear + Math.random() * (zFar - zNear);
  const dn = (z - zNear) / ((zFar - zNear) || 1); // 0=手前 .. 1=奥
  return {
    z,
    worldX: (Math.random() * 2 - 1) * laneMax,
    vx: (Math.random() < 0.5 ? -1 : 1) * (90 + dn * 150), // 奥ほど速い（ワールド速度）
    rWorld: R_WORLD,
    points: Math.round(10 + dn * 40),  // 奥ほど高得点(10〜50)
    amp: 4 + Math.random() * 10,       // 上下のゆらぎ（ワールド高さ）
    phase: Math.random() * Math.PI * 2,
    imgIndex: Math.floor(Math.random() * 6),
    dn,
    pop: 0,
    dying: false,
    x: 0, y: 0, radius: R_WORLD, s: 1, // 射影結果（game側で更新）
  };
}
