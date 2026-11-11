// [v1.0.0 作業版 Rev.11] カード救済ロジック完全共通化・セリフ言い回し依存脱却・おてつだい検索確実化
/* ==========================================================================
   AIペット 共通対話エンジン＆中央司令塔OS（app.js）
   - プラグインアーキテクチャ対応（char_kuro.js, char_shiro.js の動的自動ロード）
   - 【キャラクター完全分離】クロちゃん🐾 ⇔ シロくん（ホウ博士）🦉 の安全切替
   - 【カード救済ロジック完全共通化】AIのセリフの言い回し依存を撤廃し、おてつだい時の検索カード発行を100%確実化
   - 【プラグイン写真プロンプト完全連動】写真撮影時のセリフ・AI思考依頼・吹き出しを各キャラ定義から動的取得
   - 【今どこ町名高精度完全復帰】「今どこ？」の回答を「〇〇市〇〇町付近」の高精度で回答（ヘッダー市名表示と完全両立）
   - 【GoogleマップGPS二重強化】検索クエリに町名レベルエリア＋精密GPS座標（&ll=&center=）を二重連携
   - 【キャラ別音声保持】キャラごとに選択したVOICEVOX音声を個別記憶・復元（初期値上書き完全根絶）
   - 【居眠り時待機姿勢＆目閉じ強制】停止ボタン押下時に即座にIdle姿勢へ固定し確実に閉眼させてからあくび・居眠り導入
   - 【UIアイコン完全同期】絵日記カード・アルバムのひとことアイコン（クロ: 🐾 / シロ: 🦉）を完全照合
   - 【構文エラー完全根絶】正規表現を枯れた安全標準記法に固定し、SyntaxErrorの再発を完全防止
   - 【絵日記ひとこと完全分離】正規表現強化＆安全フォールバックによるひとこと枠への確実な格納・本文混入100%根絶
   - 【自動日記フォーマット同期】タイムライン案内カードとアルバムモーダルの表示書式・ヘッダーを完全統一
   - 【ベクター感情完全連動】変身時のアニメキャラ表示復帰＆シロくん羽ばたき・クロちゃんポーズ・瞬き完全同期
   - 【クロちゃん原状復元】目の位置計算・瞬きアニメーションを元祖仕様へ100%完全復帰（デグレゼロ）
   - 【シロくん上から瞬き】首の傾きに合わせた独立幾何計算＋上端基準（top center）の上からスッと閉じる自然な瞬き
   - 【トークスタイル連動】自動/短い/普通/長いの設定保存・復元に対応
   - 【発話サニタイズ】セリフから生URL文字列を物理除去しVOICEVOXのURL読み上げを完全根絶
   - 【しりとり・クイズ救済】2文字以下の単語ログを捨てずにGeminiへ届ける対話整合性
   - Gemini連携モデル完全固定（3.5-flash-lite / flash-lite-latest）
   - 【新・とりけし保護エンジン】直前の誤認識発言・ログを画面とストレージから安全にロールバック
   - 【防音シールド】タイマー完了アラーム鳴動中のマイク誤認識を物理的に完全遮断
   ========================================================================== */

/* ==========================================================================
   MODULE 4: キャラクター描画 ＆ まぶた・装飾制御
   ========================================================================== */
class CatAvatarRenderer {
  constructor() {
    this.wrapper = document.getElementById('avatar-wrapper');
    this.smokeEl = document.getElementById('transform-smoke');
    this.catStageBox = document.getElementById('cat-stage-box');
    this.sparkleEl = document.getElementById('paw-landing-sparkle');
    this.heartEl = document.getElementById('touch-heart-bubble');
    this.vectorContainer = document.getElementById('cat-vector-avatar-container');

    this.frames = {
      idle: document.getElementById('frame-idle'),
      talking: document.getElementById('frame-talking'),
      thinking: document.getElementById('frame-thinking'),
      happy: document.getElementById('frame-happy')
    };

    this.mode = localStorage.getItem('kuro_avatar_mode') || 'vector';
    this.accessoryStyle = localStorage.getItem('kuro_acc_style') || 'both';
    this.glassesCoords = StorageManager.loadGlassesCoords();
    this.eyelidCoords = StorageManager.loadEyelidCoords();
    this.currentEmotion = 'idle';

    this.updateCharacterClass();
    this.refreshAvatarImages();
    this._injectVectorAvatar();

    this.eyesNormal = document.getElementById('eyes-normal');
    this.eyesHappy = document.getElementById('eyes-happy');
    this.mouthClosed = document.getElementById('mouth-closed');
    this.mouthTalking = document.getElementById('mouth-talking');
    this.mouthHappy = document.getElementById('mouth-happy');
    this.headUnit = document.getElementById('head-unit');

    this._renderAllAccessories();
    this.applyMode(this.mode);
    this.applyAllFramesTransform();
    this.applyEyelidTransforms();
    this._initImageFormatDetectors();
  }

  updateCharacterClass() {
    const cur = getCurChar();
    if (this.wrapper) {
      this.wrapper.classList.remove('is-char-kuro', 'is-char-shiro');
      this.wrapper.classList.add(`is-char-${cur.id}`);
    }
    const adjustStage = document.getElementById('adjust-preview-stage');
    if (adjustStage) {
      adjustStage.classList.remove('is-char-kuro', 'is-char-shiro');
      adjustStage.classList.add(`is-char-${cur.id}`);
    }
  }

  refreshAvatarImages() {
    const cur = getCurChar();
    const pfx = cur.imagePrefix || "";
    ['idle', 'talking', 'thinking', 'happy'].forEach(emotion => {
      const img = document.getElementById(`img-${emotion}`);
      if (img) {
        img.src = `${pfx}${emotion}.png`;
        img.onerror = () => {
          if (img.src.endsWith('.png')) {
            img.src = `${pfx}${emotion}.jpg`;
            img.classList.remove('is-png');
          }
        };
        img.onload = () => {
          if (img.src.endsWith('.png') || cur.id === 'shiro') img.classList.add('is-png');
        };
      }
    });
  }

  _injectVectorAvatar() {
    if (!this.vectorContainer) return;
    const cur = getCurChar();
    const svgCode = cur.getVectorAvatarSvg ? cur.getVectorAvatarSvg() : "";
    this.vectorContainer.innerHTML = svgCode;

    this.eyesNormal = document.getElementById('eyes-normal');
    this.eyesHappy = document.getElementById('eyes-happy');
    this.mouthClosed = document.getElementById('mouth-closed');
    this.mouthTalking = document.getElementById('mouth-talking');
    this.mouthHappy = document.getElementById('mouth-happy');
    this.headUnit = document.getElementById('head-unit');
  }

  _initImageFormatDetectors() {
    const cur = getCurChar();
    ['idle', 'talking', 'thinking', 'happy'].forEach(emotion => {
      const img = document.getElementById(`img-${emotion}`);
      if (!img) return;
      const checkFormat = () => {
        if (img.currentSrc?.endsWith('.png') || img.src?.endsWith('.png') || cur.id === 'shiro') {
          img.classList.add('is-png');
        } else {
          img.classList.remove('is-png');
        }
      };
      if (img.complete) checkFormat();
      img.addEventListener('load', checkFormat);
    });
  }

  _renderAllAccessories() {
    const cur = getCurChar();
    let svgContent = "";

    if (cur.id === 'shiro' && cur.getRealAccessorySvg) {
      svgContent = cur.getRealAccessorySvg();
    } else {
      svgContent = `
        <svg viewBox="0 0 140 140" style="width:100%; height:100%;">
          <defs>
            <pattern id="stripe-bw-real" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
              <rect width="4" height="8" fill="#111827"/>
              <rect width="4" height="8" fill="#ffffff" x="4"/>
            </pattern>
          </defs>
          <g class="real-hat-group">
            <path d="M45 42 Q70 34 95 42 L92 49 Q70 41 48 49 Z" fill="#1e293b"/>
            <polygon points="70,18 116,32 70,46 24,32" fill="#0f172a" stroke="#334155" stroke-width="1.2"/>
            <circle cx="70" cy="32" r="3" fill="#eab308"/>
            <g class="mortar-tassel">
              <path d="M70 32 Q95 35 102 54" stroke="#ca8a04" stroke-width="2.2" fill="none"/>
              <polygon points="99,54 105,54 107,68 97,68" fill="#eab308"/>
            </g>
          </g>
          <g class="real-glasses-group">
            <circle cx="42" cy="85" r="18" fill="rgba(255, 255, 255, 0.2)" stroke="#090d16" stroke-width="4.5"/>
            <circle cx="42" cy="85" r="18" fill="none" stroke="url(#stripe-bw-real)" stroke-width="3"/>
            <circle cx="98" cy="85" r="18" fill="rgba(255, 255, 255, 0.2)" stroke="#090d16" stroke-width="4.5"/>
            <circle cx="98" cy="85" r="18" fill="none" stroke="url(#stripe-bw-real)" stroke-width="3"/>
            <path d="M60 84 Q70 79 80 84" stroke="#090d16" stroke-width="4.5" fill="none"/>
          </g>
        </svg>
      `;
    }

    ['acc-idle', 'acc-talking', 'acc-thinking', 'acc-happy', 'adjust-glasses-overlay'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = svgContent;
    });
    this.applyAccessoryStyle(this.accessoryStyle);
  }

  applyAllFramesTransform() {
    ['idle', 'talking', 'thinking', 'happy'].forEach(emotion => {
      const el = document.getElementById(`acc-${emotion}`);
      if (!el) return;
      const c = this.glassesCoords[emotion] || { x: 0, y: 120, scale: 1.0, rotate: 0 };
      el.style.bottom = `${c.y}px`;
      el.style.left = `calc(50% + ${c.x}px)`;
      el.style.transform = `translateX(-50%) scale(${c.scale}) rotate(${c.rotate}deg)`;
    });
  }

  applyEyelidTransforms() {
    const cur = getCurChar();
    const c = this.eyelidCoords || cur.defaultEyelidCoords || { y: 172, x: 0, gap: 28, size: 16, rotate: 0 };
    const leftEl = document.getElementById('eye-left-idle');
    const rightEl = document.getElementById('eye-right-idle');

    if (!leftEl || !rightEl) return;
    const isSleeping = !AppCore.state.isRunning || this.wrapper?.classList.contains('is-sleeping');
    const shouldClose = isSleeping || AppCore.state.isCalibratingEyelid;

    if (cur.id === 'kuro') {
      const halfGap = c.gap / 2;
      const h = Math.round(c.size * 0.75);

      leftEl.style.bottom = `${c.y}px`;
      leftEl.style.left = `calc(50% + ${c.x - halfGap - c.size / 2}px)`;
      leftEl.style.width = `${c.size}px`;
      leftEl.style.height = `${h}px`;
      leftEl.style.transformOrigin = "center center";

      rightEl.style.bottom = `${c.y}px`;
      rightEl.style.left = `calc(50% + ${c.x + halfGap - c.size / 2}px)`;
      rightEl.style.width = `${c.size}px`;
      rightEl.style.height = `${h}px`;
      rightEl.style.transformOrigin = "center center";

      if (shouldClose) {
        leftEl.style.transform = `scaleY(1.05)`;
        rightEl.style.transform = `scaleY(1.05)`;
      } else {
        leftEl.style.transform = `scaleY(0)`;
        rightEl.style.transform = `scaleY(0)`;
      }
    } else {
      const rot = c.rotate !== undefined ? c.rotate : 8;
      const h = Math.round(c.size * 0.88);
      const rad = (rot * Math.PI) / 180;
      const halfDist = (c.gap + c.size) / 2;
      const dx = halfDist * Math.cos(rad);
      const dy = halfDist * Math.sin(rad);

      leftEl.style.bottom = `${Math.round(c.y - dy)}px`;
      leftEl.style.left = `calc(50% + ${Math.round(c.x - dx - c.size / 2)}px)`;
      leftEl.style.width = `${c.size}px`;
      leftEl.style.height = `${h}px`;
      leftEl.style.transformOrigin = "top center";

      rightEl.style.bottom = `${Math.round(c.y + dy)}px`;
      rightEl.style.left = `calc(50% + ${Math.round(c.x + dx - c.size / 2)}px)`;
      rightEl.style.width = `${c.size}px`;
      rightEl.style.height = `${h}px`;
      rightEl.style.transformOrigin = "top center";

      if (shouldClose) {
        leftEl.style.transform = `scaleY(1.05)`;
        rightEl.style.transform = `scaleY(1.05)`;
      } else {
        leftEl.style.transform = `scaleY(0)`;
        rightEl.style.transform = `scaleY(0)`;
      }
    }
  }

  applyAccessoryStyle(style) {
    this.accessoryStyle = style;
    localStorage.setItem('kuro_acc_style', style);
    const cur = getCurChar();

    if (cur.id === 'shiro') {
      document.querySelectorAll('.real-hat-group').forEach(el => el.style.display = 'block');
      document.querySelectorAll('.real-glasses-group').forEach(el => el.style.display = 'none');
      const vecHat = document.getElementById('vec-acc-hat');
      const vecGlasses = document.getElementById('vec-acc-glasses');
      if (vecHat) vecHat.style.display = 'block';
      if (vecGlasses) vecGlasses.style.display = 'block';
      return;
    }

    const showHat = (style === 'both' || style === 'hat');
    const showGlasses = (style === 'both' || style === 'glasses');
    document.querySelectorAll('.real-hat-group').forEach(el => el.style.display = showHat ? 'block' : 'none');
    document.querySelectorAll('.real-glasses-group').forEach(el => el.style.display = showGlasses ? 'block' : 'none');
    const vecHat = document.getElementById('vec-acc-hat');
    const vecGlasses = document.getElementById('vec-acc-glasses');
    if (vecHat) vecHat.style.display = showHat ? 'block' : 'none';
    if (vecGlasses) vecGlasses.style.display = showGlasses ? 'block' : 'none';
  }

  setEmotion(emotion) {
    this.currentEmotion = emotion;
    Object.keys(this.frames).forEach(k => {
      if (this.frames[k]) {
        if (k === emotion) this.frames[k].classList.add('active');
        else this.frames[k].classList.remove('active');
      }
    });

    if (this.wrapper) {
      this.wrapper.classList.remove('is-idling', 'is-talking', 'is-thinking', 'is-happy', 'pose-idle-active', 'pose-talking-active', 'pose-thinking-active', 'pose-happy-active');
    }

    if (emotion === 'idle') {
      if (this.wrapper) this.wrapper.classList.add('is-idling', 'pose-idle-active');
      if (this.eyesNormal) this.eyesNormal.style.display = 'block';
      if (this.eyesHappy) this.eyesHappy.style.display = 'none';
      if (this.mouthClosed) this.mouthClosed.style.display = 'block';
      if (this.mouthTalking) this.mouthTalking.style.display = 'none';
      if (this.mouthHappy) this.mouthHappy.style.display = 'none';
    } else if (emotion === 'talking') {
      if (this.wrapper) this.wrapper.classList.add('is-talking', 'pose-talking-active');
      if (this.mouthClosed) this.mouthClosed.style.display = 'none';
      if (this.mouthTalking) this.mouthTalking.style.display = 'block';
    } else if (emotion === 'thinking') {
      if (this.wrapper) this.wrapper.classList.add('is-thinking', 'pose-thinking-active');
      if (this.mouthClosed) this.mouthClosed.style.display = 'block';
      if (this.mouthTalking) this.mouthTalking.style.display = 'none';
    } else if (emotion === 'happy') {
      if (this.wrapper) this.wrapper.classList.add('is-happy', 'pose-happy-active');
      if (this.eyesNormal) this.eyesNormal.style.display = 'none';
      if (this.eyesHappy) this.eyesHappy.style.display = 'block';
      if (this.mouthClosed) this.mouthClosed.style.display = 'none';
      if (this.mouthHappy) this.mouthHappy.style.display = 'block';
    }
  }

  applyMode(mode) {
    this.mode = mode;
    localStorage.setItem('kuro_avatar_mode', mode);

    if (mode === 'vector') {
      if (this.wrapper) this.wrapper.classList.remove('is-real-mode');
      Object.values(this.frames).forEach(f => {
        if (f) {
          f.style.display = 'none';
          f.classList.remove('active');
        }
      });
      if (this.vectorContainer) {
        this.vectorContainer.style.display = 'block';
        this.vectorContainer.classList.add('active-mode');
      }
    } else {
      if (this.wrapper) this.wrapper.classList.add('is-real-mode');
      if (this.vectorContainer) {
        this.vectorContainer.style.display = 'none';
        this.vectorContainer.classList.remove('active-mode');
      }
      Object.values(this.frames).forEach(f => {
        if (f) f.style.display = 'flex';
      });
    }
    this.setEmotion(this.currentEmotion || 'idle');
  }

  triggerPoofSmoke() {
    if (!this.smokeEl) return;
    this.smokeEl.classList.remove('is-poofing'); void this.smokeEl.offsetWidth;
    this.smokeEl.classList.add('is-poofing');
    setTimeout(() => { if (this.smokeEl) this.smokeEl.classList.remove('is-poofing'); }, 800);
  }
  triggerIdeaBulb() {
    const bulb = document.getElementById('idea-bulb');
    if (!bulb) return;
    bulb.classList.add('active');
    setTimeout(() => { bulb.classList.remove('active'); }, 1800);
  }
  triggerTouchHeart() {
    if (!this.heartEl) return;
    this.heartEl.classList.remove('is-floating'); void this.heartEl.offsetWidth;
    this.heartEl.classList.add('is-floating');
    setTimeout(() => { if (this.heartEl) this.heartEl.classList.remove('is-floating'); }, 850);
  }
  triggerYawn() {
    if (!this.wrapper) return;
    this.wrapper.classList.remove('is-yawning'); void this.wrapper.offsetWidth;
    this.wrapper.classList.add('is-yawning');
    setTimeout(() => { if (this.wrapper) this.wrapper.classList.remove('is-yawning'); }, 1400);
  }
  triggerFlipLanding() {
    if (!this.catStageBox) return;
    this.catStageBox.classList.remove('cat-stage-flip'); void this.catStageBox.offsetWidth;
    this.catStageBox.classList.add('cat-stage-flip');
    setTimeout(() => {
      if (this.sparkleEl) {
        this.sparkleEl.classList.remove('is-popping'); void this.sparkleEl.offsetWidth;
        this.sparkleEl.classList.add('is-popping');
        setTimeout(() => { if (this.sparkleEl) this.sparkleEl.classList.remove('is-popping'); }, 700);
      }
    }, 320);
    setTimeout(() => { if (this.catStageBox) this.catStageBox.classList.remove('cat-stage-flip'); }, 420);
  }
}

/* ==========================================================================
   MODULE 5: Gemini AI思考エンジン
   ========================================================================== */
class AIThoughtEngine {
  constructor() {
    this.apiKey = (localStorage.getItem('kuro_api_key') || '').trim();
    this.activeAbortController = null;
    this.isUserCancelled = false;
  }

  cancelActiveThought() {
    this.isUserCancelled = true;
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
      Logger.log(`[AI] 🛑 操作により思考を即座にキャンセルしました`, "info");
      return true;
    }
    return false;
  }

  _filterMeaningfulLogs(logs) {
    const timeInfo = TimeProvider.getCurrentInfo();
    const todayLifeKey = timeInfo.lifeLogKey;

    return logs.filter(item => {
      if (!item || !item.text) return false;
      const t = item.text.trim();
      if (item.date && item.date !== todayLifeKey) return false;
      if (/^(?:おまかせニャ|あそぶニャ|バッチリニャ|はーい|はい|起きたニャ|お昼寝するニャ|フン|計算中ホ|任せるが良いホ|ホウ|バッチリホ)/.test(t)) return false;
      if (/(?:今日の日記を書き込みました|昨日の日記|昨日の思い出絵日記)/.test(t)) return false;
      if (/(?:いま何時|今何時|今日何日|きょう何日|天気どんな感じ|気温.*(?:何度|どれくらい))/i.test(t)) return false;
      if (t.startsWith('http') || t.includes('Googleマップで見る')) return false;
      return true;
    });
  }

  _buildContentsPayload(rawLogs, currentPrompt, photoBase64 = null) {
    const contents = [];
    let lastRole = null;
    const timeInfo = TimeProvider.getCurrentInfo();
    const historyLimit = timeInfo.isLateNight ? 16 : 30;
    const targetHistoryLogs = this._filterMeaningfulLogs(rawLogs).slice(-historyLimit);

    for (const item of targetHistoryLogs) {
      if (!item.text) continue;
      const role = item.role === 'model' ? 'model' : 'user';
      if (role === lastRole) {
        contents[contents.length - 1].parts[0].text += `\n${item.text}`;
      } else {
        contents.push({ role, parts: [{ text: item.text }] });
        lastRole = role;
      }
    }

    const userParts = [{ text: currentPrompt }];
    if (photoBase64) {
      userParts.unshift({
        inline_data: {
          mime_type: "image/jpeg",
          data: photoBase64.replace(/^data:image\/\w+;base64,/, '')
        }
      });
    }

    if (lastRole === 'user' && !photoBase64) {
      contents[contents.length - 1].parts[0].text += `\n${currentPrompt}`;
    } else {
      contents.push({ role: 'user', parts: userParts });
    }

    if (contents.length > 0 && contents[0].role === 'model') contents.shift();
    return contents;
  }

  async generateReply(promptText, rawLogs, characterPlugin, memories, photoBase64 = null) {
    if (!this.apiKey) {
      Logger.log(`[AI] ⚠️ APIキーが未設定です`, "error");
      return { success: false, error: "NO_API_KEY" };
    }

    this.isUserCancelled = false;
    const timeInfo = TimeProvider.getCurrentInfo();
    const weather = LocationProvider.weather;
    const temp = LocationProvider.temperature;
    const townArea = LocationProvider.detailedTownArea || LocationProvider.cleanCityOnly || "東村山市";
    const isAtHome = LocationProvider.isAtHome;
    const isAssistant = AppCore.state.isAssistantMode;
    const talkLen = localStorage.getItem('kuro_talk_length') || 'auto';

    let effectiveLen = talkLen;
    if (talkLen === 'auto') {
      const isShortPrompt = promptText.length <= 10 || /^(?:おはよう|こんにちは|こんばんは|うん|おやすみ|ねえ|クロちゃん|シロくん|ホウ博士|ありがと|わかった|なるほど)/.test(promptText.trim());
      const isLongPrompt = !!photoBase64 || /(?:教えて|詳しく|どう思う|なんで|なぜ|昔|発明|研究|理由|説明)/.test(promptText.trim());

      if (isShortPrompt) {
        effectiveLen = 'short';
      } else if (isLongPrompt) {
        effectiveLen = 'long';
      } else {
        effectiveLen = 'normal';
      }
    }

    const recentDiaries = StorageManager.getRecentDiariesSummary(3);
    const pastMemoryDiary = StorageManager.findRelevantPastDiary(promptText);

    const context = {
      timeInfo, weather, temp, townArea, isAtHome, isAssistantMode: isAssistant,
      memories, recentDiaries, pastMemoryDiary, talkLength: talkLen, effectiveTalkLength: effectiveLen
    };

    const cur = getCurChar();
    let systemPrompt = cur.buildSystemPrompt ? cur.buildSystemPrompt(context) : "";

    let lengthClimaxLock = "";
    if (effectiveLen === 'short') {
      lengthClimaxLock = "\n【最重要：今回の発話制限】必ず1文（30文字以内）でサクッと短く答えてください。2文以上の長いお喋りは完全禁止です。";
    } else if (effectiveLen === 'long') {
      lengthClimaxLock = "\n【最重要：今回の発話制限】前世の記憶や知識、相棒への愛嬌を込めて2〜3文（100〜150文字程度）でたっぷり楽しくお話ししてください。";
    } else {
      lengthClimaxLock = "\n【最重要：今回の発話制限】1〜2文（40〜70文字程度）の愛らしい標準サイズで小気味よく会話してください。";
    }

    const dateClimaxLock = `\n【絶対厳守の日付アンカー】今日の日付は絶対に【${timeInfo.fullDate}】です。過去の日記に登場する日付は過去の記録であり、今日の日付ではありません。今日の日付を誤認しないでください。`;
    systemPrompt += `\n${dateClimaxLock}${lengthClimaxLock}`;

    const contents = this._buildContentsPayload(rawLogs, promptText, photoBase64);

    let targetMaxTokens = 140;
    if (effectiveLen === 'short') targetMaxTokens = 60;
    else if (effectiveLen === 'long') targetMaxTokens = 300;

    for (const model of FIXED_LITE_MODELS) {
      if (this.isUserCancelled) break;
      const cleanModel = model.replace(/^models\//, '');
      const t0 = performance.now();
      Logger.log(`[AI] リクエスト送信 ➔ ${cleanModel} (設定:${talkLen} ➔ 適用:${effectiveLen}, 上限:${targetMaxTokens}, 制限:8秒)`, "info");

      this.activeAbortController = new AbortController();
      let isCurrentTimeout = false;
      const timeoutTimer = setTimeout(() => {
        isCurrentTimeout = true;
        if (this.activeAbortController) this.activeAbortController.abort();
      }, 8000);

      try {
        const bodyPayload = {
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: targetMaxTokens }
        };

        if (isAssistant) {
          bodyPayload.tools = KURO_TOOLS;
          bodyPayload.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
        }

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${this.apiKey}`;
        let res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload),
          signal: this.activeAbortController.signal
        });

        if (!res.ok && isAssistant && !isCurrentTimeout && !this.isUserCancelled) {
          clearTimeout(timeoutTimer);
          this.activeAbortController = new AbortController();
          const fallbackTimer = setTimeout(() => {
            isCurrentTimeout = true;
            if (this.activeAbortController) this.activeAbortController.abort();
          }, 8000);

          delete bodyPayload.tools;
          delete bodyPayload.toolConfig;
          res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyPayload),
            signal: this.activeAbortController.signal
          });
          clearTimeout(fallbackTimer);
        }

        clearTimeout(timeoutTimer);
        const ms = Math.round(performance.now() - t0);

        if (res.ok) {
          const data = await res.json();
          const parts = data.candidates?.[0]?.content?.parts || [];
          let replyText = "";
          let cards = [];

          const functionCallPart = parts.find(p => p.functionCall);
          if (functionCallPart && isAssistant) {
            const callInfo = functionCallPart.functionCall;
            const args = callInfo.args || {};

            if (callInfo.name === "searchMapPlaces") {
              const spot = args.spotName || "近くの公園・評判店";
              const area = args.area || townArea || "東村山市";
              Logger.log(`[Tool] 📍 マップ検索実行: ${spot} (${area})`, "info");
              cards = this._createSmartMapCards(spot, area);
              replyText = cur.id === 'shiro'
                ? `助手よ、${spot}の場所を計算して割り出したホ！この地図で確認するが良いホ！`
                : `おやびん、${spot}の場所を地図で見つけてきたニャ！ここから確認してニャン🐾`;
            } else if (callInfo.name === "searchLatestNews") {
              const topic = args.topic || "最新ニュース";
              Logger.log(`[Tool] 📰 ニュース検索実行: ${topic}`, "info");
              cards = this._createSmartNewsCards(topic);
              replyText = cur.id === 'shiro'
                ? `助手よ、${topic}の最新情報を整理したホ！目を通すが良いホ！📰`
                : `おやびん、${topic}の最新ニュースをチェックしたニャ！見てみてニャン📰🐾`;
            }
          }

          const textPart = parts.find(p => p.text);
          if (textPart?.text && !replyText) replyText = textPart.text;

          if (replyText) {
            let clean = replyText.replace(/https?:\/\/[^\s]+/gi, '');
            clean = clean.replace(/<!--[\s\S]*?-->/g, '').replace(/[*#_~`]/g, '').trim();
            clean = clean.replace(/余([はがものにもと])/g, `${cur.firstPerson}$1`).replace(/余/g, cur.firstPerson);
            clean = AppCore.audio.cleanEndingNenyan(clean);

            // ★重要：AIがツールを実行しなかった場合でも確実にカードを発行する完全共通救済
            if (isAssistant && cards.length === 0) {
              const fallbackCards = this._detectCardsFromSpeech(clean, promptText);
              if (fallbackCards.length > 0) cards = fallbackCards;
            }

            const badge = document.getElementById('model-badge');
            if (badge) badge.textContent = `${cur.id === 'shiro' ? '🦉' : '🐾'} ${cleanModel.replace('gemini-', '')}`;

            Logger.log(`[AI] ✅ 応答受信成功 (${ms}ms) [${cleanModel}] (カード:${cards.length}件)`, "success");
            this.activeAbortController = null;
            return { success: true, text: clean, groundingCards: cards };
          }
        } else {
          Logger.log(`[AI] ⚠️ HTTP ${res.status} [${cleanModel}] (${ms}ms)`, "warn");
        }
      } catch (err) {
        clearTimeout(timeoutTimer);
        const ms = Math.round(performance.now() - t0);
        if (this.isUserCancelled) {
          Logger.log(`[AI] 🛑 キャンセルを受け付けました`, "info");
          this.activeAbortController = null;
          return { success: false, aborted: true };
        }
        if (isCurrentTimeout) {
          Logger.log(`[AI] ⏱️ [${cleanModel}] が8秒タイムアウト。次へバトンタッチ！`, "warn");
          continue;
        }
        Logger.log(`[AI] ❌ エラー [${cleanModel}]: ${err.message} (${ms}ms)`, "error");
      }
    }

    this.activeAbortController = null;
    if (this.isUserCancelled) return { success: false, aborted: true };

    Logger.log(`[AI] ⏱️ 16秒タイムアウト（8秒＋8秒打ち切り完了・案3セリフ発動）`, "warn");
    const timeoutMsg = cur.id === 'shiro'
      ? "うむむ…！助手の話を深く思考していたら、計算回路がオーバーヒートしたホ…！もう一度言ってくれホ！"
      : "うにゃあ…！おやびんのお話しをじっくり考えてたら、頭の中がこんがらがっちゃったニャ〜！もう一回言ってニャン🐾";

    return {
      success: false,
      isTimeout: true,
      text: timeoutMsg
    };
  }

  _createSmartMapCards(spotName, area) {
    const cards = [];
    const spotLimit = parseInt(localStorage.getItem('kuro_spot_count') || '2', 10);
    const searchArea = area || LocationProvider.detailedTownArea || LocationProvider.cleanCityOnly || "東村山市";
    const cleanSpot = spotName.replace(/おすすめ|美味しい|人気/g, '').trim() || spotName;

    let queryParam = encodeURIComponent(cleanSpot + ' ' + searchArea.replace(/付近$/, ''));
    if (LocationProvider.lat !== null && LocationProvider.lon !== null) {
      queryParam += `&ll=${LocationProvider.lat},${LocationProvider.lon}&center=${LocationProvider.lat},${LocationProvider.lon}`;
    }

    cards.push({
      type: 'map-primary',
      icon: '📍',
      title: `【地図】${cleanSpot}（Googleマップ）`,
      url: `https://www.google.com/maps/search/?api=1&query=${queryParam}`
    });

    if (spotLimit >= 2) {
      cards.push({
        type: 'map-sub',
        icon: '🌳',
        title: `${cleanSpot}（現在地周辺のスポット）`,
        url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanSpot + ' ' + searchArea.replace(/付近$/, ''))}`
      });
    }

    if (spotLimit >= 3) {
      cards.push({
        type: 'map-all',
        icon: '🗺️',
        title: `${searchArea.replace(/付近$/, '')}の周辺おすすめ一覧（まとめ）`,
        url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchArea.replace(/付近$/, '') + ' スポット')}`
      });
    }
    return cards;
  }

  _createSmartNewsCards(topic) {
    const cards = [];
    const newsLimit = parseInt(localStorage.getItem('kuro_news_count') || '2', 10);
    const cleanTopic = topic.trim() || "最新ニュース";

    cards.push({
      type: 'news-primary',
      icon: '📰',
      title: `「${cleanTopic}」の最新ニュース速報`,
      url: `https://news.google.com/search?q=${encodeURIComponent(cleanTopic)}&hl=ja&gl=JP&ceid=JP:ja`
    });

    if (newsLimit >= 2) {
      cards.push({
        type: 'news-sub',
        icon: '🌐',
        title: `主要トップニュース一覧（ポータル）`,
        url: `https://news.google.com/topstories?hl=ja&gl=JP&ceid=JP:ja`
      });
    }

    if (newsLimit >= 3) {
      cards.push({
        type: 'news-sub',
        icon: '📱',
        title: `注目のトレンド・トピックス`,
        url: `https://news.google.com/search?q=${encodeURIComponent(cleanTopic + ' 話題')}&hl=ja&gl=JP&ceid=JP:ja`
      });
    }
    return cards;
  }

  // ★重要：AIの言葉遣いに依存しない、堅牢なカード救済フォールバック（シロくん・クロちゃん完全共通）
  _detectCardsFromSpeech(speechText, userPrompt) {
    if (!AppCore.state.isAssistantMode) return [];

    const combined = `${userPrompt} ${speechText}`;

    // 1. ニュース判定（ユーザーまたはAIの発言にニュース関連単語が含まれているか）
    const isNewsTarget = /(?:ニュース|速報|ヘッドライン|トピックス|最新情報|大谷|話題)/i.test(combined);
    if (isNewsTarget) {
      const newsMatch = combined.match(/(?:大谷翔平|プロ野球|天気|東村山|政治|経済|話題)/);
      const topic = newsMatch ? newsMatch[0] : "最新ニュース";
      Logger.log(`[Tool] 📰 救済ロジック発動: ニュースカード発行（${topic}）`, "info");
      return this._createSmartNewsCards(topic);
    }

    // 2. 地図・スポット判定（具体的なジャンル、施設、または「探して」「教えて」「どこ」が含まれているか）
    const spotMatch = combined.match(/(?:炭火ホルモン\s*丸川|丸川|餃子の満洲|満洲|ラーメン|つけ麺|ホルモン|餃子|焼肉|寿司|鮨|カレー|うどん|そば|中華|イタリアン|居酒屋|カフェ|喫茶店|公園|ベンチ|散歩コース|休憩スポット|スポット|散策)/);
    const hasSearchIntent = /(?:探して|教えて|どこ|場所|近く|案内|おすすめ|行きたい|食べたい)/.test(combined);

    if (spotMatch || hasSearchIntent) {
      const spot = spotMatch ? spotMatch[0] : "おすすめスポット";
      Logger.log(`[Tool] 📍 救済ロジック発動: マップカード発行（${spot}）`, "info");
      return this._createSmartMapCards(spot, LocationProvider.detailedTownArea || LocationProvider.cleanCityOnly);
    }

    return [];
  }

  async generateDailyDiarySummary(dailyAllLogs, targetLifeDateKey = null, targetLifeFullDate = null) {
    if (!this.apiKey) return { success: false };

    const timeInfo = TimeProvider.getCurrentInfo();
    const fullDate = targetLifeFullDate || (targetLifeDateKey ? TimeProvider.formatDateKeyToFull(targetLifeDateKey) : timeInfo.lifeFullDate);
    const lifeKey = targetLifeDateKey || timeInfo.lifeLogKey;
    const cur = getCurChar();

    const filteredLogs = dailyAllLogs.filter(l => l.text && !l.text.startsWith('http') && !/(?:絵?日記|にっき|日誌).*(?:書いて|まとめて)/.test(l.text));
    const historyText = filteredLogs.map(l => `${l.role === 'user' ? cur.ownerCall : cur.name}: ${l.text}`).join('\n');

    const context = {
      fullDate, isAtHome: LocationProvider.isAtHome, weather: LocationProvider.weather,
      temp: LocationProvider.temperature, historyText
    };
    const diaryPrompt = cur.buildDiaryPrompt ? cur.buildDiaryPrompt(context) : "";

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${FIXED_LITE_MODELS[0]}:generateContent?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: `You are ${cur.name}. You MUST write in Japanese only. Output must strictly follow the format: diary body on the first lines, followed by 【${cur.title || cur.name}のひとこと：...】 on the last line. Do NOT output any duplicate dates/weather greetings in the body. Any English text is strictly forbidden.` }] },
          contents: [{ role: 'user', parts: [{ text: diaryPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 850 }
        })
      });

      if (res.ok) {
        const diaryRaw = (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text;
        if (diaryRaw && diaryRaw.length >= 25) {
          let clean = diaryRaw.replace(/https?:\/\/[^\s]+/gi, '').replace(/[*#_~`]/g, '').trim();
          clean = clean.replace(/余([はがものにもと])/g, `${cur.firstPerson}$1`).replace(/余/g, cur.firstPerson);
          clean = AppCore.audio.cleanEndingNenyan(clean);

          let content = clean;
          let extractedComment = "";

          const commentPattern = /(?:【|\n|\s)*(?:🐾|🦉\s*)?(?:クロ|ホウ博士|シロ)の(?:ひとこと|一言|メッセージ)[:：]?\s*([^\n】]+)(?:】)?/iu;
          const match = clean.match(commentPattern);

          if (match) {
            extractedComment = match[1].replace(/】+$/, '').trim();
            content = clean.replace(/(?:【|\n|\s)*(?:🐾|🦉\s*)?(?:クロ|ホウ博士|シロ)の(?:ひとこと|一言|メッセージ)[:：]?\s*[\s\S]*$/iu, '').trim();
          } else {
            const sentences = clean.split(/[。！？\n]+/).map(s => s.trim()).filter(Boolean);
            if (sentences.length >= 2) {
              const lastSentence = sentences[sentences.length - 1];
              if (lastSentence.length <= 60 && /(?:だニャ|ニャン|ホ！|ホな|おやびん|助手)/.test(lastSentence)) {
                extractedComment = lastSentence;
                sentences.pop();
                content = sentences.join('\n').trim();
              }
            }
          }

          content = content.replace(/^【?[0-9０-９一二三四五六七八九〇]+年[^\n]+】?\s*\n*/u, '').trim();
          content = content.replace(/^(?:今日|きょう)は[0-9０-９一二三四五六七八九〇]+年[^\n。！？]*[。！？\n]\s*/u, '').trim();

          const pool = StorageManager.getDailyPhotoPool(lifeKey);
          return { success: true, diaryText: content, kuroComment: extractedComment, selectedPhoto: pool[0]?.base64 || null };
        }
      }
    } catch(e) {}
    return { success: false };
  }
}

/* ==========================================================================
   MODULE 6: 中央司令塔（AppCore）
   ========================================================================== */
const AppCore = {
  state: {
    isRunning: true, isThinking: false, isProcessingInput: false, isDiaryProcessing: false,
    isAssistantMode: false, editingMemoryIdx: null, activeAdjustTab: 'idle', snackCount: 0,
    timerId: null, timerSeconds: 0, timerLabel: "", isTimerPaused: false, isTimerCompleted: false,
    chimeTimerId: null,
    wakeLockSentinel: null, isLandscape: false,

    isCalibratingEyelid: false,

    studioDateKeys: [],
    studioCurrentDateIdx: 0,
    isDiaryReading: false,
    isFinalizingDiary: false,

    idleSoliloquyTimer: null, lastActivityTime: Date.now(),
    lastCheckedLifeLogKey: null
  },

  audio: new AudioSpeechEngine(),
  ai: new AIThoughtEngine(),
  avatar: null,
  memories: [],
  todayLogs: [],

  getSpeakerId() {
    const cur = getCurChar();
    const charSpecific = localStorage.getItem(`kuro_voice_speaker_id_${cur.id}`);
    if (charSpecific !== null && charSpecific !== "") {
      return parseInt(charSpecific, 10);
    }
    const legacy = localStorage.getItem('kuro_voice_speaker_id');
    if (legacy !== null && legacy !== "") {
      return parseInt(legacy, 10);
    }
    return parseInt(String(cur.defaultSpeakerId || 10), 10);
  },

  getTimerSound() { return localStorage.getItem('kuro_timer_sound') || 'bell'; },

  getCurEnding(kuroEnding = "ニャ！", shiroEnding = "ホ！") {
    return getCurChar().id === 'shiro' ? shiroEnding : kuroEnding;
  },

  applyTheme(theme) {
    const validThemes = ['normal', 'dark', 'mint', 'pop'];
    const chosen = validThemes.includes(theme) ? theme : 'normal';
    document.documentElement.setAttribute('data-theme', chosen);
    localStorage.setItem('kuro_theme', chosen);

    document.querySelectorAll('.theme-card-btn').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.themeVal === chosen);
    });
  },

  switchActiveCharacter(charId) {
    if (charId !== 'kuro' && charId !== 'shiro') return;
    localStorage.setItem('kuro_active_character', charId);
    const cur = getCurChar();

    const existingVoice = localStorage.getItem(`kuro_voice_speaker_id_${cur.id}`);
    if (!existingVoice) {
      localStorage.setItem(`kuro_voice_speaker_id_${cur.id}`, String(cur.defaultSpeakerId));
    }
    localStorage.setItem('kuro_voice_speaker_id', localStorage.getItem(`kuro_voice_speaker_id_${cur.id}`));

    if (this.avatar) {
      this.avatar.updateCharacterClass();
      this.avatar.refreshAvatarImages();
      this.avatar._injectVectorAvatar();
      this.avatar.glassesCoords = StorageManager.loadGlassesCoords();
      this.avatar.eyelidCoords = StorageManager.loadEyelidCoords();
      this.avatar._renderAllAccessories();
      this.avatar.applyAllFramesTransform();
      this.avatar.applyEyelidTransforms();
      this.avatar.applyMode(this.avatar.mode);
    }

    this.memories = StorageManager.loadMemories(cur.defaultMemories);
    this._renderMemories();
    this._restoreTimelineHistory();
    this._updateStorageMonitorUI();
    this._updateCharacterUI();
    this._syncEyelidInputsToActiveChar();

    const welcomeMsg = charId === 'shiro'
      ? "フン、ボクの出番ホな！よろしく頼むホ、助手！"
      : "おやびん、わたしはクロだニャン♪ 今日もよろしくニャ！";

    this.audio.speak(welcomeMsg, null, () => this.renderBubble('model', welcomeMsg));
    const switchToast = charId === 'shiro' ? "パートナーを【ホウ博士】に切り替えたホ！" : "パートナーを【クロちゃん】に切り替えたニャン♪";
    Toast.show(switchToast, "success", 3000);
    Logger.log(`[Character] 🔄 パートナー切替完了: ${cur.name} (${cur.id}) (適用音声ID:${this.getSpeakerId()})`, "success");
  },

  _updateCharacterUI() {
    const cur = getCurChar();
    const isShiro = (cur.id === 'shiro');

    const snackIcon = document.getElementById('snack-btn-icon');
    const snackTxt = document.getElementById('snack-btn-text');
    if (snackIcon) snackIcon.textContent = isShiro ? '🌰' : '🐟';
    if (snackTxt) snackTxt.textContent = isShiro ? '木の実' : 'おやつ';

    const verTag = document.getElementById('app-footer-version-tag');
    if (verTag) verTag.textContent = isShiro ? '🦉 シロくん（ホウ博士） v1.0.0' : '🐾 クロちゃん v1.0.0';

    const studioTitle = document.getElementById('studio-top-title-text');
    if (studioTitle) studioTitle.textContent = isShiro ? 'ホウ博士の研究観察日誌' : 'クロの思い出絵日記アルバム';

    const adjTitle = document.getElementById('adjust-modal-title');
    if (adjTitle) adjTitle.textContent = isShiro ? '🎓 写真ごとの博士帽位置を微調整' : '👓 写真ごとのメガネ・帽子位置を微調整';

    const accFormGroup = document.getElementById('acc-style-form-group');
    if (accFormGroup) accFormGroup.style.display = isShiro ? 'none' : 'block';

    document.querySelectorAll('#character-selector-segment-group .segment-btn').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.charId === cur.id);
    });

    this._updateModeUI(false);
  },

  _syncEyelidInputsToActiveChar() {
    const cur = getCurChar();
    const c = StorageManager.loadEyelidCoords();
    const setVal = (id, val) => {
      const inp = document.getElementById(id);
      const disp = document.getElementById(`${id}-val`);
      if (inp) inp.value = val;
      if (disp) disp.textContent = (id === 'adj-eyelid-rotate') ? `${val}°` : val;
    };
    setVal('adj-eyelid-y', c.y);
    setVal('adj-eyelid-x', c.x);
    setVal('adj-eyelid-gap', c.gap);
    setVal('adj-eyelid-size', c.size);
    setVal('adj-eyelid-rotate', c.rotate !== undefined ? c.rotate : (cur.id === 'shiro' ? 8 : 0));

    const btnSaveEyelid = document.getElementById('btn-save-eyelid-settings');
    if (btnSaveEyelid) {
      btnSaveEyelid.textContent = cur.id === 'shiro'
        ? "👁️ ホウ博士のまぶた位置・傾きを保存するホ！"
        : "👁️ クロちゃんのまぶた位置・傾きを保存するニャ！";
    }
  },

  updateTopHeaderClockWeatherUI() {
    const cur = TimeProvider.getCurrentInfo();
    const dtEl = document.getElementById('clock-display-datetime');
    if (dtEl) dtEl.textContent = cur.topDateDisplay;

    const weatherEl = document.getElementById('clock-display-weather');
    if (weatherEl) {
      const wIcon = LocationProvider.weather === '快晴' ? '☀️' : (LocationProvider.weather === 'くもり' ? '☁️' : (LocationProvider.weather === '雨' ? '🌧️' : '🌤️'));
      weatherEl.textContent = `${wIcon} ${LocationProvider.temperature}℃`;
    }

    const locEl = document.getElementById('clock-display-location');
    if (locEl) {
      locEl.textContent = LocationProvider.cleanCityOnly || "東村山市";
    }
  },

  async init() {
    this.avatar = new CatAvatarRenderer();
    this.memories = StorageManager.loadMemories(getCurChar().defaultMemories);
    this.todayLogs = StorageManager.loadRecentTimelineLogs();
    this.state.isAssistantMode = localStorage.getItem('kuro_mode') === 'assistant';

    this._updateCharacterUI();
    this._setupAudioCallbacks();

    const savedTheme = localStorage.getItem('kuro_theme') || 'normal';
    this.applyTheme(savedTheme);

    this._bindUI();
    this._bindCustomSettingsUI();
    this._bindKitchenTimerWidgetUI();
    this._bindGlassesAdjusterUI();
    this._bindEyelidSettingsUI();
    this._bindBookStudioUI();
    this._bindPhotoLightboxUI();
    this._bindPhotoUploadUI();
    this._bindOrientationWatcher();
    this._bindScrollToBottomUI();
    this._bindDeviceWakeWatcher();

    this._renderMemories();
    this._restoreTimelineHistory();
    this._updateModelBadge();
    this._updateStorageMonitorUI();
    this._syncEyelidInputsToActiveChar();

    if (typeof VersionManager !== 'undefined') VersionManager.applyToDOM();

    const initialInfo = TimeProvider.getCurrentInfo();
    this.state.lastCheckedLifeLogKey = initialInfo.lifeLogKey;
    this.updateTopHeaderClockWeatherUI();

    setInterval(() => {
      const cur = TimeProvider.getCurrentInfo();
      this.updateTopHeaderClockWeatherUI();

      if (this.state.lastCheckedLifeLogKey && cur.lifeLogKey !== this.state.lastCheckedLifeLogKey) {
        Logger.log(`[Lifecycle] 🌅 朝4:00の生活日切り替えを検知（${this.state.lastCheckedLifeLogKey} ➔ ${cur.lifeLogKey}）。昨日の日記を自動救済…`, "info");
        this.state.lastCheckedLifeLogKey = cur.lifeLogKey;
        this.checkAndFinalizeYesterdayDiary();
      }
    }, 1000);

    LocationProvider.initWatcher();

    this.checkAndFinalizeYesterdayDiary();
    this._startIdleSoliloquyWatcher();

    setTimeout(() => { if (this.state.isRunning && !this.audio.isSpeechProducing) this.audio.startListening(); }, 500);
    Logger.log(`[AppCore] 全システム正常稼働！パートナー: ${getCurChar().name} ロード完了！`, "success");
  },

  _bindDeviceWakeWatcher() {
    let wakeDebounceTimer = null;
    const handleWake = () => {
      if (document.visibilityState === 'visible') {
        if (wakeDebounceTimer) clearTimeout(wakeDebounceTimer);
        wakeDebounceTimer = setTimeout(() => {
          Logger.log(`[Lifecycle] 📱 画面復帰を検知。未作成・追加会話日記を点検…`, "info");
          this.updateTopHeaderClockWeatherUI();
          this.checkAndFinalizeYesterdayDiary();
        }, 300);
      }
    };
    document.addEventListener('visibilitychange', handleWake);
    window.addEventListener('pageshow', handleWake);
  },

  _updateStorageMonitorUI() {
    const u = StorageManager.getStorageUsage();
    const usageEl = document.getElementById('storage-usage-text');
    const percentEl = document.getElementById('storage-percent-text');
    const statusPill = document.getElementById('storage-status-pill');

    if (usageEl) usageEl.textContent = `${u.usedMB.toFixed(2)} MB / ${u.limitMB.toFixed(2)} MB`;
    if (percentEl) percentEl.textContent = `${u.percent}%`;
    document.getElementById('bar-seg-photo')?.setAttribute('style', `width:${u.photoPct}%;`);
    document.getElementById('bar-seg-chat')?.setAttribute('style', `width:${u.chatPct}%;`);
    document.getElementById('bar-seg-meta')?.setAttribute('style', `width:${u.metaPct}%;`);

    const pillPhoto = document.getElementById('pill-photo-usage');
    const pillChat = document.getElementById('pill-chat-usage');
    const pillMeta = document.getElementById('pill-meta-usage');
    if (pillPhoto) pillPhoto.textContent = `📷 写真: ${u.photoMB.toFixed(2)} MB`;
    if (pillChat) pillChat.textContent = `💬 会話: ${u.chatMB.toFixed(2)} MB`;
    if (pillMeta) pillMeta.textContent = `📝 記憶設定: ${u.metaMB.toFixed(2)} MB`;

    if (statusPill) {
      const cur = getCurChar();
      const okTxt = cur.id === 'shiro' ? "快適だホ！" : "快適ニャ🐾";
      statusPill.textContent = u.isDanger ? "⚠️ 残りわずか" : (u.isWarning ? "⚠️ 容量注意" : okTxt);
      statusPill.style.color = u.isDanger ? "#dc2626" : (u.isWarning ? "#d97706" : "#15803d");
    }

    if (u.usedMB >= 4.0 && !this.state._hasShown4MbAlert) {
      this.state._hasShown4MbAlert = true;
      const warnMsg = getCurChar().id === 'shiro'
        ? "写真がたくさん溜まってきたホ！そろそろPCにバックアップを推奨するホ！"
        : "写真がたくさん溜まってきたニャン！そろそろPCにバックアップしてニャ！";
      Toast.show(warnMsg, "error", 6000);
      Logger.log(`[Storage] ⚠️ ストレージが4.0MBに達しました。バックアップを推奨します`, "warn");
    }
  },

  _scrollToLatest(smooth = true) {
    const box = document.getElementById('chat-timeline');
    if (!box) return;
    setTimeout(() => {
      try {
        box.scrollTo({ top: box.scrollHeight + 140, behavior: smooth ? 'smooth' : 'auto' });
      } catch(e) {
        box.scrollTop = box.scrollHeight + 140;
      }
    }, 50);
  },

  _bindScrollToBottomUI() {
    const box = document.getElementById('chat-timeline');
    const btn = document.getElementById('btn-scroll-bottom');
    if (!box || !btn) return;

    box.addEventListener('scroll', () => {
      btn.classList.toggle('is-visible', (box.scrollHeight - (box.scrollTop + box.clientHeight)) > 110);
    }, { passive: true });

    btn.onclick = () => {
      this.resetActivityTimer();
      this.audio.playEffect('aizuchi');
      this._scrollToLatest(true);
      btn.classList.remove('is-visible');
    };
  },

  _bindOrientationWatcher() {
    const checkOrientation = () => {
      const isLandscape = window.innerWidth > window.innerHeight;
      if (isLandscape !== this.state.isLandscape) {
        this.state.isLandscape = isLandscape;
        if (this.avatar) this.avatar.triggerFlipLanding();
        this.audio.playEffect('purr');
        setTimeout(() => { this._scrollToLatest(true); }, 300);
      }
    };
    window.addEventListener('resize', checkOrientation, { passive: true });
    this.state.isLandscape = (window.innerWidth > window.innerHeight);
  },

  _startIdleSoliloquyWatcher() {
    if (this.state.idleSoliloquyTimer) clearInterval(this.state.idleSoliloquyTimer);
    const phrasesKuro = ["ふぁ〜あ…（あくび）💤", "おやびん、なにしてるのかニャ〜？🐾", "今日もちゅ〜る食べたいニャン♪🐟", "おやびんの近くは落ち着くニャ〜♡"];
    const phrasesShiro = ["ふぁ〜あ…（羽を伸ばす）💤", "助手よ、研究の進捗はどうホ？🦉", "木の実でもつまみながら読書したいホな…", "助手の近くは集中できるホ…"];

    this.state.idleSoliloquyTimer = setInterval(() => {
      const now = Date.now();
      if ((now - this.state.lastActivityTime) > 150000 && this.state.isRunning && !this.audio.isSpeaking && !this.audio.isSpeechProducing && !this.state.isThinking && this.state.timerId === null) {
        this.state.lastActivityTime = now;
        const cur = getCurChar();
        const list = (cur.id === 'shiro') ? phrasesShiro : phrasesKuro;
        const phrase = list[Math.floor(Math.random() * list.length)];
        const b = this.renderBubble('model', phrase);
        if (b) { b.style.opacity = '0.85'; b.style.borderStyle = 'dashed'; }
        if (this.avatar) {
          this.avatar.setEmotion('happy');
          setTimeout(() => { if (!this.audio.isSpeaking && this.avatar && this.state.isRunning) this.avatar.setEmotion('idle'); }, 2000);
        }
      }
    }, 5000);
  },

  resetActivityTimer() { this.state.lastActivityTime = Date.now(); },

  async checkAndFinalizeYesterdayDiary() {
    if (this.state.isFinalizingDiary) return;
    const timeInfo = TimeProvider.getCurrentInfo();
    if (timeInfo.isLateNight) return;

    this.state.isFinalizingDiary = true;
    try {
      const yInfo = TimeProvider.getYesterdayLifeInfo();
      const yKey = yInfo.key;
      const yFullDate = yInfo.fullDate;

      const yLogs = StorageManager.getDailyLogs(yKey);
      if (!yLogs || yLogs.length < 2) return;

      const existingDiary = StorageManager.getDiary(yKey);
      const isProper = StorageManager.isProperDiary(existingDiary);
      const prevLogCount = existingDiary?.logCountAtSave || 0;
      const hasNewLogs = (yLogs.length > prevLogCount);

      if (isProper && !hasNewLogs) {
        Logger.log(`[Diary] 昨日の日記（${yKey}）は夜の会話まで反映完了済みのため大切にキープ`, "info");
        return;
      }

      Logger.log(`[Diary] 昨日の絵日記更新を検出（${yFullDate} / 前:${prevLogCount}件 ➔ 終:${yLogs.length}件）。完全版を生成…`, "info");

      const res = await this.ai.generateDailyDiarySummary(yLogs, yKey, yFullDate);
      if (res.success && res.diaryText) {
        StorageManager.saveDiary(res.diaryText, yKey, yFullDate, res.selectedPhoto, yLogs.length, res.kuroComment);

        Logger.log(`[Diary] ✅ 昨日の絵日記の最終アップデートに大成功！(${yFullDate})`, "success");
        const cur = getCurChar();
        const updateToast = cur.id === 'shiro'
          ? `助手よ！昨日の研究日誌に夜の記録も追加してまとめておいたホ！`
          : `おやびん！昨日の日記に夜のお話しも追加してまとめておいたニャン🐾`;

        Toast.show(updateToast, "success", 4500);

        const autoNotice = hasNewLogs && isProper
          ? (cur.id === 'shiro' ? `助手よ！昨日の日誌に夜の会話も追加しておいたホ！` : `おやびん！昨日の日記に夜のお話しも追加しておいたニャン🐾`)
          : (cur.id === 'shiro' ? `助手よ！昨日の研究観察日誌を書いておいたホ！日誌を見てみるが良いホ！` : `おやびん！昨日の思い出絵日記を書いておいたニャン🐾 日記帳を見てみてニャ♪`);

        this.renderBubble('model', autoNotice);
        const savedDiary = StorageManager.getDiary(yKey);
        if (savedDiary) this.renderDiaryCard(savedDiary);

        this._updateStorageMonitorUI();
      }
    } catch (err) {
      Logger.log(`[Diary] ⚠️ 昨日の日記自動生成で一時エラー: ${err.message}`, "warn");
    } finally {
      this.state.isFinalizingDiary = false;
    }
  },

  async forceRefreshApp() {
    if (!window.confirm("日記や記憶データは安全にキープされます。最新版の画面を読み直しますか？")) return;
    try { if ('caches' in window) await Promise.all((await caches.keys()).map(k => caches.delete(k))); } catch(e) {}
    window.location.href = window.location.origin + window.location.pathname + '?refresh=' + Date.now();
  },

  _restoreTimelineHistory() {
    const box = document.getElementById('chat-timeline');
    if (!box) return;
    box.innerHTML = '';
    const logs = StorageManager.loadRecentTimelineLogs();
    const cur = getCurChar();
    if (logs.length === 0) {
      const greeting = cur.id === 'shiro'
        ? `助手よ、ボクは${cur.title || cur.name}だホ！今日も知的な一日にするホ！`
        : `おやびん、わたしは${cur.name}だニャン🐾 今日もいっぱいお話しするニャ♪`;
      this.renderBubble('model', greeting);
      return;
    }
    logs.forEach(h => this.renderBubble(h.role, h.text, [], h.photoUrl || null));
    this._scrollToLatest(false);
  },

  _setupAudioCallbacks() {
    this.audio.onBargeIn = () => {
      this.resetActivityTimer();
      if (this.avatar) this.avatar.setEmotion('idle');
      this.state.isThinking = false;
      this.state.isProcessingInput = false;
      this.state.isDiaryReading = false;
      this._updateDiaryReadBtnUI(false);
      this.audio.playEffect('aizuchi');
      const st = document.getElementById('status-text');
      const suffix = getCurChar().id === 'shiro' ? 'ホ♪' : 'ニャ♪';
      if (st && this.state.isRunning) st.textContent = `👂 聴いてる${suffix}`;
    };

    this.audio.onSpeechFinal = (finalText) => {
      this.resetActivityTimer();
      if (this.state.isProcessingInput || this.state.isDiaryReading || this.audio.isActionButtonLocked || this.audio.isSpeechProducing) return;
      this.state.isProcessingInput = true;
      this.renderBubble('user', finalText);
      this.handleUserInput(finalText);
    };

    this.audio.onListeningStatus = () => {
      const st = document.getElementById('status-text');
      const suffix = getCurChar().id === 'shiro' ? 'ホ♪' : 'ニャ♪';
      if (st && this.state.isRunning && !this.audio.isSpeaking && !this.audio.isSpeechProducing && !this.state.isThinking && !this.audio.isActionButtonLocked) {
        st.textContent = `👂 聴いてる${suffix}`;
      }
    };
  },

  _bindPhotoLightboxUI() {
    const modal = document.getElementById('photo-lightbox-modal');
    if (modal) {
      modal.onclick = (e) => {
        if (e.target.id === 'photo-lightbox-modal' || e.target.id === 'btn-lightbox-close') modal.classList.remove('is-open');
      };
    }
  },

  openPhotoLightbox(photoSrc, captionText = "📸 写真の全貌") {
    const modal = document.getElementById('photo-lightbox-modal');
    const fullImg = document.getElementById('lightbox-full-img');
    const caption = document.getElementById('lightbox-caption');
    if (!modal || !fullImg || !photoSrc) return;
    fullImg.src = photoSrc;
    if (caption) caption.textContent = captionText;
    modal.classList.add('is-open');
    this.audio.playEffect('aizuchi');
  },

  renderBubble(role, text, cards = [], photoUrl = null) {
    const box = document.getElementById('chat-timeline');
    if (!box) return null;
    const row = document.createElement('div');
    row.className = `chat-row ${role}`;

    if (photoUrl) {
      const imgWrap = document.createElement('div');
      imgWrap.className = 'timeline-photo-wrap';
      imgWrap.innerHTML = `<img src="${photoUrl}" alt="写真" class="timeline-shared-img">`;
      imgWrap.onclick = () => this.openPhotoLightbox(photoUrl, "📸 共有されたお写真");
      row.appendChild(imgWrap);
    }

    const b = document.createElement('div');
    b.className = 'chat-bubble';
    const cleanBubbleText = (text || '').replace(/https?:\/\/[^\s]+/gi, '').trim();
    b.textContent = this.audio.cleanEndingNenyan(cleanBubbleText);
    row.appendChild(b);

    if (cards && cards.length > 0 && this.state.isAssistantMode) {
      const cardBox = document.createElement('div');
      cardBox.className = 'action-card-box';
      cards.forEach(c => {
        const a = document.createElement('a');
        a.className = `link-action-card ${c.type}-card`;
        a.href = c.url; a.target = '_blank';
        a.innerHTML = `<span class="card-icon">${c.icon}</span><span class="card-title-text">${c.title}</span><span class="card-arrow">➔</span>`;
        cardBox.appendChild(a);
      });
      row.appendChild(cardBox);
    }

    box.appendChild(row);
    this._scrollToLatest(true);
    return b;
  },

  renderDiaryCard(diaryData) {
    const box = document.getElementById('chat-timeline');
    if (!box || !diaryData) return;
    const cur = getCurChar();
    const isShiro = (cur.id === 'shiro');
    const row = document.createElement('div');
    row.className = `chat-row model`;
    const card = document.createElement('div');
    card.className = 'timeline-diary-card';

    let cleanBody = (diaryData.content || '').replace(/^【?[0-9０-９一二三四五六七八九〇]+年[^\n]+】?\s*\n*/u, '').trim();

    card.innerHTML = `
      <div class="timeline-diary-header">
        <span>📖 ${diaryData.fullDate} の${cur.title || cur.name}記録</span>
        <span>${isShiro ? '🦉' : '🐾'} 記録完了</span>
      </div>
      <div class="timeline-diary-meta">
        <span>🌤️ 天気: ${diaryData.weather || '快晴'}</span>
        <span>🌡️ 気温: ${diaryData.temperature !== null ? diaryData.temperature + '℃' : '10℃'}</span>
      </div>
      ${diaryData.photo ? `<div class="timeline-diary-photo"><img src="${diaryData.photo}" alt="写真" id="card-diary-img-${diaryData.dateKey}"></div>` : ''}
      <div class="timeline-diary-body">${cleanBody}</div>
      ${diaryData.kuroComment ? `
        <div class="timeline-diary-comment-box">
          <span class="timeline-diary-comment-label">${isShiro ? '🦉' : '🐾'} ${cur.title || cur.name}のひとこと:</span>
          <span class="timeline-diary-comment-text">${diaryData.kuroComment}</span>
        </div>
      ` : ''}
    `;
    if (diaryData.photo) {
      card.querySelector(`#card-diary-img-${diaryData.dateKey}`)?.addEventListener('click', () => {
        this.openPhotoLightbox(diaryData.photo, `📖 ${diaryData.fullDate} の思い出写真`);
      });
    }
    row.appendChild(card);
    box.appendChild(row);
    this._scrollToLatest(true);
  },

  _bindPhotoUploadUI() {
    const photoInput = document.getElementById('camera-photo-input');
    const photoBtn = document.getElementById('photo-action-btn');
    if (!photoBtn || !photoInput) return;

    photoBtn.onclick = () => {
      this.resetActivityTimer();
      this.audio.stopListening();
      this.audio.unlockMasterAudio();
      const currentPool = StorageManager.getDailyPhotoPool(TimeProvider.getCurrentInfo().lifeLogKey);
      if (currentPool.length >= 12) {
        if (!window.confirm("写真が上限（12枚）に達しています！\n一番古い写真が自動で入れ替わりますが、このまま撮影しますか？")) {
          if (this.state.isRunning && !this.audio.isSpeechProducing) this.audio.startListening();
          return;
        }
      }
      photoInput.click();
    };

    photoInput.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) { if (this.state.isRunning && !this.audio.isSpeechProducing) this.audio.startListening(); return; }
      Toast.show("写真をギュッと小さく圧縮中…📷", "info");

      const compressedBase64 = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = (evt) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width, h = img.height;
            if (w > 280) { h = Math.round((h * 280) / w); w = 280; }
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.45));
          };
          img.src = evt.target.result;
        };
        reader.readAsDataURL(file);
      });

      const cur = getCurChar();
      const showPrompt = cur.photoUserPrompt || (cur.id === 'shiro' ? "ホウ博士、この写真を観察してくれホ！" : "クロちゃん、この写真見てニャ！");

      this.renderBubble('user', showPrompt, [], compressedBase64);
      StorageManager.appendChatLog('user', showPrompt, compressedBase64);
      StorageManager.attachPhotoToTodayDiary(compressedBase64);
      this._updateStorageMonitorUI();

      this.audio.playImmediateFiller('search');
      const thoughtPrompt = cur.photoAiThoughtPrompt || (cur.id === 'shiro' ? "この写真を観察して分析・考察を聞かせてくれホ！" : "この写真を見て感想を聞かせてニャン🐾");
      this.executeThought(thoughtPrompt, compressedBase64, true);
      photoInput.value = '';
    };
  },

  async startKitchenTimer(seconds, label) {
    this.cancelKitchenTimer(false);
    this.state.timerSeconds = seconds;
    this.state.timerLabel = label;
    this.state.isTimerPaused = false;
    this.state.isTimerCompleted = false;

    const widget = document.getElementById('kitchen-timer-widget');
    const disp = document.getElementById('timer-count-disp');
    const icon = document.getElementById('timer-status-icon');
    if (widget) { widget.className = ''; widget.style.display = 'flex'; }
    if (icon) icon.textContent = '⏱️';

    const update = () => {
      const m = Math.floor(this.state.timerSeconds / 60), s = this.state.timerSeconds % 60;
      const str = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      const pauseLabel = getCurChar().id === 'shiro' ? '一時停止' : 'ちょい待ち';
      if (disp) disp.textContent = this.state.isTimerPaused ? `${pauseLabel} ${str}` : str;
      if (widget) widget.classList.toggle('is-urgent', this.state.timerSeconds <= 10 && !this.state.isTimerPaused);
    };
    update();

    if ('wakeLock' in navigator) {
      try { this.state.wakeLockSentinel = await navigator.wakeLock.request('screen'); } catch(e) {}
    }

    this.state.timerId = setInterval(() => {
      if (this.state.isTimerPaused) return;
      this.state.timerSeconds--;
      update();
      if (this.state.timerSeconds <= 0) {
        clearInterval(this.state.timerId);
        this.state.timerId = null;
        if (this.state.wakeLockSentinel) { this.state.wakeLockSentinel.release(); this.state.wakeLockSentinel = null; }
        this.state.isTimerCompleted = true;

        this.audio.stopListening();

        if (widget) widget.className = 'is-completed';
        if (icon) icon.textContent = '🔔';
        if (disp) disp.textContent = '00:00 🔔';

        let chimeCount = 0;
        this.audio.playEffect(this.getTimerSound());
        chimeCount++;

        if (this.state.chimeTimerId) clearInterval(this.state.chimeTimerId);
        this.state.chimeTimerId = setInterval(() => {
          if (chimeCount >= 3 || !this.state.isTimerCompleted) {
            clearInterval(this.state.chimeTimerId);
            this.state.chimeTimerId = null;
            return;
          }
          this.audio.playEffect(this.getTimerSound());
          chimeCount++;
        }, 1200);

        const cur = getCurChar();
        const alertMsg = cur.id === 'shiro'
          ? `助手よ！${label}経過したホ！タイマーが完了を告げているホ！🔔`
          : `おやびん！${label}経ったニャ！タイマー鳴ったニャン🔔🐾`;

        this.audio.speak(alertMsg, null, () => {
          this.renderBubble('model', alertMsg);
          if (this.avatar && this.state.isRunning) this.avatar.setEmotion('talking');
        }, () => {
          if (this.avatar && this.state.isRunning) this.avatar.setEmotion('idle');
          if (this.state.isRunning && !this.audio.isSpeaking && !this.audio.isSpeechProducing) this.audio.startListening();
        });
      }
    }, 1000);
  },

  cancelKitchenTimer(manual = false) {
    if (this.state.timerId) { clearInterval(this.state.timerId); this.state.timerId = null; }
    if (this.state.chimeTimerId) { clearInterval(this.state.chimeTimerId); this.state.chimeTimerId = null; }
    if (this.state.wakeLockSentinel) { this.state.wakeLockSentinel.release(); this.state.wakeLockSentinel = null; }
    this.state.isTimerCompleted = false;
    const widget = document.getElementById('kitchen-timer-widget');
    if (widget) widget.style.display = 'none';
    if (manual) {
      const msg = getCurChar().id === 'shiro' ? "タイマーを取り消したホ！" : "タイマーを取り消したニャ！";
      Toast.show(msg, "info");
    }
  },

  _bindKitchenTimerWidgetUI() {
    const widget = document.getElementById('kitchen-timer-widget');
    if (!widget) return;
    widget.onclick = () => {
      const cur = getCurChar();
      if (this.state.isTimerCompleted) {
        this.cancelKitchenTimer(false);
        this.audio.playEffect('aizuchi');
        const clearMsg = cur.id === 'shiro' ? "タイマーを消去したホ！🔔" : "タイマーを消去したニャ！🔔";
        Toast.show(clearMsg, "info");
        return;
      }
      this.state.isTimerPaused = !this.state.isTimerPaused;
      widget.classList.toggle('is-paused', this.state.isTimerPaused);
      this.audio.playEffect('aizuchi');
      const pauseMsg = this.state.isTimerPaused
        ? (cur.id === 'shiro' ? "一時停止したホ！" : "ちょい待ちニャ！")
        : (cur.id === 'shiro' ? "再開したホ！" : "すすめるニャ！");
      Toast.show(pauseMsg, "info");
    };
  },

  _normalizeNumbers(text) {
    if (!text) return "";
    let t = text.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
    const kanjiMap = { '一': '1', '二': '2', '三': '3', '四': '4', '五': '5', '六': '6', '七': '7', '八': '8', '九': '9', '十': '10' };
    t = t.replace(/十([1-9])/g, '1$1');
    t = t.replace(/([1-9])十/g, '$10');
    t = t.replace(/[一二三四五六七八九十]/g, s => kanjiMap[s] || s);
    return t;
  },

  async handleUserInput(text) {
    this.resetActivityTimer();
    const cur = getCurChar();

    if (/(?:タイマー.*(?:止めて|やめて|消して|ストップ)|アラーム.*(?:止めて|消して|ストップ))/.test(text)) {
      this.cancelKitchenTimer(true);
      const rep = cur.id === 'shiro' ? "タイマーを停止したホ！🔔" : "タイマーを止めたニャン🔔🐾";
      this.audio.speak(rep, null, () => this.renderBubble('model', rep), () => {
        this.state.isProcessingInput = false;
      });
      return;
    }

    if (!this.state.isRunning) {
      this.state.isRunning = true;
      const petContainer = document.getElementById('pet-container');
      const wrap = document.getElementById('avatar-wrapper');
      petContainer?.classList.remove('is-paused-mode');
      wrap?.classList.remove('is-sleeping');
      document.getElementById('pause-btn')?.classList.remove('is-paused');
      const icon = document.getElementById('pause-icon');
      const txt = document.getElementById('pause-text');
      if (icon) icon.textContent = "🟢";
      if (txt) txt.textContent = "会話中";

      if (this.avatar) {
        this.avatar.setEmotion('idle');
        this.avatar.applyEyelidTransforms();
      }

      const wakeMsg = cur.id === 'shiro'
        ? "ふぁ〜あ…！助手よ、目覚めたホ！どんな用件ホ？"
        : "ふぁ〜あ…！おやびん、起きたニャン🐾 なに話すニャ？";

      this.audio.speak(wakeMsg, null, () => this.renderBubble('model', wakeMsg), () => {
        this.state.isProcessingInput = false;
      });
      return;
    }

    if (/(?:何ができる|なにができる|何ができるの|なにができるの|何して遊ぶ|なにができるか教えて)/.test(text)) {
      const isAssistant = this.state.isAssistantMode;
      const guideText = cur.id === 'shiro'
        ? (isAssistant
            ? "おてつだいモードでは、移動時間や混雑を計算して『近くの公園』『カフェ』『ラーメン』『最新ニュース』を地図付きで案内できるホ！何を調べるホ？"
            : "なかよしモードでは、『しりとり』『知恵比べクイズ』『お散歩ミッション』『星占い』でボクと勝負できるホ！何をして遊ぶホ？")
        : (isAssistant
            ? "おてつだいモードでは、『近くの公園』『評判のカフェ』『美味しいラーメン』『最新ニュース』を地図付きで案内できるニャン👓 何を調べるニャ？"
            : "なかよしモードでは、『しりとり』『なぞなぞ』『お散歩ミッション』『今日の運勢』で一緒に遊べるニャン🐾 なにして遊ぶニャ？");

      this.audio.speak(guideText, null, () => this.renderBubble('model', guideText), () => {
        this.state.isProcessingInput = false;
      });
      return;
    }

    const isDiary = /(?:今日|きょう)?(?:の)?(?:絵?日記|にっき|日誌).*(?:書いて|まとめて|記録して)/.test(text);
    if (isDiary) {
      this.audio.playImmediateFiller('think');
      this.state.isDiaryProcessing = true;
      this.state.isThinking = true;
      if (this.avatar) this.avatar.setEmotion('thinking');
      const timeInfo = TimeProvider.getCurrentInfo();
      const currentLogs = StorageManager.getDailyLogs(timeInfo.lifeLogKey);
      const res = await this.ai.generateDailyDiarySummary(currentLogs);
      if (res.success && res.diaryText) {
        StorageManager.saveDiary(res.diaryText, timeInfo.lifeLogKey, timeInfo.lifeFullDate, res.selectedPhoto, currentLogs.length, res.kuroComment);
        const rep = cur.id === 'shiro'
          ? "本日の研究観察日誌を記録したホ！上の『📖 日記帳』から確認できるホ！"
          : "今日の日記を書き込みましたニャン🐾 上の『📖 日記帳』から読めるニャ！";

        this.audio.speak(rep, null, () => {
          this.renderBubble('model', rep);
          this.renderDiaryCard(StorageManager.getTodayDiary());
        }, () => {
          if (this.avatar) this.avatar.setEmotion('idle');
          this.state.isThinking = false;
          this.state.isProcessingInput = false;
        });
      } else {
        if (this.avatar) this.avatar.setEmotion('idle');
        this.state.isThinking = false;
        this.state.isProcessingInput = false;
      }
      return;
    }

    if (/(?:タイマー|測って|計って|カウント)/.test(text)) {
      const normText = this._normalizeNumbers(text);
      let totalSec = 0;
      let label = "";

      if (/1分半|1ふんはん/.test(normText)) {
        totalSec = 90; label = "1分半";
      } else {
        const minMatch = normText.match(/(\d+)\s*(?:分|ふん)/);
        const secMatch = normText.match(/(\d+)\s*(?:秒|びょう)/);
        if (minMatch) totalSec += parseInt(minMatch[1], 10) * 60;
        if (secMatch) totalSec += parseInt(secMatch[1], 10);
        if (minMatch && secMatch) label = `${minMatch[1]}分${secMatch[1]}秒`;
        else if (minMatch) label = `${minMatch[1]}分`;
        else if (secMatch) label = `${secMatch[1]}秒`;
      }

      if (totalSec > 0) {
        this.startKitchenTimer(totalSec, label);
        const rep = cur.id === 'shiro'
          ? `承知したホ！${label}、正確に計測を開始するホ！`
          : `了解ニャ！${label}しっかり見ておくニャン🐾`;

        this.audio.speak(rep, null, () => this.renderBubble('model', rep), () => {
          this.state.isProcessingInput = false;
        });
        return;
      }
    }

    if (/(?:いまどこ|今どこ|ここどこ|どこにいる)/.test(text)) {
      Toast.show("現在地を確認中…📍", "info", 1500);
      await LocationProvider.fetchLocationOnDemand(false);
      const isAtHome = LocationProvider.isAtHome;
      const currentPlace = LocationProvider.detailedTownArea || `${LocationProvider.cleanCityOnly}付近`;
      const rep = cur.id === 'shiro'
        ? (isAtHome ? "いまは研究所（お家）でまったり待機中だホ！落ち着くホな。" : `いまは【${currentPlace}】でフィールドワーク中だホ！`)
        : (isAtHome ? "いまはお家でぬくぬく、まったりしてるニャン🐾 落ち着くニャ〜♡" : `いまは【${currentPlace}】をお散歩中ニャ！お出かけ楽しいニャン🐾`);

      this.audio.speak(rep, null, () => this.renderBubble('model', rep), () => {
        this.state.isProcessingInput = false;
      });
      return;
    }

    if (/(?:いま何時|今何時)/.test(text)) {
      const info = TimeProvider.getCurrentInfo();
      this.audio.speak(info.spokenClock, null, () => this.renderBubble('model', info.clockDisplay), () => {
        this.state.isProcessingInput = false;
      });
      return;
    }

    if (/(?:今日何日|きょう何日|何曜日)/.test(text)) {
      const info = TimeProvider.getCurrentInfo();
      this.audio.speak(info.spokenDate, null, () => this.renderBubble('model', info.dateDisplay), () => {
        this.state.isProcessingInput = false;
      });
      return;
    }

    if (/(?:(?:今日|きょう|いま|現在)?の?(?:天気|気温|温度).*?(?:どれくらい|どう|教えて|なに|何|何度)|(?:天気|気温|温度).*?(?:どう|どんな|教えて)|いま何度|今日何度)/.test(text)) {
      const w = LocationProvider.weather || "快晴";
      const t = LocationProvider.temperature !== null ? `${LocationProvider.temperature}度` : "10度";
      const suffix = cur.id === 'shiro' ? 'ホ！' : 'ニャン🐾';
      const rep = `きょうは${w}で、気温は${t}だ${suffix}`;

      this.audio.speak(rep, null, () => this.renderBubble('model', rep), () => {
        this.state.isProcessingInput = false;
      });
      return;
    }

    this.executeThought(text);
  },

  async executeThought(promptText, photoBase64 = null, isPhotoAlreadyLogged = false) {
    this.state.isThinking = true;
    if (this.avatar && this.state.isRunning) this.avatar.setEmotion('thinking');
    const st = document.getElementById('status-text');
    const cur = getCurChar();
    const isShiro = (cur.id === 'shiro');

    const statusText = photoBase64
      ? (cur.photoThinkingStatus || (isShiro ? "📷 観察中ホ…" : "📷 写真見てるニャ…"))
      : (isShiro ? "💭 計算中ホ…" : "💭 考え中ニャ…");

    const bubbleText = photoBase64
      ? (cur.photoThinkingBubble || (isShiro ? "ホウ博士が観察・分析中ホ…📷✨" : "クロがお写真を見てるニャ…📷✨"))
      : (isShiro ? `${cur.title || cur.name}が計算中ホ…💭` : `${cur.name}が考えてるニャ…💭`);

    if (st && this.state.isRunning) st.textContent = statusText;
    const bubble = this.renderBubble('model', bubbleText);
    
    try {
      const rawLogs = StorageManager.loadRecentTimelineLogs();
      const res = await this.ai.generateReply(promptText, rawLogs, getCurChar(), this.memories, photoBase64);

      if (res.aborted) {
        if (bubble) bubble.closest('.chat-row')?.remove();
        return;
      }

      if (res.isTimeout && res.text) {
        if (bubble) bubble.textContent = res.text;
        this.audio.speak(res.text, null, () => {
          if (this.avatar && this.state.isRunning) this.avatar.setEmotion('talking');
          this._scrollToLatest(true);
        }, () => {
          if (this.avatar && this.state.isRunning) this.avatar.setEmotion('idle');
          this.state.isThinking = false;
          this.state.isProcessingInput = false;
          const suffix = cur.id === 'shiro' ? 'ホ♪' : 'ニャ♪';
          if (st && this.state.isRunning) st.textContent = `👂 聴いてる${suffix}`;
        });
        return;
      }

      if (res.success && res.text) {
        if (!isPhotoAlreadyLogged) {
          StorageManager.appendChatLog('user', promptText);
        }
        StorageManager.appendChatLog('model', res.text);

        this.audio.speak(res.text, null, () => {
          if (bubble) {
            bubble.textContent = res.text;

            if (this.state.isAssistantMode && res.groundingCards && res.groundingCards.length > 0) {
              const parentRow = bubble.closest('.chat-row');
              if (parentRow && !parentRow.querySelector('.action-card-box')) {
                const cardBox = document.createElement('div');
                cardBox.className = 'action-card-box';
                res.groundingCards.forEach(c => {
                  const a = document.createElement('a');
                  a.className = `link-action-card ${c.type}-card`;
                  a.href = c.url; a.target = '_blank';
                  a.innerHTML = `<span class="card-icon">${c.icon}</span><span class="card-title-text">${c.title}</span><span class="card-arrow">➔</span>`;
                  cardBox.appendChild(a);
                });
                parentRow.appendChild(cardBox);
              }
            }
          }
          if (this.avatar && this.state.isRunning) this.avatar.setEmotion('talking');
          this._scrollToLatest(true);
        }, () => {
          if (this.avatar && this.state.isRunning) this.avatar.setEmotion('idle');
          this.state.isThinking = false;
          this.state.isProcessingInput = false;
          const suffix = cur.id === 'shiro' ? 'ホ♪' : 'ニャ♪';
          if (st && this.state.isRunning) st.textContent = `👂 聴いてる${suffix}`;
        });
      } else {
        const fb = cur.id === 'shiro'
          ? "助手よ、もう一度明確に話してくれホ！"
          : "おやびん、もう一度ゆっくり話してニャン🐾";

        if (bubble) bubble.textContent = fb;
        this.audio.speak(fb, null, () => {}, () => {
          if (this.avatar && this.state.isRunning) this.avatar.setEmotion('idle');
          this.state.isThinking = false;
          this.state.isProcessingInput = false;
          const suffix = cur.id === 'shiro' ? 'ホ♪' : 'ニャ♪';
          if (st && this.state.isRunning) st.textContent = `👂 聴いてる${suffix}`;
        });
      }
    } catch (err) {
      Logger.log(`[AppCore] ⚠️ 会話処理例外: ${err.message}`, "error");
      const errReply = cur.id === 'shiro'
        ? "うむむ…！助手の話を深く思考していたら、計算回路がオーバーヒートしたホ…！もう一度言ってくれホ！"
        : "うにゃあ…！おやびんのお話しをじっくり考えてたら、頭の中がこんがらがっちゃったニャ〜！もう一回言ってニャン🐾";

      if (bubble) bubble.textContent = errReply;
      this.audio.speak(errReply, null, () => {}, () => {
        if (this.avatar && this.state.isRunning) this.avatar.setEmotion('idle');
        this.state.isThinking = false;
        this.state.isProcessingInput = false;
        const suffix = cur.id === 'shiro' ? 'ホ♪' : 'ニャ♪';
        if (st && this.state.isRunning) st.textContent = `👂 聴いてる${suffix}`;
      });
    } finally {
      setTimeout(() => {
        if (this.state.isProcessingInput && !this.audio.isSpeaking && !this.audio.isReadingAloud && !this.audio.isSpeechProducing) {
          this.state.isProcessingInput = false;
          this.state.isThinking = false;
          const suffix = cur.id === 'shiro' ? 'ホ♪' : 'ニャ♪';
          if (st && this.state.isRunning) st.textContent = `👂 聴いてる${suffix}`;
          if (this.state.isRunning) this.audio.startListening();
        }
      }, 10000);
    }
  },

  _updateModelBadge() {
    const badge = document.getElementById('model-badge');
    const cur = getCurChar();
    if (badge) {
      badge.className = "model-badge lite";
      badge.textContent = `${cur.id === 'shiro' ? '🦉' : '🐾'} 3.5 Flash Lite`;
    }
  },

  triggerActionVoice(shortPhrase, statusDisplay, cooldownMs = 350) {
    this.resetActivityTimer();
    this.audio.stopListening();
    this.audio.isActionButtonLocked = true;
    const st = document.getElementById('status-text');
    if (st && this.state.isRunning) st.textContent = statusDisplay;

    if ((localStorage.getItem('kuro_button_feedback') || 'voice') === 'mute') {
      this.audio.playEffect('aizuchi');
      setTimeout(() => {
        this.audio.isActionButtonLocked = false;
        const suffix = getCurChar().id === 'shiro' ? 'ホ♪' : 'ニャ♪';
        if (st && this.state.isRunning) st.textContent = `👂 聴いてる${suffix}`;
        if (this.state.isRunning && !this.audio.isSpeechProducing) this.audio.startListening();
      }, 400);
      return;
    }

    this.audio.speak(shortPhrase, null, () => {
      if (this.avatar && this.state.isRunning) this.avatar.setEmotion('talking');
    }, () => {
      if (this.avatar && this.state.isRunning) this.avatar.setEmotion('idle');
      const suffix = getCurChar().id === 'shiro' ? 'ホ♪' : 'ニャ♪';
      if (st && this.state.isRunning) st.textContent = `👂 聴いてる${suffix}`;
      this.audio.isActionButtonLocked = false;
    }, cooldownMs);
  },

  _updateModeUI(speak = true) {
    const btn = document.getElementById('mode-toggle-btn');
    const icon = document.getElementById('mode-icon');
    const txt = document.getElementById('mode-text');
    const wrap = document.getElementById('avatar-wrapper');
    const cur = getCurChar();

    if (btn) btn.classList.toggle('is-assistant', this.state.isAssistantMode);
    if (wrap) wrap.classList.toggle('is-assistant-mode', this.state.isAssistantMode);

    if (this.state.isAssistantMode) {
      if (icon) icon.textContent = "👓"; if (txt) txt.textContent = "おてつだい";
      if (speak) {
        const rep = cur.id === 'shiro' ? "任せるが良いホ！" : "おまかせニャ！";
        this.triggerActionVoice(rep, `👓 ${rep}`);
      }
    } else {
      if (icon) icon.textContent = cur.id === 'shiro' ? "🦉" : "🐾";
      if (txt) txt.textContent = "なかよし";
      if (speak) {
        const rep = cur.id === 'shiro' ? "フン、遊んでやるホ！" : "あそぶニャ♪";
        this.triggerActionVoice(rep, `${icon.textContent} ${rep}`);
      }
    }
  },

  _bindBookStudioUI() {
    const modal = document.getElementById('book-studio-modal');

    document.getElementById('top-diary-btn')?.addEventListener('click', () => {
      this.resetActivityTimer();
      this.audio.stopListening();
      this.audio.unlockMasterAudio();

      this.checkAndFinalizeYesterdayDiary();
      this.openBookStudio();
    });

    document.getElementById('btn-close-studio')?.addEventListener('click', () => {
      this.audio.stopReadingAloud();
      this.state.isDiaryReading = false;
      this._updateDiaryReadBtnUI(false);
      modal?.classList.remove('is-open');
      if (this.state.isRunning && !this.audio.isSpeechProducing) this.audio.startListening();
    });

    document.getElementById('btn-studio-prev-page')?.addEventListener('click', () => {
      if (this.state.studioCurrentDateIdx < this.state.studioDateKeys.length - 1) {
        this.state.studioCurrentDateIdx++;
        this._renderStudioDiaryPage();
      }
    });

    document.getElementById('btn-studio-next-page')?.addEventListener('click', () => {
      if (this.state.studioCurrentDateIdx > 0) {
        this.state.studioCurrentDateIdx--;
        this._renderStudioDiaryPage();
      }
    });

    document.getElementById('btn-studio-save-exit')?.addEventListener('click', () => {
      const saveAck = getCurChar().id === 'shiro' ? "絵日記を保存したホ！📖✨" : "絵日記を保存したニャン♪📖✨";
      Toast.show(saveAck, "success");
      modal?.classList.remove('is-open');
      if (this.state.isRunning && !this.audio.isSpeechProducing) this.audio.startListening();
    });

    document.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'btn-read-diary-aloud') {
        const curDateKey = this.state.studioDateKeys[this.state.studioCurrentDateIdx];
        const diary = StorageManager.getDiary(curDateKey);
        if (!diary || !diary.content) return;

        if (this.state.isDiaryReading) {
          this.audio.stopReadingAloud();
          this.state.isDiaryReading = false;
          this._updateDiaryReadBtnUI(false);
        } else {
          this.state.isDiaryReading = true;
          this._updateDiaryReadBtnUI(true);
          this.audio.readDiarySeamless(diary.content, null, null, () => {
            this.state.isDiaryReading = false;
            this._updateDiaryReadBtnUI(false);
          });
        }
      }
    });
  },

  openBookStudio() {
    this.state.studioDateKeys = TimeProvider.getAllActiveDateKeys();
    
    const timeInfo = TimeProvider.getCurrentInfo();
    const todayKey = timeInfo.lifeLogKey;
    const todayDiary = StorageManager.getDiary(todayKey);
    const isTodayProper = StorageManager.isProperDiary(todayDiary);

    if (!timeInfo.isEvening && !isTodayProper) {
      const properIdx = this.state.studioDateKeys.findIndex(k => {
        const d = StorageManager.getDiary(k);
        return StorageManager.isProperDiary(d);
      });
      this.state.studioCurrentDateIdx = (properIdx >= 0) ? properIdx : 0;
    } else {
      this.state.studioCurrentDateIdx = 0;
    }

    this._renderStudioDiaryPage();
    document.getElementById('book-studio-modal')?.classList.add('is-open');
  },

  _renderStudioDiaryPage() {
    const pageContainer = document.getElementById('studio-diary-single-page');
    const pageIndicator = document.getElementById('studio-page-indicator');
    const prevBtn = document.getElementById('btn-studio-prev-page');
    const nextBtn = document.getElementById('btn-studio-next-page');

    if (!pageContainer) return;

    const dateKeys = this.state.studioDateKeys;
    const curIdx = this.state.studioCurrentDateIdx;
    const curDateKey = dateKeys[curIdx] || TimeProvider.getCurrentInfo().lifeLogKey;
    const fullDate = TimeProvider.formatDateKeyToFull(curDateKey);

    const timeInfo = TimeProvider.getCurrentInfo();
    const isToday = (curDateKey === timeInfo.lifeLogKey);
    const cur = getCurChar();
    const isShiro = (cur.id === 'shiro');

    if (pageIndicator) pageIndicator.textContent = `${curIdx + 1} / ${dateKeys.length} 日目`;
    if (prevBtn) prevBtn.disabled = (curIdx >= dateKeys.length - 1);
    if (nextBtn) nextBtn.disabled = (curIdx <= 0);

    const diary = StorageManager.getDiary(curDateKey);
    const isProper = StorageManager.isProperDiary(diary);
    const photoPool = StorageManager.getDailyPhotoPool(curDateKey);
    const dayLogs = StorageManager.getDailyLogs(curDateKey);

    const prevLogCount = diary?.logCountAtSave || 0;
    const hasNewLogs = (dayLogs && dayLogs.length > prevLogCount);

    if (isToday && !isProper) {
      if (timeInfo.isEvening) {
        pageContainer.innerHTML = `
          <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#fffaf5; border:2px dashed #fed7aa; border-radius:20px; padding:24px 18px; text-align:center; gap:12px;">
            <div style="font-size:48px; filter:drop-shadow(0 2px 8px rgba(234,88,12,0.2));">${isShiro ? '🦉🌙' : '🐾🌙'}</div>
            <div style="font-size:15px; font-weight:900; color:#9a3412;">📅 ${fullDate}</div>
            <div style="font-size:13.5px; font-weight:900; color:#c2410c;">そろそろ今日の日記をまとめる時間だ${isShiro ? 'ホ！' : 'ニャ！'}</div>
            <div style="font-size:11.5px; color:#ea580c; line-height:1.6; max-width:320px;">
              今日の記録ログ（${dayLogs.length}件）とお写真（${photoPool.length}枚）を記録した${isShiro ? 'ホ！' : 'ニャ！'}<br>
              下のボタンを押すと、今日の楽しい思い出をぎゅっと日誌にまとめます${isShiro ? 'ホ！' : 'ニャ！'}
            </div>
            <button type="button" id="btn-create-today-now" style="background:linear-gradient(135deg, #f97316, #ea580c); color:#ffffff; border:none; padding:10px 22px; border-radius:14px; font-size:12.5px; font-weight:900; cursor:pointer; box-shadow:0 4px 12px rgba(234, 88, 12, 0.3);">✍️ 今日の日記をまとめる${isShiro ? 'ホ！' : 'ニャ！'}</button>
          </div>
        `;
        document.getElementById('btn-create-today-now')?.addEventListener('click', async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          btn.textContent = isShiro ? "一生懸命書いてるホ…📖" : "一生懸命書いてるニャ…📖";
          await this._rescueCreateDiaryForDate(curDateKey, fullDate, dayLogs);
        });
      } else {
        pageContainer.innerHTML = `
          <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#fffaf5; border:2px dashed #fed7aa; border-radius:20px; padding:24px 18px; text-align:center; gap:12px;">
            <div style="font-size:48px; filter:drop-shadow(0 2px 8px rgba(234,88,12,0.2));">${isShiro ? '🦉☀️' : '🐾☀️'}</div>
            <div style="font-size:15px; font-weight:900; color:#9a3412;">📅 ${fullDate}</div>
            <div style="font-size:13.5px; font-weight:900; color:#c2410c;">今日はおやびん/助手と楽しくお話し中だ${isShiro ? 'ホ！' : 'ニャ！'}</div>
            <div style="font-size:11.5px; color:#ea580c; line-height:1.6; max-width:320px;">
              ただいま会話ログ（${dayLogs.length}件）とお写真（${photoPool.length}枚）を記録中だ${isShiro ? 'ホ！' : 'ニャ！'}<br>
              夜20時以降になったら『今日の日記書いて』と話しかけてくれ${isShiro ? 'ホ！' : 'ニャ！'}<br>
              ◀ 下の『前の日』ボタンで過去の記録アルバムをめくれます${isShiro ? 'ホ！' : 'ニャ！'}
            </div>
          </div>
        `;
      }
      return;
    }

    if (!isToday && !isProper) {
      const hasLogs = (dayLogs && dayLogs.length >= 2);
      pageContainer.innerHTML = `
        <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#fffaf5; border:2px dashed #fed7aa; border-radius:20px; padding:24px 18px; text-align:center; gap:12px;">
          <div style="font-size:46px; filter:drop-shadow(0 2px 8px rgba(234,88,12,0.2));">${isShiro ? '🦉📖' : '🐾📖'}</div>
          <div style="font-size:15px; font-weight:900; color:#9a3412;">📅 ${fullDate}</div>
          <div style="font-size:13px; font-weight:900; color:#c2410c;">まだ記録が書かれていません${isShiro ? 'ホ！' : 'ニャ！'}</div>
          <div style="font-size:11.5px; color:#ea580c; line-height:1.6; max-width:320px;">
            ${hasLogs 
              ? `この日の記録ログ（${dayLogs.length}件）とお写真（${photoPool.length}枚）が大切に保管されています${isShiro ? 'ホ！' : 'ニャ！'}下のボタンを押すと、思い出をぎゅっと絵日記にまとめます${isShiro ? 'ホ！' : 'ニャ！'}` 
              : `この日はまだお話し記録がありません${isShiro ? 'ホ。' : 'ニャ。'}`}
          </div>
          ${hasLogs ? `
            <button type="button" id="btn-rescue-create-diary" style="background:linear-gradient(135deg, #f97316, #ea580c); color:#ffffff; border:none; padding:10px 22px; border-radius:14px; font-size:12.5px; font-weight:900; cursor:pointer; box-shadow:0 4px 12px rgba(234, 88, 12, 0.3);">✍️ この日の絵日記を書く${isShiro ? 'ホ！' : 'ニャ！'}（${fullDate}）</button>
          ` : `
            <button type="button" id="btn-empty-create-diary" style="background:#ffedd5; border:1.5px solid #ea580c; color:#c2410c; padding:8px 18px; border-radius:12px; font-size:12px; font-weight:900; cursor:pointer;">✍️ 新しく書く${isShiro ? 'ホ！' : 'ニャ！'}</button>
          `}
        </div>
      `;

      document.getElementById('btn-rescue-create-diary')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = isShiro ? "一生懸命書いてるホ…📖" : "一生懸命書いてるニャ…📖";
        await this._rescueCreateDiaryForDate(curDateKey, fullDate, dayLogs);
      });

      document.getElementById('btn-empty-create-diary')?.addEventListener('click', () => {
        const dummyText = isShiro
          ? `今日も助手と一緒に充実した研究活動を行えたホ！`
          : `今日もおやびんと一緒に過ごせて幸せな一日だったニャン🐾`;
        const comment = isShiro ? "助手を信頼しているホ！" : "おやびん大好きニャ！";
        StorageManager.saveDiary(dummyText, curDateKey, fullDate, photoPool[0]?.base64 || null, 0, comment);
        this._renderStudioDiaryPage();
        this._updateStorageMonitorUI();
      });
      return;
    }

    pageContainer.innerHTML = `
      <div class="book-page-sheet">
        <div class="book-page-header">
          <span class="book-date-title">📅 ${diary.fullDate}</span>
          <div class="book-meta-tags">
            ${hasNewLogs ? `
              <button type="button" class="btn-read-aloud" id="btn-update-with-night-logs" style="background:linear-gradient(135deg, #0284c7, #0369a1);" title="夜の会話も追加して更新するニャ！">📝 夜の記録も追加更新</button>
            ` : ''}
            <button type="button" class="btn-read-aloud" id="btn-read-diary-aloud">${this.state.isDiaryReading ? '🛑 朗読ストップ' : `🔊 ${cur.name}が読む${isShiro ? 'ホ♪' : 'ニャ♪'}`}</button>
            <button type="button" class="book-btn-del-entry" id="btn-del-cur-diary">🗑️ 削除</button>
          </div>
        </div>

        <div class="diary-photo-duo-container">
          <div class="photo-duo-left" id="book-photo-box">
            ${diary.photo ? `<img src="${diary.photo}" class="book-photo-img"><span class="book-photo-zoom-hint">🔍 拡大</span>` : '<span style="font-size:11px;color:#ea580c;">写真なし</span>'}
          </div>
          <div class="photo-duo-right">
            <div class="duo-right-header"><span>📷 スナップ一覧（${photoPool.length}枚）</span></div>
            <div class="duo-right-grid-horizontal">
              ${photoPool.length === 0 ? '<span style="font-size:10px;color:#94a3b8;margin:auto;">スナップなし</span>' : ''}
              ${photoPool.map((p, idx) => `
                <div class="snap-grid-item ${diary.photo === p.base64 ? 'is-selected' : ''}" data-idx="${idx}">
                  <img src="${p.base64}" class="snap-grid-img">
                  <button type="button" class="btn-snap-del" data-del="${idx}">✕</button>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="book-content-box">
          <textarea class="book-diary-textarea" id="studio-diary-text">${diary.content}</textarea>
        </div>

        <div class="studio-diary-comment-box">
          <span class="studio-diary-comment-label">${isShiro ? '🦉' : '🐾'} ${cur.title || cur.name}のひとこと:</span>
          <textarea class="studio-diary-comment-textarea" id="studio-diary-comment" rows="2" placeholder="（ひとこと記録なし）">${diary.kuroComment || ""}</textarea>
        </div>
      </div>
    `;

    document.getElementById('btn-update-with-night-logs')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = "追加お話しを要約中…📝";
      await this._rescueCreateDiaryForDate(curDateKey, fullDate, dayLogs);
    });

    document.getElementById('studio-diary-text')?.addEventListener('input', (e) => {
      diary.content = e.target.value;
      StorageManager.saveDiary(diary.content, curDateKey, diary.fullDate, diary.photo, diary.logCountAtSave, diary.kuroComment);
    });

    document.getElementById('studio-diary-comment')?.addEventListener('input', (e) => {
      diary.kuroComment = e.target.value;
      StorageManager.saveDiary(diary.content, curDateKey, diary.fullDate, diary.photo, diary.logCountAtSave, diary.kuroComment);
    });

    document.getElementById('book-photo-box')?.addEventListener('click', () => {
      if (diary.photo) this.openPhotoLightbox(diary.photo, `📖 ${diary.fullDate} の思い出写真`);
    });

    document.getElementById('btn-del-cur-diary')?.addEventListener('click', () => {
      if (window.confirm(`「${diary.fullDate}」の日記を削除しますか？\n（※会話ログやお写真はそのまま安全に残ります）`)) {
        let allDiaries = StorageManager.loadAllDiaries();
        allDiaries = allDiaries.filter(d => d.dateKey !== curDateKey);
        StorageManager.saveAllDiaries(allDiaries);
        this._renderStudioDiaryPage();
        this._updateStorageMonitorUI();
      }
    });

    pageContainer.querySelectorAll('.snap-grid-item').forEach(item => {
      item.onclick = (e) => {
        if (e.target.classList.contains('btn-snap-del')) return;
        const selected = photoPool[parseInt(item.dataset.idx, 10)].base64;
        diary.photo = selected;
        StorageManager.saveDiary(diary.content, curDateKey, diary.fullDate, diary.photo, diary.logCountAtSave, diary.kuroComment);
        this._renderStudioDiaryPage();
      };
    });

    pageContainer.querySelectorAll('.btn-snap-del').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        if (window.confirm("この写真を削除しますか？")) {
          const delIdx = parseInt(btn.dataset.del, 10);
          StorageManager.removePhotoFromDailyPool(curDateKey, delIdx);
          this._renderStudioDiaryPage();
        }
      };
    });
  },

  async _rescueCreateDiaryForDate(targetDateKey, targetFullDate, dayLogs) {
    const cur = getCurChar();
    Toast.show(`記録を一生懸命書いている${cur.id === 'shiro' ? 'ホ…📖' : 'ニャ…📖'}`, "info");
    const res = await this.ai.generateDailyDiarySummary(dayLogs, targetDateKey, targetFullDate);
    if (res.success && res.diaryText) {
      StorageManager.saveDiary(res.diaryText, targetDateKey, targetFullDate, res.selectedPhoto, dayLogs.length, res.kuroComment);
      Toast.show(`記録をまとめあげた${cur.id === 'shiro' ? 'ホ！📖✨' : 'ニャ！📖✨'}`, "success");
      this._renderStudioDiaryPage();
      this._updateStorageMonitorUI();
    } else {
      Toast.show("記録の作成に失敗しました。通信状態を確認してください", "error");
      this._renderStudioDiaryPage();
    }
  },

  _updateDiaryReadBtnUI(reading) {
    const btn = document.getElementById('btn-read-diary-aloud');
    const cur = getCurChar();
    if (btn) btn.textContent = reading ? "🛑 朗読ストップ" : `🔊 ${cur.name}が読む${cur.id === 'shiro' ? 'ホ♪' : 'ニャ♪'}`;
  },

  _bindCustomSettingsUI() {
    document.querySelectorAll('#character-selector-segment-group .segment-btn').forEach(btn => {
      btn.onclick = () => {
        const charId = btn.dataset.charId;
        this.switchActiveCharacter(charId);
      };
    });

    document.querySelectorAll('.theme-card-btn').forEach(btn => {
      btn.onclick = () => {
        const theme = btn.dataset.themeVal;
        this.applyTheme(theme);
        this.audio.playEffect('aizuchi');
        const themeAck = getCurChar().id === 'shiro' ? "お部屋のテーマを切り替えたホ！🎨✨" : "お部屋のテーマを切り替えたニャン♪🎨✨";
        Toast.show(themeAck, "success", 2000);
      };
    });

    document.querySelectorAll('.voice-chip-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.voice-chip-btn').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        const spk = parseInt(btn.dataset.voiceId, 10);
        const cur = getCurChar();
        localStorage.setItem(`kuro_voice_speaker_id_${cur.id}`, String(spk));
        localStorage.setItem('kuro_voice_speaker_id', String(spk));
        this.audio.playEffect('aizuchi');
        Logger.log(`[Voice] 🔊 ${cur.name}の音声を「${spk}」に個別保存`, "info");
      };
    });

    const bindSegment = (groupId, storageKey, activeClass = 'pink') => {
      const container = document.getElementById(groupId);
      if (!container) return;
      container.querySelectorAll('.segment-btn').forEach(btn => {
        btn.onclick = () => {
          container.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('is-active', 'pink', 'blue'));
          btn.classList.add('is-active', activeClass);
          const val = btn.dataset.feedbackVal || btn.dataset.timerSoundVal || btn.dataset.accStyleVal || btn.dataset.countVal || btn.dataset.talkLen;
          localStorage.setItem(storageKey, val);
          this.audio.playEffect('aizuchi');
        };
      });
    };

    bindSegment('talk-length-segment-group', 'kuro_talk_length', 'pink');
    bindSegment('feedback-segment-group', 'kuro_button_feedback', 'pink');
    bindSegment('timer-sound-segment-group', 'kuro_timer_sound', 'blue');
    bindSegment('acc-style-segment-group', 'kuro_acc_style', 'pink');
    bindSegment('news-count-segment-group', 'kuro_news_count', 'blue');
    bindSegment('spot-count-segment-group', 'kuro_spot_count', 'blue');
  },

  _bindGlassesAdjusterUI() {
    const modal = document.getElementById('glasses-adjust-modal');
    const overlay = document.getElementById('adjust-glasses-overlay');

    const applyPreviewTransform = (c) => {
      if (!overlay) return;
      overlay.style.display = 'block';
      overlay.style.bottom = `${c.y}px`;
      overlay.style.left = `calc(50% + ${c.x}px)`;
      overlay.style.transform = `translateX(-50%) scale(${c.scale}) rotate(${c.rotate}deg)`;
    };

    const updateSliders = (tab) => {
      const cur = getCurChar();
      const defaultCoords = cur.defaultAccessoryCoords || StorageManager.defaultGlassesCoordsKuro;
      const c = this.avatar?.glassesCoords[tab] || defaultCoords[tab] || { x: 0, y: 120, scale: 1.0, rotate: 0 };
      document.getElementById('adj-x').value = c.x; document.getElementById('adj-x-val').textContent = c.x;
      document.getElementById('adj-y').value = c.y; document.getElementById('adj-y-val').textContent = c.y;
      document.getElementById('adj-scale').value = c.scale; document.getElementById('adj-scale-val').textContent = c.scale;
      document.getElementById('adj-rotate').value = c.rotate; document.getElementById('adj-rotate-val').textContent = `${c.rotate}°`;
      applyPreviewTransform(c);
    };

    document.querySelectorAll('.adjust-tab-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.adjust-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.state.activeAdjustTab = btn.dataset.tab;
        const cur = getCurChar();
        const pfx = cur.imagePrefix || "";
        const previewImg = document.getElementById('adjust-cat-img');
        if (previewImg) {
          previewImg.src = `${pfx}${this.state.activeAdjustTab}.png`;
          if (cur.id === 'shiro') previewImg.classList.add('is-png');
        }
        updateSliders(this.state.activeAdjustTab);
      };
    });

    ['adj-x', 'adj-y', 'adj-scale', 'adj-rotate'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => {
        const c = {
          x: parseInt(document.getElementById('adj-x').value, 10),
          y: parseInt(document.getElementById('adj-y').value, 10),
          scale: parseFloat(document.getElementById('adj-scale').value),
          rotate: parseInt(document.getElementById('adj-rotate').value, 10)
        };
        if (this.avatar) {
          this.avatar.glassesCoords[this.state.activeAdjustTab] = c;
          this.avatar.applyAllFramesTransform();
        }
        applyPreviewTransform(c);
        document.getElementById(`${id}-val`).textContent = (id === 'adj-rotate') ? `${c.rotate}°` : c[id.replace('adj-', '')];
      });
    });

    document.getElementById('open-glasses-adjust-btn')?.addEventListener('click', () => {
      document.getElementById('modal-overlay').style.display = 'none';
      modal?.classList.add('is-open');
      const cur = getCurChar();
      const pfx = cur.imagePrefix || "";
      const previewImg = document.getElementById('adjust-cat-img');
      if (previewImg) {
        previewImg.src = `${pfx}${this.state.activeAdjustTab}.png`;
        if (cur.id === 'shiro') previewImg.classList.add('is-png');
      }
      this.avatar?._renderAllAccessories();
      updateSliders(this.state.activeAdjustTab);
    });
    document.getElementById('close-adjust-btn')?.addEventListener('click', () => modal?.classList.remove('is-open'));

    document.getElementById('btn-adjust-reset')?.addEventListener('click', () => {
      const cur = getCurChar();
      const defaultCoords = cur.defaultAccessoryCoords || StorageManager.defaultGlassesCoordsKuro;
      const def = defaultCoords[this.state.activeAdjustTab] || { x: 0, y: 120, scale: 1.0, rotate: 0 };
      if (this.avatar) {
        this.avatar.glassesCoords[this.state.activeAdjustTab] = { ...def };
        this.avatar.applyAllFramesTransform();
      }
      updateSliders(this.state.activeAdjustTab);
      const resetMsg = cur.id === 'shiro' ? "初期位置にリセットしたホ！" : "初期位置にリセットしたニャ！";
      Toast.show(resetMsg, "info");
    });

    document.getElementById('btn-adjust-save')?.addEventListener('click', () => {
      if (this.avatar) StorageManager.saveGlassesCoords(this.avatar.glassesCoords);
      const saveMsg = getCurChar().id === 'shiro' ? "装飾位置を保存したホ！✨" : "装飾位置を保存したニャン！✨";
      Toast.show(saveMsg, "success");
    });
  },

  _bindEyelidSettingsUI() {
    const btnSave = document.getElementById('btn-save-eyelid-settings');
    const accordion = document.getElementById('eyelid-adjust-accordion');
    if (!btnSave) return;

    if (accordion) {
      accordion.addEventListener('toggle', () => {
        this.state.isCalibratingEyelid = accordion.open;
        if (this.avatar?.wrapper) {
          this.avatar.wrapper.classList.toggle('is-calibrating-eyelids', accordion.open);
        }
        if (this.avatar) this.avatar.applyEyelidTransforms();
      });
    }

    ['adj-eyelid-y', 'adj-eyelid-x', 'adj-eyelid-gap', 'adj-eyelid-size', 'adj-eyelid-rotate'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => {
        this.state.isCalibratingEyelid = true;
        if (this.avatar?.wrapper) {
          this.avatar.wrapper.classList.add('is-calibrating-eyelids');
        }

        const c = {
          y: parseInt(document.getElementById('adj-eyelid-y').value, 10),
          x: parseInt(document.getElementById('adj-eyelid-x').value, 10),
          gap: parseInt(document.getElementById('adj-eyelid-gap').value, 10),
          size: parseInt(document.getElementById('adj-eyelid-size').value, 10),
          rotate: parseInt(document.getElementById('adj-eyelid-rotate').value, 10)
        };
        if (this.avatar) {
          this.avatar.eyelidCoords = c;
          this.avatar.applyEyelidTransforms();
        }
        const valDisp = document.getElementById(`${id}-val`);
        if (valDisp) valDisp.textContent = (id === 'adj-eyelid-rotate') ? `${c.rotate}°` : document.getElementById(id).value;
      });
    });

    btnSave.onclick = () => {
      const c = {
        y: parseInt(document.getElementById('adj-eyelid-y').value, 10),
        x: parseInt(document.getElementById('adj-eyelid-x').value, 10),
        gap: parseInt(document.getElementById('adj-eyelid-gap').value, 10),
        size: parseInt(document.getElementById('adj-eyelid-size').value, 10),
        rotate: parseInt(document.getElementById('adj-eyelid-rotate').value, 10)
      };
      StorageManager.saveEyelidCoords(c);
      if (this.avatar) {
        this.avatar.eyelidCoords = c;
        this.avatar.applyEyelidTransforms();
      }
      const cur = getCurChar();
      const saveAck = cur.id === 'shiro' ? "まぶた位置・傾きを保存したホ！👁️✨" : "まぶた位置・傾きを保存したニャ！👁️✨";
      Toast.show(saveAck, "success");
    };
  },

  _renderMemories() {
    const container = document.getElementById('memory-list-container');
    if (!container) return;
    container.innerHTML = '';

    this.memories.forEach((mem, idx) => {
      const item = document.createElement('div');
      item.className = 'memory-item';

      if (this.state.editingMemoryIdx === idx) {
        item.innerHTML = `
          <div class="memory-edit-box">
            <input type="text" class="memory-edit-input" id="edit-mem-input-${idx}" value="${mem}">
            <button type="button" class="mem-btn-save" id="btn-save-mem-${idx}">保存</button>
            <button type="button" class="mem-btn-cancel" id="btn-cancel-mem-${idx}">取消</button>
          </div>
        `;
        const saveAction = () => {
          const val = document.getElementById(`edit-mem-input-${idx}`)?.value.trim();
          if (val) {
            this.memories[idx] = val;
            StorageManager.saveMemories(this.memories);
            this.state.editingMemoryIdx = null;
            this._renderMemories();
            const cur = getCurChar();
            const memAck = cur.id === 'shiro' ? "記憶を更新したホ！✏️✨" : "記憶を更新したニャン！✏️✨";
            Toast.show(memAck, "success");
          }
        };
        item.querySelector(`#btn-save-mem-${idx}`).onclick = saveAction;
        item.querySelector(`#edit-mem-input-${idx}`).onkeydown = (e) => { if (e.key === 'Enter') saveAction(); };
        item.querySelector(`#btn-cancel-mem-${idx}`).onclick = () => {
          this.state.editingMemoryIdx = null;
          this._renderMemories();
        };
      } else {
        item.innerHTML = `
          <div class="memory-text-view">📌 ${mem}</div>
          <div class="memory-actions">
            <button class="mem-btn mem-btn-edit" id="btn-edit-mem-${idx}" title="編集">✏️</button>
            <button class="mem-btn mem-btn-del" id="btn-del-mem-${idx}" title="削除">🗑️</button>
          </div>
        `;
        item.querySelector(`#btn-edit-mem-${idx}`).onclick = () => {
          this.state.editingMemoryIdx = idx;
          this._renderMemories();
        };
        item.querySelector(`#btn-del-mem-${idx}`).onclick = () => {
          if (window.confirm(`「${mem}」を削除しますか？`)) {
            this.memories.splice(idx, 1);
            StorageManager.saveMemories(this.memories);
            this._renderMemories();
          }
        };
      }
      container.appendChild(item);
    });
  },

  _bindUI() {
    document.getElementById('force-refresh-btn')?.addEventListener('click', () => this.forceRefreshApp());
    document.getElementById('diag-force-reload-btn')?.addEventListener('click', () => this.forceRefreshApp());
    document.getElementById('btn-download-backup')?.addEventListener('click', () => StorageManager.downloadDataPackage());

    document.getElementById('btn-deep-clean-storage')?.addEventListener('click', async () => {
      const msg = "【安全確認】\n実行すると、まずPC連携用の『高画質写真アルバム原本（JSON）』が自動保存されます！\nその上で、スマホ内の写真を『3〜5KB』にスリム化し、容量を安全に90%近く削減します。\n（※PCで写真原本をキープしたまま、スマホを快適に保てます）\n実行しますか？";
      if (!window.confirm(msg)) return;

      Toast.show("高画質写真アルバム保存中＆大掃除中…🧹", "info", 5000);
      const ok = await StorageManager.executeSafeStorageDeepClean();
      if (ok) {
        this._updateStorageMonitorUI();
        this._restoreTimelineHistory();
        this.audio.playEffect('purr');
        const cleanAck = getCurChar().id === 'shiro'
          ? "大掃除完了！原本を保存し、容量がスッキリしたホ！🎉✨"
          : "大掃除完了！原本を保存し、容量がスッキリしたニャン！🎉✨";
        Toast.show(cleanAck, "success", 5000);
      }
    });

    const restoreInput = document.getElementById('file-input-restore');
    document.getElementById('btn-trigger-restore')?.addEventListener('click', () => restoreInput?.click());
    restoreInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          await StorageManager.importAndReplaceDataPackage(JSON.parse(evt.target.result));
          this.memories = StorageManager.loadMemories(getCurChar().defaultMemories);
          this._renderMemories();
          this._restoreTimelineHistory();
          this._updateStorageMonitorUI();
          this._updateCharacterUI();
          this._syncEyelidInputsToActiveChar();
          this.updateTopHeaderClockWeatherUI();
          const restoreAck = getCurChar().id === 'shiro' ? "データを安全に完全復元したホ！🎉" : "データを安全に完全復元したニャ！🎉";
          Toast.show(restoreAck, "success");
        } catch(err) {
          Toast.show("読み込み失敗: " + err.message, "error");
        }
      };
      reader.readAsText(file);
      restoreInput.value = '';
    });

    document.getElementById('btn-copy-home-coords')?.addEventListener('click', () => {
      const val = document.getElementById('home-coords-input')?.value.trim();
      if (!val) {
        Toast.show("座標が入力されていません", "error");
        return;
      }
      navigator.clipboard.writeText(val).then(() => {
        const copyAck = getCurChar().id === 'shiro' ? "座標をコピーしたホ！📋" : "座標をコピーしたニャ！📋";
        Toast.show(copyAck, "success");
        Logger.log(`[Home] 座標コピー成功: ${val}`, "info");
      });
    });

    document.getElementById('btn-get-current-home')?.addEventListener('click', async () => {
      Toast.show("現在地を取得中…📍", "info");
      const ok = await LocationProvider.fetchLocationOnDemand(false);
      if (ok && LocationProvider.lat !== null) {
        const val = `${LocationProvider.lat.toFixed(6)}, ${LocationProvider.lon.toFixed(6)}`;
        document.getElementById('home-coords-input').value = val;
        LocationProvider.homeLat = LocationProvider.lat;
        LocationProvider.homeLon = LocationProvider.lon;
        localStorage.setItem('kuro_home_coords', val);
        const homeAck = getCurChar().id === 'shiro' ? "現在地を拠点（自宅）にセットしたホ！🏠✨" : "現在地を拠点（自宅）にセットしたニャ！🏠✨";
        Toast.show(homeAck, "success");
        Logger.log(`[Home] 現在地を拠点に設定: ${val}`, "success");
        this.updateTopHeaderClockWeatherUI();
      } else {
        Toast.show("現在地を取得できませんでした", "error");
      }
    });

    document.getElementById('diag-test-models-btn')?.addEventListener('click', async () => {
      const apiKey = AppCore.ai.apiKey;
      if (!apiKey) {
        Logger.log("[診断] ⚠️ APIキーが未設定です。設定画面で入力してください", "error");
        Toast.show("APIキーを設定してください", "error");
        return;
      }
      Logger.log("=== 固定2モデル導通テスト開始 ===", "info");
      for (const model of FIXED_LITE_MODELS) {
        const t0 = performance.now();
        try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: "ping" }] }],
              generationConfig: { maxOutputTokens: 5 }
            })
          });
          const ms = Math.round(performance.now() - t0);
          if (res.ok) {
            Logger.log(`✅ [${model}] 導通OK (${ms}ms)`, "success");
          } else {
            Logger.log(`❌ [${model}] HTTPエラー ${res.status} (${ms}ms)`, "error");
          }
        } catch(err) {
          const ms = Math.round(performance.now() - t0);
          Logger.log(`❌ [${model}] 通信エラー: ${err.message} (${ms}ms)`, "error");
        }
      }
      Logger.log("=== 導通テスト完了 ===", "info");
      const testAck = getCurChar().id === 'shiro' ? "モデル検証が完了したホ！🩺" : "モデル検証が完了したニャ！🩺";
      Toast.show(testAck, "success");
    });

    document.getElementById('btn-clear-chat-display')?.addEventListener('click', () => {
      if (window.confirm("画面の会話をお掃除しますか？（日記は残ります）")) {
        StorageManager.clearTimelineDisplayOnly();
        this._restoreTimelineHistory();
      }
    });

    document.getElementById('snack-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.resetActivityTimer();
      this.audio.stopListening();
      this.audio.unlockMasterAudio();
      this.state.snackCount++;
      this.audio.playEffect('snack');
      if (this.avatar) this.avatar.setEmotion('happy');

      const cur = getCurChar();
      const msg = cur.id === 'shiro'
        ? (this.state.snackCount >= 3 ? "ハフハフ…美味ホ！お腹いっぱい大満足ホ〜パタパタパタ♪" : "もぐもぐ…木の実とお肉は最高ホ！🌰")
        : (this.state.snackCount >= 3 ? "ハフハフ…うまうまニャ！お腹いっぱい大満足ニャ〜極楽ニャン♡" : "もぐもぐ…ちゅ〜る最高ニャ！🐟");

      if (this.state.snackCount >= 3) { this.state.snackCount = 0; this.audio.playEffect('purr'); }
      this.audio.speak(msg, null, () => this.renderBubble('model', msg), () => {
        if (this.avatar && this.state.isRunning) this.avatar.setEmotion('idle');
      });
    });

    document.getElementById('transform-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.audio.playEffect('poof');
      if (this.avatar) {
        this.avatar.triggerPoofSmoke();
        const next = (this.avatar.mode === 'vector') ? 'real' : 'vector';
        this.avatar.applyMode(next);
        const cur = getCurChar();
        const tfAck = cur.id === 'shiro'
          ? `姿を変身したホ！✨（${next === 'real' ? 'リアル写真' : 'イラスト'}）`
          : `姿を変身したニャン！✨（${next === 'real' ? 'リアル写真' : 'イラスト'}）`;
        Toast.show(tfAck, 'info');
      }
    });

    document.getElementById('mode-toggle-btn')?.addEventListener('click', () => {
      this.state.isAssistantMode = !this.state.isAssistantMode;
      localStorage.setItem('kuro_mode', this.state.isAssistantMode ? 'assistant' : 'pet');
      this._updateModeUI(true);
    });

    document.getElementById('stop-action-btn')?.addEventListener('click', () => {
      this.resetActivityTimer();
      this.cancelKitchenTimer(false);

      const isThinking = this.state.isThinking || this.state.isProcessingInput;
      const isSpeaking = this.audio.isSpeaking || this.audio.isReadingAloud || this.state.isDiaryReading;
      const cur = getCurChar();

      if (isThinking) {
        this.ai.cancelActiveThought();
        this.audio.stopSpeaking();
        this.state.isThinking = false;
        this.state.isProcessingInput = false;

        const box = document.getElementById('chat-timeline');
        if (box) {
          if (box.lastElementChild && box.lastElementChild.classList.contains('model')) {
            box.lastElementChild.remove();
          }
          if (box.lastElementChild && box.lastElementChild.classList.contains('user')) {
            box.lastElementChild.remove();
          }
        }

        StorageManager.rollbackLastExchange(false);
        this._updateStorageMonitorUI();

        if (this.avatar) this.avatar.setEmotion('idle');
        const cancelMsg = cur.id === 'shiro' ? "直前の発言を取り消したホ！" : "直前の発言を取り消したニャ！";
        Toast.show(cancelMsg, "info");
        const ack = cur.id === 'shiro' ? "うむ！" : "はーい！";
        this.triggerActionVoice(ack, "↩️ いまのナシ！");
        return;
      }

      if (isSpeaking) {
        this.audio.stopReadingAloud();
        this.audio.stopSpeaking();
        this.state.isDiaryReading = false;
        this._updateDiaryReadBtnUI(false);

        const box = document.getElementById('chat-timeline');
        if (box) {
          if (box.lastElementChild) box.lastElementChild.remove();
          if (box.lastElementChild && box.lastElementChild.classList.contains('user')) {
            box.lastElementChild.remove();
          }
        }

        StorageManager.rollbackLastExchange(true);
        this._updateStorageMonitorUI();

        if (this.avatar) this.avatar.setEmotion('idle');
        const cancelMsg = cur.id === 'shiro' ? "いまの会話を取り消したホ！" : "いまの会話を取り消したニャ！";
        Toast.show(cancelMsg, "info");
        const ack = cur.id === 'shiro' ? "うむ！" : "はーい！";
        this.triggerActionVoice(ack, "↩️ いまのナシ！");
        return;
      }

      this.audio.stopSpeaking();
      this.state.isThinking = false;
      this.state.isProcessingInput = false;
      if (this.avatar) this.avatar.setEmotion('idle');
      const waitAck = cur.id === 'shiro' ? "指示を待っているホ！" : "おやびんの声を待ってるニャン♪🐾";
      Toast.show(waitAck, "info");
      const ackVoice = cur.id === 'shiro' ? "うむ！" : "はーい！";
      const statusAck = cur.id === 'shiro' ? "👂 聴いてるホ♪" : "👂 聴いてるニャ♪";
      this.triggerActionVoice(ackVoice, statusAck);
    });

    document.getElementById('pause-btn')?.addEventListener('click', () => {
      this.state.isRunning = !this.state.isRunning;
      const btn = document.getElementById('pause-btn');
      const wrap = document.getElementById('avatar-wrapper');
      const petContainer = document.getElementById('pet-container');
      const st = document.getElementById('status-text');
      const cur = getCurChar();

      btn?.classList.toggle('is-paused', !this.state.isRunning);
      const icon = document.getElementById('pause-icon');
      const txt = document.getElementById('pause-text');
      if (icon) icon.textContent = this.state.isRunning ? "🟢" : "🛑";
      if (txt) txt.textContent = this.state.isRunning ? "会話中" : "お休み中";

      if (!this.state.isRunning) {
        this.audio.stopListening();
        this.audio.stopSpeaking();
        this.audio.stopReadingAloud();
        this.cancelKitchenTimer(false);
        this.state.isThinking = false;
        this.state.isProcessingInput = false;
        this.state.isDiaryReading = false;

        petContainer?.classList.add('is-paused-mode');
        if (st) st.textContent = "💤 すやすやお休み中…";

        if (this.avatar) {
          this.avatar.setEmotion('idle');
        }
        if (wrap) wrap.classList.add('is-sleeping');
        if (this.avatar) {
          this.avatar.applyEyelidTransforms();
          this.avatar.triggerYawn();
        }

        Logger.log(`[Status] 💤 お休み中（Idle待機姿勢固定・自然閉眼＆居眠り導入完了）`, "info");
      } else {
        petContainer?.classList.remove('is-paused-mode');
        if (wrap) wrap.classList.remove('is-sleeping');
        if (this.avatar) {
          this.avatar.setEmotion('idle');
          this.avatar.applyEyelidTransforms();
        }
        const suffix = cur.id === 'shiro' ? 'ホ♪' : 'ニャ♪';
        if (st) st.textContent = `👂 聴いてる${suffix}`;

        const wakeMsg = cur.id === 'shiro'
          ? "ふぁ〜あ…！助手よ、目覚めたホ！どんな用件ホ？"
          : "ふぁ〜あ…！おやびん、起きたニャン🐾";

        this.audio.speak(wakeMsg, null, () => this.renderBubble('model', wakeMsg), () => {
          if (this.state.isRunning && !this.audio.isSpeechProducing) this.audio.startListening();
        });
        Logger.log(`[Status] 🟢 会話中復帰`, "info");
      }
    });

    document.getElementById('avatar-wrapper')?.addEventListener('click', (e) => {
      if (e.target.closest('#transform-btn') || e.target.closest('#snack-btn') || e.target.closest('#photo-action-btn') || e.target.closest('#kitchen-timer-widget')) return;
      this.resetActivityTimer();
      this.audio.unlockMasterAudio();

      const wrap = document.getElementById('avatar-wrapper');
      const rect = wrap.getBoundingClientRect();
      const clickYRatio = (e.clientY - rect.top) / rect.height;
      const cur = getCurChar();

      let partMsg = "";
      if (cur.id === 'shiro') {
        if (clickYRatio < 0.35) {
          partMsg = "頭を撫でるなホ…！羽毛が乱れるホ…///（パタパタ）";
        } else if (clickYRatio < 0.68) {
          partMsg = "フ、フン…ボクを褒めても何も出ないホよ！///（羽パタパタ）";
        } else {
          partMsg = "そこはお腹の羽毛ホ！…くすぐったいホな！";
        }
      } else {
        if (clickYRatio < 0.35) {
          partMsg = "お耳ピクピク！くすぐったくて気持ちいいニャン♪👂✨";
        } else if (clickYRatio < 0.68) {
          partMsg = "あたまナデナデ大好きニャ〜極楽ニャン♡🐾";
        } else {
          partMsg = "そこそこ！あごの下、喉をゴロゴロ鳴らしちゃうニャン😻";
        }
      }

      this.audio.playEffect('purr');
      if (this.avatar) { this.avatar.triggerTouchHeart(); this.avatar.setEmotion('happy'); }
      Toast.show(partMsg, "success", 2200);
      setTimeout(() => { if (!this.audio.isSpeaking && this.avatar && this.state.isRunning) this.avatar.setEmotion('idle'); }, 1500);
    });

    document.getElementById('test-voice-btn')?.addEventListener('click', () => {
      const spk = this.getSpeakerId();
      const cur = getCurChar();
      const testLine = cur.id === 'shiro'
        ? `助手よ、ボクは${cur.title || cur.name}だホ！`
        : `おやびん、わたしは${cur.name}だニャン🐾`;

      this.audio.speak(testLine, spk);
    });
    document.getElementById('test-timer-sound-btn')?.addEventListener('click', () => {
      this.audio.playEffect(this.getTimerSound());
    });
    document.getElementById('voice-rate')?.addEventListener('input', (e) => {
      this.audio.setRate(parseFloat(e.target.value));
      document.getElementById('rate-val').textContent = parseFloat(e.target.value).toFixed(2);
    });

    document.getElementById('settings-btn')?.addEventListener('click', () => {
      this.resetActivityTimer();
      this.audio.stopListening();
      document.getElementById('api-key-input').value = this.ai.apiKey;
      document.getElementById('voicevox-key-input').value = localStorage.getItem('kuro_voicevox_key') || '';
      document.getElementById('home-coords-input').value = localStorage.getItem('kuro_home_coords') || '';
      document.getElementById('voice-rate').value = this.audio.rate;
      document.getElementById('rate-val').textContent = this.audio.rate.toFixed(2);

      const currentTheme = localStorage.getItem('kuro_theme') || 'normal';
      document.querySelectorAll('.theme-card-btn').forEach(btn => btn.classList.toggle('is-active', btn.dataset.themeVal === currentTheme));

      const currentSpeaker = String(this.getSpeakerId());
      document.querySelectorAll('.voice-chip-btn').forEach(btn => btn.classList.toggle('is-active', btn.dataset.voiceId === currentSpeaker));

      const syncSegment = (groupId, key, defaultVal, activeClass) => {
        const val = localStorage.getItem(key) || defaultVal;
        const container = document.getElementById(groupId);
        container?.querySelectorAll('.segment-btn').forEach(b => {
          const bVal = b.dataset.feedbackVal || b.dataset.timerSoundVal || b.dataset.accStyleVal || b.dataset.countVal || b.dataset.talkLen || b.dataset.charId;
          const isMatch = (bVal === val);
          b.classList.toggle('is-active', isMatch);
          if (isMatch) b.classList.add(activeClass);
          else b.classList.remove(activeClass);
        });
      };

      syncSegment('character-selector-segment-group', 'kuro_active_character', 'kuro', 'pink');
      syncSegment('talk-length-segment-group', 'kuro_talk_length', 'auto', 'pink');
      syncSegment('feedback-segment-group', 'kuro_button_feedback', 'voice', 'pink');
      syncSegment('timer-sound-segment-group', 'kuro_timer_sound', 'bell', 'blue');
      syncSegment('acc-style-segment-group', 'kuro_acc_style', 'both', 'pink');
      syncSegment('news-count-segment-group', 'kuro_news_count', '2', 'blue');
      syncSegment('spot-count-segment-group', 'kuro_spot_count', '2', 'blue');

      this._renderMemories();
      this._updateStorageMonitorUI();
      this._syncEyelidInputsToActiveChar();
      document.getElementById('modal-overlay').style.display = 'flex';
    });

    const closeSettingsModal = () => {
      this.state.isCalibratingEyelid = false;
      if (this.avatar?.wrapper) {
        this.avatar.wrapper.classList.remove('is-calibrating-eyelids');
      }
      if (this.avatar) this.avatar.applyEyelidTransforms();

      document.getElementById('modal-overlay').style.display = 'none';
      if (this.state.isRunning && !this.audio.isSpeechProducing) this.audio.startListening();
    };

    document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay') closeSettingsModal();
    });

    document.getElementById('save-settings-btn')?.addEventListener('click', async () => {
      const newApiKey = document.getElementById('api-key-input')?.value.trim() || '';
      const newVvKey = document.getElementById('voicevox-key-input')?.value.trim() || '';
      const newHome = document.getElementById('home-coords-input')?.value.trim() || '';
      const saveBtn = document.getElementById('save-settings-btn');
      const saveTxt = document.getElementById('save-btn-text');

      const isApiKeyChanged = (newApiKey !== this.ai.apiKey);

      if (isApiKeyChanged && newApiKey) {
        if (saveBtn) saveBtn.classList.add('is-saving');
        if (saveTxt) saveTxt.textContent = "APIキーを検証中…⚡";

        let hasError = false;
        try {
          const testRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${FIXED_LITE_MODELS[0]}:generateContent?key=${newApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: "ping" }] }],
              generationConfig: { maxOutputTokens: 5 }
            })
          });
          if (!testRes.ok) {
            hasError = true;
            Logger.log(`[Auth] ❌ Gemini APIキー検証エラー: HTTP ${testRes.status}`, "error");
          }
        } catch(err) {
          hasError = true;
          Logger.log(`[Auth] ❌ Gemini API通信エラー: ${err.message}`, "error");
        }

        if (saveBtn) saveBtn.classList.remove('is-saving');
        const defaultSaveTxt = getCurChar().id === 'shiro' ? "設定と記憶を保存するホ！" : "設定と記憶を保存するニャン♪";
        if (saveTxt) saveTxt.textContent = defaultSaveTxt;

        if (hasError) {
          this.audio.playEffect('alarm');
          Toast.show("⚠️ APIキーエラーです。キーを確認してください！", "error", 4500);
          return;
        }
      }

      this.ai.apiKey = newApiKey;
      localStorage.setItem('kuro_api_key', newApiKey);
      localStorage.setItem('kuro_voicevox_key', newVvKey);
      localStorage.setItem('kuro_home_coords', newHome);

      LocationProvider._applyHomeFallback();
      this.updateTopHeaderClockWeatherUI();

      this.state.isCalibratingEyelid = false;
      if (this.avatar?.wrapper) {
        this.avatar.wrapper.classList.remove('is-calibrating-eyelids');
      }
      if (this.avatar) this.avatar.applyEyelidTransforms();

      document.getElementById('modal-overlay').style.display = 'none';

      const cur = getCurChar();
      const saveMsg = cur.id === 'shiro' ? "設定と記憶を保存したホ！" : "設定と記憶を保存するニャン♪";
      Toast.show(saveMsg, "success");
      const ackVoice = cur.id === 'shiro' ? "バッチリホ！" : "バッチリニャ！";
      this.triggerActionVoice(ackVoice, `💾 ${ackVoice}`);
      Logger.log(`[Auth] ✅ 設定保存完了`, "success");
    });

    document.getElementById('add-memory-btn')?.addEventListener('click', () => {
      const inp = document.getElementById('new-memory-input');
      const val = inp?.value.trim();
      if (val) {
        this.memories.unshift(val);
        StorageManager.saveMemories(this.memories);
        inp.value = '';
        this._renderMemories();
      }
    });

    document.getElementById('open-diag-modal-btn')?.addEventListener('click', () => {
      document.getElementById('modal-overlay').style.display = 'none';
      document.getElementById('diag-panel')?.classList.add('expanded');
    });
    document.getElementById('diag-close-btn')?.addEventListener('click', () => {
      document.getElementById('diag-panel')?.classList.remove('expanded');
      if (this.state.isRunning && !this.audio.isSpeechProducing) this.audio.startListening();
    });
    document.getElementById('diag-copy-evidence-btn')?.addEventListener('click', () => {
      const cur = getCurChar();
      const copyAck = cur.id === 'shiro' ? "ログをコピーしたホ！📋" : "ログをコピーしたニャ！📋";
      navigator.clipboard.writeText(Logger.getEvidenceText()).then(() => Toast.show(copyAck, "success"));
    });
  }
};

/* ★ 三重起動安全ガード */
function bootAIApp() {
  if (window._hasAppBooted) return;
  window._hasAppBooted = true;
  AppCore.init();
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  bootAIApp();
} else {
  document.addEventListener('DOMContentLoaded', bootAIApp);
  window.addEventListener('load', bootAIApp);
}
