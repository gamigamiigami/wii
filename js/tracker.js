// ============================================================
//  カメラで手を追う部分（MediaPipe GestureRecognizer）
//  ・手の傾き方向 → 照準（Wii風：向きで狙う）
//    手首(lm[0])→中指MCP(lm[9]) のベクトルの向きが照準位置を決める。
//    右に傾けると右、上に向けると遠くを狙う。体の位置に関係なく「向き」だけで狙える。
//  ・✊グー(Closed_Fist) → 発射
//  ・2人ぶんの手を同時に追い、画面の左=P1 / 右=P2 に割り当て（位置ベース）
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
    this.latest = [];        // [{nx, ndx, ndy, len, fist}]
    this._lastVideoTime = -1;
    this._slots = [];
  }

  async init(video) {
    this.video = video;
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
      const lm = res.landmarks[i];
      const lm0 = lm[0];   // 手首
      const lm9 = lm[9];   // 中指MCP（安定点）
      const g = res.gestures?.[i]?.[0];
      const fist = g && g.categoryName === 'Closed_Fist' && g.score >= CONFIG.GESTURE_SCORE_MIN;

      // P1/P2割り当て用の画面位置（鏡映し）
      const nx = 1 - lm9.x;

      // 指す方向ベクトル（鏡映しスクリーン座標系）
      //   dx: lm0.x - lm9.x  正=プレイヤー右=カーソル右
      //   dy: lm9.y - lm0.y  負=MCP が手首より上=上方向=遠い的
      const dx = lm0.x - lm9.x;
      const dy = lm9.y - lm0.y;
      const len = Math.hypot(dx, dy);
      const ndx = len > 0.02 ? dx / len : 0;
      const ndy = len > 0.02 ? dy / len : 0;

      hands.push({ nx, ndx, ndy, len, fist });
    }
    hands.sort((a, b) => a.nx - b.nx); // 左→右の順でP1/P2割り当て
    this.latest = hands;
  }

  get handCount() { return this.latest.length; }

  _slot(i, alpha) {
    if (!this._slots[i]) {
      this._slots[i] = { sm: new Smoother(alpha), x: null, y: null, wasFist: false, lastShot: -Infinity, lastSeen: 0 };
    }
    return this._slots[i];
  }

  // ゲーム/キャリブで使う players を作る
  getPlayers(count, W, H, sensitivity) {
    const now = performance.now();
    const out = [];
    for (let i = 0; i < count; i++) {
      const slot = this._slot(i, sensitivity);
      slot.sm.setAlpha(sensitivity);
      const det = this.latest[i];
      if (det) {
        // 方向ベクトルから照準スクリーン座標を計算（Wii風）
        // ndx: -1=左, 0=前方, +1=右  ndy: -1=上向き(遠い), 0=横向き, +1=下向き(近い)
        if (det.len > 0.02) {
          const raw_x = W * (0.5 + det.ndx * CONFIG.DIR_H_SCALE);
          const raw_y = H * (0.5 + (det.ndy + CONFIG.DIR_V_OFFSET) * CONFIG.DIR_V_SCALE);
          const pos = slot.sm.push(raw_x, raw_y);
          slot.x = pos.x;
          slot.y = pos.y;
        }
        slot.lastSeen = now;
        let shoot = false;
        if (det.fist && !slot.wasFist && (now - slot.lastShot) > CONFIG.SHOOT_COOLDOWN_MS) {
          shoot = true; slot.lastShot = now;
        }
        slot.wasFist = det.fist;
        out.push({ x: slot.x ?? W / 2, y: slot.y ?? H / 2, shoot, visible: true, opacity: 1 });
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
