// [v1.0.0 作業版 Rev.3] style.css外出し・キャラ別音声保持・居眠り時Idle待機＆目閉じ物理強制
/* ==========================================================================
   AIペット クロちゃん🐾＆シロくん🦉 バージョン一元管理エンジン（version.js v1.0.0）
   - バージョン管理ルール完全準拠（大幅刷新:〇 / 機能追加:● / 修正:◎）
   - システム指示（System Instructions）の日付基準に100%連動
   - アプリ本体（index.html）およびアルバムビューワー（viewer.html）のバージョン完全同期
   ========================================================================== */

const VersionManager = {
  // 初登録・正式システムイニシャルバージョン（v1.0.0）
  current: "v1.0.0",

  // バージョン更新履歴（最新順・最大10件保持）
  history: [
    {
      version: "v1.0.0 (Rev.8)",
      date: "2026/11/09",
      type: "fix",       // 修正（◎更新）
      changes: "style.css の完全外出し分離（index.html の大幅スリム化）。パートナー切り替え時にお好みの肉声ボイス（VOICEVOX）が初期化されず各キャラ独立で永久保持されるよう改修。居眠りボタン押下時に笑顔や会話フレームのまま寝る不具合を解消し、即座にIdle待機表情へ固定した上で自然に閉眼・あくび導入する就寝フローの完全化。"
    },
    {
      version: "v1.0.0",
      date: "2026/11/09",
      type: "major",     // イニシャルリリース（〇更新）
      changes: "AIペット「クロちゃん🐾＆シロくん（ホウ博士）🦉」初期正式リリース。マルチキャラクター完全分離プラグインアーキテクチャ（char_kuro.js, char_shiro.js, core_engine.js, app.js）の確立。クロちゃん元祖まぶた座標＆上から自然な瞬きの100%完全復元。シロくん首かしげ幾何追従（右目上がり独立計算）＆メガネ内径ジャストフィット自然閉眼スリット。絵日記写真の日付境界完全厳格化（写真なし日の過去引き継ぎ完全遮断）。4大トークスタイル自律判断、なかよし／おてつだい（Googleマップ・最新ニュース検索カード）完全棲み分け。TTSレート制限（429）防護壁＆自声エコー物理遮断フラグ（isSpeechProducing）。非破壊ストレージ大掃除（原本自動バックアップ＆3〜5KB極小化）とビューワー側での高画質写真プロテクト・マージ機構の完全装備。スマホ画面下端ギリギリまでの操作バー最適配置。"
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
    if (document.title.includes("ビューワー") || document.title.includes("思い出アルバム")) {
      document.title = `クロちゃんの思い出アルバム ＆ バックアップ ビューワー＆エディター🐾 ${ver}`;
    } else {
      document.title = `AIペット クロちゃん＆シロくん🐾🦉 ${ver}`;
    }

    // 2. 画面最下部の極小タグ（アプリ側）
    const bottomTag = document.querySelector('.app-version-tag');
    if (bottomTag) {
      const isShiro = localStorage.getItem('kuro_active_character') === 'shiro';
      bottomTag.textContent = isShiro ? `🦉 シロくん（ホウ博士） ${ver}` : `🐾 クロちゃん ${ver}`;
    }

    // 3. 設定モーダルの右上表示
    const settingVerTag = document.getElementById('setting-modal-version-tag');
    if (settingVerTag) settingVerTag.textContent = ver;

    // 4. システム診断モニタのタイトル
    const diagTitle = document.getElementById('diag-header-title');
    if (diagTitle) diagTitle.textContent = `🩺 システム診断モニタ (${ver})`;

    // 5. ビューワー側のヘッダーバッジ
    const viewerBadge = document.getElementById('header-pkg-version');
    if (viewerBadge && !viewerBadge.textContent.includes("バックアップ")) {
      viewerBadge.textContent = `${ver} 対応`;
    }

    // 6. 設定画面内の更新履歴一覧の自動描画
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