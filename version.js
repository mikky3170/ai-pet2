
/* ==========================================================================
   AIペット クロちゃん🐾 バージョン一元管理エンジン（version.js V.1.1.1）
   - バージョン管理ルール完全準拠（大幅刷新:〇 / 機能追加:● / 修正:◎）
   - 更新履歴は最大10件まで自動保持（11件目で最古を自動破棄）
   - システム指示（System Instructions）の日付基準に100%連動
   - 今後のバージョン更新時は、このファイルのみの出力・更新で完結します
   ========================================================================== */

const VersionManager = {
  // 現在の正式システムバージョン（速度改善・バグ修正により◎を更新: V.1.1.1）
  current: "V.1.1.1",

  // バージョン更新履歴（最新順・最大10件保持）
  history: [
    {
      version: "V.1.1.1",
      date: "2026/11/01",
      type: "fix",       // バグ・速度修正（◎更新）
      changes: "Gemini応答遅延の完全解消（最速Liteモデル優先化＆5秒タイムアウト自動切替による爆速化）、バージョン更新日管理の確定"
    },
    {
      version: "V.1.1.0",
      date: "2026/11/01",
      type: "feature",   // 機能追加（●更新）
      changes: "version.jsによるバージョン一元管理の新設、自宅判定（在宅・外出の自動識別）と散歩決めつけの完全撤廃"
    },
    {
      version: "V.1.0.5",
      date: "2026/11/01",
      type: "fix",       // バグ修正（◎更新）
      changes: "マイクの常時通話化（continuous=trueによる点滅根絶）およびボタン操作時のマイク完全密閉・自声エコー遮断"
    },
    {
      version: "V.1.0.4",
      date: "2026/11/01",
      type: "fix",
      changes: "正式安定版リリース、Flash Lite専用最適化、絵日記アルバム機能強化"
    }
  ],

  // 履歴の取得（最大10件を厳密に保証）
  getHistory() {
    return this.history.slice(0, 10);
  },

  // 画面各所のバージョン表記を一括更新するDOM適用エンジン
  applyToDOM() {
    const ver = this.current;

    // 1. ブラウザタイトル
    document.title = `AIペット クロちゃん🐾 ${ver}`;

    // 2. 画面最下部の極小タグ
    const bottomTag = document.querySelector('.app-version-tag');
    if (bottomTag) bottomTag.textContent = `🐾 クロちゃん ${ver}`;

    // 3. 設定モーダルの右上表示
    const settingVerTag = document.getElementById('setting-modal-version-tag');
    if (settingVerTag) settingVerTag.textContent = ver;

    // 4. システム診断モニタのタイトル
    const diagTitle = document.getElementById('diag-header-title');
    if (diagTitle) diagTitle.textContent = `🩺 システム診断モニタ (${ver})`;

    // 5. 設定画面内の更新履歴一覧の自動描画（最大10件）
    const historyContainer = document.getElementById('version-history-container');
    if (historyContainer) {
      historyContainer.innerHTML = this.getHistory().map(h => `
        <div class="version-history-row">
          <div class="version-history-meta">
            <span class="version-tag-pill ${h.type || 'fix'}">${h.version}</span>
            <span class="version-date-text">📅 ${h.date}</span>
          </div>
          <div class="version-changes-text">${h.changes}</div>
        </div>
      `).join('');
    }
  }
};

// DOM読み込み完了時に自動実行
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    VersionManager.applyToDOM();
  });
}

