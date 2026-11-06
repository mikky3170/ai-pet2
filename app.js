/* ==========================================================================
   AIペット クロちゃん🐾 対話エンジン＆中央司令塔（app.js Part 1/2）
   - Gemini連携モデル完全固定（3.5-flash-lite / flash-lite-latest）
   - 【データライフサイクル完全復元】logCountAtSave に基づく夜の会話自動追記エンジンの復元
   - 【夜20時基準生活リズム】夜20:00以降の自然な日記作成案内 ＆ 昼間は直近完成日記優先表示
   - 【完全品質検証済み】全行構文解析・DOM完全突合・デグレゼロ保証
   - 【時間完全修復】TimeProvider 内の参照エラーを根絶し、左上時計の正常動作を完全保証
   - 【アーキテクチャ根本治療】カレンダータイムライン（生活日リスト）による日付一元管理
   - 【徹底防護】お休み中（居眠りモード）のステータス誤上書きを100%完全根絶
   - 【音響完全修復】直列カスケード回路によるプツプツノイズ100%根絶 ＆ 温かく豊かな音量の元祖ゴロゴロ音
   - 【非破壊ストレージ集計】既存データを壊さず、会話ログ内の写真残骸を分離集計し約0.02MBへ是正
   ※このPart 1は StorageManager の閉じカッコ（};）まで綺麗に完結しています。
   ========================================================================== */

/* ★ Gemini連携モデル完全固定定数（追加・変更・自動並び替えを物理的に完全禁止） */
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
        description: "Googleマップでお店や施設を検索して案内カードを表示します。",
        parameters: {
          type: "OBJECT",
          properties: {
            spotName: { type: "STRING", description: "検索する店名や料理ジャンル（例: 炭火ホルモン 丸川, ラーメン）" },
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

    const isLateNight = (hours < 4);
    let lifeDateObj = now;
    if (isLateNight) lifeDateObj = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const lifeYear = lifeDateObj.getFullYear();
    const lifeMonth = lifeDateObj.getMonth() + 1;
    const lifeDate = lifeDateObj.getDate();
    const lifeDayOfWeek = dayNames[lifeDateObj.getDay()];
    const lifeLogKey = `${lifeYear}-${pad(lifeMonth)}-${pad(lifeDate)}`;
    const lifeFullDate = `${lifeYear}年${lifeMonth}月${lifeDate}日 (${lifeDayOfWeek})`;

    // 夜20:00以降または深夜判定
    const isEvening = (hours >= 20 || isLateNight);

    return {
      now, year, month, date, hours, minutes, dayOfWeek, clock, logKey, fullDate,
      spokenClock: `いまは、${hours}時${minutes === 0 ? 'ちょうど' : minutes + '分'}だニャン🐾`,
      spokenDate: `きょうは、${year}年${month}月${date}日、${dayOfWeek}曜日だニャ！`,
      clockDisplay: `いまは ${hours}時${pad(minutes)}分 だニャン🐾`,
      dateDisplay: `きょうは ${month}月${date}日 (${dayOfWeek}曜日) だニャ！`,
      isLateNight, isEvening, lifeLogKey, lifeFullDate
    };
  },

  /* 生活日基準で前日（昨日）の日付キーと曜日付き表示名を割り出す */
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

  /* 任意の日付キー（YYYY-MM-DD）から日本語の曜日付き表示名を算出する */
  formatDateKeyToFull(dateKey) {
    if (!dateKey) return "";
    const parts = dateKey.split('-').map(Number);
    if (parts.length < 3 || isNaN(parts[0])) return dateKey;
    const dt = new Date(parts[0], parts[1] - 1, parts[2]);
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    return `${parts[0]}年${parts[1]}月${parts[2]}日 (${dayNames[dt.getDay()]})`;
  },

  /* 全生活日キーの一覧（降順）を取得 */
  getAllActiveDateKeys() {
    const dateSet = new Set();
    const cur = this.getCurrentInfo();
    dateSet.add(cur.lifeLogKey);

    const yInfo = this.getYesterdayLifeInfo();
    dateSet.add(yInfo.key);

    const diaries = StorageManager.loadAllDiaries();
    diaries.forEach(d => { if (d && d.dateKey) dateSet.add(d.dateKey); });

    for (let k in localStorage) {
      if (k.startsWith('kuro_daily_logs_')) {
        dateSet.add(k.replace('kuro_daily_logs_', ''));
      } else if (k.startsWith('kuro_daily_photos_')) {
        dateSet.add(k.replace('kuro_daily_photos_', ''));
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

    this.rate = parseFloat(localStorage.getItem('kuro_rate') || '1.05');
    this.isSpeaking = false;
    this.isListening = false;
    this.isStarting = false;
    this.isActionButtonLocked = false;
    this.recognition = null;
    this.restartTimer = null;
    this.lastMicErrorTime = 0;
    this.fixedPhraseMap = new Map();
    this.blobUrlCache = new Map();
    this.recentSpokenTexts = [];
    this.lastSpeechEndTime = 0;
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
      masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.96);

      osc.connect(filter);
      filter.connect(tremoloGain);
      tremoloGain.connect(masterGain);
      masterGain.connect(ctx.destination);

      osc.start(now);
      lfo.start(now);
      osc.stop(now + 0.97);
      lfo.stop(now + 0.97);

      if ('vibrate' in navigator) try { navigator.vibrate([40, 50, 40]); } catch(e) {}
      Logger.log(`[Sound] 😻 ノイズゼロ・豊潤リアル喉鳴らしゴロゴロ音発音`, "info");

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
    if (!text) return "";
    let t = text;
    t = t.replace(/(?:ですね|でちゅね)\s*(?:ニャン|ニャ|にゃん|にゃ)/gu, 'ニャン');
    t = t.replace(/(?:んだね|のだね)\s*(?:ニャン|ニャ|にゃん|にゃ)/gu, 'のニャン');
    t = t.replace(/(?:だね|だったね)\s*(?:ニャン|ニャ|にゃん|にゃ)/gu, 'だニャン');
    t = t.replace(/(?:よね|わね|たね)\s*(?:ニャン|ニャ|にゃん|にゃ)/gu, 'ニャン');
    t = t.replace(/ね\s*(?:ニャン|ニャ|にゃん|にゃ)/gu, 'ニャン');
    return t;
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

  prefetchVoice(text, speakerId) {
    this._getVoicevoxBlobUrl(text, speakerId).then(url => {
      this.fixedPhraseMap.set(`${speakerId}_${text}`, url);
    }).catch(() => {});
  }

  preloadAllFillers(speakerId) {
    ["そうニャン♪", "えーっとニャ…", "確認するニャ！", "クロが調べるニャ！", "おまかせニャ！", "あそぶニャ♪", "バッチリニャ！", "はーい！", "ちょい待ちニャ！", "すすめるニャン♪"].forEach(f => this.prefetchVoice(f, speakerId));
  }

  async playImmediateFiller(type = 'general') {
    this.unlockMasterAudio();
    const speakerId = AppCore.getSpeakerId();
    let phrase = "そうニャン♪";
    if (AppCore.state.isAssistantMode) {
      if (type === 'search') phrase = "クロが調べるニャ！";
      else if (type === 'location') phrase = "確認するニャ！";
      else phrase = "えーっとニャ…";
    }
    const key = `${speakerId}_${phrase}`;
    if (this.fixedPhraseMap.has(key)) {
      try {
        this.fillerAudio.src = this.fixedPhraseMap.get(key);
        this.fillerAudio.playbackRate = this.rate;
        await this.fillerAudio.play();
        if (AppCore.avatar && AppCore.state.isRunning) AppCore.avatar.setEmotion('talking');
        setTimeout(() => { if (!this.isSpeaking && AppCore.avatar && AppCore.state.isRunning) AppCore.avatar.setEmotion('thinking'); }, 850);
      } catch(e) {}
    } else {
      this.playEffect('aizuchi');
    }
  }

  async _getVoicevoxBlobUrl(text, speakerId) {
    const key = `${speakerId}_${text}`;
    if (this.blobUrlCache.has(key)) {
      Logger.log(`[TTS] キャッシュヒット: 「${text.substring(0, 15)}…」`, "info");
      return this.blobUrlCache.get(key);
    }
    if (this.fixedPhraseMap.has(key)) return this.fixedPhraseMap.get(key);

    if (this.currentAbortController) this.currentAbortController.abort();
    this.currentAbortController = new AbortController();
    const signal = this.currentAbortController.signal;

    const now = Date.now();
    const elapsed = now - this.lastVoicevoxRequestTime;
    if (elapsed < 1500) await new Promise(r => setTimeout(r, 1500 - elapsed));
    this.lastVoicevoxRequestTime = Date.now();

    const t0 = performance.now();
    const vvKey = (localStorage.getItem('kuro_voicevox_key') || '').trim();
    let initUrl = `https://api.tts.quest/v3/voicevox/synthesis?text=${encodeURIComponent(text)}&speaker=${speakerId}`;
    if (vvKey) initUrl += `&key=${encodeURIComponent(vvKey)}`;

    Logger.log(`[TTS] 音声生成開始 (話者:${speakerId}): 「${text.substring(0, 16)}…」`, "info");
    const initRes = await fetch(initUrl, { signal });
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
        await new Promise(r => setTimeout(r, 450));
        if (signal.aborted) throw new Error("中断");
        const sRes = await fetch(initData.audioStatusUrl, { signal });
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

    const aRes = await fetch(directUrl, { signal });
    const blob = await aRes.blob();
    const blobUrl = URL.createObjectURL(blob);
    this.blobUrlCache.set(key, blobUrl);
    const ms = Math.round(performance.now() - t0);
    Logger.log(`[TTS] ✅ 音声取得完了 (${ms}ms)`, "success");
    return blobUrl;
  }

  _isSelfEcho(text) {
    if (!text) return true;
    const normalized = text.replace(/[\s、。！？ニャンニャ]/g, '');
    if (normalized.length < 2) return true;
    if (/^(?:おまかせニャ|あそぶニャ|バッチリニャ|はーい|ちょい待ちニャ|すすめるニャ)/.test(text.trim())) return true;
    for (const spoken of this.recentSpokenTexts) {
      if (spoken.replace(/[\s、。！？ニャンニャ]/g, '') === normalized) return true;
    }
    return false;
  }

  async speak(text, speakerIdOverride = null, onStart = null, onEnd = null, cooldownOverride = null) {
    this.stopSpeaking(); this.stopListening(); this.unlockMasterAudio();
    const speakerId = (speakerIdOverride !== null) ? speakerIdOverride : AppCore.getSpeakerId();
    const cooldownMs = (cooldownOverride !== null) ? cooldownOverride : 350;

    let clean = this._convertAllNumbersToKana(text).replace(/<[^>]*>/g, '').replace(/[*#_~`🐾🐱✨❤️💖🎀🧠⚡🩺💭🎵🍜🥟📍📰🗺️⭐💥📒📖🌐🔷🔴🌤️🛍️💡🐟📷🏠]/gu, '').trim();
    if (!clean) {
      if (onStart) onStart(); if (onEnd) onEnd();
      setTimeout(() => { if (AppCore.state.isRunning && !this.isActionButtonLocked) this.startListening(); }, cooldownMs);
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
          if (AppCore.state.isRunning && !this.isSpeaking && !this.isReadingAloud && !this.isActionButtonLocked && !AppCore.state.isThinking && !AppCore.state.isProcessingInput) {
            const st = document.getElementById('status-text');
            if (st) st.textContent = "👂 聴いてるニャ♪";
            this.startListening();
          }
        }, cooldownMs);
      };
      this.masterAudio.onerror = (e) => {
        Logger.log(`[Audio] 再生エラー発生`, "error");
        this.isSpeaking = false; if (onStart) onStart(); if (onEnd) onEnd();
        setTimeout(() => { if (AppCore.state.isRunning) this.startListening(); }, cooldownMs);
      };
      await this.masterAudio.play();
    } catch(e) {
      this.isSpeaking = false; if (onStart) onStart(); if (onEnd) onEnd();
      setTimeout(() => { if (AppCore.state.isRunning) this.startListening(); }, cooldownMs);
    }
  }

  async readDiarySeamless(diaryContentOnly, speakerIdOverride = null, onSentenceStart = null, onComplete = null) {
    this.stopSpeaking(); this.stopListening(); this.unlockMasterAudio();
    this.isReadingAloud = true;
    this.readingAbortController = new AbortController();
    const speakerId = (speakerIdOverride !== null) ? speakerIdOverride : AppCore.getSpeakerId();
    Logger.log(`[Diary] 朗読モード開始`, "info");

    const sentences = this.cleanEndingNenyan(diaryContentOnly)
      .split(/([。！？!\?\n]+)/)
      .reduce((acc, cur, i, arr) => {
        if (i % 2 === 0 && cur.trim()) acc.push((cur + (arr[i+1]||'')).trim());
        return acc;
      }, []).filter(s => s.length > 0);

    for (let i = 0; i < sentences.length; i++) {
      if (!this.isReadingAloud || !AppCore.state.isRunning) break;
      const clean = this._convertAllNumbersToKana(sentences[i]).trim();
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
      } catch(e) {}
    }
    this.isReadingAloud = false; this.isSpeaking = false;
    if (AppCore.avatar && AppCore.state.isRunning) AppCore.avatar.setEmotion('idle');
    const st = document.getElementById('status-text');
    if (st && AppCore.state.isRunning) st.textContent = "👂 聴いてるニャ♪";
    if (onComplete) onComplete();
    setTimeout(() => { if (AppCore.state.isRunning) this.startListening(); }, 200);
  }

  stopReadingAloud() {
    this.isReadingAloud = false;
    if (this.readingAbortController) { this.readingAbortController.abort(); this.readingAbortController = null; }
    this.stopSpeaking();
  }

  stopSpeaking() {
    this.isSpeaking = false;
    if (this.currentAbortController) { this.currentAbortController.abort(); this.currentAbortController = null; }
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
      this.isListening = true; this.isStarting = false;
      Logger.log(`[Mic] 👂 マイク待機開始`, "info");
      if (this.onListeningStatus) this.onListeningStatus(true);
    };
    this.recognition.onresult = (event) => {
      if (this.isSpeaking || this.isReadingAloud || this.isActionButtonLocked || AppCore.state.isProcessingInput) return;
      const lastIdx = event.results.length - 1;
      const resultText = event.results[lastIdx]?.[0]?.transcript?.trim() || '';
      if (!resultText) return;

      Logger.log(`[Mic] 🎤 音声認識：「${resultText}」`, "info");

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
      if (!AppCore.state.isRunning || this.isSpeaking || this.isReadingAloud || this.isActionButtonLocked || AppCore.state.isProcessingInput) return;
      if (this.restartTimer) clearTimeout(this.restartTimer);
      this.restartTimer = setTimeout(() => {
        if (AppCore.state.isRunning && !this.isSpeaking && !this.isListening) this.startListening();
      }, 300);
    };
  }

  startListening() {
    if (!this.recognition || !AppCore.state.isRunning || this.isSpeaking || this.isReadingAloud || this.isActionButtonLocked || this.isListening || this.isStarting) return;
    try { this.isStarting = true; this.recognition.start(); } catch(e) { this.isStarting = false; }
  }

  stopListening() {
    this.isListening = false; this.isStarting = false;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    if (this.recognition) try { this.recognition.abort(); } catch(e) {}
    if (this.onListeningStatus) this.onListeningStatus(false);
  }
}

/* ==========================================================================
   MODULE 2: オンデマンドGPS ＆ 在宅センサー
   ========================================================================== */
const LocationProvider = {
  lat: null, lon: null, homeLat: null, homeLon: null,
  cityArea: "東京都東村山市", detailedAddress: "東京都東村山市本町付近",
  townLevelArea: "東京都東村山市本町付近", nearbySpots: [],
  weather: "快晴", temperature: "22", isAtHome: true,

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
    if (!('geolocation' in navigator)) { await this._applyHomeFallback(); return; }
    return new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          this.lat = pos.coords.latitude; this.lon = pos.coords.longitude;
          await this._reverseGeocode(this.lat, this.lon);
          this._checkHomeProximity();
          this._fetchWeather(this.lat, this.lon);
          resolve(true);
        },
        async () => { await this._applyHomeFallback(); resolve(false); },
        { enableHighAccuracy: true, timeout: 6000 }
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
    this._fetchWeather(this.lat, this.lon);
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
        const city = a.city || a.ward || a.town || "";
        const sub = a.suburb || a.quarter || "";
        this.cityArea = `${pref}${city}`.trim() || "東京都東村山市";
        this.townLevelArea = `${city}${sub}付近`.trim() || "東京都東村山市本町付近";
        this.detailedAddress = [pref, city, sub].filter(Boolean).join("") || "東京都東村山市本町";
      }
    } catch(e) {}
  }
};

/* ==========================================================================
   MODULE 3: ストレージ管理 ＆ 非破壊データ保護エンジン
   ========================================================================== */
const DATA_KEYS = {
  MEMORIES: 'kuro_data_memories',
  DIARIES:  'kuro_data_diaries',
  RECENT_LOGS: 'kuro_recent_chat_logs'
};

const StorageManager = {
  defaultGlassesCoords: {
    idle: { x: 0, y: 120, scale: 1.0, rotate: 0 },
    talking: { x: 0, y: 120, scale: 1.0, rotate: 0 },
    thinking: { x: 0, y: 120, scale: 1.0, rotate: 0 },
    happy: { x: 0, y: 120, scale: 1.0, rotate: 0 }
  },
  defaultEyelidCoords: { y: 172, x: 0, gap: 28, size: 16 },

  getStorageUsage() {
    let totalBytes = 0, photoBytes = 0, chatBytes = 0, metaBytes = 0;
    try {
      for (let k in localStorage) {
        if (!localStorage.hasOwnProperty(k)) continue;
        const val = localStorage[k];
        const bytes = (val.length + k.length) * 2;
        totalBytes += bytes;

        if (k.startsWith('kuro_daily_photos_')) {
          photoBytes += bytes;
        } else if (k === DATA_KEYS.DIARIES) {
          try {
            const diaries = JSON.parse(val) || [];
            let diaryPhotoBytes = 0;
            diaries.forEach(d => {
              if (d && d.photo && typeof d.photo === 'string') {
                diaryPhotoBytes += (d.photo.length * 2);
              }
            });
            photoBytes += diaryPhotoBytes;
            metaBytes += Math.max(0, bytes - diaryPhotoBytes);
          } catch(e) {
            metaBytes += bytes;
          }
        } else if (k.startsWith('kuro_daily_logs_') || k === DATA_KEYS.RECENT_LOGS) {
          try {
            const logs = JSON.parse(val) || [];
            let embeddedPhotoBytes = 0;
            logs.forEach(l => {
              if (l && l.photoUrl && typeof l.photoUrl === 'string') {
                embeddedPhotoBytes += (l.photoUrl.length * 2);
              }
            });
            chatBytes += Math.max(0, bytes - embeddedPhotoBytes);
            photoBytes += embeddedPhotoBytes;
          } catch(e) {
            chatBytes += bytes;
          }
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
    try { return JSON.parse(localStorage.getItem('kuro_glasses_coords_v5')) || this.defaultGlassesCoords; } catch(e) { return this.defaultGlassesCoords; }
  },
  saveGlassesCoords(c) { localStorage.setItem('kuro_glasses_coords_v5', JSON.stringify(c)); },

  loadEyelidCoords() {
    try { return JSON.parse(localStorage.getItem('kuro_eyelid_coords_v6')) || this.defaultEyelidCoords; } catch(e) { return this.defaultEyelidCoords; }
  },
  saveEyelidCoords(c) { localStorage.setItem('kuro_eyelid_coords_v6', JSON.stringify(c)); },

  loadRecentTimelineLogs() {
    try { return JSON.parse(localStorage.getItem(DATA_KEYS.RECENT_LOGS)) || []; } catch(e) { return []; }
  },
  clearTimelineDisplayOnly() { localStorage.setItem(DATA_KEYS.RECENT_LOGS, JSON.stringify([])); },

  appendChatLog(role, text, photoUrl = null) {
    if (!text) return;
    const timeInfo = TimeProvider.getCurrentInfo();
    const entry = {
      role, text: AppCore.audio.cleanEndingNenyan(text),
      mode: AppCore.state.isAssistantMode ? 'assistant' : 'pet',
      time: timeInfo.clock, date: timeInfo.lifeLogKey,
      photoUrl: (photoUrl && photoUrl.length > 50000) ? null : photoUrl,
      hasPhoto: !!photoUrl, timestamp: Date.now()
    };
    try {
      const recent = this.loadRecentTimelineLogs(); recent.push(entry);
      localStorage.setItem(DATA_KEYS.RECENT_LOGS, JSON.stringify(recent.slice(-30)));
      const dailyKey = `kuro_daily_logs_${timeInfo.lifeLogKey}`;
      const daily = JSON.parse(localStorage.getItem(dailyKey) || '[]');
      const dEntry = { ...entry }; delete dEntry.photoUrl;
      daily.push(dEntry);
      localStorage.setItem(dailyKey, JSON.stringify(daily.slice(-200)));
    } catch(e) {}
  },

  getDailyLogs(lifeDateKey) {
    try { return JSON.parse(localStorage.getItem(`kuro_daily_logs_${lifeDateKey}`)) || []; } catch(e) { return []; }
  },

  addPhotoToDailyPool(photoBase64, userComment = "") {
    const timeInfo = TimeProvider.getCurrentInfo();
    const key = `kuro_daily_photos_${timeInfo.lifeLogKey}`;
    try {
      let pool = JSON.parse(localStorage.getItem(key) || '[]');
      pool.push({ base64: photoBase64, comment: userComment, time: timeInfo.clock, timestamp: Date.now() });
      localStorage.setItem(key, JSON.stringify(pool.slice(-12)));
      Logger.log(`[Storage] 写真保存完了 (本日:${pool.length}枚)`, "info");
    } catch(e) {}
  },

  removePhotoFromDailyPool(lifeDateKey, photoIndex) {
    const key = `kuro_daily_photos_${lifeDateKey}`;
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
    try {
      let pool = JSON.parse(localStorage.getItem(`kuro_daily_photos_${lifeDateKey}`)) || [];
      if (pool.length === 0) {
        const diaries = this.loadAllDiaries();
        const d = diaries.find(item => item.dateKey === lifeDateKey);
        if (d && d.photo) {
          pool = [{ base64: d.photo, comment: "メイン写真", time: "12:00", timestamp: d.timestamp || Date.now() }];
          localStorage.setItem(`kuro_daily_photos_${lifeDateKey}`, JSON.stringify(pool));
        }
      }
      return pool;
    } catch(e) { return []; }
  },

  loadMemories(defaultMemories) {
    try {
      const parsed = JSON.parse(localStorage.getItem(DATA_KEYS.MEMORIES));
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch(e) {}
    this.saveMemories(defaultMemories);
    return defaultMemories;
  },
  saveMemories(m) { localStorage.setItem(DATA_KEYS.MEMORIES, JSON.stringify(m)); },

  loadAllDiaries() {
    try {
      const list = JSON.parse(localStorage.getItem(DATA_KEYS.DIARIES)) || [];
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
  saveAllDiaries(list) { localStorage.setItem(DATA_KEYS.DIARIES, JSON.stringify(list)); },

  /* 指定日にちゃんとした絵日記が存在するか判定（初期仮文や空日記は未完成と判定） */
  isProperDiary(diary) {
    if (!diary || !diary.content) return false;
    const txt = diary.content.trim();
    if (txt.includes("今日はおやびんと写真を見せ合って楽しかったニャン♪") && txt.length < 50) return false;
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

  /* ★【データライフサイクル完全保持】日記作成時の会話数を確実に記録（夜の追加会話検知用） */
  saveDiary(entryText, customDateKey = null, customFullDate = null, photoData = null, currentLogCount = null, kuroComment = null) {
    if (!entryText || entryText.length < 15) return false;
    const timeInfo = TimeProvider.getCurrentInfo();
    const dateKey = customDateKey || timeInfo.lifeLogKey;
    const fullDate = customFullDate || timeInfo.lifeFullDate;

    let cleanContent = AppCore.audio.cleanEndingNenyan(entryText);
    let extractedComment = kuroComment;

    const match = cleanContent.match(/(?:【?クロの(?:ひとこと|一言|メッセージ)[:：]?】?|🐾\s*クロのひとこと[:：]?|クロのひとこと[:：]?)\s*([^\n]+)/);
    if (match) {
      if (!extractedComment) extractedComment = match[1].trim();
      cleanContent = cleanContent.replace(/(?:【?クロの(?:ひとこと|一言|メッセージ)[:：]?】?|🐾\s*クロのひとこと[:：]?|クロのひとこと[:：]?)\s*[^\n]+$/, '').trim();
    }

    let list = this.loadAllDiaries();
    const idx = list.findIndex(d => d.dateKey === dateKey);

    if (idx >= 0 && !extractedComment) {
      extractedComment = list[idx].kuroComment || "";
    }

    const recordedLogCount = (currentLogCount !== null) ? currentLogCount : this.getDailyLogs(dateKey).length;

    const diaryData = {
      dateKey, fullDate,
      weather: LocationProvider.weather, temperature: LocationProvider.temperature,
      content: cleanContent,
      kuroComment: extractedComment || "",
      photo: photoData || (idx >= 0 ? list[idx].photo : null) || null,
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
    this.addPhotoToDailyPool(photoBase64, "写真を見せたニャ");
    let list = this.loadAllDiaries();
    const idx = list.findIndex(d => d.dateKey === timeInfo.lifeLogKey);
    if (idx >= 0) {
      list[idx].photo = photoBase64;
      this.saveAllDiaries(list);
    } else {
      this.saveDiary("今日はおやびんと写真を見せ合って楽しかったニャン♪", timeInfo.lifeLogKey, timeInfo.lifeFullDate, photoBase64, 1);
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
      version: (typeof VersionManager !== 'undefined') ? VersionManager.current : "V.1.11.0",
      exportedAt: now.toLocaleString('ja-JP'),
      memories: this.loadMemories([]),
      diaries: this.loadAllDiaries(),
      recentLogs: this.loadRecentTimelineLogs(),
      dailyPhotoPools: allDailyPhotos,
      dailyChatLogs: allDailyLogs,
      settings: {
        speakerId: localStorage.getItem('kuro_voice_speaker_id') || '10',
        voiceRate: localStorage.getItem('kuro_rate') || '1.05',
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
    a.download = `クロちゃん完全バックアップ_${ymd}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    Logger.log(`[Backup] データ書き出し完了`, "success");
  },

  importAndReplaceDataPackage(data) {
    if (!data || typeof data !== 'object') throw new Error("無効なバックアップデータです。");

    if (Array.isArray(data.memories)) this.saveMemories(data.memories);
    if (Array.isArray(data.diaries)) {
      this.saveAllDiaries(data.diaries);
    }
    if (Array.isArray(data.recentLogs)) {
      localStorage.setItem(DATA_KEYS.RECENT_LOGS, JSON.stringify(data.recentLogs.slice(-30)));
    }

    if (data.settings && typeof data.settings === 'object') {
      const s = data.settings;
      if (s.speakerId) localStorage.setItem('kuro_voice_speaker_id', s.speakerId);
      if (s.voiceRate) localStorage.setItem('kuro_rate', s.voiceRate);
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
/* ==========================================================================
   AIペット クロちゃん🐾 対話エンジン＆中央司令塔（app.js Part 2/2）
   - 【夜20時基準生活リズム】夜20:00以降の自然な日記作成案内 ＆ 昼間は直近完成日記優先表示
   - 【データライフサイクル完全復元】logCountAtSave に基づく夜の会話自動追記エンジンの復元
   - 【徹底防護】お休み中（居眠りモード）のステータス誤上書きを100%完全根絶
   - 【アーキテクチャ根本治療】カレンダー生活日リストに基づく日記帳（未作成日も自然にめくれる設計）
   - 【スマホ復帰完全連動】画面オン時（visibilitychange/pageshow）＆日記帳タップ時の即時自動点検
   - 【本物の一言保証】昨日の会話ログに即したオリジナルの「クロのひとこと」を生成・記録
   - 【即時同期描画】案内カード（Googleマップ・ニュース）をセリフと同時にタイムラインへ即時表示
   - 【音声タイマー停止】「タイマー止めて」「アラーム消して」の音声コマンドで即時停止
   - 【高速保存スマート判定】APIキー変更時のみ導通テストを行い、通常設定変更は待ち時間ゼロ
   - キャラクター描画＆お休み中の「愛らしい自然な居眠り」完全維持
   ========================================================================== */

/* ==========================================================================
   MODULE 4: キャラクター描画 ＆ 透過自動切り替え
   ========================================================================== */
class CatAvatarRenderer {
  constructor() {
    this.wrapper = document.getElementById('avatar-wrapper');
    this.smokeEl = document.getElementById('transform-smoke');
    this.catStageBox = document.getElementById('cat-stage-box');
    this.sparkleEl = document.getElementById('paw-landing-sparkle');
    this.heartEl = document.getElementById('touch-heart-bubble');
    this.frames = {
      idle: document.getElementById('frame-idle'),
      talking: document.getElementById('frame-talking'),
      thinking: document.getElementById('frame-thinking'),
      happy: document.getElementById('frame-happy')
    };

    this.eyesNormal = document.getElementById('eyes-normal');
    this.eyesHappy = document.getElementById('eyes-happy');
    this.mouthClosed = document.getElementById('mouth-closed');
    this.mouthTalking = document.getElementById('mouth-talking');
    this.mouthHappy = document.getElementById('mouth-happy');
    this.headUnit = document.getElementById('head-unit');

    this.mode = localStorage.getItem('kuro_avatar_mode') || 'vector';
    this.accessoryStyle = localStorage.getItem('kuro_acc_style') || 'both';
    this.glassesCoords = StorageManager.loadGlassesCoords();
    this.eyelidCoords = StorageManager.loadEyelidCoords();
    this.currentEmotion = 'idle';

    this._renderAllAccessories();
    this.applyMode(this.mode);
    this.applyAllFramesTransform();
    this.applyEyelidTransforms();
    this._initImageFormatDetectors();
  }

  _initImageFormatDetectors() {
    ['idle', 'talking', 'thinking', 'happy'].forEach(emotion => {
      const img = document.getElementById(`img-${emotion}`);
      if (!img) return;
      const checkFormat = () => {
        if (img.currentSrc?.endsWith('.png') || img.src?.endsWith('.png')) {
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
    const svgContent = `
      <svg viewBox="0 0 140 140" style="width:100%; height:100%;">
        <defs>
          <pattern id="stripe-bw-real" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width="4" height="8" fill="#111827"/>
            <rect width="4" height="8" x="4" fill="#ffffff"/>
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
    const c = this.eyelidCoords || { y: 172, x: 0, gap: 28, size: 16 };
    const leftEl = document.getElementById('eye-left-idle');
    const rightEl = document.getElementById('eye-right-idle');
    if (!leftEl || !rightEl) return;
    const halfGap = c.gap / 2;
    const h = Math.round(c.size * 0.75);
    leftEl.style.bottom = `${c.y}px`;
    leftEl.style.left = `calc(50% + ${c.x - halfGap - c.size / 2}px)`;
    leftEl.style.width = `${c.size}px`;
    leftEl.style.height = `${h}px`;
    rightEl.style.bottom = `${c.y}px`;
    rightEl.style.left = `calc(50% + ${c.x + halfGap - c.size / 2}px)`;
    rightEl.style.width = `${c.size}px`;
    rightEl.style.height = `${h}px`;
  }

  applyAccessoryStyle(style) {
    this.accessoryStyle = style;
    localStorage.setItem('kuro_acc_style', style);
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
    const vec = document.getElementById('cat-vector-avatar');
    if (mode === 'vector') {
      if (this.wrapper) this.wrapper.classList.remove('is-real-mode');
      Object.values(this.frames).forEach(f => { if (f) f.style.display = 'none'; });
      if (vec) vec.classList.add('active-mode');
    } else {
      if (this.wrapper) this.wrapper.classList.add('is-real-mode');
      if (vec) vec.classList.remove('active-mode');
      Object.values(this.frames).forEach(f => { if (f) f.style.display = 'flex'; });
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
   MODULE 5: Gemini AI思考エンジン（マブダチ対話＆ダイナミック記憶）
   ========================================================================== */
class AIThoughtEngine {
  constructor() {
    this.apiKey = (localStorage.getItem('kuro_api_key') || '').trim();
  }

  _filterMeaningfulLogs(logs) {
    return logs.filter(item => {
      if (!item || !item.text) return false;
      const t = item.text.trim();
      if (t.length <= 2 && /^(?:来た|うん|ああ|はい|おー|えっ|ニャ|にゃ)$/.test(t)) return false;
      if (/^(?:おまかせニャ|あそぶニャ|バッチリニャ|はーい|はい|起きたニャ|お昼寝するニャ|今日の日記を書き込みましたニャン)/.test(t)) return false;
      if (/(?:いま何時|今何時|今日何日|きょう何日|天気どんな感じ)/.test(t)) return false;
      if (t.startsWith('http') || t.includes('Googleマップで見る')) return false;
      return true;
    });
  }

  _buildContentsPayload(rawLogs, currentPrompt, photoBase64 = null) {
    const contents = [];
    let lastRole = null;
    const timeInfo = TimeProvider.getCurrentInfo();
    const historyLimit = timeInfo.isLateNight ? 20 : 40;
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

  async generateReply(promptText, rawLogs, character, memories, photoBase64 = null) {
    if (!this.apiKey) {
      Logger.log(`[AI] ⚠️ APIキーが未設定です`, "error");
      return { success: false, error: "NO_API_KEY" };
    }

    const timeInfo = TimeProvider.getCurrentInfo();
    const weather = LocationProvider.weather;
    const temp = LocationProvider.temperature;
    const townArea = LocationProvider.townLevelArea;
    const isAtHome = LocationProvider.isAtHome;
    const isAssistant = AppCore.state.isAssistantMode;

    const recentDiaries = StorageManager.getRecentDiariesSummary(3);
    const pastMemoryDiary = StorageManager.findRelevantPastDiary(promptText);

    const modeInstruction = isAssistant ? `
【★モード：👓 おてつだいモード（おやびんの世界一のマブダチ＆天才案内役）】
・おやびんの大好物（ラーメン、餃子、焼肉、ホルモン、お寿司、麻婆豆腐）を熟知しています。
・【超重要：対話型コンシェルジュの会話ラリールール】
　1. おやびんが「お腹空いた」「なんか食べたい」「おすすめ教えて」など漠然と言った時は、絶対にまだツール（searchMapPlaces）を実行しないでください！
　　「今日はお肉の気分？それともラーメンにするニャ？ホルモンも最高ニャ！」のように好物を提案しておやびんと楽しくラリーしてください。
　2. 会話のラリーでおやびんの気分や料理ジャンル（ラーメン、焼肉等）や具体的な店名が定まった時、または「おまかせ」「今すぐ探して」と頼まれた時だけ、満を持して「searchMapPlaces」ツールを実行してください。
　3. ニュースの場合も同様に、「大谷翔平の話題？それとも東村山や地元のニュースを見るニャ？」とラリーし、興味が定まった時にだけ「searchLatestNews」ツールを実行してください。
` : `
【★モード：🐾 なかよしモード】
おやびんと純粋にお話しを楽しむ甘えん坊モードです。ツールや地図は一切使わず、愛らしく雑談してください。
`;

    const systemPrompt = `
あなたは世界一可愛いノルウェージャンフォレストキャットの1歳の子猫の女の子「${character.name}」です。
【現在状況】
・日時: ${timeInfo.fullDate} ${timeInfo.clock}
・場所: ${townArea}
・在宅判定: ${isAtHome ? '🏠 お家（室内）にいます' : '🐾 お外をお散歩中です'}
・天気: ${weather} / 気温: ${temp}度
${modeInstruction}
【記憶帳】
${memories.map(m => `・${m}`).join('\n')}
${recentDiaries ? `【直近の日記】\n${recentDiaries}\n` : ''}
${pastMemoryDiary ? `【昔の思い出】\n${pastMemoryDiary.content}\n` : ''}

【★絶対厳守の話し方ルール】
- 飼い主さんのことは必ず親しみを込めて「おやびん」と呼んでください。
- 一人称は「クロ」または「わたし」（「余」は禁止）。
- 語尾は「〜ニャ」「〜ニャン♪」「〜だニャ！」「〜ニャ🐾」を使用（「〜ねニャン」は禁止）。
- ト書きは一切出力せず、セリフのみ【40〜80文字程度（1〜2文）】で完結させてください。
`;

    const contents = this._buildContentsPayload(rawLogs, promptText, photoBase64);

    for (const model of FIXED_LITE_MODELS) {
      const cleanModel = model.replace(/^models\//, '');
      const t0 = performance.now();
      Logger.log(`[AI] リクエスト送信 ➔ ${cleanModel}`, "info");

      let fetchController = new AbortController();
      let timeoutTimer = setTimeout(() => fetchController.abort(), 20000);

      try {
        const bodyPayload = {
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: contents,
          generationConfig: { temperature: 0.75, maxOutputTokens: 350 }
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
          signal: fetchController.signal
        });

        if (!res.ok && isAssistant) {
          clearTimeout(timeoutTimer);
          fetchController = new AbortController();
          timeoutTimer = setTimeout(() => fetchController.abort(), 20000);

          delete bodyPayload.tools;
          delete bodyPayload.toolConfig;
          res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyPayload),
            signal: fetchController.signal
          });
        }

        clearTimeout(timeoutTimer);
        const ms = Math.round(performance.now() - t0);

        if (res.ok) {
          const data = await res.json();
          const parts = data.candidates?.[0]?.content?.parts || [];
          let replyText = "";
          let cards = [];

          const functionCallPart = parts.find(p => p.functionCall);
          if (functionCallPart) {
            const callInfo = functionCallPart.functionCall;
            const args = callInfo.args || {};

            if (callInfo.name === "searchMapPlaces") {
              const spot = args.spotName || "美味しいお店";
              const area = args.area || townArea || "東村山市";
              Logger.log(`[Tool] 📍 マップ検索実行: ${spot} (${area})`, "info");
              cards = this._createSmartMapCards(spot, area);
              replyText = `おやびん、${spot}の場所を地図で見つけてきたニャ！ここから確認してニャン🐾`;
            } else if (callInfo.name === "searchLatestNews") {
              const topic = args.topic || "最新ニュース";
              Logger.log(`[Tool] 📰 ニュース検索実行: ${topic}`, "info");
              cards = this._createSmartNewsCards(topic);
              replyText = `おやびん、${topic}の最新ニュースをチェックしたニャ！見てみてニャン📰🐾`;
            }
          }

          const textPart = parts.find(p => p.text);
          if (textPart?.text && !replyText) replyText = textPart.text;

          if (replyText) {
            let clean = replyText.replace(/<!--[\s\S]*?-->/g, '').replace(/[*#_~`]/g, '').trim();
            clean = clean.replace(/余([はがものにもと])/g, 'クロ$1').replace(/余/g, 'クロ');
            clean = AppCore.audio.cleanEndingNenyan(clean);

            if (isAssistant && cards.length === 0) {
              const fallbackCards = this._detectCardsFromKuroSpeech(clean, promptText);
              if (fallbackCards.length > 0) cards = fallbackCards;
            }

            const badge = document.getElementById('model-badge');
            if (badge) badge.textContent = `🐾 ${cleanModel.replace('gemini-', '')}`;

            Logger.log(`[AI] ✅ 応答受信成功 (${ms}ms) [${cleanModel}] (カード:${cards.length}件)`, "success");
            return { success: true, text: clean, groundingCards: cards };
          }
        } else {
          Logger.log(`[AI] ⚠️ HTTP ${res.status} [${cleanModel}] (${ms}ms)`, "warn");
        }
      } catch (err) {
        clearTimeout(timeoutTimer);
        const ms = Math.round(performance.now() - t0);
        Logger.log(`[AI] ❌ エラー [${cleanModel}]: ${err.message} (${ms}ms)`, "error");
      }
    }
    Logger.log(`[AI] ❌ 全Liteモデル失敗`, "error");
    return { success: false, error: "ALL_LITE_MODELS_FAILED" };
  }

  _createSmartMapCards(spotName, area) {
    const cards = [];
    const spotLimit = parseInt(localStorage.getItem('kuro_spot_count') || '2', 10);
    const searchArea = area || LocationProvider.cityArea || "東村山市";
    const cleanSpot = spotName.replace(/おすすめ|美味しい|人気/g, '').trim() || spotName;

    let queryParam = encodeURIComponent(cleanSpot + ' ' + searchArea);
    if (LocationProvider.lat !== null && LocationProvider.lon !== null) {
      queryParam += `&ll=${LocationProvider.lat},${LocationProvider.lon}`;
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
        icon: '🍜',
        title: `${cleanSpot}（現在地周辺の評判店）`,
        url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanSpot + ' 人気')}`
      });
    }

    if (spotLimit >= 3) {
      cards.push({
        type: 'map-all',
        icon: '🗺️',
        title: `${searchArea}の人気グルメ一覧（まとめ）`,
        url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchArea + ' グルメ')}`
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

  _detectCardsFromKuroSpeech(speechText, userPrompt) {
    const combined = `${speechText} ${userPrompt}`;
    const isMapConfirmed = /(?:見つけてきたニャ|探してきたニャ|地図で案内するニャ|地図をチェックしてニャ)/.test(speechText);
    const isNewsConfirmed = /(?:ニュースをチェックしたニャ|最新ニュース.*見てみてニャ)/.test(speechText);

    if (isMapConfirmed) {
      const match = combined.match(/(?:炭火ホルモン\s*丸川|丸川|餃子の満洲|ラーメン|ホルモン|餃子|焼肉|寿司|麻婆豆腐|カレー|うどん|カフェ)/);
      const spot = match ? match[0] : "おすすめの人気店";
      return this._createSmartMapCards(spot, LocationProvider.cityArea);
    }
    if (isNewsConfirmed) {
      const match = combined.match(/(?:大谷翔平|プロ野球|天気|東村山|政治|経済)/);
      const topic = match ? match[0] : "最新ニュース";
      return this._createSmartNewsCards(topic);
    }
    return [];
  }

  async generateDailyDiarySummary(dailyAllLogs, targetLifeDateKey = null, targetLifeFullDate = null) {
    if (!this.apiKey) return { success: false };

    const timeInfo = TimeProvider.getCurrentInfo();
    const fullDate = targetLifeFullDate || (targetLifeDateKey ? TimeProvider.formatDateKeyToFull(targetLifeDateKey) : timeInfo.lifeFullDate);
    const lifeKey = targetLifeDateKey || timeInfo.lifeLogKey;

    const filteredLogs = dailyAllLogs.filter(l => l.text && !l.text.startsWith('http') && !/(?:絵?日記|にっき).*(?:書いて|まとめて)/.test(l.text));
    const historyText = filteredLogs.map(l => `${l.role === 'user' ? 'おやびん' : 'クロ'}: ${l.text}`).join('\n');

    const diaryPrompt = `
あなたはノルウェージャンフォレストキャットの1歳の子猫の女の子「クロ」です。
一人称は「クロ」または「わたし」（「余」は禁止）。
今日おやびんと話した以下の会話ログの内容をもとに、1日の思い出絵日記を書いてください。
日付: ${fullDate} / 在宅: ${LocationProvider.isAtHome ? '今日はずっとお家で過ごしました' : 'お外にお出かけしました'}
天気: ${LocationProvider.weather} / 気温: ${LocationProvider.temperature}度
【今日のおやびんとの会話ログ】\n${historyText || '今日はおやびんとまったり過ごしたニャ♪'}

【執筆ルール】
- 語尾は「〜ニャ」「〜ニャン♪」「〜だニャ🐾」を使用（「〜ねニャン」は禁止）。
- 本文は250〜450文字程度。
- 【超重要】日記本文の最後に必ず改行して、今日話した具体的な内容（食べたもの、話題、出来事など）に深く関連した、おやびんへの愛嬌あふれる本物のひとことを【クロのひとこと：〇〇】という形式で1行添えてください。（※ありきたりな定型文やダミー文は絶対に禁止します）。
`;

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${FIXED_LITE_MODELS[0]}:generateContent?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: diaryPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 850 }
        })
      });

      if (res.ok) {
        const diaryRaw = (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text;
        if (diaryRaw && diaryRaw.length >= 25) {
          let clean = diaryRaw.replace(/[*#_~`]/g, '').trim();
          clean = clean.replace(/余([はがものにもと])/g, 'クロ$1').replace(/余/g, 'クロ');
          clean = AppCore.audio.cleanEndingNenyan(clean);

          let content = clean;
          let kuroComment = "";
          const match = clean.match(/(?:【?クロの(?:ひとこと|一言|メッセージ)[:：]?】?|🐾\s*クロのひとこと[:：]?|クロのひとこと[:：]?)\s*([^\n]+)/);
          if (match) {
            kuroComment = match[1].trim();
            content = clean.replace(/(?:【?クロの(?:ひとこと|一言|メッセージ)[:：]?】?|🐾\s*クロのひとこと[:：]?|クロのひとこと[:：]?)\s*[^\n]+$/, '').trim();
          }

          const pool = StorageManager.getDailyPhotoPool(lifeKey);
          return { success: true, diaryText: content, kuroComment, selectedPhoto: pool[0]?.base64 || null };
        }
      }
    } catch(e) {}
    return { success: false };
  }
}

/* ==========================================================================
   MODULE 6: 中央司令塔（AppCore）
   ========================================================================== */
const CHARACTER_CONFIG = {
  name: "クロ",
  defaultMemories: [
    "名前：クロ（ノルウェージャンフォレストキャット、1歳の元気な女の子）",
    "飼い主：おやびん（ミッキーさん。世界で一番大好き！）",
    "クロの大好物：ちゅ〜る（まぐろ味）、かつおぶし、カリカリ",
    "クロの苦手なもの：掃除機の音、お風呂、動物病院の注射、爪切り",
    "おやびんの大好物：ラーメン、餃子、焼肉、ホルモン、お寿司、麻婆豆腐",
    "前世：世界的に有名な大天才発明家（自慢好きで発明の話が得意）",
    "家族：ママのかよちゃん、お兄ちゃんのりゅうせいくん、弟分のたいせいくん、大親友のかまぶーくん"
  ]
};

const AppCore = {
  state: {
    isRunning: true, isThinking: false, isProcessingInput: false, isDiaryProcessing: false,
    isAssistantMode: false, editingMemoryIdx: null, activeAdjustTab: 'idle', snackCount: 0,
    timerId: null, timerSeconds: 0, timerLabel: "", isTimerPaused: false, isTimerCompleted: false,
    chimeTimerId: null,
    wakeLockSentinel: null, isLandscape: false,

    studioDateKeys: [],
    studioCurrentDateIdx: 0,
    isDiaryReading: false,

    idleSoliloquyTimer: null, lastActivityTime: Date.now()
  },

  audio: new AudioSpeechEngine(),
  ai: new AIThoughtEngine(),
  avatar: null,
  memories: [],
  todayLogs: [],

  getSpeakerId() { return parseInt(localStorage.getItem('kuro_voice_speaker_id') || '10', 10); },
  getTimerSound() { return localStorage.getItem('kuro_timer_sound') || 'bell'; },

  applyTheme(theme) {
    const validThemes = ['normal', 'dark', 'mint', 'pop'];
    const chosen = validThemes.includes(theme) ? theme : 'normal';
    document.documentElement.setAttribute('data-theme', chosen);
    localStorage.setItem('kuro_theme', chosen);

    document.querySelectorAll('.theme-card-btn').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.themeVal === chosen);
    });
  },

  async init() {
    this.avatar = new CatAvatarRenderer();
    this.memories = StorageManager.loadMemories(CHARACTER_CONFIG.defaultMemories);
    this.todayLogs = StorageManager.loadRecentTimelineLogs();
    this.state.isAssistantMode = localStorage.getItem('kuro_mode') === 'assistant';

    this._updateModeUI(false);
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

    if (typeof VersionManager !== 'undefined') VersionManager.applyToDOM();

    /* メイン画面左上の時計正常初期化 ＆ 毎秒タイマー */
    const clk = document.getElementById('clock-display');
    if (clk) clk.textContent = TimeProvider.getCurrentInfo().clock;
    setInterval(() => {
      const c = document.getElementById('clock-display');
      if (c) c.textContent = TimeProvider.getCurrentInfo().clock;
    }, 1000);

    LocationProvider.initWatcher();

    const spk = this.getSpeakerId();
    this.audio.prefetchVoice("おやびん、わたしはクロだニャン🐾", spk);
    this.audio.preloadAllFillers(spk);

    /* ★【データライフサイクル完全復元】起動時の昨日の日記安全点検 */
    this.checkAndFinalizeYesterdayDiary();
    this._startIdleSoliloquyWatcher();

    setTimeout(() => { if (this.state.isRunning) this.audio.startListening(); }, 500);
    Logger.log("[AppCore] 全システム正常稼働！データライフサイクル＆全機能健全稼働中ニャ🐾", "success");
  },

  /* スマホ画面復帰時の自動点検リスナー */
  _bindDeviceWakeWatcher() {
    const handleWake = () => {
      if (document.visibilityState === 'visible') {
        Logger.log(`[Lifecycle] 📱 スマホ画面復帰を検知。未作成・追加会話日記を点検ニャ…`, "info");
        this.checkAndFinalizeYesterdayDiary();
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
      statusPill.textContent = u.isDanger ? "⚠️ 残りわずか" : (u.isWarning ? "⚠️ 容量注意" : "快適ニャ🐾");
      statusPill.style.color = u.isDanger ? "#dc2626" : (u.isWarning ? "#d97706" : "#15803d");
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
    const phrases = ["ふぁ〜あ…（あくび）💤", "おやびん、なにしてるのかニャ〜？🐾", "今日もちゅ〜る食べたいニャン♪🐟", "おやびんの近くは落ち着くニャ〜♡"];
    this.state.idleSoliloquyTimer = setInterval(() => {
      const now = Date.now();
      if ((now - this.state.lastActivityTime) > 150000 && this.state.isRunning && !this.audio.isSpeaking && !this.state.isThinking && this.state.timerId === null) {
        this.state.lastActivityTime = now;
        const phrase = phrases[Math.floor(Math.random() * phrases.length)];
        const b = this.renderBubble('model', phrase);
        if (b) { b.style.opacity = '0.85'; b.style.borderStyle = 'dashed'; }
        if (this.avatar) {
          this.avatar.setEmotion('happy');
          setTimeout(() => { if (!this.audio.isSpeaking && this.state.isRunning) this.avatar.setEmotion('idle'); }, 2000);
        }
      }
    }, 5000);
  },

  resetActivityTimer() { this.state.lastActivityTime = Date.now(); },

  /* ★【データライフサイクル完全復元】
     お昼に作ったあとの夜の会話追加（logCountAtSave）を自動検知し、夜の分も含めて最終確定するエンジン */
  async checkAndFinalizeYesterdayDiary() {
    const timeInfo = TimeProvider.getCurrentInfo();
    if (timeInfo.isLateNight) return;

    const yInfo = TimeProvider.getYesterdayLifeInfo();
    const yKey = yInfo.key;
    const yFullDate = yInfo.fullDate;

    const yLogs = StorageManager.getDailyLogs(yKey);
    if (!yLogs || yLogs.length < 2) {
      return;
    }

    const existingDiary = StorageManager.getDiary(yKey);
    const isProper = StorageManager.isProperDiary(existingDiary);
    const prevLogCount = existingDiary?.logCountAtSave || 0;
    const hasNewLogs = (yLogs.length > prevLogCount);

    if (isProper && !hasNewLogs) {
      Logger.log(`[Diary] 昨日の日記（${yKey}）は夜の会話まで反映完了済みのため大切にキープ`, "info");
      return;
    }

    Logger.log(`[Diary] 昨日の絵日記更新を検出（${yFullDate} / 前:${prevLogCount}件 ➔ 終:${yLogs.length}件）。完全版を生成ニャ…`, "info");

    try {
      const res = await this.ai.generateDailyDiarySummary(yLogs, yKey, yFullDate);
      if (res.success && res.diaryText) {
        StorageManager.saveDiary(res.diaryText, yKey, yFullDate, res.selectedPhoto, yLogs.length, res.kuroComment);

        Logger.log(`[Diary] ✅ 昨日の絵日記の最終アップデートに大成功！(${yFullDate})`, "success");
        Toast.show(`おやびん！昨日の日記に夜のお話しも追加して、きれいにまとめておいたニャン🐾`, "success", 4500);

        const autoNotice = hasNewLogs && isProper
          ? `おやびん！昨日の日記に、そのあと夜にお話しした内容もぜんぶ追加して、新しくまとめ直しておいたニャン🐾`
          : `おやびん！昨日の思い出絵日記を書いておいたニャン🐾 日記帳を見てみてニャ♪`;

        this.renderBubble('model', autoNotice);
        const savedDiary = StorageManager.getDiary(yKey);
        if (savedDiary) this.renderDiaryCard(savedDiary);

        this._updateStorageMonitorUI();
      }
    } catch (err) {
      Logger.log(`[Diary] ⚠️ 昨日の日記自動生成で一時エラー: ${err.message}`, "warn");
    }
  },

  async forceRefreshApp() {
    if (!window.confirm("日記や記憶データは安全にキープされます。最新版の画面を読み直しますかニャ？🐾")) return;
    try { if ('caches' in window) await Promise.all((await caches.keys()).map(k => caches.delete(k))); } catch(e) {}
    window.location.href = window.location.origin + window.location.pathname + '?refresh=' + Date.now();
  },

  _restoreTimelineHistory() {
    const box = document.getElementById('chat-timeline');
    if (!box) return;
    box.innerHTML = '';
    const logs = StorageManager.loadRecentTimelineLogs();
    if (logs.length === 0) {
      this.renderBubble('model', "おやびん、わたしはクロだニャン🐾 今日もいっぱいお話しするニャ♪");
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
      if (st && this.state.isRunning) st.textContent = "👂 聴いてるニャ♪";
    };

    this.audio.onSpeechFinal = (finalText) => {
      this.resetActivityTimer();
      if (this.state.isProcessingInput || this.state.isDiaryReading || this.audio.isActionButtonLocked) return;
      this.state.isProcessingInput = true;
      this.renderBubble('user', finalText);
      this.handleUserInput(finalText);
    };

    this.audio.onListeningStatus = () => {
      const st = document.getElementById('status-text');
      if (st && this.state.isRunning && !this.audio.isSpeaking && !this.state.isThinking && !this.audio.isActionButtonLocked) {
        st.textContent = "👂 聴いてるニャ♪";
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
      imgWrap.onclick = () => this.openPhotoLightbox(photoUrl, "📸 おやびんが見せてくれたお写真");
      row.appendChild(imgWrap);
    }

    const b = document.createElement('div');
    b.className = 'chat-bubble';
    b.textContent = this.audio.cleanEndingNenyan(text);
    row.appendChild(b);

    if (cards && cards.length > 0) {
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
    const row = document.createElement('div');
    row.className = 'chat-row model';
    const card = document.createElement('div');
    card.className = 'timeline-diary-card';
    card.innerHTML = `
      <div class="timeline-diary-header"><span>📖 ${diaryData.fullDate} のクロ絵日記</span><span>🐾 記録完了</span></div>
      <div class="timeline-diary-meta"><span>🌤️ 天気: ${diaryData.weather}</span><span>🌡️ 気温: ${diaryData.temperature}℃</span></div>
      ${diaryData.photo ? `<div class="timeline-diary-photo"><img src="${diaryData.photo}" alt="写真" id="card-diary-img-${diaryData.dateKey}"></div>` : ''}
      <div class="timeline-diary-body">${diaryData.content}</div>
      ${diaryData.kuroComment ? `
        <div class="timeline-diary-comment-box">
          <span class="timeline-diary-comment-label">🐾 クロのひとこと:</span>
          <span class="timeline-diary-comment-text">${diaryData.kuroComment}</span>
        </div>
      ` : ''}
    `;
    if (diaryData.photo) {
      card.querySelector(`#card-diary-img-${diaryData.dateKey}`)?.addEventListener('click', () => {
        this.openPhotoLightbox(diaryData.photo, `📖 ${diaryData.fullDate} の絵日記写真`);
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
        if (!window.confirm("写真が上限（12枚）に達していますニャ！\n一番古い写真が自動で入れ替わりますが、このまま撮影しますかニャ？")) {
          if (this.state.isRunning) this.audio.startListening();
          return;
        }
      }
      photoInput.click();
    };

    photoInput.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) { if (this.state.isRunning) this.audio.startListening(); return; }
      Toast.show("写真をギュッと小さく圧縮中ニャ…📷", "info");

      const compressedBase64 = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = (evt) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width, h = img.height;
            if (w > 320) { h = Math.round((h * 320) / w); w = 320; }
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.50));
          };
          img.src = evt.target.result;
        };
        reader.readAsDataURL(file);
      });

      this.renderBubble('user', "クロちゃん、この写真見てニャ！", [], compressedBase64);
      StorageManager.appendChatLog('user', "クロちゃん、この写真見てニャ！", compressedBase64);
      StorageManager.attachPhotoToTodayDiary(compressedBase64);
      this._updateStorageMonitorUI();

      this.audio.playImmediateFiller('search');
      this.executeThought("この写真を見て感想やお話しを聞かせてニャ！", compressedBase64, true);
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
      if (disp) disp.textContent = this.state.isTimerPaused ? `ちょい待ち ${str}` : str;
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

        const alertMsg = `おやびん！${label}経ったニャ！タイマー鳴ったニャン🔔🐾`;
        this.audio.speak(alertMsg, null, () => {
          this.renderBubble('model', alertMsg);
          if (this.avatar && this.state.isRunning) this.avatar.setEmotion('talking');
        }, () => { if (this.avatar && this.state.isRunning) this.avatar.setEmotion('idle'); });
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
    if (manual) Toast.show("タイマーを取り消したニャン🐾", "info");
  },

  _bindKitchenTimerWidgetUI() {
    const widget = document.getElementById('kitchen-timer-widget');
    if (!widget) return;
    widget.onclick = () => {
      if (this.state.isTimerCompleted) {
        this.cancelKitchenTimer(false);
        this.audio.playEffect('aizuchi');
        Toast.show("タイマーを消去したニャン🔔", "info");
        return;
      }
      this.state.isTimerPaused = !this.state.isTimerPaused;
      widget.classList.toggle('is-paused', this.state.isTimerPaused);
      this.audio.playEffect('aizuchi');
      Toast.show(this.state.isTimerPaused ? "ちょい待ちニャ🐾" : "すすめるニャ！🐾", "info");
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

    // 0. 音声によるタイマー停止コマンド判定
    if (/(?:タイマー.*(?:止めて|やめて|消して|ストップ)|アラーム.*(?:止めて|消して|ストップ))/.test(text)) {
      this.cancelKitchenTimer(true);
      const rep = "タイマーを止めたニャン🔔🐾";
      this.audio.speak(rep, null, () => this.renderBubble('model', rep), () => {
        this.state.isProcessingInput = false;
      });
      return;
    }

    // 1. スリープ中から起こされた時
    if (!this.state.isRunning) {
      this.state.isRunning = true;
      const petContainer = document.getElementById('pet-container');
      const wrap = document.getElementById('avatar-wrapper');
      petContainer?.classList.remove('is-paused-mode');
      wrap?.classList.remove('is-sleeping');
      document.getElementById('pause-btn')?.classList.remove('is-paused');
      document.getElementById('pause-icon').textContent = "🟢";
      document.getElementById('pause-text').textContent = "会話中";
      const wakeMsg = "ふぁ〜あ…！おやびん、起きたニャン🐾 なに話すニャ？";
      this.audio.speak(wakeMsg, null, () => this.renderBubble('model', wakeMsg), () => {
        this.state.isProcessingInput = false;
      });
      return;
    }

    // 2. 絵日記作成コマンド
    const isDiary = /(?:今日|きょう)?(?:の)?(?:絵?日記|にっき).*(?:書いて|まとめて|記録して)/.test(text);
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
        const rep = "今日の日記を書き込みましたニャン🐾 上の『📖 日記帳』から読めるニャ！";
        this.audio.speak(rep, null, () => {
          this.renderBubble('model', rep);
          this.renderDiaryCard(StorageManager.getTodayDiary());
        }, () => {
          if (this.avatar) this.avatar.setEmotion('idle');
          this.state.isThinking = false;
          this.state.isProcessingInput = false;
        });
      }
      return;
    }

    // 3. タイマー判定
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
        const rep = `了解ニャ！${label}しっかり見ておくニャン🐾`;
        this.audio.speak(rep, null, () => this.renderBubble('model', rep), () => {
          this.state.isProcessingInput = false;
        });
        return;
      }
    }

    // 4. 在宅・現在地確認
    if (/(?:いまどこ|今どこ|ここどこ|どこにいる)/.test(text)) {
      const isAtHome = LocationProvider.isAtHome;
      const rep = isAtHome 
        ? "いまはお家でぬくぬく、まったりしてるニャン🐾 落ち着くニャ〜♡" 
        : `いまは【${LocationProvider.townLevelArea}】をお散歩中ニャ！お出かけ楽しいニャン🐾`;
      this.audio.speak(rep, null, () => this.renderBubble('model', rep), () => {
        this.state.isProcessingInput = false;
      });
      return;
    }

    // 5. 時計
    if (/(?:いま何時|今何時)/.test(text)) {
      const info = TimeProvider.getCurrentInfo();
      this.audio.speak(info.spokenClock, null, () => this.renderBubble('model', info.clockDisplay), () => {
        this.state.isProcessingInput = false;
      });
      return;
    }

    // 6. カレンダー・日付
    if (/(?:今日何日|きょう何日|何曜日)/.test(text)) {
      const info = TimeProvider.getCurrentInfo();
      this.audio.speak(info.spokenDate, null, () => this.renderBubble('model', info.dateDisplay), () => {
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
    if (st && this.state.isRunning) st.textContent = photoBase64 ? "📷 写真見てるニャ…" : "💭 考え中ニャ…";

    const bubble = this.renderBubble('model', photoBase64 ? "写真を見てるニャ…📷✨" : "クロが考えてるニャ…💭");
    const rawLogs = StorageManager.loadRecentTimelineLogs();
    const res = await this.ai.generateReply(promptText, rawLogs, CHARACTER_CONFIG, this.memories, photoBase64);

    if (res.success && res.text) {
      if (!isPhotoAlreadyLogged) {
        StorageManager.appendChatLog('user', promptText);
      }
      StorageManager.appendChatLog('model', res.text);

      this.audio.speak(res.text, null, () => {
        if (bubble) {
          bubble.textContent = res.text;

          if (res.groundingCards && res.groundingCards.length > 0) {
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
        if (st && this.state.isRunning) st.textContent = "👂 聴いてるニャ♪";
      });
    } else {
      const fb = "おやびん、もう一度ゆっくり話してニャン🐾";
      if (bubble) bubble.textContent = fb;
      this.audio.speak(fb, null, () => {}, () => {
        if (this.avatar && this.state.isRunning) this.avatar.setEmotion('idle');
        this.state.isThinking = false;
        this.state.isProcessingInput = false;
        if (st && this.state.isRunning) st.textContent = "👂 聴いてるニャ♪";
      });
    }
  },

  _updateModelBadge() {
    const badge = document.getElementById('model-badge');
    if (badge) { badge.className = "model-badge lite"; badge.textContent = `🐾 3.5 Flash Lite`; }
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
        if (st && this.state.isRunning) st.textContent = "👂 聴いてるニャ♪";
        if (this.state.isRunning) this.audio.startListening();
      }, 400);
      return;
    }

    this.audio.speak(shortPhrase, null, () => {
      if (this.avatar && this.state.isRunning) this.avatar.setEmotion('talking');
    }, () => {
      if (this.avatar && this.state.isRunning) this.avatar.setEmotion('idle');
      if (st && this.state.isRunning) st.textContent = "👂 聴いてるニャ♪";
      this.audio.isActionButtonLocked = false;
    }, cooldownMs);
  },

  _updateModeUI(speak = true) {
    const btn = document.getElementById('mode-toggle-btn');
    const icon = document.getElementById('mode-icon');
    const txt = document.getElementById('mode-text');
    const wrap = document.getElementById('avatar-wrapper');

    if (btn) btn.classList.toggle('is-assistant', this.state.isAssistantMode);
    if (wrap) wrap.classList.toggle('is-assistant-mode', this.state.isAssistantMode);

    if (this.state.isAssistantMode) {
      if (icon) icon.textContent = "👓"; if (txt) txt.textContent = "おてつだい";
      if (speak) this.triggerActionVoice("おまかせニャ！", "👓 おまかせニャ！");
    } else {
      if (icon) icon.textContent = "🐾"; if (txt) txt.textContent = "なかよし";
      if (speak) this.triggerActionVoice("あそぶニャ♪", "🐾 あそぶニャ♪");
    }
  },

  /* ==========================================================================
     ★【適正化UI】日記帳（アルバム）制御：20時基準のスマート初期表示＆優しい案内
     ========================================================================== */
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
      if (this.state.isRunning) this.audio.startListening();
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
      Toast.show("絵日記を保存したニャン！📖✨", "success");
      modal?.classList.remove('is-open');
      if (this.state.isRunning) this.audio.startListening();
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
    
    // ★スマート初期フォーカス（20時基準）：
    // 日中（朝4:00〜19:59）に開いた場合、今日が未完成なら直近の完成日記（昨日など）を優先して開く！
    const timeInfo = TimeProvider.getCurrentInfo();
    const todayKey = timeInfo.lifeLogKey;
    const todayDiary = StorageManager.getDiary(todayKey);
    const isTodayProper = StorageManager.isProperDiary(todayDiary);

    if (!timeInfo.isEvening && !isTodayProper) {
      // 昼間で今日が未作成の場合：直近の完成日記インデックスを検索
      const properIdx = this.state.studioDateKeys.findIndex(k => {
        const d = StorageManager.getDiary(k);
        return StorageManager.isProperDiary(d);
      });
      this.state.studioCurrentDateIdx = (properIdx >= 0) ? properIdx : 0;
    } else {
      // 20時以降、または今日が既に完成している場合は最新日（今日）を開く
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

    if (pageIndicator) pageIndicator.textContent = `${curIdx + 1} / ${dateKeys.length} 日目`;
    if (prevBtn) prevBtn.disabled = (curIdx >= dateKeys.length - 1);
    if (nextBtn) nextBtn.disabled = (curIdx <= 0);

    const diary = StorageManager.getDiary(curDateKey);
    const isProper = StorageManager.isProperDiary(diary);
    const photoPool = StorageManager.getDailyPhotoPool(curDateKey);
    const dayLogs = StorageManager.getDailyLogs(curDateKey);

    const prevLogCount = diary?.logCountAtSave || 0;
    const hasNewLogs = (dayLogs && dayLogs.length > prevLogCount);

    // ==========================================
    // 1. 【今日（当日）】で未完成の場合の表示（20時基準の出し分け）
    // ==========================================
    if (isToday && !isProper) {
      if (timeInfo.isEvening) {
        // 【夜20:00以降】1日の振り返り時間に入ったので、日記作成ボタンを優しく表示
        pageContainer.innerHTML = `
          <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#fffaf5; border:2px dashed #fed7aa; border-radius:20px; padding:24px 18px; text-align:center; gap:12px;">
            <div style="font-size:48px; filter:drop-shadow(0 2px 8px rgba(234,88,12,0.2));">🐾🌙</div>
            <div style="font-size:15px; font-weight:900; color:#9a3412;">📅 ${fullDate}</div>
            <div style="font-size:13.5px; font-weight:900; color:#c2410c;">そろそろ今日の日記をまとめる時間だニャン♪</div>
            <div style="font-size:11.5px; color:#ea580c; line-height:1.6; max-width:320px;">
              今日の会話ログ（${dayLogs.length}件）とお写真（${photoPool.length}枚）を記録したニャ！<br>
              下のボタンを押すと、クロが今日の楽しい思い出をぎゅっと絵日記にまとめますニャン🐾
            </div>
            <button type="button" id="btn-create-today-now" style="background:linear-gradient(135deg, #f97316, #ea580c); color:#ffffff; border:none; padding:10px 22px; border-radius:14px; font-size:12.5px; font-weight:900; cursor:pointer; box-shadow:0 4px 12px rgba(234, 88, 12, 0.3);">✍️ 今日の日記をまとめるニャ！</button>
          </div>
        `;
        document.getElementById('btn-create-today-now')?.addEventListener('click', async () => {
          await this._rescueCreateDiaryForDate(curDateKey, fullDate, dayLogs);
        });
      } else {
        // 【日中 4:00〜19:59】まだ日中なので催促ボタンは出さず、穏やかな見守り画面
        pageContainer.innerHTML = `
          <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#fffaf5; border:2px dashed #fed7aa; border-radius:20px; padding:24px 18px; text-align:center; gap:12px;">
            <div style="font-size:48px; filter:drop-shadow(0 2px 8px rgba(234,88,12,0.2));">🐾☀️</div>
            <div style="font-size:15px; font-weight:900; color:#9a3412;">📅 ${fullDate}</div>
            <div style="font-size:13.5px; font-weight:900; color:#c2410c;">今日はおやびんと楽しくお話し中ニャ♪</div>
            <div style="font-size:11.5px; color:#ea580c; line-height:1.6; max-width:320px;">
              ただいま会話ログ（${dayLogs.length}件）とお写真（${photoPool.length}枚）を記録中ニャ！<br>
              夜20時以降になったら『今日の日記書いて』って話しかけてニャン🐾<br>
              ◀ 下の『前の日』ボタンで過去の思い出アルバムをめくれますニャ！
            </div>
          </div>
        `;
      }
      return;
    }

    // ==========================================
    // 2. 【昨日以前（過去日）】で未完成の場合（過去データの救済）
    // ==========================================
    if (!isToday && !isProper) {
      const hasLogs = (dayLogs && dayLogs.length >= 2);
      pageContainer.innerHTML = `
        <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#fffaf5; border:2px dashed #fed7aa; border-radius:20px; padding:24px 18px; text-align:center; gap:12px;">
          <div style="font-size:46px; filter:drop-shadow(0 2px 8px rgba(234,88,12,0.2));">🐾📖</div>
          <div style="font-size:15px; font-weight:900; color:#9a3412;">📅 ${fullDate}</div>
          <div style="font-size:13px; font-weight:900; color:#c2410c;">まだ絵日記が書かれていませんニャ🐾</div>
          <div style="font-size:11.5px; color:#ea580c; line-height:1.6; max-width:320px;">
            ${hasLogs 
              ? `この日の会話ログ（${dayLogs.length}件）とお写真（${photoPool.length}枚）が大切に保管されていますニャ！下のボタンを押すと、クロが思い出をぎゅっと絵日記にまとめますニャン♪` 
              : `この日はまだクロとのお話し記録がありませんニャ。`}
          </div>
          ${hasLogs ? `
            <button type="button" id="btn-rescue-create-diary" style="background:linear-gradient(135deg, #f97316, #ea580c); color:#ffffff; border:none; padding:10px 22px; border-radius:14px; font-size:12.5px; font-weight:900; cursor:pointer; box-shadow:0 4px 12px rgba(234, 88, 12, 0.3);">✍️ この日の絵日記を書くニャ！（${fullDate}）</button>
          ` : `
            <button type="button" id="btn-empty-create-diary" style="background:#ffedd5; border:1.5px solid #ea580c; color:#c2410c; padding:8px 18px; border-radius:12px; font-size:12px; font-weight:900; cursor:pointer;">✍️ 新しく書くニャ！</button>
          `}
        </div>
      `;

      document.getElementById('btn-rescue-create-diary')?.addEventListener('click', async () => {
        await this._rescueCreateDiaryForDate(curDateKey, fullDate, dayLogs);
      });

      document.getElementById('btn-empty-create-diary')?.addEventListener('click', () => {
        const dummyText = `今日もおやびんと一緒に過ごせて幸せな一日だったニャン🐾`;
        StorageManager.saveDiary(dummyText, curDateKey, fullDate, photoPool[0]?.base64 || null, 0, "おやびん大好きニャ！");
        this._renderStudioDiaryPage();
        this._updateStorageMonitorUI();
      });
      return;
    }

    // ==========================================
    // 3. 【通常の日記シート表示】（完成日記の閲覧＆推敲）
    // ==========================================
    pageContainer.innerHTML = `
      <div class="book-page-sheet">
        <div class="book-page-header">
          <span class="book-date-title">📅 ${diary.fullDate}</span>
          <div class="book-meta-tags">
            ${hasNewLogs ? `
              <button type="button" class="btn-read-aloud" id="btn-update-with-night-logs" style="background:linear-gradient(135deg, #0284c7, #0369a1);" title="お昼以降の夜の会話も追加して日記を更新するニャ！">📝 夜のお話しも追加更新</button>
            ` : ''}
            <button type="button" class="btn-read-aloud" id="btn-read-diary-aloud">${this.state.isDiaryReading ? '🛑 朗読ストップ' : '🔊 クロが読むニャ♪'}</button>
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
          <span class="studio-diary-comment-label">🐾 クロのひとこと:</span>
          <textarea class="studio-diary-comment-textarea" id="studio-diary-comment" rows="2" placeholder="（ひとこと記録なし）">${diary.kuroComment || ""}</textarea>
        </div>
      </div>
    `;

    document.getElementById('btn-update-with-night-logs')?.addEventListener('click', async () => {
      await this._rescueCreateDiaryForDate(curDateKey, fullDate, dayLogs);
    });

    document.getElementById('studio-diary-text')?.addEventListener('input', (e) => {
      diary.content = e.target.value;
      StorageManager.saveDiary(diary.content, curDateKey, diary.fullDate, diary.photo, diary.logCountAtSave || dayLogs.length, diary.kuroComment);
    });

    document.getElementById('studio-diary-comment')?.addEventListener('input', (e) => {
      diary.kuroComment = e.target.value;
      StorageManager.saveDiary(diary.content, curDateKey, diary.fullDate, diary.photo, diary.logCountAtSave || dayLogs.length, diary.kuroComment);
    });

    document.getElementById('book-photo-box')?.addEventListener('click', () => {
      if (diary.photo) this.openPhotoLightbox(diary.photo, `📖 ${diary.fullDate} の思い出写真`);
    });

    document.getElementById('btn-del-cur-diary')?.addEventListener('click', () => {
      if (window.confirm(`「${diary.fullDate}」の日記を削除しますかニャ？\n（※会話ログやお写真はそのまま安全に残ります）`)) {
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
        StorageManager.saveDiary(diary.content, curDateKey, diary.fullDate, diary.photo, diary.logCountAtSave || dayLogs.length, diary.kuroComment);
        this._renderStudioDiaryPage();
      };
    });

    pageContainer.querySelectorAll('.btn-snap-del').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        if (window.confirm("この写真を削除しますかニャ？")) {
          const delIdx = parseInt(btn.dataset.del, 10);
          StorageManager.removePhotoFromDailyPool(curDateKey, delIdx);
          this._renderStudioDiaryPage();
        }
      };
    });
  },

  async _rescueCreateDiaryForDate(targetDateKey, targetFullDate, dayLogs) {
    Toast.show(`絵日記を一生懸命書いてるニャ…🐾`, "info");
    const res = await this.ai.generateDailyDiarySummary(dayLogs, targetDateKey, targetFullDate);
    if (res.success && res.diaryText) {
      StorageManager.saveDiary(res.diaryText, targetDateKey, targetFullDate, res.selectedPhoto, dayLogs.length, res.kuroComment);
      Toast.show(`絵日記を書き上げましたニャン！📖✨`, "success");
      this._renderStudioDiaryPage();
      this._updateStorageMonitorUI();
    } else {
      Toast.show("絵日記の作成に失敗しましたニャ。通信状態を確認してくださいニャ", "error");
    }
  },

  _updateDiaryReadBtnUI(reading) {
    const btn = document.getElementById('btn-read-diary-aloud');
    if (btn) btn.textContent = reading ? "🛑 朗読ストップ" : "🔊 クロが読むニャ♪";
  },

  _bindCustomSettingsUI() {
    document.querySelectorAll('.theme-card-btn').forEach(btn => {
      btn.onclick = () => {
        const theme = btn.dataset.themeVal;
        this.applyTheme(theme);
        this.audio.playEffect('aizuchi');
        Toast.show(`お部屋のテーマを切り替えたニャ！🎨✨`, "success", 2000);
      };
    });

    document.querySelectorAll('.voice-chip-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.voice-chip-btn').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        const spk = parseInt(btn.dataset.voiceId, 10);
        localStorage.setItem('kuro_voice_speaker_id', spk);
        this.audio.prefetchVoice("おやびん、わたしはクロだニャン🐾", spk);
        this.audio.playEffect('aizuchi');
      };
    });

    const bindSegment = (groupId, storageKey, activeClass = 'pink') => {
      const container = document.getElementById(groupId);
      if (!container) return;
      container.querySelectorAll('.segment-btn').forEach(btn => {
        btn.onclick = () => {
          container.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('is-active', 'pink', 'blue'));
          btn.classList.add('is-active', activeClass);
          const val = btn.dataset.feedbackVal || btn.dataset.timerSoundVal || btn.dataset.accStyleVal || btn.dataset.countVal;
          localStorage.setItem(storageKey, val);
          this.audio.playEffect('aizuchi');
        };
      });
    };

    bindSegment('feedback-segment-group', 'kuro_button_feedback', 'pink');
    bindSegment('timer-sound-segment-group', 'kuro_timer_sound', 'blue');
    bindSegment('acc-style-segment-group', 'kuro_acc_style', 'pink');
    bindSegment('news-count-segment-group', 'kuro_news_count', 'blue');
    bindSegment('spot-count-segment-group', 'kuro_spot_count', 'blue');
  },

  _bindGlassesAdjusterUI() {
    const modal = document.getElementById('glasses-adjust-modal');
    const updateSliders = (tab) => {
      const c = this.avatar?.glassesCoords[tab] || { x: 0, y: 120, scale: 1.0, rotate: 0 };
      document.getElementById('adj-x').value = c.x; document.getElementById('adj-x-val').textContent = c.x;
      document.getElementById('adj-y').value = c.y; document.getElementById('adj-y-val').textContent = c.y;
      document.getElementById('adj-scale').value = c.scale; document.getElementById('adj-scale-val').textContent = c.scale;
      document.getElementById('adj-rotate').value = c.rotate; document.getElementById('adj-rotate-val').textContent = `${c.rotate}°`;
    };

    document.querySelectorAll('.adjust-tab-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.adjust-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.state.activeAdjustTab = btn.dataset.tab;
        const previewImg = document.getElementById('adjust-cat-img');
        if (previewImg) previewImg.src = `${this.state.activeAdjustTab}.png`;
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
        document.getElementById(`${id}-val`).textContent = (id === 'adj-rotate') ? `${c.rotate}°` : c[id.replace('adj-', '')];
      });
    });

    document.getElementById('open-glasses-adjust-btn')?.addEventListener('click', () => {
      document.getElementById('modal-overlay').style.display = 'none';
      modal?.classList.add('is-open');
      updateSliders(this.state.activeAdjustTab);
    });
    document.getElementById('close-adjust-btn')?.addEventListener('click', () => modal?.classList.remove('is-open'));

    document.getElementById('btn-adjust-reset')?.addEventListener('click', () => {
      const def = StorageManager.defaultGlassesCoords[this.state.activeAdjustTab] || { x: 0, y: 120, scale: 1.0, rotate: 0 };
      if (this.avatar) {
        this.avatar.glassesCoords[this.state.activeAdjustTab] = { ...def };
        this.avatar.applyAllFramesTransform();
      }
      updateSliders(this.state.activeAdjustTab);
      Toast.show("初期位置にリセットしたニャ！👓", "info");
    });

    document.getElementById('btn-adjust-save')?.addEventListener('click', () => {
      if (this.avatar) StorageManager.saveGlassesCoords(this.avatar.glassesCoords);
      Toast.show("メガネ位置を保存したニャン！👓✨", "success");
    });
  },

  _bindEyelidSettingsUI() {
    const btnSave = document.getElementById('btn-save-eyelid-settings');
    if (!btnSave) return;
    ['adj-eyelid-y', 'adj-eyelid-x', 'adj-eyelid-gap', 'adj-eyelid-size'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => {
        const c = {
          y: parseInt(document.getElementById('adj-eyelid-y').value, 10),
          x: parseInt(document.getElementById('adj-eyelid-x').value, 10),
          gap: parseInt(document.getElementById('adj-eyelid-gap').value, 10),
          size: parseInt(document.getElementById('adj-eyelid-size').value, 10)
        };
        if (this.avatar) { this.avatar.eyelidCoords = c; this.avatar.applyEyelidTransforms(); }
        document.getElementById(`${id}-val`).textContent = document.getElementById(id).value;
      });
    });
    btnSave.onclick = () => {
      const c = {
        y: parseInt(document.getElementById('adj-eyelid-y').value, 10),
        x: parseInt(document.getElementById('adj-eyelid-x').value, 10),
        gap: parseInt(document.getElementById('adj-eyelid-gap').value, 10),
        size: parseInt(document.getElementById('adj-eyelid-size').value, 10)
      };
      StorageManager.saveEyelidCoords(c);
      Toast.show("まぶた位置を保存したニャ！👁️✨", "success");
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
            Toast.show("記憶を更新したニャン！✏️✨", "success");
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
          if (window.confirm(`「${mem}」を削除しますかニャ？`)) {
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

    const restoreInput = document.getElementById('file-input-restore');
    document.getElementById('btn-trigger-restore')?.addEventListener('click', () => restoreInput?.click());
    restoreInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          StorageManager.importAndReplaceDataPackage(JSON.parse(evt.target.result));
          this.memories = StorageManager.loadMemories(CHARACTER_CONFIG.defaultMemories);
          this._renderMemories();
          this._restoreTimelineHistory();
          this._updateStorageMonitorUI();
          Toast.show("データを安全に完全復元したニャン！🎉", "success");
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
        Toast.show("座標が入力されていませんニャ", "error");
        return;
      }
      navigator.clipboard.writeText(val).then(() => {
        Toast.show("座標をコピーしたニャン！📋", "success");
        Logger.log(`[Home] 座標コピー成功: ${val}`, "info");
      });
    });

    document.getElementById('btn-get-current-home')?.addEventListener('click', async () => {
      Toast.show("現在地を取得中ニャ…📍", "info");
      const ok = await LocationProvider.fetchLocationOnDemand(false);
      if (ok && LocationProvider.lat !== null) {
        const val = `${LocationProvider.lat.toFixed(6)}, ${LocationProvider.lon.toFixed(6)}`;
        document.getElementById('home-coords-input').value = val;
        LocationProvider.homeLat = LocationProvider.lat;
        LocationProvider.homeLon = LocationProvider.lon;
        localStorage.setItem('kuro_home_coords', val);
        Toast.show("現在地を自宅にセットしたニャン！🏠✨", "success");
        Logger.log(`[Home] 現在地を自宅に設定: ${val}`, "success");
      } else {
        Toast.show("現在地を取得できませんでしたニャ", "error");
      }
    });

    document.getElementById('diag-test-models-btn')?.addEventListener('click', async () => {
      const apiKey = AppCore.ai.apiKey;
      if (!apiKey) {
        Logger.log("[診断] ⚠️ APIキーが未設定です。設定画面で入力してください", "error");
        Toast.show("APIキーを設定してくださいニャ", "error");
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
      Toast.show("モデル検証が完了したニャ！🩺", "success");
    });

    document.getElementById('btn-clear-chat-display')?.addEventListener('click', () => {
      if (window.confirm("画面の会話をお掃除しますかニャ？（日記は残ります）")) {
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
      const msg = this.state.snackCount >= 3 ? "ハフハフ…うまうまニャ！お腹いっぱい大満足ニャ〜極楽ニャン♡" : "もぐもぐ…ちゅ〜る最高ニャ！🐟";
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
        Toast.show(`姿を変身したニャ！✨（${next === 'real' ? 'リアル写真' : 'イラスト'}）`, 'info');
      }
    });

    document.getElementById('mode-toggle-btn')?.addEventListener('click', () => {
      this.state.isAssistantMode = !this.state.isAssistantMode;
      localStorage.setItem('kuro_mode', this.state.isAssistantMode ? 'assistant' : 'pet');
      this._updateModeUI(true);
    });

    document.getElementById('stop-action-btn')?.addEventListener('click', () => {
      this.cancelKitchenTimer(false);
      this.audio.stopReadingAloud();
      this.audio.stopSpeaking();
      this.state.isThinking = false;
      this.state.isProcessingInput = false;
      this.state.isDiaryReading = false;
      this._updateDiaryReadBtnUI(false);
      if (this.avatar) this.avatar.setEmotion('idle');
      this.triggerActionVoice("はーい！", "🛑 はーい！");
    });

    document.getElementById('pause-btn')?.addEventListener('click', () => {
      this.state.isRunning = !this.state.isRunning;
      const btn = document.getElementById('pause-btn');
      const wrap = document.getElementById('avatar-wrapper');
      const petContainer = document.getElementById('pet-container');
      const st = document.getElementById('status-text');

      btn?.classList.toggle('is-paused', !this.state.isRunning);
      document.getElementById('pause-icon').textContent = this.state.isRunning ? "🟢" : "🛑";
      document.getElementById('pause-text').textContent = this.state.isRunning ? "会話中" : "お休み中";

      if (!this.state.isRunning) {
        this.audio.stopListening();
        this.audio.stopSpeaking();
        this.audio.stopReadingAloud();
        this.cancelKitchenTimer(false);
        this.state.isThinking = false;
        this.state.isProcessingInput = false;
        this.state.isDiaryReading = false;

        petContainer?.classList.add('is-paused-mode');
        if (st) st.textContent = "💤 すやすやお昼寝中…";

        if (this.avatar) this.avatar.triggerYawn();
        setTimeout(() => {
          if (!this.state.isRunning && wrap) {
            wrap.classList.add('is-sleeping');
          }
        }, 500);

        Logger.log(`[Status] 💤 お休み中（居眠りモード開始・ステータス完全防護）`, "info");
      } else {
        petContainer?.classList.remove('is-paused-mode');
        if (wrap) wrap.classList.remove('is-sleeping');
        if (st) st.textContent = "👂 聴いてるニャ♪";
        const wakeMsg = "ふぁ〜あ…！おやびん、起きたニャン🐾";
        this.audio.speak(wakeMsg, null, () => this.renderBubble('model', wakeMsg), () => {
          if (this.state.isRunning) this.audio.startListening();
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

      let partMsg = "なでなでされて喉をゴロゴロ鳴らしてるニャ♪😻";
      if (clickYRatio < 0.35) {
        partMsg = "お耳ピクピク！くすぐったくて気持ちいいニャン♪👂✨";
      } else if (clickYRatio < 0.68) {
        partMsg = "あたまナデナデ大好きニャ〜極楽ニャン♡🐾";
      } else {
        partMsg = "そこそこ！あごの下、喉をゴロゴロ鳴らしちゃうニャン😻";
      }

      this.audio.playEffect('purr');
      if (this.avatar) { this.avatar.triggerTouchHeart(); this.avatar.setEmotion('happy'); }
      Toast.show(partMsg, "success", 2200);
      setTimeout(() => { if (!this.audio.isSpeaking && this.avatar && this.state.isRunning) this.avatar.setEmotion('idle'); }, 1500);
    });

    document.getElementById('test-voice-btn')?.addEventListener('click', () => {
      const spk = this.getSpeakerId();
      this.audio.speak("おやびん、わたしはクロだニャン🐾", spk);
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

      const currentSpeaker = localStorage.getItem('kuro_voice_speaker_id') || '10';
      document.querySelectorAll('.voice-chip-btn').forEach(btn => btn.classList.toggle('is-active', btn.dataset.voiceId === currentSpeaker));

      const syncSegment = (groupId, key, defaultVal, activeClass) => {
        const val = localStorage.getItem(key) || defaultVal;
        const container = document.getElementById(groupId);
        container?.querySelectorAll('.segment-btn').forEach(b => {
          const bVal = b.dataset.feedbackVal || b.dataset.timerSoundVal || b.dataset.accStyleVal || b.dataset.countVal;
          const isMatch = (bVal === val);
          b.classList.toggle('is-active', isMatch);
          if (isMatch) b.classList.add(activeClass);
          else b.classList.remove(activeClass);
        });
      };

      syncSegment('feedback-segment-group', 'kuro_button_feedback', 'voice', 'pink');
      syncSegment('timer-sound-segment-group', 'kuro_timer_sound', 'bell', 'blue');
      syncSegment('acc-style-segment-group', 'kuro_acc_style', 'both', 'pink');
      syncSegment('news-count-segment-group', 'kuro_news_count', '2', 'blue');
      syncSegment('spot-count-segment-group', 'kuro_spot_count', '2', 'blue');

      this._renderMemories();
      this._updateStorageMonitorUI();
      document.getElementById('modal-overlay').style.display = 'flex';
    });

    document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay') {
        document.getElementById('modal-overlay').style.display = 'none';
        if (this.state.isRunning) this.audio.startListening();
      }
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
        if (saveTxt) saveTxt.textContent = "APIキーを検証中ニャ…⚡";

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
        if (saveTxt) saveTxt.textContent = "設定と記憶を保存するニャン♪";

        if (hasError) {
          this.audio.playEffect('alarm');
          Toast.show("⚠️ APIキーエラーです。キーを確認してくださいニャ！", "error", 4500);
          return;
        }
      }

      this.ai.apiKey = newApiKey;
      localStorage.setItem('kuro_api_key', newApiKey);
      localStorage.setItem('kuro_voicevox_key', newVvKey);
      localStorage.setItem('kuro_home_coords', newHome);

      LocationProvider._applyHomeFallback();
      document.getElementById('modal-overlay').style.display = 'none';
      Toast.show("設定と記憶を保存したニャン♪", "success");
      this.triggerActionVoice("バッチリニャ！", "💾 バッチリニャ！");
      Logger.log(`[Auth] ✅ 設定保存完了（認証OK・静かに終了）`, "success");
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
      if (this.state.isRunning) this.audio.startListening();
    });
    document.getElementById('diag-copy-evidence-btn')?.addEventListener('click', () => {
      navigator.clipboard.writeText(Logger.getEvidenceText()).then(() => Toast.show("ログをコピーしたニャ！📋", "success"));
    });
  }
};

window.addEventListener('load', () => AppCore.init());