/* ==========================================================================
   AIペット クロちゃん🐾 バージョン一元管理エンジン（version.js V.1.12.0）
   - バージョン管理ルール完全準拠（大幅刷新:〇 / 機能追加:● / 修正:◎）
   - 更新履歴は最大10件まで自動保持（11件目で最古を自動破棄）
   - システム指示（System Instructions）の日付基準に100%連動
   - アプリ本体（index.html）およびアルバムビューワー（viewer.html）のバージョン完全同期
   ========================================================================== */

const VersionManager = {
  // 現在の正式システムバージョン（V.1.12.0）
  current: "V.1.12.0",

  // バージョン更新履歴（最新順・最大10件保持）
  history: [
    {
      version: "V.1.12.0",
      date: "2026/11/05",
      type: "feature",   // 機能追加・デザイン刷新（●更新）
      changes: "お休み中（居眠りモード）におけるステータスバー誤上書きバグを100%防護・解消。完全透過クロちゃんに対応した4大カラーテーマ（サクラピンク/漆黒ネイビー/北欧ボタニカルミント/陽だまりアプリコット）の劇的リニューアル。居眠り中の瞼（まぶた）を黒パッチから毛並みに自然に溶け込む閉眼アーチラインへ改良。外枠の四隅のRをスマホ・タブレットのベゼルに美しく調和するなだらかな36pxへ最適化。"
    },
    {
      version: "V.1.11.0",
      date: "2026/11/05",
      type: "feature",   // 機能追加（●更新）
      changes: "アルバム＆バックアップエディター（viewer.html）に写真ごとの個別データ容量（KB）＆未圧縮警告バッジ（⚠️）表示機能を追加。4大テーマのCSS配色・ステージラグ・屋根・モーダル連動の徹底強化。設定保存時にAPIキー変更時のみ導通検証を行う高速スマート判定を実装。"
    },
    {
      version: "V.1.10.0",
      date: "2026/11/04",
      type: "feature",   // 機能追加（●更新）
      changes: "絵日記＆ビューワーの写真エリアを「左：メイン写真 ＋ 右：スナップ一覧」の左右2分割フォトブロック（縦横比完全ロック・上下2段横スクロール快適カルーセル）へ刷新。スナップ写真プール（1〜12枚）の個別ゴミ箱削除機能の新設。13枚目撮影時の親切アドバイス付き削除警告ダイアログ（キャンセル可能）の新設。設定画面の旧重複写真スリム化ボタン撤去。viewer.html を「思い出アルバム ＆ バックアップ ビューワー＆エディター」へ進化（日記本文の編集、不要スナップの個別削除、編集済み完全互換JSONの安全再保存機能）。4大カラーテーマ切り替え機能の実装。"
    },
    {
      version: "V.1.9.0",
      date: "2026/11/04",
      type: "feature",   // 機能追加（●更新）
      changes: "iPhone風3色マルチカラーストレージメーター新設（写真・会話・記憶設定の種別容量と空き容量を完全可視化）。重複写真安全お掃除＆スマート再圧縮エンジン（絵日記写真を約20KBに超軽量再圧縮、会話ログの画像重複完全パージ、ワンタップで空き容量を安全激増）。今後の写真追加時における25KB軽量保存ガードの実装。"
    },
    {
      version: "V.1.8.0",
      date: "2026/11/03",
      type: "feature",   // 機能追加（●更新）
      changes: "タブレット縦向き全幅対応＆四つ角完全角丸（26px）統一。横向き時左右全角1文字分余白＆頭上ゆとりクリアランス新設。待機中まぶたの黒毛毛並みテクスチャ＆愛らしいアイライン描画（瞬きを待機中に限定）。ノイズゼロ極上ゴロゴロ音（スムーズ減衰）。なでなで触感ハプティクス振動＆ハートポップ。おやすみ突入時の愛らしいあくび演出。会話記憶枠倍増（日中20往復40件／夜10往復20件）。語尾「ねニャン」徹底排除（二重防波堤）。絵日記AI最適写真選定＆思い出スナップ一覧（ワンタップ写真切替）。"
    },
    {
      version: "V.1.7.0",
      date: "2026/11/03",
      type: "feature",   // 機能追加（●更新）
      changes: "スマホ横向き対応（左列に広々会話タイムライン、右列にクロちゃん＆土台の黒い操作バーを配置する最適レイアウト）、歩行時の誤作動を防ぐ不感帯センサー、空中くるりん着地アニメーション、UIボタンの衝突防止（一時退避＆ポンッ♪再登場）の実装"
    },
    {
      version: "V.1.6.0",
      date: "2026/11/02",
      type: "feature",   // 機能追加（●更新）
      changes: "キッチンタイマーの完全進化（琥珀＆ゴールド砂時計アニメーション新設・おやつ上配置、秒・分半・漢数字対応パーサー、選べる2大アラーム音【華やかベル/デジタルアラーム】と試聴UI、Screen Wake Lockによるスマホ画面消灯・スリープ防止、タップ停止機能）の実装"
    },
    {
      version: "V.1.5.0",
      date: "2026/11/02",
      type: "feature",   // 機能追加（●更新）
      changes: "マブダチ対話アーキテクチャ（寄り添い絞り込み・気まぐれぶっ込み直感提案・おまかせ直撃）、正式なFunction Calling（searchMapPlaces/searchLatestNews）完全実装、スマートカード生成（本命ピンポイント＋周辺/主要一覧ポータル表示）、空っぽ絶対防止セーフティ網、マイク安全クールダウン（クラッシュ防止）の実装"
    },
    {
      version: "V.1.4.0",
      date: "2026/11/02",
      type: "feature",   // 機能追加（●更新）
      changes: "おてつだいモード専用対話型コンシェルジュ（好物を振る絞り込みラリー）、Google Search Grounding（本物URLカード生成＆二重安全回路）、知的クレンジングフィルター（実質的な会話10往復厳選）、20秒通信耐性（混雑時16秒クリア＆平常時0.6秒即答）の実装"
    },
    {
      version: "V.1.3.0",
      date: "2026/11/02",
      type: "feature",   // 機能追加（●更新）
      changes: "モード分離の徹底（なかよし時のマップ完全封印）、記憶ライフサイクル（日記前100件⇄日記後10件）、単語早とちり根絶、新3大ふれあい機能（気まぐれ独り言・なでなで部位センサー・絵日記肉球スタンプ＆ミニ手紙）の正式実装"
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
      document.title = `AIペット クロちゃん🐾 ${ver}`;
    }

    // 2. 画面最下部の極小タグ（アプリ側）
    const bottomTag = document.querySelector('.app-version-tag');
    if (bottomTag) bottomTag.textContent = `🐾 クロちゃん ${ver}`;

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

    // 6. 設定画面内の更新履歴一覧の自動描画（最大10件）
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