// ============================================================
//  カメラで手を追う部分（MediaPipe GestureRecognizer）
//  ・手のひらの「向き」→ 照準（レーザーポインター／Wiiリモコン方式）
//    手を傾けた方向にカーソルが動く。手の位置は関係ないので、腕を上げなくても
//    上の的を狙える（CONFIG.AIM_MODE='position' で旧来の位置方式に戻せます）。
//  ・✊グー(Closed_Fist) → 発射
//  ・2人ぶんの手を同時に追い、立ち位置の左=P1 / 右=P2 に割り当て
//  カメラやモデルの読み込みに失敗しても例外を投げず、ready=false を返します。
// ============================================================

import { CONFIG } from './config.js';
import { Smoother } from './crosshair.js';

export class HandTracker {
  constructor() {
    this.video = null;
    this.recognizer = null;
    this.ready = false;
    this.error = null;
    this.latest = [];        // [{nx, ny, fist}]（nxは鏡映し済み 0..1）
    this._lastVideoTime = -1;
    this._slots = [];
  }

  async init(video) {
    this.video = video;
    // 1) カメラ起動
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
    } catch (e) {
      this.error = 'camera';
      throw e;
    }
    // 2) 手認識モデル読み込み
    try {
      const vision = await import(CONFIG.VISION_ESM);
      const fileset = await vision.FilesetResolver.forVisionTasks(CONFIG.WASM_PATH);
      const opts = {
        baseOptions: { modelAssetPath: CONFIG.MODEL_PATH, delegate: 'GPU' },
        numHands: 2,
        runningMode: 'VIDEO',
      };
      try {
        this.recognizer = await vision.GestureRecognizer.createFromOptions(fileset, opts);
      } catch (gpuErr) {
        // GPUが使えない端末はCPUで再挑戦
        opts.baseOptions.delegate = 'CPU';
        this.recognizer = await vision.GestureRecognizer.createFromOptions(fileset, opts);
      }
      this.ready = true;
    } catch (e) {
      this.error = 'model';
      throw e;
    }
  }

  // 毎フレーム：新しい映像が来たときだけ手を検出
  update() {
    if (!this.ready || !this.video) return;
    if (this.video.currentTime === this._lastVideoTime) return;
    this._lastVideoTime = this.video.currentTime;

    let res;
    try {
      res = this.recognizer.recognizeForVideo(this.video, performance.now());
    } catch (e) { return; }

    const hands = [];
    const n = res.landmarks ? res.landmarks.length : 0;
    for (let i = 0; i < n; i++) {
      const lms = res.landmarks[i];
      const base = lms[9]; // 中指の付け根（手の画面位置の基準。一番ブレない点）
      const g = res.gestures?.[i]?.[0];
      const fist = g && g.categoryName === 'Closed_Fist' && g.score >= CONFIG.GESTURE_SCORE_MIN;
      // 手のひらの「向き」を求める（worldLandmarks=メートル単位の3D。手の位置に依存しない）
      const handed = (res.handednesses || res.handedness)?.[i]?.[0]?.categoryName;
      const aim = this._palmAim(res.worldLandmarks?.[i], handed);
      hands.push({
        nx: 1 - base.x, ny: base.y,           // 手の画面位置（鏡映し済み。並べ替え＆フォールバック用）
        ax: aim ? aim.x : null,               // 手のひらの向き 左右(-1..1)
        ay: aim ? aim.y : null,               // 手のひらの向き 上下(-1..1)
        fist,
      });
    }
    hands.sort((a, b) => a.nx - b.nx); // 左→右の順（立ち位置でP1/P2を割り当て）
    this.latest = hands;
  }

  // 手のひらの法線ベクトル（手のひらが向いている方向）を求め、狙い方向 x,y(-1..1) に変換。
  // 手首・人差し指の付け根・小指の付け根の3点で手のひらの「面」を作り、その垂線を法線とする。
  // worldLandmarks を使うので、手を画面のどこに置いても向きだけで狙える。
  _palmAim(wl, handed) {
    if (!wl || wl.length < 18) return null;
    const W = wl[0], I = wl[5], P = wl[17];
    const v1 = { x: I.x - W.x, y: I.y - W.y, z: I.z - W.z };
    const v2 = { x: P.x - W.x, y: P.y - W.y, z: P.z - W.z };
    // 外積 = 手のひらに垂直な法線
    let nx = v1.y * v2.z - v1.z * v2.y;
    let ny = v1.z * v2.x - v1.x * v2.z;
    let nz = v1.x * v2.y - v1.y * v2.x;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len;
    // 左右の手で外積の向き(符号)が反転するので、手の左右でそろえる
    if (handed === 'Left') { nx = -nx; ny = -ny; }
    // 映像は鏡映しなので左右を反転。さらに設定で上下左右を反転できる。
    let x = -nx, y = ny;
    if (CONFIG.AIM_INVERT_X) x = -x;
    if (CONFIG.AIM_INVERT_Y) y = -y;
    return { x, y };
  }

  // 狙いの「向き」(または旧方式の「位置」)を画面座標に変換する
  _aimToScreen(det, W, H) {
    if (CONFIG.AIM_MODE !== 'orientation' || det.ax === null) {
      return { x: det.nx * W, y: det.ny * H }; // 旧方式：手の位置をそのままカーソルに
    }
    const dz = CONFIG.AIM_DEADZONE, g = CONFIG.AIM_GAIN;
    const dead = (v) => Math.sign(v) * Math.max(0, Math.abs(v) - dz); // 中央の遊び
    let x = W / 2 + dead(det.ax) * g * (W / 2);
    let y = H / 2 + dead(det.ay) * g * (H / 2);
    x = Math.max(0, Math.min(W, x));
    y = Math.max(0, Math.min(H, y));
    return { x, y };
  }

  get handCount() { return this.latest.length; }

  _slot(i, alpha) {
    if (!this._slots[i]) {
      this._slots[i] = { sm: new Smoother(alpha), x: null, y: null, wasFist: false, lastShot: -Infinity, lastSeen: 0 };
    }
    return this._slots[i];
  }

  // ゲーム/キャリブで使う players を作る
  // count: 1 か 2 / W,H: キャンバスのサイズ / sensitivity: 追従の強さ
  getPlayers(count, W, H, sensitivity) {
    const now = performance.now();
    const out = [];
    for (let i = 0; i < count; i++) {
      const slot = this._slot(i, sensitivity);
      slot.sm.setAlpha(sensitivity);
      const det = this.latest[i];
      if (det) {
        const t = this._aimToScreen(det, W, H);
        const { x, y } = slot.sm.push(t.x, t.y);
        slot.x = x; slot.y = y; slot.lastSeen = now;
        let shoot = false;
        if (det.fist && !slot.wasFist && (now - slot.lastShot) > CONFIG.SHOOT_COOLDOWN_MS) {
          shoot = true; slot.lastShot = now;
        }
        slot.wasFist = det.fist;
        out.push({ x, y, shoot, visible: true, opacity: 1 });
      } else {
        const age = now - slot.lastSeen;
        if (slot.x !== null && age < CONFIG.CROSSHAIR_HOLD_MS) {
          out.push({ x: slot.x, y: slot.y, shoot: false, visible: true, opacity: 1 - age / CONFIG.CROSSHAIR_HOLD_MS });
        } else {
          slot.sm.reset(); slot.wasFist = false;
          out.push({ x: slot.x ?? W / 2, y: slot.y ?? H / 2, shoot: false, visible: false, opacity: 0 });
        }
      }
    }
    return out;
  }

  stop() {
    try {
      const s = this.video?.srcObject;
      if (s) s.getTracks().forEach(t => t.stop());
    } catch (e) {}
  }
}
