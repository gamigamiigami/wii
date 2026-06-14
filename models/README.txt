【オフラインで使いたいとき】手認識データのダウンロード手順
===========================================================

標準では、手認識のデータ(モデル)をインターネットから読み込みます。
文化祭などネットが無い・不安定な会場では、下の1ファイルをこのフォルダに
ダウンロードして同梱すると、完全オフラインで動きます。

■ ダウンロードするファイル（約8MB）
  gesture_recognizer.task

■ ダウンロード元URL
  https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task

  上のURLをブラウザのアドレス欄に貼って開くと、ファイルが保存されます。
  保存した gesture_recognizer.task を、この models フォルダに置いてください。

■ 設定の書き換え（1か所）
  js/config.js を開き、
      MODEL_PATH: 'https://storage.googleapis.com/.../gesture_recognizer.task',
  の行を、
      MODEL_PATH: 'models/gesture_recognizer.task',
  に書き換えて保存します。

  ※ より完全なオフライン化（手認識プログラム本体も同梱）が必要な場合は、
    @mediapipe/tasks-vision@0.10.35 の wasm 一式も同梱し、
    config.js の WASM_PATH と VISION_ESM をローカルパスに変更してください。
    （オンラインで一度動かせるなら、まずは上のモデル同梱だけで十分です）
