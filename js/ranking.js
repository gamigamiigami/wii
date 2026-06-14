// ============================================================
//  ランキング（PCの中に自動保存）
//  サーバーもネットも不要。ブラウザのlocalStorageに保存します。
//  うまく保存できない環境でも、メモリ上で動くようにしてあります。
// ============================================================

import { CONFIG } from './config.js';

const DEFAULT = { version: 1, nextPlayer: 1, entries: [] };
let memory = null; // localStorageが使えないとき用

function readAll() {
  try {
    const raw = localStorage.getItem(CONFIG.RANKING_KEY);
    if (!raw) return structuredClone(DEFAULT);
    const data = JSON.parse(raw);
    if (!data.entries) return structuredClone(DEFAULT);
    if (!data.nextPlayer) data.nextPlayer = data.entries.length + 1;
    return data;
  } catch (e) {
    return memory ? memory : structuredClone(DEFAULT);
  }
}

function writeAll(data) {
  memory = data;
  try {
    localStorage.setItem(CONFIG.RANKING_KEY, JSON.stringify(data));
  } catch (e) {
    // 保存できない(プライベートモード等)→メモリ保持のみ
    console.warn('ランキングを保存できませんでした。今回のみメモリに保持します。', e);
  }
}

// 次の自動採番名（例: Player#7）。名前を入れたくない人向け。
export function nextAutoName() {
  const data = readAll();
  return `Player#${data.nextPlayer}`;
}

// スコアを1件追加して、上位順に整理
export function addEntry({ name, score, mode }) {
  const data = readAll();
  const finalName = (name && name.trim()) ? name.trim().slice(0, 16) : `Player#${data.nextPlayer}`;
  data.entries.push({
    name: finalName,
    score: Math.round(score),
    mode,
    date: new Date().toISOString(),
  });
  data.entries.sort((a, b) => b.score - a.score);
  data.entries = data.entries.slice(0, CONFIG.RANKING_KEEP);
  data.nextPlayer = (data.nextPlayer || 1) + 1;
  writeAll(data);
  // 今回のスコアが何位かを返す
  const rank = data.entries.findIndex(e => e.name === finalName && e.score === Math.round(score)) + 1;
  return { rank, name: finalName, entries: data.entries };
}

export function topEntries(n = CONFIG.RANKING_SHOW) {
  return readAll().entries.slice(0, n);
}

// ランキングをファイルに書き出してダウンロード（バックアップ・印刷用）
export function exportRanking() {
  const data = readAll();
  // テキスト版
  let txt = 'フリフリ・シューティング！ ランキング\n';
  txt += '=====================================\n';
  data.entries.forEach((e, i) => {
    const d = new Date(e.date);
    const ds = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    txt += `${String(i + 1).padStart(2, ' ')}位  ${String(e.score).padStart(5, ' ')}点  ${e.name}  (${e.mode}, ${ds})\n`;
  });
  download('ranking.txt', txt, 'text/plain');
  download('ranking.json', JSON.stringify(data, null, 2), 'application/json');
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
