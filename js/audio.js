// ============================================================
//  音（BGM＋ヒット効果音）
//  ・ブラウザは「最初のクリック」までは音を鳴らせない仕様なので、
//    unlock() を最初のボタン操作で呼びます。
//  ・assets/ に音ファイルが無くても、効果音は「ピコッ」と自動生成して鳴ります
//    （ファイル欠けでも止まらない安全設計）。
// ============================================================

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.hitBuf = null;
    this.bgm = null;
    this.ready = false;
    this.unlocked = false;
  }

  // 最初のユーザー操作で呼ぶ（音の再生を解禁）
  async unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') await this.ctx.resume();
    } catch (e) { /* AudioContext不可でも続行 */ }

    // BGM（あれば）
    try {
      this.bgm = new Audio('assets/bgm.mp3');
      this.bgm.loop = true;
      this.bgm.volume = 0.5;
      // ファイルが無くてもエラーで止めない
      this.bgm.addEventListener('error', () => { this.bgm = null; });
    } catch (e) { this.bgm = null; }

    // ヒット音（あれば低遅延で鳴らすため事前デコード）
    if (this.ctx) {
      try {
        const res = await fetch('assets/hit.mp3');
        if (res.ok) {
          const arr = await res.arrayBuffer();
          this.hitBuf = await this.ctx.decodeAudioData(arr);
        }
      } catch (e) { this.hitBuf = null; }
    }
    this.ready = true;
  }

  startBgm() {
    if (this.bgm) { this.bgm.currentTime = 0; this.bgm.play().catch(() => {}); }
  }
  stopBgm() {
    if (this.bgm) { try { this.bgm.pause(); } catch (e) {} }
  }

  // 的に当たったとき
  playHit() {
    if (this.ctx && this.hitBuf) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.hitBuf;
      src.connect(this.ctx.destination);
      src.start();
    } else {
      this._beep(880, 0.07); // ファイルが無ければ電子音「ピコッ」
    }
  }

  // 終了の音
  playEnd() {
    this._beep(440, 0.18);
    setTimeout(() => this._beep(660, 0.22), 140);
  }

  // 簡単な電子音を生成
  _beep(freq, dur) {
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, this.ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
      osc.connect(gain); gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + dur + 0.02);
    } catch (e) { /* 無音でも続行 */ }
  }
}
