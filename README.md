# ハイゲFINAL マルチビュー

「配信者ハイパーゲーム大会 FINAL」（2026/11/28・29）の公式配信と出場者の配信を、1画面で同時に見るための個人の非公式ツール。大会の運営とは関係ない。

- 公開先：https://momonga1192.github.io/hyge-multiview/
- 中身：静的なHTML/CSS/JS（`index.html` `style.css` `app.js` `streamers.js`）。ビルド不要
- 出場者とチャンネルの一覧は `streamers.js`。`tools/build_streamers.py` で作り直せる
- 左の一覧の赤い丸は配信中の印。GitHub Actions（.github/workflows/live-status.yml）が5分ごとに Twitch・YouTube のページを見て、status ブランチの live.json に書く。2026/11/30 を過ぎると何もしなくなる
- Twitch の埋め込みは https のページでしか映らない（`frame-ancestors https://<親ドメイン>`）。ローカルの http では YouTube だけ映る

## 使い方

- 左の一覧で配信者を選ぶと窓が開く。窓の上の「音声」でその窓だけ音を出す。「拡大」でメイン＋サブの並びになる
- 「この並びのリンク」で、開いている窓と並べ方を URL に入れてコピーできる
- 「URLで追加」に twitch.tv/〇〇 や YouTube の配信URLを入れると、一覧にない配信も開ける
