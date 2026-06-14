// ============================================================
//  全体のまとめ役：画面遷移・入力(カメラ/マウス)・ループ
// ============================================================

import { CONFIG } from './config.js';
import { STATES, StateMachine } from './state.js';
import { Game } from './game.js';
import { HandTracker } from './tracker.js';
import { AudioManager } from './audio.js';
import { showScreen, renderRanking } from './ui.js';
import { addEntry, topEntries, exportRanking, nextAutoName } from './ranking.js';

const $ = (id) => document.getElementById(id);

// ---- 部品 ----
const canvas = $('game');
const video = $('cam');
const audio = new AudioManager();
const game = new Game(canvas, audio);
const tracker = new HandTracker();

// 任意：assets/ に背景や的の画像があれば自動で使う（無ければコードで描画）
(function loadArt() {
  const load = (src) => new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
  load('assets/background.jpg').then((im) => { if (im) game.bgImage = im; });
  for (let i = 1; i <= 6; i++) {
    load(`assets/target${i}.png`).then((im) => { if (im) game.targetImages[i - 1] = im; });
  }
})();
const sm = new StateMachine(STATES.TITLE);

const session = {
  mode: '1P',
  input: 'camera',           // 'camera' | 'mouse'
  sensitivity: CONFIG.SENSITIVITY_DEFAULT,
  lastScore: 0,
};

// マウス入力
const mouse = { x: 0, y: 0, shoot: false };

// ---- キャンバスのサイズを画面いっぱいに ----
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// ---- 画面が変わったとき ----
sm.onChange((next) => {
  showScreen([STATES.COUNTDOWN, STATES.PLAYING].includes(next) ? '__none__' : next);
});
showScreen(STATES.TITLE);

// ===== 入力ヘルパー =====
function getPlayers() {
  if (session.input === 'mouse') {
    const p = [{ x: mouse.x, y: mouse.y, shoot: mouse.shoot, visible: true, opacity: 1 }];
    mouse.shoot = false; // 1フレームで消費
    return p;
  }
  const count = session.mode === '2P' ? 2 : 1;
  return tracker.getPlayers(count, canvas.width, canvas.height, session.sensitivity);
}

canvas.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
canvas.addEventListener('mousedown', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.shoot = true; });

// スマホ・タブレット用：タップで「狙う＋撃つ」、なぞって照準移動
canvas.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  if (t) { mouse.x = t.clientX; mouse.y = t.clientY; mouse.shoot = true; }
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
  const t = e.touches[0];
  if (t) { mouse.x = t.clientX; mouse.y = t.clientY; }
  e.preventDefault();
}, { passive: false });

// ===== メインループ =====
let last = performance.now();
let countdown = 0;

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // カメラを使う画面では毎フレ検出を回す
  if (session.input === 'camera' && (sm.is(STATES.CALIB) || sm.is(STATES.COUNTDOWN) || sm.is(STATES.PLAYING))) {
    tracker.update();
  }

  const ctx = game.ctx;
  game._drawScene(ctx);

  if (sm.is(STATES.CALIB)) {
    renderCalib(ctx);
  } else if (sm.is(STATES.COUNTDOWN)) {
    const players = getPlayers();
    game.render(players);
    countdown -= dt;
    drawCountdown(ctx, countdown);
    if (countdown <= 0) startPlaying();
  } else if (sm.is(STATES.PLAYING)) {
    const players = getPlayers();
    game.update(dt, players);
    game.render(players);
  }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ===== キャリブ画面の描画 =====
function renderCalib(ctx) {
  const W = canvas.width, H = canvas.height;
  // カメラ映像を鏡映しで表示
  if (tracker.ready && video.readyState >= 2) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.translate(W, 0); ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, W, H);
    ctx.restore();
  }
  // 検出した手に照準を重ねる
  const count = session.mode === '2P' ? 2 : 1;
  const players = tracker.getPlayers(count, W, H, session.sensitivity);
  players.forEach((p, i) => {
    if (p.visible) {
      ctx.save();
      ctx.globalAlpha = p.opacity ?? 1;
      ctx.strokeStyle = CONFIG.PLAYER_COLORS[i];
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(p.x, p.y, 28, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  });
  // ステータス更新
  const need = session.mode === '2P' ? 2 : 1;
  const got = tracker.handCount;
  const startBtn = $('btn-calib-start');
  if (!tracker.ready) {
    $('calib-status').textContent = '⏳ カメラと手認識を準備中…（数秒かかります）';
    startBtn.disabled = true;
  } else if (got >= 1) {
    $('calib-status').textContent = got >= need
      ? '✅ 手をみつけました！ いつでも始められます'
      : `✋ もう ${need - got} 人ぶんの手を映してね（${got}/${need}）`;
    startBtn.disabled = false;
  } else {
    $('calib-status').textContent = '🔦 手が見つかりません。手を画面にうつし、明るくしてみてね';
    startBtn.disabled = false; // 1Pは手なしでも開始可（ゲーム中に映せる）
  }
}

function drawCountdown(ctx, t) {
  const W = canvas.width, H = canvas.height;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const label = t > 0 ? String(Math.ceil(t)) : 'START!';
  ctx.font = 'bold 160px sans-serif';
  ctx.fillText(label, W / 2, H / 2);
  ctx.font = 'bold 36px sans-serif';
  ctx.fillStyle = '#ffd23b';
  ctx.fillText('✋パーで狙って ✊グーで撃つ！', W / 2, H / 2 + 130);
  ctx.restore();
}

// ===== フロー制御 =====
function goCountdown() {
  game.reset(session.mode);
  countdown = CONFIG.COUNTDOWN_FROM;
  sm.go(STATES.COUNTDOWN);
}
function startPlaying() {
  audio.startBgm();
  sm.go(STATES.PLAYING);
}

game.onEnd = (score) => {
  audio.stopBgm();
  audio.playEnd();
  session.lastScore = score;
  $('result-score').textContent = score;
  const nameInput = $('result-name');
  nameInput.value = '';
  nameInput.placeholder = nextAutoName();
  sm.go(STATES.RESULT);
};

function registerScore(name) {
  const { rank, name: finalName } = addEntry({ name, score: session.lastScore, mode: session.mode });
  $('ranking-caption').textContent = `あなたは ${rank}位！（${finalName}）`;
  renderRanking($('ranking-body'), topEntries(), finalName);
  sm.go(STATES.RANKING);
}

// カメラ準備（キャリブに入るとき）
async function prepareCamera() {
  if (tracker.ready) { sm.go(STATES.CALIB); return; }
  sm.go(STATES.CALIB);
  try {
    await tracker.init(video);
  } catch (e) {
    // カメラ/モデル失敗 → マウスモードへ退避
    session.input = 'mouse';
    session.mode = '1P';
    alert('カメラを準備できませんでした。マウスモードで遊びます。\n（メニューのチェックでいつでも切替できます）');
    goCountdown();
  }
}

// ===== ボタン配線 =====
function firstClickUnlock() { audio.unlock(); window.removeEventListener('pointerdown', firstClickUnlock); }
window.addEventListener('pointerdown', firstClickUnlock);

$('btn-start').onclick = () => sm.go(STATES.MODE);
$('btn-show-ranking').onclick = () => {
  $('ranking-caption').textContent = '🏆 これまでの記録';
  renderRanking($('ranking-body'), topEntries(), null);
  sm.go(STATES.RANKING);
};

$('chk-mouse').onchange = (e) => {
  session.input = e.target.checked ? 'mouse' : 'camera';
  $('btn-2p').disabled = e.target.checked; // マウスは1人用
  $('mode-mouse-note').style.display = e.target.checked ? 'block' : 'none';
};

function chooseMode(mode) {
  session.mode = mode;
  if (session.input === 'mouse') goCountdown();
  else prepareCamera();
}
$('btn-1p').onclick = () => chooseMode('1P');
$('btn-2p').onclick = () => chooseMode('2P');
$('btn-mode-back').onclick = () => sm.go(STATES.TITLE);

$('sens').oninput = $('sens2').oninput = (e) => {
  session.sensitivity = parseFloat(e.target.value);
  $('sens').value = e.target.value;
  $('sens2').value = e.target.value;
};

$('btn-calib-start').onclick = () => goCountdown();
$('btn-calib-mouse').onclick = () => {
  session.input = 'mouse'; session.mode = '1P';
  tracker.stop();
  goCountdown();
};
$('btn-calib-back').onclick = () => { sm.go(STATES.MODE); }; // カメラは付けたままメニューへ

$('btn-result-register').onclick = () => registerScore($('result-name').value);
$('btn-result-skip').onclick = () => registerScore('');

$('btn-ranking-again').onclick = () => sm.go(STATES.TITLE);
$('btn-ranking-export').onclick = () => exportRanking();

// 初期表示
$('sens').value = session.sensitivity;
$('sens2').value = session.sensitivity;

// デバッグ/自動テスト用にゲーム内部を公開（通常プレイには影響しません）
window.__ffs = { game, session, sm, tracker, audio, STATES };
