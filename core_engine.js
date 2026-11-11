// [v1.0.0 作業版 Rev.9] LocationProvider表示・対話2系統分離（ヘッダー市名/会話検索町名GPS）
/* ==========================================================================
   AIペット 共通対話基盤エンジンOS（core_engine.js）
   - プラグインアーキテクチャ対応（char_kuro.js, char_shiro.js の動的自動ロード）
   - 【キャラクター完全分離】クロちゃん🐾 ⇔ シロくん（ホウ博士）🦉 の安全動的取得
   - 【データ独立保護】キャラごとの記憶帳・絵日記・写真プールを混ざらず安全に独立保持
   - 【位置情報2系統完全分離】ヘッダー表示用（cleanCityOnly: 市名のみ）＆ 対話・検索用（detailedTownArea: 町名付近＋GPS座標）
   - 【絵日記写真日付完全独立】写真のない日に過去の日付の写真が勝手に引き継がれる現象を物理的に完全遮断
   - 【自声エコー完全根絶】音声生成準備〜再生完了〜余韻までマイク絶対遮断フラグ（isSpeechProducing）で物理ロック
   - 【TTSレート制限(429)防護壁】429検知時のクールダウンタイマー＆安全キューイング機構
   - 【絵日記書き出し完全統一】「YYYY年M月D日 (曜日) 天気: ○○ 気温: ○○℃」ヘッダー自動整形＆重複挨拶パージ
   - 【PC逆インポート安全防護壁】PCから戻した大きな画像によるスマホ容量パンクを自動再スリム化で完全防御
   - 【非破壊ストレージ大掃除】原本JSONを強制ダウンロード後に安全に3〜5KB化＆重複完全排除
   - 【4.0MB自動監視アラート】4MB到達時にPCバックアップを優しく促す安全センサー常時稼働
   - 【音響完全修復】直列カスケード回路によるプツプツノイズ100%根絶＆豊かな元祖ゴロゴロ音
   - Gemini連携モデル完全固定（3.5-flash-lite / flash-lite-latest）
   ========================================================================== */

/* ★ アクティブキャラクターの安全動的取得（クロちゃん ⇔ シロくん） */
const CurrentCharacterFallback = {
  id: "kuro",
  name: "クロ",
  title: "クロちゃん",
  species: "ノルウェージャンフォレストキャット（1歳の女の子）",
  firstPerson: "クロ",
  ownerCall: "おやびん",
  defaultSpeakerId: 10,
  defaultVoiceRate: 1.05,
  imagePrefix: "",
  fillerPhrases: ["そうニャン♪", "えーっとニャ…", "確認するニャ！", "おまかせニャ！", "あそぶニャ♪", "バッチリニャ！", "はーい！"],
  photoUserPrompt: "クロちゃん、この写真見てニャ！",
  photoAiThoughtPrompt: "この写真を見て感想を聞かせてニャン🐾",
  photoThinkingStatus: "📷 写真見てるニャ…",
  photoThinkingBubble: "クロがお写真を見てるニャ…📷✨",
  cleanEnding: (t) => t,
  correctSpeechInput: (t) => t,
  defaultMemories: [],
  defaultEyelidCoords: { y: 172, x: 0, gap: 28, size: 16, rotate: 0 },
  defaultAccessoryCoords: {
    idle: { x: 0, y: 120, scale: 1.0, rotate: 0 },
    talking: { x: 0, y: 120, scale: 1.0, rotate: 0 },
    thinking: { x: 0, y: 120, scale: 1.0, rotate: 0 },
    happy: { x: 0, y: 120, scale: 1.0, rotate: 0 }
  },
  buildSystemPrompt: () => "",
  buildDiaryPrompt: () => "",
  getVectorAvatarSvg: () => ""
};

const getCurChar = () => {
  const activeId = localStorage.getItem('kuro_active_character') || 'kuro';
  if (activeId === 'shiro' && window.Character_Shiro) {
    return window.Character_Shiro;
  }
  return window.Character_Kuro || CurrentCharacterFallback;
};

const CurrentCharacter = new Proxy(CurrentCharacterFallback, {
  get(target, prop) {
    const active = getCurChar();
    return active[prop] !== undefined ? active[prop] : target[prop];
  }
});

/* ★ Gemini連携モデル完全固定定数 */
const FIXED_LITE_MODELS = Object.freeze([
  "gemini-3.5-flash-lite",     // 第1優先（主軸・最速モデル）
  "gemini-flash-lite-latest"   // 第2優先（タイムアウト時バックアップ）
]);

/* ★ 正式なFunction Calling定義 */
const KURO_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "searchMapPlaces",
        description: "Googleマップでお店（ラーメン、焼肉等）や公園、カフェ、休憩スポット、散策施設を検索して案内カードを表示します。",
        parameters: {
          type: "OBJECT",
          properties: {
            spotName: { type: "STRING", description: "検索する店名・施設・ジャンル（例: 近くの公園, カフェ, 炭火ホルモン 丸川, ラーメン）" },
            area: { type: "STRING", description: "検索するエリア（例: 東京都東村山市, 現在地周辺）" }
          },
          required: ["spotName"]
        }
      },
      {
        name: "searchLatestNews",
        description: "Googleニュースで最新のニュースを検索して案内カードを表示します。",
        parameters: {
          type: "OBJECT",
          properties: {
            topic: { type: "STRING", description: "検索キーワード（例: 大谷翔平 最新ニュース, 東村山市）" }
          },
          required: ["topic"]
        }
      }
    ]
  }
];

/* ==========================================================================
   MODULE 0: 診断ロガー ＆ トースト通知
   ========================================================================== */
const Toast = {
  timer: null,
  show(message, type = 'success', duration = 3500) {
    const el = document.getElementById('toast-notification');
    const icon = document.getElementById('toast-icon');
    const msg = document.getElementById('toast-message');
    if (!el) return;
    if (this.timer) clearTimeout(this.timer);
    el.className = `is-show ${type}`;
    icon.textContent = type === 'success' ? '✅' : (type === 'error' ? '⚠️' : 'ℹ️');
    msg.textContent = message;
    el.onclick = () => { el.classList.remove('is-show'); };
    this.timer = setTimeout(() => { el.classList.remove('is-show'); }, duration);
  }
};

const Logger = {
  allLogs: [],
  log(message, type = 'info') {
    const panel = document.getElementById('diag-logs');
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
    const formatted = `[${timeStr}] ${message}`;
    this.allLogs.push(formatted);
    if (panel) {
      const row = document.createElement('div');
      row.className = `log-row log-${type}`;
      row.textContent = formatted;
      panel.appendChild(row);
      panel.scrollTop = panel.scrollHeight;
    }
    console.log(formatted);
  },
  getEvidenceText() { return this.allLogs.join('\n'); }
};

/* ==========================================================================
   MODULE 0.5: 日時・生活リズム提供エンジン
   ========================================================================== */
const TimeProvider = {
  getCurrentInfo() {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const date = now.getDate();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
      const dayOfWeek = dayNames[now.getDay()];
      const pad = (n) => String(n).padStart(2, '0');
      const clock = `${pad(hours)}:${pad(minutes)}`;
      const logKey = `${year}-${pad(month)}-${pad(date)}`;
      const fullDate = `${year}年${month}月${date}日 (${dayOfWeek})`;

      const topDateDisplay = `${month}/${date} (${dayOfWeek}) ${clock}`;
      const headerDisplay = topDateDisplay;

      const isLateNight = (hours < 4);
      let lifeDateObj = now;
      if (isLateNight) lifeDateObj = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const lifeYear = lifeDateObj.getFullYear();
      const lifeMonth = lifeDateObj.getMonth() + 1;
      const lifeDate = lifeDateObj.getDate();
      const lifeDayOfWeek = dayNames[lifeDateObj.getDay()];
      const lifeLogKey = `${lifeYear}-${pad(lifeMonth)}-${pad(lifeDate)}`;
      const lifeFullDate = `${lifeYear}年${lifeMonth}月${lifeDate}日 (${lifeDayOfWeek})`;

      const isEvening = (hours >= 20 || isLateNight);

      const curChar = getCurChar();
      const suffix = curChar.id === 'shiro' ? 'ホ！' : 'ニャ！';
      const clockSuffix = curChar.id === 'shiro' ? 'ホな🐾' : 'ニャン🐾';

      return {
        now, year, month, date, hours, minutes, dayOfWeek, clock, logKey, fullDate,
        headerDisplay, topDateDisplay,
        spokenClock: `いまは、${hours}時${minutes === 0 ? 'ちょうど' : minutes + '分'}だ${clockSuffix}`,
        spokenDate: `きょうは、${month}月${date}日、${dayOfWeek}曜日だ${suffix}`,
        clockDisplay: `いまは ${hours}時${pad(minutes)}分 だ${clockSuffix}`,
        dateDisplay: `きょうは ${month}月${date}日 (${dayOfWeek}曜日) だ${suffix}`,
        isLateNight, isEvening, lifeLogKey, lifeFullDate
      };
    } catch (e) {
      const fbNow = new Date();
      const fbPad = (n) => String(n).padStart(2, '0');
      const fbClock = `${fbPad(fbNow.getHours())}:${fbPad(fbNow.getMinutes())}`;
      const fbKey = `${fbNow.getFullYear()}-${fbPad(fbNow.getMonth() + 1)}-${fbPad(fbNow.getDate())}`;
      return {
        now: fbNow, year: fbNow.getFullYear(), month: fbNow.getMonth() + 1, date: fbNow.getDate(),
        hours: fbNow.getHours(), minutes: fbNow.getMinutes(), dayOfWeek: "日", clock: fbClock,
        logKey: fbKey, fullDate: `${fbNow.getFullYear()}年${fbNow.getMonth() + 1}月${fbNow.getDate()}日`,
        headerDisplay: `${fbNow.getMonth() + 1}/${fbNow.getDate()} ${fbClock}`,
        topDateDisplay: `${fbNow.getMonth() + 1}/${fbNow.getDate()} ${fbClock}`,
        spokenClock: `いまは、${fbNow.getHours()}時${fbNow.getMinutes()}分だニャン🐾`,
        spokenDate: `きょうは、${fbNow.getMonth() + 1}月${fbNow.getDate()}日だニャ！`,
        clockDisplay: `いまは ${fbNow.getHours()}時${fbPad(fbNow.getMinutes())}分 だニャン🐾`,
        dateDisplay: `きょうは ${fbNow.getMonth() + 1}月${fbNow.getDate()}日 だニャ！`,
        isLateNight: false, isEvening: false, lifeLogKey: fbKey, lifeFullDate: fbKey
      };
    }
  },

  getYesterdayLifeInfo() {
    const cur = this.getCurrentInfo();
    const [y, m, d] = cur.lifeLogKey.split('-').map(Number);
    const baseDate = new Date(y, m - 1, d);
    const yesterdayDate = new Date(baseDate.getTime() - 24 * 60 * 60 * 1000);

    const year = yesterdayDate.getFullYear();
    const month = yesterdayDate.getMonth() + 1;
    const date = yesterdayDate.getDate();
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const dayOfWeek = dayNames[yesterdayDate.getDay()];
    const pad = (n) => String(n).padStart(2, '0');
    const key = `${year}-${pad(month)}-${pad(date)}`;
    const fullDate = `${year}年${month}月${date}日 (${dayOfWeek})`;

    return { year, month, date, dayOfWeek, key, fullDate };
  },

  formatDateKeyToFull(dateKey) {
    if (!dateKey) return "";
    const parts = dateKey.split('-').map(Number);
    if (parts.length < 3 || isNaN(parts[0])) return dateKey;
    const dt = new Date(parts[0], parts[1] - 1, parts[2]);
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    return `${parts[0]}年${parts[1]}月${parts[2]}日 (${dayNames[dt.getDay()]})`;
  },

  getAllActiveDateKeys() {
    const dateSet = new Set();
    const cur = this.getCurrentInfo();
    dateSet.add(cur.lifeLogKey);

    const yInfo = this.getYesterdayLifeInfo();
    dateSet.add(yInfo.key);

    const diaries = StorageManager.loadAllDiaries();
    diaries.forEach(d => { if (d && d.dateKey) dateSet.add(d.dateKey); });

    const activeId = getCurChar().id;
    for (let k in localStorage) {
      if (k.startsWith(`kuro_daily_logs_${activeId}_`) || k.startsWith('kuro_daily_logs_')) {
        const cleanK = k.replace(`kuro_daily_logs_${activeId}_`, '').replace('kuro_daily_logs_', '');
        if (/^\d{4}-\d{2}-\d{2}$/.test(cleanK)) dateSet.add(cleanK);
      } else if (k.startsWith(`kuro_daily_photos_${activeId}_`) || k.startsWith('kuro_daily_photos_')) {
        const cleanP = k.replace(`kuro_daily_photos_${activeId}_`, '').replace('kuro_daily_photos_', '');
        if (/^\d{4}-\d{2}-\d{2}$/.test(cleanP)) dateSet.add(cleanP);
      }
    }

    return Array.from(dateSet).sort().reverse();
  }
};

/* ==========================================================================
   MODULE 1: 音声合成＆音声認識エンジン
   ========================================================================== */
class AudioSpeechEngine {
  constructor() {
    this.masterAudio = new Audio();
    this.masterAudio.preload = "auto";
    this.fillerAudio = new Audio();
    this.fillerAudio.preload = "auto";
    this.isMasterUnlocked = false;
    this.silentWav = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
    this.audioCtx = null;

    this.rate = parseFloat(localStorage.getItem('kuro_rate') || String(getCurChar().defaultVoiceRate || 1.05));
    this.isSpeaking = false;
    this.isListening = false;
    this.isStarting = false;
    this.isActionButtonLocked = false;
    this.isSpeechProducing = false;

    this.recognition = null;
    this.restartTimer = null;
    this.lastMicErrorTime = 0;
    this.fixedPhraseMap = new Map();
    this.blobUrlCache = new Map();
    this.recentSpokenTexts = [];
    this.lastSpeechEndTime = 0;

    this.rateLimitCooldownUntil = 0;
    this.ttsRequestChain = Promise.resolve();
    this.lastVoicevoxRequestTime = 0;
    this.currentAbortController = null;
    this.isReadingAloud = false;
    this.readingAbortController = null;

    this.onSpeechFinal = null;
    this.onListeningStatus = null;
    this.onBargeIn = null;

    this._setupRecognition();
    this._setupInteractionUnlock();
  }

  setRate(r) { this.rate = r; localStorage.setItem('kuro_rate', r); }

  _ensureAudioContext() {
    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.audioCtx = new AudioCtx();
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  unlockMasterAudio() {
    const ctx = this._ensureAudioContext();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (this.isMasterUnlocked) return;
    this.masterAudio.src = this.silentWav;
    this.fillerAudio.src = this.silentWav;
    Promise.all([this.masterAudio.play().catch(() => {}), this.fillerAudio.play().catch(() => {})])
      .then(() => { this.isMasterUnlocked = true; }).catch(() => {});
  }

  _setupInteractionUnlock() {
    const unlock = () => {
      this._ensureAudioContext();
      this.unlockMasterAudio();
    };
    ['pointerdown', 'touchstart', 'click'].forEach(evt => window.addEventListener(evt, unlock, { passive: true, once: true }));
  }

  playEffect(type) {
    const ctx = this._ensureAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => this._executePlayEffect(type, ctx)).catch(() => {});
    } else {
      this._executePlayEffect(type, ctx);
    }
  }

  _executePlayEffect(type, ctx) {
    const now = ctx.currentTime;

    if (type === 'poof') {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.35, ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < buffer.length; i++) output[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource(); noise.buffer = buffer;
      const filter = ctx.createBiquadFilter(); filter.type = 'bandpass';
      filter.frequency.setValueAtTime(800, now); filter.frequency.exponentialRampToValueAtTime(160, now + 0.32);
      const gain = ctx.createGain(); gain.gain.setValueAtTime(0.45, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
      noise.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
      noise.start(now); noise.stop(now + 0.35);

    } else if (type === 'purr') {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const tremoloGain = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const masterGain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(175, now);
      osc.frequency.linearRampToValueAtTime(162, now + 0.4);
      osc.frequency.linearRampToValueAtTime(180, now + 0.85);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(850, now);

      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(21, now);

      tremoloGain.gain.setValueAtTime(0.55, now);
      lfoGain.gain.setValueAtTime(0.42, now);
      lfo.connect(lfoGain);
      lfoGain.connect(tremoloGain.gain);

      masterGain.gain.setValueAtTime(0.02, now);
      masterGain.gain.linearRampToValueAtTime(0.72, now + 0.14);
      masterGain.exponentialRampToValueAtTime(0.001, now + 0.96);

      osc.connect(filter);
      filter.connect(tremoloGain);
      tremoloGain.connect(masterGain);
      masterGain.connect(ctx.destination);

      osc.start(now);
      lfo.start(now);
      osc.stop(now + 0.97);
      lfo.stop(now + 0.97);

      if ('vibrate' in navigator) try { navigator.vibrate([40, 50, 40]); } catch(e) {}
      Logger.log(`[Sound] 😻 ノイズゼロ・豊潤リアル喉鳴らし/羽音発音`, "info");

    } else if (type === 'snack') {
      [0, 0.15, 0.3].forEach(d => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.type = 'triangle'; osc.frequency.setValueAtTime(440, now + d);
        gain.gain.setValueAtTime(0.35, now + d); gain.gain.exponentialRampToValueAtTime(0.01, now + d + 0.12);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now + d); osc.stop(now + d + 0.12);
      });
      Logger.log(`[Sound] 🐟 おやつ音発音`, "info");

    } else if (type === 'bell') {
      [1568, 2093].forEach((f, idx) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(f, now + idx * 0.2);
        gain.gain.setValueAtTime(0.45, now + idx * 0.2); gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.2 + 0.4);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now + idx * 0.2); osc.stop(now + idx * 0.2 + 0.42);
      });

    } else if (type === 'alarm') {
      [0, 0.12, 0.24].forEach(d => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.type = 'square'; osc.frequency.setValueAtTime(2093, now + d);
        gain.gain.setValueAtTime(0.35, now + d); gain.gain.exponentialRampToValueAtTime(0.01, now + d + 0.08);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now + d); osc.stop(now + d + 0.085);
      });

    } else if (type === 'idea') {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.setValueAtTime(880, now); osc.frequency.exponentialRampToValueAtTime(1760, now + 0.2);
      gain.gain.setValueAtTime(0.35, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.35);

    } else if (type === 'aizuchi') {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = 'triangle'; osc.frequency.setValueAtTime(680, now); osc.frequency.exponentialRampToValueAtTime(920, now + 0.08);
      gain.gain.setValueAtTime(0.24, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.18);

    } else if (type === 'happy_meow') {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = 'triangle'; osc.frequency.setValueAtTime(580, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.15); osc.frequency.exponentialRampToValueAtTime(640, now + 0.4);
      gain.gain.setValueAtTime(0.28, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.45);
    }
  }

  cleanEndingNenyan(text) {
    const cur = getCurChar();
    return cur.cleanEnding ? cur.cleanEnding(text) : text;
  }

  correctSpeechInput(text) {
    const cur = getCurChar();
    return cur.correctSpeechInput ? cur.correctSpeechInput(text) : text;
  }

  _convertAllNumbersToKana(text) {
    if (!text) return "";
    let t = this.cleanEndingNenyan(text).replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
    t = t.replace(/余([はがものにもと])/g, 'よ$1').replace(/余/g, 'よ');

    const d = ['', 'いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう'];

    const numToKana = (n) => {
      if (isNaN(n)) return '';
      if (n === 0) return 'ぜろ';
      let res = '';

      if (n >= 10000) {
        const man = Math.floor(n / 10000);
        res += numToKana(man) + 'まん';
        n %= 10000;
      }
      if (n >= 1000) {
        const sen = Math.floor(n / 1000);
        if (sen === 1) res += 'せん';
        else if (sen === 3) res += 'さんぜん';
        else if (sen === 8) res += 'はっせん';
        else res += d[sen] + 'せん';
        n %= 1000;
      }
      if (n >= 100) {
        const hyaku = Math.floor(n / 100);
        if (hyaku === 1) res += 'ひゃく';
        else if (hyaku === 3) res += 'さんびゃく';
        else if (hyaku === 6) res += 'ろっぴゃく';
        else if (hyaku === 8) res += 'はっぴゃく';
        else res += d[hyaku] + 'ひゃく';
        n %= 100;
      }
      if (n >= 10) {
        const ten = Math.floor(n / 10);
        res += (ten === 1 ? 'じゅう' : d[ten] + 'じゅう');
        n %= 10;
      }
      if (n > 0) {
        res += d[n];
      }
      return res;
    };

    t = t.replace(/(\d{1,4})\s*年/g, (m, y) => `${numToKana(parseInt(y, 10))}ねん`);
    t = t.replace(/(\d{1,2})\s*月/g, (m, mo) => `${numToKana(parseInt(mo, 10))}がつ`);
    t = t.replace(/(\d{1,2})\s*日/g, (m, da) => {
      const dn = parseInt(da, 10);
      const specialDays = { 1: 'ついたち', 2: 'ふつか', 3: 'みっか', 4: 'よっか', 5: 'いつか', 6: 'むいか', 7: 'なのか', 8: 'ようか', 9: 'ここのか', 10: 'とおか', 14: 'じゅうよっか', 20: 'はつか', 24: 'にじゅうよっか' };
      return specialDays[dn] || `${numToKana(dn)}にち`;
    });
    t = t.replace(/(\d{1,2})\s*時/g, (m, h) => `${numToKana(parseInt(h, 10))}じ`);
    t = t.replace(/(\d{1,2})\s*分/g, (m, mi) => `${numToKana(parseInt(mi, 10))}ふん`);
    t = t.replace(/(\d+)\s*(?:度|℃)/g, (m, c) => `${numToKana(parseInt(c, 10))}ど`);
    t = t.replace(/\d+/g, m => numToKana(parseInt(m, 10)));
    return t;
  }

  playImmediateFiller(type = 'general') {
    this.unlockMasterAudio();
    this.playEffect('aizuchi');
    if (AppCore.avatar && AppCore.state.isRunning) AppCore.avatar.setEmotion('thinking');
  }

  _getVoicevoxBlobUrl(text, speakerId) {
    const key = `${speakerId}_${text}`;
    if (this.blobUrlCache.has(key)) {
      Logger.log(`[TTS] キャッシュヒット: 「${text.substring(0, 15)}…」`, "info");
      return Promise.resolve(this.blobUrlCache.get(key));
    }

    this.ttsRequestChain = this.ttsRequestChain.catch(() => {}).then(async () => {
      if (this.blobUrlCache.has(key)) return this.blobUrlCache.get(key);

      const now = Date.now();
      if (now < this.rateLimitCooldownUntil) {
        const remainingSec = Math.ceil((this.rateLimitCooldownUntil - now) / 1000);
        Logger.log(`[TTS] ⏳ 429クールダウン中（残り${remainingSec}秒）。API呼び出しをスキップします`, "warn");
        throw new Error("TTS_RATE_LIMITED_COOLDOWN");
      }

      const elapsed = now - this.lastVoicevoxRequestTime;
      if (elapsed < 600) await new Promise(r => setTimeout(r, 600 - elapsed));
      this.lastVoicevoxRequestTime = Date.now();

      const t0 = performance.now();
      const vvKey = (localStorage.getItem('kuro_voicevox_key') || '').trim();
      let initUrl = `https://api.tts.quest/v3/voicevox/synthesis?text=${encodeURIComponent(text)}&speaker=${speakerId}`;
      if (vvKey) initUrl += `&key=${encodeURIComponent(vvKey)}`;

      const keyStatusText = vvKey ? "🔑個別キー適用済" : "🆓無料枠";
      Logger.log(`[TTS] 音声生成開始 (${keyStatusText}, 話者:${speakerId}): 「${text.substring(0, 16)}…」`, "info");

      let initRes;
      try {
        initRes = await fetch(initUrl);
      } catch (networkErr) {
        Logger.log(`[TTS] ネットワークエラー: ${networkErr.message}`, "error");
        throw networkErr;
      }

      if (initRes.status === 429) {
        this.rateLimitCooldownUntil = Date.now() + 8000;
        Logger.log(`[TTS] ⚠️ レート制限(429)検知。8秒間のクールダウン防護壁を展開します`, "warn");
        throw new Error("HTTPエラー 429");
      }

      if (!initRes.ok) {
        Logger.log(`[TTS] HTTPエラー ${initRes.status}`, "error");
        throw new Error(`HTTPエラー ${initRes.status}`);
      }

      const initData = await initRes.json();
      if (initData.isAudioError) {
        Logger.log(`[TTS] VOICEVOX生成エラー`, "error");
        throw new Error("VOICEVOX生成エラー");
      }

      let directUrl = initData.mp3StreamingUrl || initData.mp3DownloadUrl;
      if (!directUrl && initData.audioStatusUrl) {
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 350));
          const sRes = await fetch(initData.audioStatusUrl);
          if (sRes.ok) {
            const sData = await sRes.json();
            if (sData.isAudioReady) { directUrl = sData.mp3StreamingUrl || sData.mp3DownloadUrl; break; }
          }
        }
      }
      if (!directUrl) {
        Logger.log(`[TTS] 音声生成タイムアウト`, "error");
        throw new Error("音声タイムアウト");
      }

      const aRes = await fetch(directUrl);
      const blob = await aRes.blob();
      const blobUrl = URL.createObjectURL(blob);
      this.blobUrlCache.set(key, blobUrl);
      const ms = Math.round(performance.now() - t0);
      Logger.log(`[TTS] ✅ 音声取得完了 (${ms}ms) [${keyStatusText}]`, "success");
      return blobUrl;
    });

    return this.ttsRequestChain;
  }

  _isSelfEcho(text) {
    if (!text) return true;
    const cleanInput = text.trim();
    const normalizedInput = cleanInput.replace(/[\s、。！？ニャンニャホ]/g, '');
    
    if (normalizedInput.length < 1) return true;
    if (/^(?:おまかせニャ|あそぶニャ|バッチリニャ|はーい|ちょい待ちニャ|すすめるニャ|フン|計算中ホ|任せるが良いホ|ホウ|バッチリホ|うむ)/.test(cleanInput)) return true;
    if (/^(?:だホ|ホ|ホウ|だニャ|ニャン|ニャ|ホな|ホよ)[！!？\?]*$/.test(cleanInput)) return true;

    const now = Date.now();
    const isVeryRecent = (now - this.lastSpeechEndTime) < 1800;

    for (const spoken of this.recentSpokenTexts) {
      if (!spoken) continue;
      const normalizedSpoken = spoken.replace(/[\s、。！？ニャンニャホ]/g, '');

      if (normalizedSpoken === normalizedInput) return true;

      if (isVeryRecent && normalizedSpoken.length >= 10) {
        const tail10 = normalizedSpoken.slice(-10);
        const tail15 = normalizedSpoken.slice(-15);
        if (normalizedInput.length >= 2 && (tail10.endsWith(normalizedInput) || tail15.endsWith(normalizedInput))) {
          Logger.log(`[Mic] 🛑 長文末尾エコーを検知・除外: 「${cleanInput}」 (直前発話末尾と一致)`, "info");
          return true;
        }
      }
    }
    return false;
  }

  async speak(text, speakerIdOverride = null, onStart = null, onEnd = null, cooldownOverride = null) {
    this.isSpeechProducing = true;
    this.stopSpeaking();
    this.stopListening();
    this.unlockMasterAudio();

    const speakerId = (speakerIdOverride !== null) ? speakerIdOverride : AppCore.getSpeakerId();

    let clean = (text || '').replace(/https?:\/\/[^\s]+/gi, '');
    clean = this._convertAllNumbersToKana(clean).replace(/<[^>]*>/g, '').replace(/[*#_~`🐾🐱✨❤️💖🎀🧠⚡🩺💭🎵🍜🥟📍📰🗺️⭐💥📒📖🌐🔷🔴🌤️🛍️💡🐟📷🏠🔮🦉]/gu, '').trim();

    let dynamicCooldown = (cooldownOverride !== null) ? cooldownOverride : (clean.length > 70 ? 600 : 400);

    if (!clean) {
      this.isSpeechProducing = false;
      if (onStart) onStart(); if (onEnd) onEnd();
      setTimeout(() => { if (AppCore.state.isRunning && !this.isActionButtonLocked) this.startListening(); }, dynamicCooldown);
      return;
    }

    this.recentSpokenTexts.unshift(clean);
    if (this.recentSpokenTexts.length > 5) this.recentSpokenTexts.pop();

    try {
      const blobAudioUrl = await this._getVoicevoxBlobUrl(clean, speakerId);
      this.masterAudio.src = blobAudioUrl;
      this.masterAudio.playbackRate = this.rate;

      this.masterAudio.onplaying = () => {
        this.isSpeaking = true;
        if (AppCore.state.isRunning) {
          const st = document.getElementById('status-text');
          if (st) st.textContent = "🗣️ お話し中♪";
        }
        if (onStart) onStart();
      };

      this.masterAudio.onended = () => {
        this.isSpeaking = false;
        this.lastSpeechEndTime = Date.now();
        if (onEnd) onEnd();
        
        setTimeout(() => {
          this.isSpeechProducing = false;
          if (AppCore.state.isRunning && !this.isSpeaking && !this.isReadingAloud && !this.isActionButtonLocked && !AppCore.state.isThinking && !AppCore.state.isProcessingInput) {
            const st = document.getElementById('status-text');
            const suffix = getCurChar().id === 'shiro' ? 'ホ♪' : 'ニャ♪';
            if (st) st.textContent = `👂 聴いてる${suffix}`;
            this.startListening();
          }
        }, dynamicCooldown);
      };

      this.masterAudio.onerror = (e) => {
        Logger.log(`[Audio] 再生エラー発生`, "error");
        this.isSpeaking = false;
        if (onStart) onStart(); if (onEnd) onEnd();
        setTimeout(() => {
          this.isSpeechProducing = false;
          if (AppCore.state.isRunning) this.startListening();
        }, dynamicCooldown);
      };

      await this.masterAudio.play();

    } catch(err) {
      Logger.log(`[TTS] ⚠️ 音声スキップ発話 (安全復帰): ${err.message}`, "warn");
      this.isSpeaking = false;
      if (onStart) onStart();
      if (onEnd) onEnd();

      setTimeout(() => {
        this.isSpeechProducing = false;
        this.lastSpeechEndTime = Date.now();
        if (AppCore.state.isRunning && !this.isActionButtonLocked && !AppCore.state.isThinking) {
          const st = document.getElementById('status-text');
          const suffix = getCurChar().id === 'shiro' ? 'ホ♪' : 'ニャ♪';
          if (st) st.textContent = `👂 聴いてる${suffix}`;
          this.startListening();
        }
      }, dynamicCooldown);
    }
  }

  async readDiarySeamless(diaryContentOnly, speakerIdOverride = null, onSentenceStart = null, onComplete = null) {
    this.isSpeechProducing = true;
    this.stopSpeaking();
    this.stopListening();
    this.unlockMasterAudio();
    this.isReadingAloud = true;
    this.readingAbortController = new AbortController();
    const speakerId = (speakerIdOverride !== null) ? speakerIdOverride : AppCore.getSpeakerId();
    Logger.log(`[Diary] 朗読モード開始`, "info");

    let readBody = (diaryContentOnly || '').replace(/^【?\d{4}年\d{1,2}月\d{1,2}日[\s\S]*?(?:℃|度|天気[^\n]+)?】?\s*\n*/u, '').trim();
    readBody = readBody.replace(/(?:【?(?:クロ|ホウ博士|シロ)の(?:ひとこと|一言|メッセージ)[:：]?】?|🐾\s*クロのひとこと[:：]?|クロのひとこと[:：]?|ホウ博士のひとこと[:：]?)\s*[^\n]+$/u, '').trim();

    const sentences = this.cleanEndingNenyan(readBody)
      .split(/([。！？!\?\n]+)/)
      .reduce((acc, cur, i, arr) => {
        if (i % 2 === 0 && cur.trim()) acc.push((cur + (arr[i+1]||'')).trim());
        return acc;
      }, []).filter(s => s.length > 0);

    for (let i = 0; i < sentences.length; i++) {
      if (!this.isReadingAloud || !AppCore.state.isRunning) break;
      let clean = sentences[i].replace(/https?:\/\/[^\s]+/gi, '');
      clean = this._convertAllNumbersToKana(clean).trim();
      if (!clean) continue;
      if (onSentenceStart) onSentenceStart(i, sentences[i]);
      try {
        const blobUrl = await this._getVoicevoxBlobUrl(clean, speakerId);
        if (!this.isReadingAloud || !AppCore.state.isRunning) break;
        await new Promise(resolve => {
          this.masterAudio.src = blobUrl;
          this.masterAudio.playbackRate = this.rate;
          this.isSpeaking = true;
          if (AppCore.avatar && AppCore.state.isRunning) AppCore.avatar.setEmotion('talking');
          this.masterAudio.onended = () => { this.isSpeaking = false; resolve(); };
          this.masterAudio.onerror = () => { this.isSpeaking = false; resolve(); };
          this.masterAudio.play().catch(() => resolve());
        });
      } catch(e) {
        await new Promise(r => setTimeout(r, 600));
      }
    }

    this.isReadingAloud = false;
    this.isSpeaking = false;
    this.lastSpeechEndTime = Date.now();
    if (AppCore.avatar && AppCore.state.isRunning) AppCore.avatar.setEmotion('idle');
    const st = document.getElementById('status-text');
    const suffix = getCurChar().id === 'shiro' ? 'ホ♪' : 'ニャ♪';
    if (st && AppCore.state.isRunning) st.textContent = `👂 聴いてる${suffix}`;
    if (onComplete) onComplete();

    setTimeout(() => {
      this.isSpeechProducing = false;
      if (AppCore.state.isRunning) this.startListening();
    }, 500);
  }

  stopReadingAloud() {
    this.isReadingAloud = false;
    this.isSpeechProducing = false;
    if (this.readingAbortController) { this.readingAbortController.abort(); this.readingAbortController = null; }
    this.stopSpeaking();
  }

  stopSpeaking() {
    this.isSpeaking = false;
    this.masterAudio.pause(); this.masterAudio.currentTime = 0;
    this.fillerAudio.pause(); this.fillerAudio.currentTime = 0;
  }

  _setupRecognition() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      Logger.log(`[Mic] ⚠️ Web Speech API非対応ブラウザです`, "warn");
      return;
    }
    this.recognition = new SpeechRec();
    this.recognition.lang = 'ja-JP';
    this.recognition.continuous = true;
    this.recognition.interimResults = false;

    this.recognition.onstart = () => {
      if (this.isSpeechProducing || this.isSpeaking || this.isReadingAloud) {
        try { this.recognition.abort(); } catch(e) {}
        this.isListening = false;
        this.isStarting = false;
        return;
      }
      this.isListening = true;
      this.isStarting = false;
      Logger.log(`[Mic] 👂 マイク待機開始`, "info");
      if (this.onListeningStatus) this.onListeningStatus(true);
    };

    this.recognition.onresult = (event) => {
      if (this.isSpeechProducing || this.isSpeaking || this.isReadingAloud || this.isActionButtonLocked || AppCore.state.isProcessingInput) return;
      const lastIdx = event.results.length - 1;
      let rawText = event.results[lastIdx]?.[0]?.transcript?.trim() || '';
      if (!rawText) return;

      const resultText = this.correctSpeechInput(rawText);
      Logger.log(`[Mic] 🎤 音声認識：「${rawText}」➔ 補正後:「${resultText}」`, "info");

      if (/(?:ストップ|やめて|とまって|止めて|タイマー.*(?:止めて|やめて|消して)|アラーム.*(?:止めて|消して))/.test(resultText)) {
        AppCore.cancelKitchenTimer(true);
        this.stopReadingAloud(); this.stopSpeaking();
        if (this.onBargeIn) this.onBargeIn();
        return;
      }

      if (this._isSelfEcho(resultText)) {
        Logger.log(`[Mic] 自声エコー除外: 「${resultText}」`, "info");
        return;
      }
      if (this.onSpeechFinal) this.onSpeechFinal(resultText);
    };

    this.recognition.onerror = (e) => {
      this.isStarting = false; this.lastMicErrorTime = Date.now();
      Logger.log(`[Mic] エラー: ${e.error}`, "warn");
      if (e.error === 'not-allowed') this.isListening = false;
    };

    this.recognition.onend = () => {
      this.isListening = false; this.isStarting = false;
      if (this.onListeningStatus) this.onListeningStatus(false);

      if (!AppCore.state.isRunning || this.isSpeechProducing || this.isSpeaking || this.isReadingAloud || this.isActionButtonLocked || AppCore.state.isProcessingInput) return;

      if (this.restartTimer) clearTimeout(this.restartTimer);
      this.restartTimer = setTimeout(() => {
        if (AppCore.state.isRunning && !this.isSpeechProducing && !this.isSpeaking && !this.isListening) {
          this.startListening();
        }
      }, 350);
    };
  }

  startListening() {
    if (!this.recognition || !AppCore.state.isRunning || this.isSpeechProducing || this.isSpeaking || this.isReadingAloud || this.isActionButtonLocked || this.isListening || this.isStarting) return;
    try {
      this.isStarting = true;
      this.recognition.start();
    } catch(e) {
      this.isStarting = false;
    }
  }

  stopListening() {
    this.isListening = false;
    this.isStarting = false;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    if (this.recognition) {
      try { this.recognition.abort(); } catch(e) {}
    }
    if (this.onListeningStatus) this.onListeningStatus(false);
  }
}

/* ==========================================================================
   MODULE 2: オンデマンドGPS ＆ リアルタイム在宅センサー
   ========================================================================== */
const LocationProvider = {
  lat: null, lon: null, homeLat: null, homeLon: null,
  cityArea: "東村山市", detailedAddress: "東京都東村山市本町付近",
  townLevelArea: "東村山市本町付近", cleanCityOnly: "東村山市", detailedTownArea: "東村山市本町付近",
  nearbySpots: [], weather: "快晴", temperature: "10", isAtHome: true,

  calcDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  },

  initWatcher() {
    this._loadHomeCoordsFromStorage();
    this.fetchLocationOnDemand(false);
  },

  _loadHomeCoordsFromStorage() {
    const homeVal = (localStorage.getItem('kuro_home_coords') || '').trim();
    if (!homeVal) {
      this.homeLat = 35.7582; this.homeLon = 139.4678;
      return;
    }
    const match = homeVal.match(/([-+]?\d+\.\d+)\s*,\s*([-+]?\d+\.\d+)/);
    if (match) {
      this.homeLat = parseFloat(match[1]);
      this.homeLon = parseFloat(match[2]);
      Logger.log(`[GPS] 拠点座標読込完了: ${this.homeLat}, ${this.homeLon}`, "info");
    } else {
      this.homeLat = 35.7582; this.homeLon = 139.4678;
    }
  },

  async fetchLocationOnDemand(fetchSpots = true) {
    this._loadHomeCoordsFromStorage();
    if (!('geolocation' in navigator)) { await this._applyHomeFallback(); return false; }
    return new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          this.lat = pos.coords.latitude; this.lon = pos.coords.longitude;
          await this._reverseGeocode(this.lat, this.lon);
          this._checkHomeProximity();
          await this._fetchWeather(this.lat, this.lon);
          Logger.log(`[GPS] 📍 リアルタイム最新測位完了: ${this.detailedTownArea} (${this.isAtHome ? 'お家' : 'お散歩中'})`, "info");
          AppCore.updateTopHeaderClockWeatherUI();
          resolve(true);
        },
        async () => {
          await this._applyHomeFallback();
          AppCore.updateTopHeaderClockWeatherUI();
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 10000 }
      );
    });
  },

  _checkHomeProximity() {
    if (this.homeLat !== null && this.homeLon !== null && this.lat !== null && this.lon !== null) {
      const dist = this.calcDistanceMeters(this.lat, this.lon, this.homeLat, this.homeLon);
      this.isAtHome = (dist <= 150);
      Logger.log(`[GPS] 拠点照合: 距離=${dist}m ➔ ${this.isAtHome ? '🏠 お家' : '🐾 お外'}`, "info");
    } else {
      this.isAtHome = true;
    }
  },

  async _applyHomeFallback() {
    this._loadHomeCoordsFromStorage();
    this.lat = this.homeLat;
    this.lon = this.homeLon;
    this.isAtHome = true;
    await this._reverseGeocode(this.lat, this.lon);
    await this._fetchWeather(this.lat, this.lon);
    if (!this.detailedTownArea || this.detailedTownArea === "東村山市付近") {
      this.detailedTownArea = "東村山市本町付近";
      this.cleanCityOnly = "東村山市";
    }
  },

  async _fetchWeather(lat, lon) {
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
      if (res.ok) {
        const data = await res.json();
        if (data.current_weather) {
          this.temperature = Math.round(data.current_weather.temperature);
          const c = data.current_weather.weathercode || 0;
          this.weather = (c <= 1) ? "快晴" : (c <= 3 ? "くもり" : (c >= 71 ? "雪" : "雨"));
          Logger.log(`[Weather] 🌤️ 天気取得: ${this.weather} (${this.temperature}℃)`, "info");
        }
      }
    } catch(e) {}
  },

  async _reverseGeocode(lat, lon) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=ja`);
      if (res.ok) {
        const a = (await res.json()).address || {};
        const pref = a.province || a.state || "";
        const city = a.city || a.ward || a.town || a.village || "";
        const sub = a.suburb || a.quarter || a.neighbourhood || a.city_district || "";
        
        this.cleanCityOnly = city ? city.trim() : (pref.includes("東京") ? "東村山市" : "市内");
        this.cityArea = `${pref}${city}`.trim() || "東京都東村山市";
        this.detailedTownArea = sub ? `${this.cleanCityOnly}${sub}付近` : `${this.cleanCityOnly}付近`;
        this.townLevelArea = this.detailedTownArea;
        this.detailedAddress = [pref, city, sub].filter(Boolean).join("") || "東京都東村山市本町";
      }
    } catch(e) {
      this.cleanCityOnly = "東村山市";
      this.detailedTownArea = "東村山市本町付近";
      this.townLevelArea = "東村山市本町付近";
    }
  }
};

/* ==========================================================================
   MODULE 3: ストレージ管理 ＆ 非破壊データ保護 ＆ 恒久大掃除エンジン
   ========================================================================== */
const DATA_KEYS = {
  MEMORIES: 'kuro_data_memories',
  DIARIES:  'kuro_data_diaries',
  RECENT_LOGS: 'kuro_recent_chat_logs'
};

const StorageManager = {
  defaultGlassesCoordsKuro: {
    idle: { x: 0, y: 120, scale: 1.0, rotate: 0 },
    talking: { x: 0, y: 120, scale: 1.0, rotate: 0 },
    thinking: { x: 0, y: 120, scale: 1.0, rotate: 0 },
    happy: { x: 0, y: 120, scale: 1.0, rotate: 0 }
  },
  defaultEyelidCoordsKuro: { y: 172, x: 0, gap: 28, size: 16, rotate: 0 },

  _getCharSpecificKey(baseKey) {
    const curId = getCurChar().id;
    if (curId === 'kuro') return baseKey;
    return `${baseKey}_${curId}`;
  },

  getStorageUsage() {
    let totalBytes = 0, photoBytes = 0, chatBytes = 0, metaBytes = 0;
    const trackedPhotoSet = new Set();

    try {
      for (let k in localStorage) {
        if (!localStorage.hasOwnProperty(k)) continue;
        if (k.startsWith('kuro_daily_photos_')) {
          const val = localStorage[k];
          const bytes = (val.length + k.length) * 2;
          photoBytes += bytes;
          totalBytes += bytes;
          try {
            const arr = JSON.parse(val) || [];
            arr.forEach(p => { if (p && p.base64) trackedPhotoSet.add(p.base64); });
          } catch(e) {}
        }
      }

      for (let k in localStorage) {
        if (!localStorage.hasOwnProperty(k)) continue;
        if (k.startsWith('kuro_data_diaries')) {
          const diaryVal = localStorage[k];
          const rawBytes = (diaryVal.length + k.length) * 2;
          try {
            const diaries = JSON.parse(diaryVal) || [];
            let uniqueDiaryPhotoBytes = 0;
            diaries.forEach(d => {
              if (d && d.photo && typeof d.photo === 'string') {
                if (!trackedPhotoSet.has(d.photo)) {
                  uniqueDiaryPhotoBytes += (d.photo.length * 2);
                }
              }
            });
            photoBytes += uniqueDiaryPhotoBytes;
            const diaryMeta = Math.max(0, rawBytes - uniqueDiaryPhotoBytes);
            metaBytes += diaryMeta;
            totalBytes += rawBytes;
          } catch(e) {
            metaBytes += rawBytes;
            totalBytes += rawBytes;
          }
        }
      }

      for (let k in localStorage) {
        if (!localStorage.hasOwnProperty(k)) continue;
        if (k.startsWith('kuro_daily_photos_') || k.startsWith('kuro_data_diaries')) continue;

        const val = localStorage[k];
        const bytes = (val.length + k.length) * 2;
        totalBytes += bytes;

        if (k.startsWith('kuro_daily_logs_') || k.startsWith('kuro_recent_chat_logs')) {
          chatBytes += bytes;
        } else {
          metaBytes += bytes;
        }
      }
    } catch(e) {}

    const toMB = (b) => parseFloat((b / (1024 * 1024)).toFixed(2));
    const usedMB = toMB(totalBytes);
    const limitMB = 5.0;
    const percent = Math.min(100, Math.round((totalBytes / (limitMB * 1024 * 1024)) * 100));

    return {
      usedMB, limitMB, percent,
      photoMB: toMB(photoBytes), photoPct: Math.min(100, Math.round((photoBytes / (limitMB * 1024 * 1024)) * 100)),
      chatMB: toMB(chatBytes), chatPct: Math.min(100, Math.round((chatBytes / (limitMB * 1024 * 1024)) * 100)),
      metaMB: toMB(metaBytes), metaPct: Math.min(100, Math.round((metaBytes / (limitMB * 1024 * 1024)) * 100)),
      isWarning: percent >= 75, isDanger: percent >= 90
    };
  },

  loadGlassesCoords() {
    const cur = getCurChar();
    const curId = cur.id;
    const defaultCoords = cur.defaultAccessoryCoords || this.defaultGlassesCoordsKuro;
    const key = `kuro_glasses_coords_v5_${curId}`;
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      if (saved) return saved;
      if (curId === 'kuro') {
        return JSON.parse(localStorage.getItem('kuro_glasses_coords_v5')) || defaultCoords;
      }
      return defaultCoords;
    } catch(e) {
      return defaultCoords;
    }
  },
  saveGlassesCoords(c) {
    const key = `kuro_glasses_coords_v5_${getCurChar().id}`;
    localStorage.setItem(key, JSON.stringify(c));
  },

  loadEyelidCoords() {
    const cur = getCurChar();
    const curId = cur.id;
    const defaultCoords = cur.defaultEyelidCoords || this.defaultEyelidCoordsKuro;
    const key = `kuro_eyelid_coords_v6_${curId}`;
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      if (saved) return saved;
      if (curId === 'kuro') {
        return JSON.parse(localStorage.getItem('kuro_eyelid_coords_v6')) || defaultCoords;
      }
      return defaultCoords;
    } catch(e) {
      return defaultCoords;
    }
  },
  saveEyelidCoords(c) {
    const key = `kuro_eyelid_coords_v6_${getCurChar().id}`;
    localStorage.setItem(key, JSON.stringify(c));
  },

  loadRecentTimelineLogs() {
    const key = this._getCharSpecificKey(DATA_KEYS.RECENT_LOGS);
    try { return JSON.parse(localStorage.getItem(key)) || []; } catch(e) { return []; }
  },
  clearTimelineDisplayOnly() {
    const key = this._getCharSpecificKey(DATA_KEYS.RECENT_LOGS);
    localStorage.setItem(key, JSON.stringify([]));
  },

  appendChatLog(role, text, photoUrl = null) {
    if (!text) return;
    const timeInfo = TimeProvider.getCurrentInfo();
    let cleanText = (text || '').replace(/https?:\/\/[^\s]+/gi, '').trim();
    cleanText = AppCore.audio.cleanEndingNenyan(cleanText);
    if (!cleanText) return;

    const entry = {
      role, text: cleanText,
      mode: AppCore.state.isAssistantMode ? 'assistant' : 'pet',
      time: timeInfo.clock, date: timeInfo.lifeLogKey,
      photoUrl: null,
      hasPhoto: !!photoUrl, timestamp: Date.now()
    };
    try {
      const recentKey = this._getCharSpecificKey(DATA_KEYS.RECENT_LOGS);
      const recent = this.loadRecentTimelineLogs();
      const rEntry = { ...entry };
      if (photoUrl && photoUrl.length < 50000) rEntry.photoUrl = photoUrl;
      recent.push(rEntry);
      localStorage.setItem(recentKey, JSON.stringify(recent.slice(-30)));

      const activeId = getCurChar().id;
      const dailyKey = activeId === 'kuro' ? `kuro_daily_logs_${timeInfo.lifeLogKey}` : `kuro_daily_logs_${activeId}_${timeInfo.lifeLogKey}`;
      const daily = JSON.parse(localStorage.getItem(dailyKey) || '[]');
      daily.push(entry);
      localStorage.setItem(dailyKey, JSON.stringify(daily.slice(-1000)));
    } catch(e) {}
  },

  rollbackLastExchange(includeModelReply = false) {
    try {
      const timeInfo = TimeProvider.getCurrentInfo();
      const activeId = getCurChar().id;
      const dailyKey = activeId === 'kuro' ? `kuro_daily_logs_${timeInfo.lifeLogKey}` : `kuro_daily_logs_${activeId}_${timeInfo.lifeLogKey}`;
      const recentKey = this._getCharSpecificKey(DATA_KEYS.RECENT_LOGS);

      let recent = this.loadRecentTimelineLogs();
      let daily = JSON.parse(localStorage.getItem(dailyKey) || '[]');

      let removed = false;

      if (includeModelReply && recent.length > 0 && recent[recent.length - 1].role === 'model') {
        recent.pop();
        if (daily.length > 0 && daily[daily.length - 1].role === 'model') daily.pop();
        removed = true;
      }

      if (recent.length > 0 && recent[recent.length - 1].role === 'user') {
        recent.pop();
        if (daily.length > 0 && daily[daily.length - 1].role === 'user') daily.pop();
        removed = true;
      }

      if (removed) {
        localStorage.setItem(recentKey, JSON.stringify(recent));
        localStorage.setItem(dailyKey, JSON.stringify(daily));
        Logger.log(`[Rollback] ↩️ 直前の誤認識発言を安全に取り消しました`, "info");
        return true;
      }
    } catch(e) {
      Logger.log(`[Rollback] ⚠️ ロールバック例外: ${e.message}`, "error");
    }
    return false;
  },

  getDailyLogs(lifeDateKey) {
    const activeId = getCurChar().id;
    const dailyKey = activeId === 'kuro' ? `kuro_daily_logs_${lifeDateKey}` : `kuro_daily_logs_${activeId}_${lifeDateKey}`;
    try { return JSON.parse(localStorage.getItem(dailyKey)) || []; } catch(e) { return []; }
  },

  addPhotoToDailyPool(photoBase64, userComment = "") {
    const timeInfo = TimeProvider.getCurrentInfo();
    const activeId = getCurChar().id;
    const key = activeId === 'kuro' ? `kuro_daily_photos_${timeInfo.lifeLogKey}` : `kuro_daily_photos_${activeId}_${timeInfo.lifeLogKey}`;
    try {
      let pool = JSON.parse(localStorage.getItem(key) || '[]');
      const exists = pool.some(p => p.base64 === photoBase64);
      if (!exists) {
        pool.push({ base64: photoBase64, comment: userComment, time: timeInfo.clock, timestamp: Date.now() });
        localStorage.setItem(key, JSON.stringify(pool.slice(-12)));
        Logger.log(`[Storage] 写真プール保存完了 (本日:${pool.length}枚)`, "info");
      }
    } catch(e) {}
  },

  removePhotoFromDailyPool(lifeDateKey, photoIndex) {
    const activeId = getCurChar().id;
    const key = activeId === 'kuro' ? `kuro_daily_photos_${lifeDateKey}` : `kuro_daily_photos_${activeId}_${lifeDateKey}`;
    try {
      let pool = JSON.parse(localStorage.getItem(key) || '[]');
      if (photoIndex < 0 || photoIndex >= pool.length) return false;
      const del = pool.splice(photoIndex, 1)[0];
      localStorage.setItem(key, JSON.stringify(pool));

      const diaries = this.loadAllDiaries();
      const target = diaries.find(d => d.dateKey === lifeDateKey);
      if (target && target.photo === del.base64) {
        target.photo = pool.length > 0 ? pool[0].base64 : null;
        this.saveAllDiaries(diaries);
      }
      return true;
    } catch(e) { return false; }
  },

  getDailyPhotoPool(lifeDateKey) {
    const activeId = getCurChar().id;
    const key = activeId === 'kuro' ? `kuro_daily_photos_${lifeDateKey}` : `kuro_daily_photos_${activeId}_${lifeDateKey}`;
    try {
      let pool = JSON.parse(localStorage.getItem(key)) || [];
      if (pool.length === 0) {
        const diaries = this.loadAllDiaries();
        const d = diaries.find(item => item.dateKey === lifeDateKey);
        if (d && d.photo) {
          pool = [{ base64: d.photo, comment: "メイン写真", time: "12:00", timestamp: d.timestamp || Date.now() }];
          localStorage.setItem(key, JSON.stringify(pool));
        }
      }
      return pool;
    } catch(e) { return []; }
  },

  loadMemories(defaultMemories) {
    const key = this._getCharSpecificKey(DATA_KEYS.MEMORIES);
    try {
      const parsed = JSON.parse(localStorage.getItem(key));
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch(e) {}
    const initList = defaultMemories || getCurChar().defaultMemories || [];
    this.saveMemories(initList);
    return initList;
  },
  saveMemories(m) {
    const key = this._getCharSpecificKey(DATA_KEYS.MEMORIES);
    localStorage.setItem(key, JSON.stringify(m));
  },

  loadAllDiaries() {
    const key = this._getCharSpecificKey(DATA_KEYS.DIARIES);
    try {
      const list = JSON.parse(localStorage.getItem(key)) || [];
      const timeInfo = TimeProvider.getCurrentInfo();
      const todayKey = timeInfo.lifeLogKey;

      return list.map(d => {
        if (d.dateKey !== todayKey) {
          if (d.kuroComment && d.kuroComment.includes("今日もおやびんと一緒で最高に幸せな一日だった")) {
            d.kuroComment = "";
          }
        }
        return d;
      });
    } catch(e) { return []; }
  },
  saveAllDiaries(list) {
    const key = this._getCharSpecificKey(DATA_KEYS.DIARIES);
    localStorage.setItem(key, JSON.stringify(list));
  },

  isProperDiary(diary) {
    if (!diary || !diary.content) return false;
    const txt = diary.content.trim();
    if (txt.includes("今日はおやびんと写真を見せ合って楽しかったニャン♪") && txt.length < 50) return false;
    if (txt.includes("今日は助手と写真を見せ合って楽しかったホ！") && txt.length < 50) return false;
    return (txt.length >= 30);
  },

  hasDiary(dateKey) {
    const d = this.getDiary(dateKey);
    return this.isProperDiary(d);
  },

  getDiary(dateKey) {
    const list = this.loadAllDiaries();
    return list.find(d => d.dateKey === dateKey) || null;
  },

  saveDiary(entryText, customDateKey = null, customFullDate = null, photoData = null, currentLogCount = null, kuroComment = null) {
    if (!entryText || entryText.length < 15) return false;
    const timeInfo = TimeProvider.getCurrentInfo();
    const dateKey = customDateKey || timeInfo.lifeLogKey;
    const fullDate = customFullDate || (customDateKey ? TimeProvider.formatDateKeyToFull(customDateKey) : timeInfo.lifeFullDate);

    let cleanContent = entryText.replace(/https?:\/\/[^\s]+/gi, '');
    cleanContent = AppCore.audio.cleanEndingNenyan(cleanContent);
    let extractedComment = kuroComment;

    const match = cleanContent.match(/(?:【?(?:クロ|ホウ博士|シロ)の(?:ひとこと|一言|メッセージ)[:：]?】?|🐾\s*クロのひとこと[:：]?|クロのひとこと[:：]?|ホウ博士のひとこと[:：]?|🦉\s*ホウ博士のひとこと[:：]?)\s*([^\n]+)/);
    if (match) {
      if (!extractedComment) extractedComment = match[1].trim();
      cleanContent = cleanContent.replace(/(?:【?(?:クロ|ホウ博士|シロ)の(?:ひとこと|一言|メッセージ)[:：]?】?|🐾\s*クロのひとこと[:：]?|クロのひとこと[:：]?|ホウ博士のひとこと[:：]?|🦉\s*ホウ博士のひとこと[:：]?)\s*[^\n]+$/, '').trim();
    }

    cleanContent = cleanContent.replace(/^【?[0-9０-９一二三四五六七八九〇]+年[^\n]+】?\s*\n*/u, '').trim();
    cleanContent = cleanContent.replace(/^(?:今日|きょう)は[0-9０-９一二三四五六七八九〇]+年[^\n。！？]*[。！？\n]\s*/u, '').trim();

    const weatherStr = LocationProvider.weather || "快晴";
    const tempStr = LocationProvider.temperature !== null ? `${LocationProvider.temperature}℃` : "10℃";
    const unifiedHeader = `【${fullDate} 天気:${weatherStr} 気温:${tempStr}】\n\n`;

    const finalizedContent = unifiedHeader + cleanContent;

    let list = this.loadAllDiaries();
    const idx = list.findIndex(d => d.dateKey === dateKey);

    if (idx >= 0 && !extractedComment) {
      extractedComment = list[idx].kuroComment || "";
    }

    const recordedLogCount = (currentLogCount !== null) ? currentLogCount : this.getDailyLogs(dateKey).length;

    let targetPhoto = photoData || (idx >= 0 ? list[idx].photo : null) || null;
    if (targetPhoto) {
      this.addPhotoToDailyPool(targetPhoto, "絵日記メイン写真");
    }

    const diaryData = {
      dateKey, fullDate,
      weather: weatherStr, temperature: LocationProvider.temperature,
      content: finalizedContent,
      kuroComment: extractedComment || "",
      photo: targetPhoto,
      timestamp: Date.now(),
      logCountAtSave: recordedLogCount
    };

    if (idx >= 0) {
      list[idx] = diaryData;
    } else {
      list.unshift(diaryData);
    }
    this.saveAllDiaries(list);
    Logger.log(`[Diary] 📖 絵日記保存完了: ${fullDate} (ログ数:${recordedLogCount})`, "success");
    return true;
  },

  attachPhotoToTodayDiary(photoBase64) {
    const timeInfo = TimeProvider.getCurrentInfo();
    this.addPhotoToDailyPool(photoBase64, "写真を見せた記録");
    let list = this.loadAllDiaries();
    const idx = list.findIndex(d => d.dateKey === timeInfo.lifeLogKey);
    const defTxt = getCurChar().id === 'shiro'
      ? "今日は助手と写真を見せ合って楽しい時間を過ごしたホ！"
      : "今日はおやびんと写真を見せ合って楽しかったニャン♪";

    if (idx >= 0) {
      list[idx].photo = photoBase64;
      this.saveAllDiaries(list);
    } else {
      this.saveDiary(defTxt, timeInfo.lifeLogKey, timeInfo.lifeFullDate, photoBase64, 1);
    }
  },

  getTodayDiary() {
    return this.loadAllDiaries().find(d => d.dateKey === TimeProvider.getCurrentInfo().lifeLogKey) || null;
  },
  getRecentDiariesSummary(count = 3) {
    return this.loadAllDiaries().slice(0, count).map(d => `・【${d.fullDate}】: ${d.content}`).join("\n");
  },
  findRelevantPastDiary(queryText) {
    if (!queryText || !/(?:昔|前|先週|先月|昨日|覚えてる)/.test(queryText)) return null;
    const list = this.loadAllDiaries();
    return list.length > 1 ? list[1] : null;
  },

  async executeSafeStorageDeepClean() {
    Logger.log("[DeepClean] 🧹 安全ストレージ大掃除を開始…", "info");

    this.downloadPhotoArchivePackage();
    await new Promise(r => setTimeout(r, 600));

    const compressToThumbnail = (base64Str) => {
      return new Promise((resolve) => {
        if (!base64Str || typeof base64Str !== 'string' || !base64Str.startsWith('data:image/')) {
          resolve(base64Str);
          return;
        }
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            let w = img.width, h = img.height;
            const maxDim = 180;
            if (w > maxDim) { h = Math.round((h * maxDim) / w); w = maxDim; }
            canvas.width = Math.max(1, w);
            canvas.height = Math.max(1, h);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            const slimBase64 = canvas.toDataURL('image/jpeg', 0.45);
            resolve(slimBase64 && slimBase64.length > 100 ? slimBase64 : base64Str);
          } catch(e) {
            resolve(base64Str);
          }
        };
        img.onerror = () => resolve(base64Str);
        img.src = base64Str;
      });
    };

    let processedPhotos = 0;
    const photoMapping = new Map();

    for (let k in localStorage) {
      if (!localStorage.hasOwnProperty(k)) continue;
      if (k.startsWith('kuro_daily_photos_')) {
        try {
          const pool = JSON.parse(localStorage[k]) || [];
          for (let p of pool) {
            if (p && p.base64) {
              const old = p.base64;
              if (!photoMapping.has(old)) {
                const slim = await compressToThumbnail(old);
                photoMapping.set(old, slim);
                p.base64 = slim;
                processedPhotos++;
              } else {
                p.base64 = photoMapping.get(old);
              }
            }
          }
          localStorage.setItem(k, JSON.stringify(pool));
        } catch(e) {}
      }
    }

    const diaries = this.loadAllDiaries();
    for (let d of diaries) {
      if (d && d.photo) {
        if (photoMapping.has(d.photo)) {
          d.photo = photoMapping.get(d.photo);
        } else {
          const slim = await compressToThumbnail(d.photo);
          photoMapping.set(d.photo, slim);
          d.photo = slim;
          processedPhotos++;
        }
      }
    }
    this.saveAllDiaries(diaries);

    for (let k in localStorage) {
      if (!localStorage.hasOwnProperty(k)) continue;
      if (k.startsWith('kuro_daily_logs_')) {
        try {
          const logs = JSON.parse(localStorage[k]) || [];
          logs.forEach(l => { if (l) delete l.photoUrl; });
          localStorage.setItem(k, JSON.stringify(logs));
        } catch(e) {}
      }
    }

    const recentLogs = this.loadRecentTimelineLogs();
    recentLogs.forEach(l => { if (l && l.photoUrl && photoMapping.has(l.photoUrl)) l.photoUrl = photoMapping.get(l.photoUrl); });
    const recentKey = this._getCharSpecificKey(DATA_KEYS.RECENT_LOGS);
    localStorage.setItem(recentKey, JSON.stringify(recentLogs));

    Logger.log(`[DeepClean] ✅ 大掃除完了: 写真${processedPhotos}枚を安全に3〜5KB化・重複完全パージ`, "success");
    return true;
  },

  downloadPhotoArchivePackage() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const ymd = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const allDailyPhotos = {};
    for (let k in localStorage) {
      if (k.startsWith('kuro_daily_photos_')) try { allDailyPhotos[k] = JSON.parse(localStorage[k]); } catch(e) {}
    }
    const pkg = {
      format: "kuro_photo_archive_v1",
      characterId: getCurChar().id,
      exportedAt: now.toLocaleString('ja-JP'),
      dailyPhotoPools: allDailyPhotos,
      diaries: this.loadAllDiaries().map(d => ({ dateKey: d.dateKey, fullDate: d.fullDate, photo: d.photo }))
    };
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AIペット_${getCurChar().name}_高画質写真アルバム_${ymd}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    Logger.log(`[Backup] 📷 高画質写真アルバム原本の書き出し完了`, "success");
  },

  downloadDataPackage() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const ymd = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const allDailyPhotos = {}, allDailyLogs = {};
    for (let k in localStorage) {
      if (k.startsWith('kuro_daily_photos_')) try { allDailyPhotos[k] = JSON.parse(localStorage[k]); } catch(e) {}
      if (k.startsWith('kuro_daily_logs_')) try { allDailyLogs[k] = JSON.parse(localStorage[k]); } catch(e) {}
    }
    const pkg = {
      format: "kuro_pure_data_package_v2",
      characterId: getCurChar().id,
      version: (typeof VersionManager !== 'undefined') ? VersionManager.current : "v1.0.0",
      exportedAt: now.toLocaleString('ja-JP'),
      memories: this.loadMemories([]),
      diaries: this.loadAllDiaries(),
      recentLogs: this.loadRecentTimelineLogs(),
      dailyPhotoPools: allDailyPhotos,
      dailyChatLogs: allDailyLogs,
      settings: {
        activeCharacter: localStorage.getItem('kuro_active_character') || 'kuro',
        speakerId: localStorage.getItem('kuro_voice_speaker_id') || String(getCurChar().defaultSpeakerId || 10),
        voiceRate: localStorage.getItem('kuro_rate') || String(getCurChar().defaultVoiceRate || 1.05),
        talkLength: localStorage.getItem('kuro_talk_length') || 'auto',
        buttonFeedback: localStorage.getItem('kuro_button_feedback') || 'voice',
        timerSound: localStorage.getItem('kuro_timer_sound') || 'bell',
        theme: localStorage.getItem('kuro_theme') || 'normal',
        newsCount: localStorage.getItem('kuro_news_count') || '2',
        spotCount: localStorage.getItem('kuro_spot_count') || '2',
        homeCoords: localStorage.getItem('kuro_home_coords') || '',
        accessoryStyle: localStorage.getItem('kuro_acc_style') || 'both',
        glassesCoords: this.loadGlassesCoords(),
        eyelidCoords: this.loadEyelidCoords()
      }
    };
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AIペット_${getCurChar().name}_完全バックアップ_${ymd}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    Logger.log(`[Backup] データ書き出し完了`, "success");
  },

  async importAndReplaceDataPackage(data) {
    if (!data || typeof data !== 'object') throw new Error("無効なバックアップデータです。");

    if (Array.isArray(data.memories)) this.saveMemories(data.memories);

    if (Array.isArray(data.diaries)) {
      const sanitizedDiaries = data.diaries.map(d => {
        if (d && d.content && !d.content.startsWith('【')) {
          const w = d.weather || "快晴";
          const t = d.temperature !== undefined ? `${d.temperature}℃` : "10℃";
          d.content = `【${d.fullDate || d.dateKey} 天気:${w} 気温:${t}】\n\n` + d.content.replace(/^【?[0-9０-９一二三四五六七八九〇]+年[^\n]+】?\s*\n*/u, '').trim();
        }
        return d;
      });
      this.saveAllDiaries(sanitizedDiaries);
    }

    if (Array.isArray(data.recentLogs)) {
      const recentKey = this._getCharSpecificKey(DATA_KEYS.RECENT_LOGS);
      localStorage.setItem(recentKey, JSON.stringify(data.recentLogs.slice(-30)));
    }

    if (data.settings && typeof data.settings === 'object') {
      const s = data.settings;
      if (s.activeCharacter) localStorage.setItem('kuro_active_character', s.activeCharacter);
      if (s.speakerId) localStorage.setItem('kuro_voice_speaker_id', s.speakerId);
      if (s.voiceRate) localStorage.setItem('kuro_rate', s.voiceRate);
      if (s.talkLength) localStorage.setItem('kuro_talk_length', s.talkLength);
      if (s.buttonFeedback) localStorage.setItem('kuro_button_feedback', s.buttonFeedback);
      if (s.timerSound) localStorage.setItem('kuro_timer_sound', s.timerSound);
      if (s.theme) { localStorage.setItem('kuro_theme', s.theme); AppCore.applyTheme(s.theme); }
      if (s.newsCount) localStorage.setItem('kuro_news_count', s.newsCount);
      if (s.spotCount) localStorage.setItem('kuro_spot_count', s.spotCount);
      if (s.homeCoords) localStorage.setItem('kuro_home_coords', s.homeCoords);
      if (s.accessoryStyle) localStorage.setItem('kuro_acc_style', s.accessoryStyle);
      if (s.glassesCoords) this.saveGlassesCoords(s.glassesCoords);
      if (s.eyelidCoords) this.saveEyelidCoords(s.eyelidCoords);
    }

    if (data.dailyChatLogs) {
      for (let k in data.dailyChatLogs) {
        try { localStorage.setItem(k, JSON.stringify(data.dailyChatLogs[k])); } catch(e) {}
      }
    }

    if (data.dailyPhotoPools) {
      for (let k in data.dailyPhotoPools) {
        try {
          localStorage.setItem(k, JSON.stringify(data.dailyPhotoPools[k]));
        } catch(quotaErr) {
          try {
            Logger.log(`[Import] ⚠️ 写真容量超過を検知。安全サムネイル制限を適用します`, "warn");
            const trimmed = (data.dailyPhotoPools[k] || []).slice(-4);
            localStorage.setItem(k, JSON.stringify(trimmed));
          } catch(e) {}
        }
      }
    }
    Logger.log(`[Backup] データ読み込み＆安全復元完了`, "success");
    return true;
  }
};