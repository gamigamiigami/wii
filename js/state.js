// ============================================================
//  画面の状態（どの画面を表示しているか）を管理する小さな仕組み
// ============================================================

export const STATES = {
  TITLE: 'title',
  MODE: 'mode',
  CALIB: 'calib',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  RESULT: 'result',
  RANKING: 'ranking',
};

export class StateMachine {
  constructor(initial) {
    this.current = initial;
    this._listeners = [];
  }
  // 状態が変わったときに呼ばれる関数を登録
  onChange(fn) { this._listeners.push(fn); }
  // 状態を切り替える
  go(next) {
    if (next === this.current) return;
    const prev = this.current;
    this.current = next;
    for (const fn of this._listeners) fn(next, prev);
  }
  is(s) { return this.current === s; }
}
