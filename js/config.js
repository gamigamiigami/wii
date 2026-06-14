// ============================================================
//  設定（ここの数字を変えればゲームを調整できます）
//  非エンジニアの方へ: まずはこのファイルだけ触ればOKです。
// ============================================================

export const CONFIG = {
  // --- ゲームの基本 ---
  GAME_DURATION: 40,        // 制限時間（秒）
  TARGET_COUNT: 6,          // 画面に出る的の数（多いほど忙しい）
  COUNTDOWN_FROM: 3,        // 開始前のカウントダウン（3,2,1）

  // --- 操作・狙いの感触 ---
  SHOOT_COOLDOWN_MS: 150,   // 連射しすぎ防止（小さいほど速く連打できる。ミリ秒）
  SENSITIVITY_DEFAULT: 0.45, // 照準の追従の強さ(0.2=なめらか/ゆっくり .. 0.8=機敏/プルプル)
  GESTURE_SCORE_MIN: 0.5,   // 「グー」と判定する自信のしきい値(0〜1)。小さいほど速く反応（誤爆も増）
  CROSSHAIR_HOLD_MS: 500,   // 手を見失っても照準を保持する時間（ミリ秒）

  // --- カーソルと当たり判定 ---
  // 当たり判定は「的の上を狙えば命中」（的の大きさそのものが当たる範囲）。
  // 的が小さい(遠い)ほど狙うのが難しく高得点になります。
  CROSSHAIR_RADIUS: 18,     // カーソル(照準)の大きさ(px)

  // --- 弾(投げる球)の物理 ---
  BULLET_GRAVITY: 1200,     // 重力(px/秒²)。大きいほど放物線が強い／小さく＝まっすぐ投げる感じ
  BULLET_RADIUS: 24,        // 手前の弾の大きさ。奥へ飛ぶほど小さく描画されます

  // --- ランキング ---
  RANKING_KEY: 'wii_ranking_v1',
  RANKING_KEEP: 50,         // 保存しておく件数
  RANKING_SHOW: 12,         // 画面に表示する件数

  // --- カメラ手認識(MediaPipe) ---
  // モデルの場所。標準はインターネット上(オンラインで動く)。
  // 文化祭などネットが無い場所では models/gesture_recognizer.task に
  // ダウンロードして、下を 'models/gesture_recognizer.task' に書き換えてください。
  MODEL_PATH: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task',
  WASM_PATH: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm',
  VISION_ESM: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35',

  // --- 見た目 ---
  PLAYER_COLORS: ['#ff4d5e', '#3aa0ff'], // P1=赤, P2=青
};
