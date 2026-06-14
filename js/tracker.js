// ============================================================
//  カメラで手を追う部分（MediaPipe GestureRecognizer）
//  ・手の位置 → 照準
//  ・✊グー(Closed_Fist) → 発射
//  ・2人ぶんの手を同時に追い、画面の左=P1 / 右=P2 に割り当て
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
      const lm = res.landmarks[i][9]; // 中指の付け根（一番ブレない点）
      const g = res.gestures?.[i]?.[0];
      const fist = g && g.categoryName === 'Closed_Fist' && g.score >= CONFIG.GESTURE_SCORE_MIN;
      hands.push({ nx: 1 - lm.x, ny: lm.y, fist }); // x は鏡映し
    }
    hands.sort((a, b) => a.nx - b.nx); // 左→右の順
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
  // count: 1 か 2 / W,H: キャンバスのサイズ / sensitivity: 追従の強さ
  getPlayers(count, W, H, sensitivity) {
    const now = performance.now();
    const out = [];
    for (let i = 0; i < count; i++) {
      const slot = this._slot(i, sensitivity);
      slot.sm.setAlpha(sensitivity);
      const det = this.latest[i];
      if (det) {
        const { x, y } = slot.sm.push(det.nx * W, det.ny * H);
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
