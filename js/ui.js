// ============================================================
//  画面の出し入れ・ランキング表の描画など、見た目まわりの補助
// ============================================================

import { STATES } from './state.js';

// 指定した画面だけを表示する
export function showScreen(state) {
  document.querySelectorAll('.screen').forEach(el => {
    el.classList.toggle('active', el.dataset.screen === state);
  });
}

// ランキング表を描く
export function renderRanking(tbodyEl, entries, highlightName) {
  tbodyEl.innerHTML = '';
  if (!entries.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="3" class="empty">まだ記録がありません。一番乗りを目指そう！</td>';
    tbodyEl.appendChild(tr);
    return;
  }
  entries.forEach((e, i) => {
    const tr = document.createElement('tr');
    if (e.name === highlightName) tr.classList.add('me');
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
    tr.innerHTML =
      `<td class="rank">${medal}</td>` +
      `<td class="name">${escapeHtml(e.name)}</td>` +
      `<td class="score">${e.score}</td>`;
    tbodyEl.appendChild(tr);
  });
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
