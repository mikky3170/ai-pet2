/* ==========================================================================
   【永久不変仕様書】AIペット クロちゃん🐾 対話エンジン＆設計思想（app.js Part 1）
   ==========================================================================
   ■ 1. なかよしモード と おてつだいモード の絶対分離ルール
     ・🐾 なかよしモード（通常モード）：
       おやびんとの雑談・共感・甘えん坊を楽しむ時間。ツール・地図は完全封印し爆速雑談。
     ・👓 おてつだいモード（博士帽＆丸メガネ装着時）：
       ネット検索や道案内をする世界一の相棒「マブダチ」タイム。
       寄り添い絞り込み・気まぐれぶっ込み直感提案・おまかせ直撃を状況に合わせて使い分け。

   ■ 2. 写真管理・容量最適化・ストレージ安心設計
     ・写真の4重重複保存を完全撤廃。会話ログに重い画像を重複書き込みせず容量を保護。
     ・写真プールは1日最大12枚。13枚目到達時は一番古い写真と自動で入れ替え。
     ・LocalStorageの容量をリアルタイム監視し、iPhone風の3色マルチカラー（写真・会話・記憶設定）で完全可視化。
     ・ワンタップで重複写真をお掃除し、絵日記写真は約20〜25KBにスマート再圧縮して空き容量を激増させる安全エンジン搭載。
     ・翌朝4時以降の初回発話時に、前日の日記自動更新を声と文字で報告（会話記憶からは除外）。

   ■ 3. システム優先順位（絶対厳守）
     ・優先1：VOICEVOX肉声とセリフ同期、Gemini連携モデル完全固定（3.5-flash-lite / flash-lite-latest）
     ・優先2：可愛いデザイン、スムーズなアニメーションの完全維持
     ・優先3：絵日記アルバム、GPS、二重の安全防波堤（自動フォールバック）
   ========================================================================== */

/* ★ Gemini連携モデル完全固定定数（変更・追加・動的ソートを物理的に禁止） */
const FIXED_LITE_MODELS = Object.freeze([
  "gemini-3.5-flash-lite",     // 第1優先（主軸・実測0.69秒の最速モデル）
  "gemini-flash-lite-latest"   // 第2優先（20秒タイムアウト時バックアップ）
]);

/* ★ 検証テストプログラム準拠：正式なFunction Calling定義 */
const KURO_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "searchMapPlaces",
        description: "Googleマップでお店や施設、観光スポットを検索して案内カードを表示します。おやびんとの会話でジャンルや移動手段・店名が決まった時、またはおまかせ・直撃・ぶっ込み提案の時に呼び出してください。",
        parameters: {
          type: "OBJECT",
          properties: {
            spotName: {
              type: "STRING",
              description: "検索する店名や施設名・料理ジャンル（例: 炭火ホルモン 丸川, 餃子の満洲, 車で行ける美味しい餃子屋, ラーメン）"
            },
            area: {
              type: "STRING",
              description: "検索するエリア・地域（例: 東京都東村山市, 現在地周辺）"
            }
          },
          required: ["spotName"]
        }
      },
      {
        name: "searchLatestNews",
        description: "Googleニュースで最新のニュース記事やトピックを検索して案内カードを表示します。ニュースの話題が決まった時、またはクロちゃんおすすめの話題を出す時に呼び出してください。",
        parameters: {
          type: "OBJECT",
          properties: {
            topic: {
              type: "STRING",
              description: "検索するニュースキーワード（例: 大谷翔平 最新ニュース, 東村山市, プロ野球, 最新テクノロジー）"
            }
          },
          required: ["topic"]
        }
      }
    ]
  }
];

/* ==========================================================================
   ★ MODULE 0: 診断ロガー ＆ トースト通知システム
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
  getEvidenceText() {
    return this.allLogs.join('\n');
  }
};

/* ==========================================================================
   ★ MODULE 0.5: 日時・時間提供エンジン（TimeProvider - 午前4時生活リズム対応）
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
    if (isLateNight) {
      lifeDateObj = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const lifeYear = lifeDateObj.getFullYear();
    const lifeMonth = lifeDateObj.getMonth() + 1;
    const lifeDate = lifeDateObj.getDate();
    const lifeDayOfWeek = dayNames[lifeDateObj.getDay()];
    const lifeLogKey = `${lifeYear}-${pad(lifeMonth)}-${pad(lifeDate)}`;
    const lifeFullDate = `${lifeYear}年${lifeMonth}月${lifeDate}日 (${lifeDayOfWeek})`;

    const spokenClock = `いまは、${hours}時${minutes === 0 ? 'ちょうど' : minutes + '分'}だニャン🐾`;
    const spokenDate = `きょうは、${year}年${month}月${date}日、${dayOfWeek}曜日だニャ！`;

    const clockDisplay = `いまは ${hours}時${pad(minutes)}分 だニャン🐾`;
    const dateDisplay = `きょうは ${month}月${date}日 (${dayOfWeek}曜日) だニャ！`;

    return {
      now,
      year,
      month,
      date,
      hours,
      minutes,
      dayOfWeek,
      clock,
      logKey,
      fullDate,
      spokenClock,
      spokenDate,
      clockDisplay,
      dateDisplay,
      isLateNight,
      lifeLogKey,
      lifeFullDate
    };
  }
};

/* ==========================================================================
   ★ MODULE 1: 音声合成＆音声認識（ノイズゼロ極上ゴロゴロ音 ＆ 語尾「ねニャン」自動お掃除）
   ========================================================================== */
class AudioSpeechEngine {
  constructor() {
    this.masterAudio = new Audio();
    this.masterAudio.preload = "auto";
    this.fillerAudio = new Audio();
    this.fillerAudio.preload = "auto";
    this.isMasterUnlocked = false;
    this.silentWav = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
    
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.audioCtx = AudioCtx ? new AudioCtx() : null;

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

  setRate(r) {
    this.rate = r;
    localStorage.setItem('kuro_rate', r);
  }

  _getAudioContext() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  unlockMasterAudio() {
    this._getAudioContext();
    if (this.isMasterUnlocked) return;
    this.masterAudio.src = this.silentWav;
    this.fillerAudio.src = this.silentWav;
    Promise.all([
      this.masterAudio.play().catch(() => {}),
      this.fillerAudio.play().catch(() => {})
    ]).then(() => {
      this.isMasterUnlocked = true;
      Logger.log("[Audio] オーディオ再生アンカー解放完了", "info");
    }).catch(() => {});
  }

  _setupInteractionUnlock() {
    const unlock = () => this.unlockMasterAudio();
    ['pointerdown', 'touchstart', 'click'].forEach(evt => {
      window.addEventListener(evt, unlock, { passive: true, once: true });
    });
  }

  playEffect(type) {
    const ctx = this._getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (type === 'poof') {
      const bufferSize = ctx.sampleRate * 0.35;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(800, now);
      filter.frequency.exponentialRampToValueAtTime(160, now + 0.32);
      filter.Q.setValueAtTime(2.5, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.45, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

      whiteNoise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      const osc = ctx.createOscillator();
      const toneGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.28);
      toneGain.gain.setValueAtTime(0.38, now);
      toneGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc.connect(toneGain);
      toneGain.connect(ctx.destination);

      whiteNoise.start(now);
      whiteNoise.stop(now + 0.35);
      osc.start(now);
      osc.stop(now + 0.28);

    } else if (type === 'purr') {
      const oscBase = ctx.createOscillator();
      const oscSub = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const mainGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      oscBase.type = 'triangle';
      oscBase.frequency.setValueAtTime(86, now);
      oscBase.frequency.linearRampToValueAtTime(102, now + 0.35);
      oscBase.frequency.linearRampToValueAtTime(82, now + 0.70);

      oscSub.type = 'sine';
      oscSub.frequency.setValueAtTime(172, now);
      oscSub.frequency.linearRampToValueAtTime(204, now + 0.35);
      oscSub.frequency.linearRampToValueAtTime(164, now + 0.70);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(240, now);

      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(24, now);

      lfoGain.gain.setValueAtTime(0.32, now);
      lfoGain.gain.setValueAtTime(0.32, now + 0.65);
      lfoGain.gain.linearRampToValueAtTime(0, now + 0.82);

      mainGain.gain.setValueAtTime(0, now);
      mainGain.gain.linearRampToValueAtTime(0.38, now + 0.12);
      mainGain.gain.linearRampToValueAtTime(0.32, now + 0.50);
      mainGain.gain.linearRampToValueAtTime(0, now + 0.82);

      lfo.connect(lfoGain);
      lfoGain.connect(mainGain.gain);

      oscBase.connect(filter);
      oscSub.connect(filter);
      filter.connect(mainGain);
      mainGain.connect(ctx.destination);

      lfo.start(now); lfo.stop(now + 0.85);
      oscBase.start(now); oscBase.stop(now + 0.85);
      oscSub.start(now); oscSub.stop(now + 0.85);

      if ('vibrate' in navigator) {
        try { navigator.vibrate([35, 45, 35, 45, 35, 45]); } catch(e) {}
      }

    } else if (type === 'snack') {
      [0, 0.16, 0.32].forEach(delay => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(450, now + delay);
        osc.frequency.exponentialRampToValueAtTime(220, now + delay + 0.12);
        gain.gain.setValueAtTime(0.32, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.12);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now + delay); osc.stop(now + delay + 0.12);
      });

    } else if (type === 'bell') {
      const bellPitches = [1568, 2093, 1568, 2093];
      const bellTimes = [0, 0.14, 0.38, 0.52];

      bellTimes.forEach((delay, idx) => {
        const osc = ctx.createOscillator();
        const oscHarmonic = ctx.createOscillator();
        const gain = ctx.createGain();

        const freq = bellPitches[idx];
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + delay);

        oscHarmonic.type = 'triangle';
        oscHarmonic.frequency.setValueAtTime(freq * 2.02, now + delay);

        gain.gain.setValueAtTime(0.48, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.42);

        osc.connect(gain);
        oscHarmonic.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + delay); osc.stop(now + delay + 0.45);
        oscHarmonic.start(now + delay); oscHarmonic.stop(now + delay + 0.45);
      });

    } else if (type === 'alarm') {
      const bursts = [0, 0.11, 0.22, 0.45, 0.56, 0.67];
      bursts.forEach(delay => {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'square';
        osc1.frequency.setValueAtTime(2093, now + delay);

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(2637, now + delay);

        gain.gain.setValueAtTime(0.38, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.08);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now + delay); osc1.stop(now + delay + 0.085);
        osc2.start(now + delay); osc2.stop(now + delay + 0.085);
      });

    } else if (type === 'idea') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1760, now + 0.18);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.4);

    } else if (type === 'aizuchi') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(680, now);
      osc.frequency.exponentialRampToValueAtTime(920, now + 0.07);
      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.18);

    } else if (type === 'happy_meow') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(580, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
      osc.frequency.exponentialRampToValueAtTime(640, now + 0.42);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
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
    t = t.replace(/(?:よね|わね)\s*(?:ニャン|ニャ|にゃん|にゃ)/gu, 'ニャン');
    t = t.replace(/(?:たね|たよね)\s*(?:ニャン|ニャ|にゃん|にゃ)/gu, 'たニャン');
    t = t.replace(/(?:そうね)\s*(?:ニャン|ニャ|にゃん|にゃ)/gu, 'そうニャン');
    t = t.replace(/ね\s*(?:ニャン|ニャ|にゃん|にゃ)/gu, 'ニャン');
    return t;
  }

  _convertAllNumbersToKana(text) {
    if (!text) return "";
    let t = this.cleanEndingNenyan(text);
    t = t.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));

    t = t.replace(/余([はがものにもと])/g, 'よ$1').replace(/余/g, 'よ');
    t = t.replace(/(\d{4})\s*年/g, (m, yStr) => `${numToKana(parseInt(yStr, 10))}ねん`);

    const monthMap = {
      1: 'いちがつ', 2: 'にがつ', 3: 'さんがつ', 4: 'しがつ', 5: 'ごがつ', 6: 'ろくがつ',
      7: 'しちがつ', 8: 'はちがつ', 9: 'くがつ', 10: 'じゅうがつ', 11: 'じゅういちがつ', 12: 'じゅうにがつ'
    };
    t = t.replace(/(\d{1,2})\s*月/g, (m, mStr) => {
      const mNum = parseInt(mStr, 10);
      return monthMap[mNum] ? monthMap[mNum] : `${numToKana(mNum)}がつ`;
    });

    const dayMap = {
      1: 'ついたち', 2: 'ふつか', 3: 'みっか', 4: 'よっか', 5: 'いつか',
      6: 'むいか', 7: 'なのか', 8: 'ようか', 9: 'ここのか', 10: 'とおか',
      11: 'じゅういちにち', 12: 'じゅうににち', 13: 'じゅうさんにち', 14: 'じゅうよっか',
      15: 'じゅうごにち', 16: 'じゅうろくにち', 17: 'じゅうしちにち', 18: 'じゅうはちにち',
      19: 'じゅうくにち', 20: 'はつか', 21: 'にじゅういちにち', 22: 'にじゅうににち',
      23: 'にじゅうさんにち', 24: 'にじゅうよっか', 25: 'にじゅうごにち', 26: 'にじゅうろくにち',
      27: 'にじゅうしちにち', 28: 'にじゅうはちにち', 29: 'にじゅうくにち', 30: 'さんじゅうにち',
      31: 'さんじゅういちにち'
    };
    t = t.replace(/(\d{1,2})\s*日/g, (m, dStr) => {
      const dNum = parseInt(dStr, 10);
      return dayMap[dNum] ? dayMap[dNum] : `${numToKana(dNum)}にち`;
    });

    const hourUnit = (h) => {
      const map = {
        0: 'れいじ', 1: 'いちじ', 2: 'にじ', 3: 'さんじ', 4: 'よじ', 5: 'ごじ',
        6: 'ろくじ', 7: 'しちじ', 8: 'はちじ', 9: 'くじ', 10: 'じゅうじ',
        11: 'じゅういちじ', 12: 'じゅうにじ', 13: 'じゅうさんじ', 14: 'じゅうよじ',
        15: 'じゅうごじ', 16: 'じゅうろくじ', 17: 'じゅうしちじ', 18: 'じゅうはちじ',
        19: 'じゅうくじ', 20: 'にじゅうじ', 21: 'にじゅういちじ', 22: 'にじゅうにじ',
        23: 'にじゅうさんじ', 24: 'にじゅうよじ'
      };
      return map[h] || (numToKana(h) + 'じ');
    };

    const minuteUnit = (m) => {
      if (m === 0) return 'ぜろふん';
      const ones = ['', 'いっぷん', 'にふん', 'さんぷん', 'よんぷん', 'ごふん', 'ろっぷん', 'ななふん', 'はっぷん', 'きゅうふん', 'じゅっぷん'];
      if (m <= 10) return ones[m];
      const tens = Math.floor(m / 10);
      const rem = m % 10;
      const tensPrefix = (tens === 1 ? 'じゅう' : numToKana(tens) + 'じゅう');
      if (rem === 0) return tensPrefix + 'っぷん';
      return tensPrefix + ones[rem];
    };

    function numToKana(n) {
      if (n === 0) return 'ぜろ';
      const d = ['', 'いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう'];
      const parse4 = (val) => {
        let res = '';
        const sen = Math.floor(val / 1000);
        if (sen === 1) res += 'せん';
        else if (sen === 3) res += 'さんぜん';
        else if (sen === 6) res += 'ろくせん';
        else if (sen === 8) res += 'はっせん';
        else if (sen > 1) res += d[sen] + 'せん';

        const hyaku = Math.floor((val % 1000) / 100);
        if (hyaku === 1) res += 'ひゃく';
        else if (hyaku === 3) res += 'さんびゃく';
        else if (hyaku === 6) res += 'ろっぴゃく';
        else if (hyaku === 8) res += 'はっぴゃく';
        else if (hyaku > 1) res += d[hyaku] + 'ひゃく';

        const juu = Math.floor((val % 100) / 10);
        if (juu === 1) res += 'じゅう';
        else if (juu > 1) res += d[juu] + 'じゅう';

        const ichi = val % 10;
        if (ichi > 0) res += d[ichi];
        return res;
      };

      if (n >= 10000) {
        const man = Math.floor(n / 10000);
        const rem = n % 10000;
        return (man === 1 ? 'いちまん' : parse4(man) + 'まん') + (rem > 0 ? parse4(rem) : '');
      }
      return parse4(n);
    }

    t = t.replace(/(\d{1,2}):(\d{1,2})/g, (m, hStr, mStr) => `${hourUnit(parseInt(hStr, 10))}${minuteUnit(parseInt(mStr, 10))}`);
    t = t.replace(/(\d{1,2})\s*時/g, (match, nStr) => hourUnit(parseInt(nStr, 10)));
    t = t.replace(/(\d{1,2})\s*分/g, (match, nStr) => minuteUnit(parseInt(nStr, 10)));
    t = t.replace(/マイナス\s*(\d+)/g, 'まいなす$1');
    t = t.replace(/-\s*(\d+)/g, 'まいなす$1');
    t = t.replace(/(\d+)\s*(?:度|℃|°C|°c|°)/g, (m, nStr) => numToKana(parseInt(nStr, 10)) + 'ど');
    t = t.replace(/(\d+)\s*秒/g, (m, nStr) => numToKana(parseInt(nStr, 10)) + 'びょう');
    t = t.replace(/(\d+)\s*円/g, (m, nStr) => numToKana(parseInt(nStr, 10)) + 'えん');
    t = t.replace(/(\d+)\s*(?:キロ|km|kg)/gi, (m, nStr) => numToKana(parseInt(nStr, 10)) + 'きろ');
    t = t.replace(/1\s*人/g, 'ひとり').replace(/2\s*人/g, 'ふたり').replace(/(\d+)\s*人/g, (m, nStr) => numToKana(parseInt(nStr, 10)) + 'にん');
    t = t.replace(/1\s*匹/g, 'いっぴき').replace(/(\d+)\s*匹/g, (m, nStr) => numToKana(parseInt(nStr, 10)) + 'ひき');
    t = t.replace(/1\s*つ/g, 'ひとつ').replace(/2\s*つ/g, 'ふたつ').replace(/3\s*つ/g, 'みっつ');
    t = t.replace(/(\d+)\s*(?:歳|才)/g, (m, nStr) => (parseInt(nStr, 10) === 20 ? 'はたち' : numToKana(parseInt(nStr, 10)) + 'さい'));
    t = t.replace(/\d+/g, m => numToKana(parseInt(m, 10)));
    return t;
  }

  prefetchVoice(text, speakerId) {
    this._getVoicevoxBlobUrl(text, speakerId).then(blobUrl => {
      this.fixedPhraseMap.set(`${speakerId}_${text}`, blobUrl);
      Logger.log(`[定型肉声Blobキャッシュ完了] ${text}`, "info");
    }).catch(() => {});
  }

  preloadAllFillers(speakerId) {
    const fillers = [
      "そうニャン♪",
      "えーっとニャ…",
      "確認するニャ！",
      "ちょっと待ってニャ♪",
      "クロが調べるニャ！",
      "うんうん、聞いてるニャ♪",
      "おまかせニャ！",
      "あそぶニャ♪",
      "バッチリニャ！",
      "はーい！",
      "ちょい待ちニャ！",
      "すすめるニャン♪"
    ];
    fillers.forEach(f => this.prefetchVoice(f, speakerId));
  }

  async playImmediateFiller(type = 'general') {
    this.unlockMasterAudio();
    const speakerId = AppCore.getSpeakerId();
    let phrase = "そうニャン♪";

    if (!AppCore.state.isAssistantMode) {
      const candidates = ["そうニャン♪", "うんうん、聞いてるニャ♪", "えーっとニャ…"];
      phrase = candidates[Math.floor(Math.random() * candidates.length)];
    } else {
      if (type === 'location') {
        phrase = Math.random() > 0.5 ? "確認するニャ！" : "ちょっと待ってニャ♪";
      } else if (type === 'search') {
        phrase = "クロが調べるニャ！";
      } else if (type === 'think') {
        phrase = "えーっとニャ…";
      } else {
        const candidates = ["そうニャン♪", "うんうん、聞いてるニャ♪"];
        phrase = candidates[Math.floor(Math.random() * candidates.length)];
      }
    }

    const key = `${speakerId}_${phrase}`;
    if (this.fixedPhraseMap.has(key)) {
      try {
        this.fillerAudio.src = this.fixedPhraseMap.get(key);
        this.fillerAudio.playbackRate = this.rate;
        await this.fillerAudio.play();
        if (AppCore.avatar) AppCore.avatar.setEmotion('talking');
        setTimeout(() => {
          if (!this.isSpeaking && AppCore.avatar) AppCore.avatar.setEmotion('thinking');
        }, 850);
      } catch(e) {}
    } else {
      this.playEffect('aizuchi');
    }
  }

  async _getVoicevoxBlobUrl(text, speakerId) {
    const key = `${speakerId}_${text}`;
    if (this.blobUrlCache.has(key)) {
      return this.blobUrlCache.get(key);
    }
    if (this.fixedPhraseMap.has(key)) {
      return this.fixedPhraseMap.get(key);
    }

    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }
    this.currentAbortController = new AbortController();
    const signal = this.currentAbortController.signal;

    const now = Date.now();
    const elapsed = now - this.lastVoicevoxRequestTime;
    if (elapsed < 1500) {
      await new Promise(r => setTimeout(r, 1500 - elapsed));
    }
    this.lastVoicevoxRequestTime = Date.now();

    const rawVvKey = localStorage.getItem('kuro_voicevox_key') || '';
    const vvKey = rawVvKey.trim();

    let initUrl = `https://api.tts.quest/v3/voicevox/synthesis?text=${encodeURIComponent(text)}&speaker=${speakerId}`;
    if (vvKey) {
      initUrl += `&key=${encodeURIComponent(vvKey)}`;
    }

    const initRes = await fetch(initUrl, { signal });
    if (!initRes.ok) throw new Error(`HTTP初期エラー ${initRes.status}`);

    const initData = await initRes.json();
    if (initData.isAudioError) throw new Error("VOICEVOX側エラー");

    let directUrl = initData.mp3StreamingUrl || initData.mp3DownloadUrl;

    if (!directUrl && initData.audioStatusUrl) {
      const statusUrl = initData.audioStatusUrl;
      for (let i = 1; i <= 24; i++) {
        await new Promise(r => setTimeout(r, 450));
        if (signal.aborted) throw new Error("リクエスト中断");
        try {
          const sRes = await fetch(statusUrl, { signal });
          if (sRes.ok) {
            const sData = await sRes.json();
            if (sData.isAudioReady) {
              directUrl = sData.mp3StreamingUrl || sData.mp3DownloadUrl;
              break;
            }
          }
        } catch(e) {
          if (signal.aborted) throw e;
        }
      }
    }

    if (!directUrl) throw new Error("VOICEVOX生成タイムアウト");

    const audioRes = await fetch(directUrl, { signal });
    if (!audioRes.ok) throw new Error("音声データのダウンロードに失敗しました");
    const audioBlob = await audioRes.blob();
    const blobUrl = URL.createObjectURL(audioBlob);

    this.blobUrlCache.set(key, blobUrl);
    return blobUrl;
  }

  _isSelfEcho(text) {
    if (!text) return true;
    const normalized = text.replace(/[\s、。！？ニャンニャ]/g, '');
    if (normalized.length < 2) return true;

    const exactButtonPatterns = /^(?:おまかせ|お任せ|あそぶ|遊ぶ|ばっちり|バッチリ|はーい|はい|うまうま|ちょい待ち|すすめる)(?:ニャ|ニャン|にゃ|にゃん)?$/;
    if (exactButtonPatterns.test(normalized)) {
      return true;
    }

    const now = Date.now();
    const isVeryRecent = (now - this.lastSpeechEndTime) < 450;

    for (const spoken of this.recentSpokenTexts) {
      const normSpoken = spoken.replace(/[\s、。！？ニャンニャ]/g, '');
      if (normSpoken === normalized) return true;
      if (isVeryRecent && normalized.length <= 6 && normSpoken.includes(normalized)) return true;
    }
    return false;
  }

  async speak(text, speakerIdOverride = null, onStart = null, onEnd = null, cooldownOverride = null) {
    this.stopSpeaking();
    this.stopListening();
    this.unlockMasterAudio();

    try {
      this.fillerAudio.pause();
      this.fillerAudio.currentTime = 0;
    } catch(e) {}

    const speakerId = (speakerIdOverride !== null) ? speakerIdOverride : AppCore.getSpeakerId();
    const cooldownMs = (cooldownOverride !== null) ? cooldownOverride : 350;

    let clean = this._convertAllNumbersToKana(text)
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/[（\(][^）\)]*?[）\)]/g, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/<[^>]*>/g, '')
      .replace(/[*#_~`🐾🐱✨❤️💖🎀🧠⚡🩺💭🎵🍜🥟📍📰🗺️⭐💥📒📖🌐🔷🔴🌤️🛍️💡🐟📷🏠]/gu, '')
      .replace(/^[、。,\.\s]+/, '')
      .trim();

    if (!clean) {
      if (onStart) onStart();
      if (onEnd) onEnd();
      setTimeout(() => {
        if (AppCore.state.isRunning && !this.isActionButtonLocked) this.startListening();
      }, cooldownMs);
      return;
    }

    this.recentSpokenTexts.unshift(clean);
    if (this.recentSpokenTexts.length > 5) this.recentSpokenTexts.pop();

    let hasTriggeredStart = false;
    const triggerStartOnce = () => {
      if (!hasTriggeredStart) {
        hasTriggeredStart = true;
        this.isSpeaking = true;
        const st = document.getElementById('status-text');
        if (st) st.textContent = "🗣️ お話し中♪";
        if (onStart) onStart();
      }
    };

    try {
      const blobAudioUrl = await this._getVoicevoxBlobUrl(clean, speakerId);
      this.masterAudio.src = blobAudioUrl;
      this.masterAudio.playbackRate = this.rate;

      await new Promise((resolve) => {
        let isResolved = false;
        const completeHandler = () => {
          if (!isResolved) {
            isResolved = true;
            this.masterAudio.removeEventListener('canplaythrough', completeHandler);
            this.masterAudio.removeEventListener('loadeddata', completeHandler);
            resolve();
          }
        };
        this.masterAudio.addEventListener('canplaythrough', completeHandler);
        this.masterAudio.addEventListener('loadeddata', completeHandler);
        setTimeout(completeHandler, 600);
      });

      this.masterAudio.onplaying = () => { triggerStartOnce(); };

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

      this.masterAudio.onerror = () => {
        Logger.log("[Audio] VOICEVOX直接再生エラー", "error");
        this.isSpeaking = false;
        if (onStart) onStart();
        if (onEnd) onEnd();
        setTimeout(() => {
          if (AppCore.state.isRunning && !this.isActionButtonLocked) {
            const st = document.getElementById('status-text');
            if (st) st.textContent = "👂 聴いてるニャ♪";
            this.startListening();
          }
        }, cooldownMs);
      };

      await this.masterAudio.play();
    } catch (err) {
      Logger.log(`[VOICEVOX待機] ${err.message}`, "warn");
      this.isSpeaking = false;
      if (onStart) onStart();
      if (onEnd) onEnd();
      setTimeout(() => {
        if (AppCore.state.isRunning && !this.isActionButtonLocked) {
          const st = document.getElementById('status-text');
          if (st) st.textContent = "👂 聴いてるニャ♪";
          this.startListening();
        }
      }, cooldownMs);
    }
  }

  async readDiarySeamless(diaryContentOnly, speakerIdOverride = null, onSentenceStart = null, onComplete = null) {
    this.stopSpeaking();
    this.stopListening();
    this.unlockMasterAudio();

    this.isReadingAloud = true;
    this.readingAbortController = new AbortController();
    const speakerId = (speakerIdOverride !== null) ? speakerIdOverride : AppCore.getSpeakerId();

    let cleanFull = this.cleanEndingNenyan(diaryContentOnly)
      .replace(/[（\(][^）\)]*?[）\)]/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/[*#_~`🐾🐱✨❤️💖🎀🧠⚡🩺💭🎵🍜🥟📍📰🗺️⭐💥📒📖🌐🔷🔴🌤️🛍️💡🐟📷🏠]/gu, '')
      .trim();

    const sentences = cleanFull
      .split(/([。！？!\?\n]+)/)
      .reduce((acc, cur, i, arr) => {
        if (i % 2 === 0 && cur.trim()) {
          const punct = arr[i + 1] || '';
          acc.push((cur + punct).trim());
        }
        return acc;
      }, [])
      .filter(s => s.length > 0);

    if (sentences.length === 0) {
      this.isReadingAloud = false;
      if (onComplete) onComplete();
      setTimeout(() => { if (AppCore.state.isRunning) this.startListening(); }, 200);
      return;
    }

    Logger.log(`[本文朗読開始] 全 ${sentences.length} 文をBlobシームレス先読み再生`, "info");
    const audioBlobCache = new Map();

    const prefetchSentence = async (idx) => {
      if (idx >= sentences.length) return;
      const targetText = this._convertAllNumbersToKana(sentences[idx]).trim();
      if (!targetText || audioBlobCache.has(idx)) return;
      try {
        const url = await this._getVoicevoxBlobUrl(targetText, speakerId);
        audioBlobCache.set(idx, url);
      } catch(e) {}
    };

    prefetchSentence(0);
    if (sentences.length > 1) prefetchSentence(1);

    for (let i = 0; i < sentences.length; i++) {
      if (!this.isReadingAloud) break;

      if (i + 1 < sentences.length) prefetchSentence(i + 1);
      if (i + 2 < sentences.length) prefetchSentence(i + 2);

      const sentenceRaw = sentences[i];
      let clean = this._convertAllNumbersToKana(sentenceRaw).trim();
      if (!clean) continue;

      if (onSentenceStart) onSentenceStart(i, sentenceRaw);

      let blobUrl = audioBlobCache.get(i);
      if (!blobUrl) {
        try {
          blobUrl = await this._getVoicevoxBlobUrl(clean, speakerId);
        } catch(e) {
          continue;
        }
      }

      if (!this.isReadingAloud) break;

      await new Promise((resolve) => {
        this.masterAudio.src = blobUrl;
        this.masterAudio.playbackRate = this.rate;
        this.isSpeaking = true;
        const st = document.getElementById('status-text');
        if (st) st.textContent = "🗣️ お話し中♪";

        if (AppCore.avatar) AppCore.avatar.setEmotion('talking');

        this.masterAudio.onended = () => {
          this.isSpeaking = false;
          setTimeout(resolve, 50);
        };
        this.masterAudio.onerror = () => {
          this.isSpeaking = false;
          resolve();
        };

        this.masterAudio.play().catch(() => resolve());
      });
    }

    this.isReadingAloud = false;
    this.isSpeaking = false;
    if (AppCore.avatar) AppCore.avatar.setEmotion('idle');
    const st = document.getElementById('status-text');
    if (st && AppCore.state.isRunning) st.textContent = "👂 聴いてるニャ♪";

    if (onComplete) onComplete();
    setTimeout(() => { if (AppCore.state.isRunning) this.startListening(); }, 200);
  }

  stopReadingAloud() {
    this.isReadingAloud = false;
    if (this.readingAbortController) {
      this.readingAbortController.abort();
      this.readingAbortController = null;
    }
    this.stopSpeaking();
    const st = document.getElementById('status-text');
    if (st && AppCore.state.isRunning) st.textContent = "👂 聴いてるニャ♪";
  }

  stopSpeaking() {
    this.isSpeaking = false;
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
    this.masterAudio.pause();
    this.masterAudio.currentTime = 0;
    this.fillerAudio.pause();
    this.fillerAudio.currentTime = 0;
  }

  _setupRecognition() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      Logger.log("[マイク] 非対応ブラウザです", "error");
      return;
    }

    this.recognition = new SpeechRec();
    this.recognition.lang = 'ja-JP';
    this.recognition.continuous = true;
    this.recognition.interimResults = false;

    this.recognition.onstart = () => {
      this.isListening = true;
      this.isStarting = false;
      if (this.onListeningStatus) this.onListeningStatus(true);
      Logger.log("[マイク] 通話接続中（聴いてるニャ♪）", "info");
    };

    this.recognition.onresult = (event) => {
      if (this.isSpeaking || this.isReadingAloud || this.isActionButtonLocked || AppCore.state.isProcessingInput) {
        return;
      }

      const lastIdx = event.results.length - 1;
      const resultText = event.results[lastIdx]?.[0]?.transcript?.trim() || '';
      if (!resultText) return;

      if (/(?:ストップ|やめて|とまって|止めて)/.test(resultText)) {
        this.stopReadingAloud();
        this.stopSpeaking();
        if (this.onBargeIn) this.onBargeIn();
        return;
      }

      if (this._isSelfEcho(resultText)) {
        Logger.log(`[エコー破棄] 自声の跳ね返り: ${resultText}`, "warn");
        return;
      }

      Logger.log(`[おやびんのお声を受信⚡] 「${resultText}」`, "success");
      if (this.onSpeechFinal) this.onSpeechFinal(resultText);
    };

    this.recognition.onerror = (e) => {
      this.isStarting = false;
      this.lastMicErrorTime = Date.now();
      if (e.error === 'no-speech') return;

      Logger.log(`[マイク情報] ${e.error}`, "info");

      if (e.error === 'not-allowed' || e.error === 'network') {
        this.isListening = false;
        if (this.restartTimer) clearTimeout(this.restartTimer);
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.isStarting = false;

      if (this.onListeningStatus) this.onListeningStatus(false);

      if (!AppCore.state.isRunning || this.isSpeaking || this.isReadingAloud || this.isActionButtonLocked || AppCore.state.isProcessingInput) {
        return;
      }

      const timeSinceError = Date.now() - this.lastMicErrorTime;
      const restartDelay = timeSinceError < 3000 ? 1500 : 200;

      if (this.restartTimer) clearTimeout(this.restartTimer);
      this.restartTimer = setTimeout(() => {
        if (AppCore.state.isRunning && !this.isSpeaking && !this.isReadingAloud && !this.isActionButtonLocked && !AppCore.state.isProcessingInput && !this.isListening) {
          this.startListening();
        }
      }, restartDelay);
    };
  }

  startListening() {
    if (!this.recognition || !AppCore.state.isRunning || this.isSpeaking || this.isReadingAloud || this.isActionButtonLocked || this.isListening || this.isStarting || AppCore.state.isProcessingInput) return;
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
   ★ MODULE 2: オンデマンド高精度GPS ＆ 在宅・外出の自動判定
   ========================================================================== */
const LocationProvider = {
  lat: null,
  lon: null,
  homeLat: null,
  homeLon: null,
  cityArea: "",
  detailedAddress: "東京都東村山市本町付近",
  townLevelArea: "東京都東村山市本町付近",
  nearbySpots: [],
  weather: "快晴",
  temperature: "22",
  isGpsAvailable: false,
  isAtHome: true,

  calcDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  },

  initWatcher() {
    this.fetchLocationOnDemand(false);
  },

  async fetchLocationOnDemand(fetchSpots = true) {
    if (!('geolocation' in navigator)) {
      await this._applyHomeFallback();
      return;
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          this.isGpsAvailable = true;
          this.lat = pos.coords.latitude;
          this.lon = pos.coords.longitude;
          Logger.log(`[GPS測位成功⚡] 座標: ${this.lat.toFixed(5)}, ${this.lon.toFixed(5)} (精度: ±${Math.round(pos.coords.accuracy)}m)`, "success");

          await this._reverseGeocode(this.lat, this.lon);
          this._checkHomeProximity();
          this._fetchWeather(this.lat, this.lon);

          if (fetchSpots) {
            await this._scanNearbyFeatures(this.lat, this.lon);
          }
          resolve(true);
        },
        async (err) => {
          Logger.log(`[GPS不可: ${err.message}] 拠点座標へ切り替えます`, "warn");
          await this._applyHomeFallback();
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 10000 }
      );
    });
  },

  _checkHomeProximity() {
    if (this.homeLat !== null && this.homeLon !== null && this.lat !== null && this.lon !== null) {
      const dist = this.calcDistanceMeters(this.lat, this.lon, this.homeLat, this.homeLon);
      this.isAtHome = (dist <= 150);
      Logger.log(`[在宅判定] 自宅からの距離: ${dist}m ➔ ${this.isAtHome ? '🏠 お家にいます' : '🐾 お散歩・外出中'}`, "info");
    } else {
      this.isAtHome = true;
    }
  },

  async _scanNearbyFeatures(lat, lon) {
    try {
      const radius = 250;
      const query = `[out:json][timeout:5];(
        way["waterway"](around:${radius},${lat},${lon});
        relation["waterway"](around:${radius},${lat},${lon});
        node["leisure"="park"](around:${radius},${lat},${lon});
        way["leisure"="park"](around:${radius},${lat},${lon});
        node["amenity"](around:${radius},${lat},${lon});
        way["amenity"](around:${radius},${lat},${lon});
        node["leisure"](around:${radius},${lat},${lon});
      );out center;`;

      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query)
      });

      if (res.ok) {
        const data = await res.json();
        const elements = data.elements || [];
        const spots = [];

        elements.forEach(el => {
          const tags = el.tags || {};
          const name = tags.name || tags["name:ja"];
          if (!name) return;

          const sLat = el.lat || el.center?.lat;
          const sLon = el.lon || el.center?.lon;
          if (!sLat || !sLon) return;

          const dist = this.calcDistanceMeters(lat, lon, sLat, sLon);
          let type = "施設";
          if (tags.waterway) type = "川（河川）";
          else if (tags.leisure === "park") type = "公園";
          else if (tags.leisure === "sports_centre" || tags.leisure === "bowling_alley") type = "スポーツ・娯楽";

          spots.push({ name, type, dist });
        });

        spots.sort((a, b) => a.dist - b.dist);
        const uniqueSpots = [];
        const seen = new Set();
        for (const sp of spots) {
          if (!seen.has(sp.name)) {
            seen.add(sp.name);
            uniqueSpots.push(sp);
            if (uniqueSpots.length >= 5) break;
          }
        }

        this.nearbySpots = uniqueSpots;
        Logger.log(`[周辺スポットスキャン完了] 最も近い: ${uniqueSpots[0]?.name || 'なし'} (${uniqueSpots[0]?.dist || 0}m)`, "info");
      }
    } catch(e) {}
  },

  async _applyHomeFallback() {
    this.isAtHome = true;
    const homeVal = (localStorage.getItem('kuro_home_coords') || '').trim();
    if (!homeVal) {
      this.detailedAddress = "東京都東村山市本町1丁目付近";
      this.townLevelArea = "東京都東村山市本町1丁目付近";
      this.cityArea = "東京都東村山市";
      this.lat = 35.7582;
      this.lon = 139.4678;
      this.homeLat = 35.7582;
      this.homeLon = 139.4678;
      this._fetchWeather(this.lat, this.lon);
      return;
    }

    const match = homeVal.match(/([-+]?\d+\.\d+)\s*,\s*([-+]?\d+\.\d+)/);
    if (match) {
      this.lat = parseFloat(match[1]);
      this.lon = parseFloat(match[2]);
      this.homeLat = this.lat;
      this.homeLon = this.lon;
      await this._reverseGeocode(this.lat, this.lon);
      this._fetchWeather(this.lat, this.lon);
      return;
    }

    this.cityArea = homeVal;
    this.detailedAddress = homeVal;
    this.townLevelArea = homeVal;
  },

  async _fetchWeather(lat, lon) {
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
      if (res.ok) {
        const data = await res.json();
        const cur = data.current_weather;
        if (cur) {
          this.temperature = Math.round(cur.temperature);
          const code = cur.weathercode || 0;
          if (code <= 1) this.weather = "快晴";
          else if (code <= 3) this.weather = "くもり";
          else if (code >= 51 && code <= 67) this.weather = "雨";
          else if (code >= 71) this.weather = "雪";
          Logger.log(`[気象情報取得] 天気: ${this.weather} / 気温: ${this.temperature}℃`, "info");
        }
      }
    } catch(e) {}
  },

  async _reverseGeocode(lat, lon) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=ja`);
      if (res.ok) {
        const data = await res.json();
        const a = data.address || {};
        const pref = a.province || a.state || "";
        const city = a.city || a.ward || a.town || "";
        const sub = a.suburb || a.quarter || a.neighbourhood || "";
        const road = a.road || "";

        this.cityArea = `${pref}${city}`.trim() || "東京都東村山市";
        this.townLevelArea = `${city}${sub}${road ? ' ' + road : ''}付近`.trim() || "東京都東村山市本町付近";
        this.detailedAddress = [pref, city, sub, road].filter(Boolean).join("") || "東京都東村山市本町";
      }
    } catch(e) {}
  }
};

/* ==========================================================================
   ★ MODULE 3: 鉄壁ストレージ管理 ＆ マルチカラー種別容量モニター ＆ 重複写真スリム化
   ========================================================================== */
const DATA_KEYS = {
  MEMORIES: 'kuro_data_memories',
  DIARIES:  'kuro_data_diaries',
  RECENT_LOGS: 'kuro_recent_chat_logs',
  SETTINGS: 'kuro_data_settings',
  SNAPSHOT: 'kuro_data_snapshot'
};

const StorageManager = {
  defaultGlassesCoords: {
    idle: { x: 0, y: 120, scale: 1.0, rotate: 0 },
    talking: { x: 0, y: 120, scale: 1.0, rotate: 0 },
    thinking: { x: 0, y: 120, scale: 1.0, rotate: 0 },
    happy: { x: 0, y: 120, scale: 1.0, rotate: 0 }
  },

  defaultEyelidCoords: {
    y: 172,
    x: 0,
    gap: 28,
    size: 16
  },

  /* ★ iPhone風マルチカラー種別ストレージ使用量計算 */
  getStorageUsage() {
    let totalBytes = 0;
    let photoBytes = 0;
    let chatBytes = 0;
    let metaBytes = 0;

    try {
      for (let key in localStorage) {
        if (!localStorage.hasOwnProperty(key)) continue;
        const val = localStorage[key];
        const bytes = (val.length + key.length) * 2; // UTF-16文字換算
        totalBytes += bytes;

        // 種別の判定
        if (key.startsWith('kuro_daily_photos_')) {
          photoBytes += bytes;
        } else if (key.startsWith('kuro_daily_logs_') || key === DATA_KEYS.RECENT_LOGS) {
          // 会話ログの中に画像Base64が混ざっている場合の識別
          if (val.includes('data:image/')) {
            const imgCount = (val.match(/data:image\/[^"]+/g) || []).reduce((acc, str) => acc + str.length * 2, 0);
            photoBytes += imgCount;
            chatBytes += Math.max(0, bytes - imgCount);
          } else {
            chatBytes += bytes;
          }
        } else if (key === DATA_KEYS.DIARIES) {
          // 日記配列の中の写真と本文を切り分け
          if (val.includes('data:image/')) {
            const imgCount = (val.match(/data:image\/[^"]+/g) || []).reduce((acc, str) => acc + str.length * 2, 0);
            photoBytes += imgCount;
            metaBytes += Math.max(0, bytes - imgCount);
          } else {
            metaBytes += bytes;
          }
        } else {
          metaBytes += bytes;
        }
      }
    } catch(e) {}

    const limitBytes = 5 * 1024 * 1024;
    const toMB = (b) => parseFloat((b / (1024 * 1024)).toFixed(2));

    const usedMB = toMB(totalBytes);
    const photoMB = toMB(photoBytes);
    const chatMB = toMB(chatBytes);
    const metaMB = toMB(metaBytes);

    const percent = Math.min(100, Math.round((totalBytes / limitBytes) * 100));
    const photoPct = Math.min(100, Math.round((photoBytes / limitBytes) * 100));
    const chatPct = Math.min(100, Math.round((chatBytes / limitBytes) * 100));
    const metaPct = Math.min(100, Math.round((metaBytes / limitBytes) * 100));

    return {
      totalBytes,
      usedMB,
      limitMB: 5.0,
      percent,
      photoBytes,
      photoMB,
      photoPct,
      chatBytes,
      chatMB,
      chatPct,
      metaBytes,
      metaMB,
      metaPct,
      isWarning: percent >= 75,
      isDanger: percent >= 90
    };
  },

  /* ★ ワンタップ重複写真パージ ＆ 日記写真の超軽量再圧縮エンジン */
  async purgeAndCompressAllPhotos() {
    Logger.log("[StoragePurge] 重複写真のお掃除とスマート再圧縮を開始ニャ…", "info");
    let cleanedPhotosCount = 0;

    // 1. 会話ログ（最近の会話 & 日別ログ）から重複Base64画像を完全除去
    try {
      const recent = this.loadRecentTimelineLogs();
      let recentModified = false;
      recent.forEach(entry => {
        if (entry.photoUrl && entry.photoUrl.startsWith('data:image/')) {
          entry.photoUrl = null;
          recentModified = true;
        }
      });
      if (recentModified) {
        localStorage.setItem(DATA_KEYS.RECENT_LOGS, JSON.stringify(recent));
      }

      for (let key in localStorage) {
        if (key.startsWith('kuro_daily_logs_')) {
          try {
            const raw = localStorage[key];
            if (raw.includes('data:image/')) {
              const logs = JSON.parse(raw);
              logs.forEach(l => {
                if (l.photoUrl) delete l.photoUrl;
                l.hasPhoto = true;
              });
              localStorage.setItem(key, JSON.stringify(logs));
            }
          } catch(e) {}
        }
      }
    } catch(e) {}

    // 2. 過去（3日以上前）の写真プール（未採用ストック）をパージ
    try {
      const timeInfo = TimeProvider.getCurrentInfo();
      const todayKey = `kuro_daily_photos_${timeInfo.lifeLogKey}`;
      for (let key in localStorage) {
        if (key.startsWith('kuro_daily_photos_') && key !== todayKey) {
          localStorage.removeItem(key);
        }
      }
    } catch(e) {}

    // 3. 絵日記（kuro_data_diaries）の写真を約20KBにスマート再圧縮
    try {
      const diaries = this.loadAllDiaries();
      for (const d of diaries) {
        if (d.photo && d.photo.startsWith('data:image/')) {
          // すでに25KB以下の小さな画像はスキップ
          if (d.photo.length > 35000) {
            d.photo = await this._recompressBase64Image(d.photo, 320, 0.50);
            cleanedPhotosCount++;
          }
        }
      }
      this.saveAllDiaries(diaries);
    } catch(e) {}

    Logger.log(`[StoragePurge] お掃除完了！再圧縮写真: ${cleanedPhotosCount}枚`, "success");
    return true;
  },

  /* Base64画像をブラウザCanvasで超軽量化再圧縮 */
  async _recompressBase64Image(base64Str, maxWidth = 320, quality = 0.50) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const newBase64 = canvas.toDataURL('image/jpeg', quality);
        resolve(newBase64);
      };
      img.onerror = () => resolve(base64Str);
      img.src = base64Str;
    });
  },

  loadGlassesCoords() {
    try {
      const raw = localStorage.getItem('kuro_glasses_coords_v5');
      if (raw) return JSON.parse(raw);
      return JSON.parse(JSON.stringify(this.defaultGlassesCoords));
    } catch(e) {
      return JSON.parse(JSON.stringify(this.defaultGlassesCoords));
    }
  },

  saveGlassesCoords(coords) {
    try { localStorage.setItem('kuro_glasses_coords_v5', JSON.stringify(coords)); } catch(e) {}
  },

  loadEyelidCoords() {
    try {
      const raw = localStorage.getItem('kuro_eyelid_coords_v6');
      if (raw) return JSON.parse(raw);
      return JSON.parse(JSON.stringify(this.defaultEyelidCoords));
    } catch(e) {
      return JSON.parse(JSON.stringify(this.defaultEyelidCoords));
    }
  },

  saveEyelidCoords(coords) {
    try { localStorage.setItem('kuro_eyelid_coords_v6', JSON.stringify(coords)); } catch(e) {}
  },

  loadRecentTimelineLogs() {
    try {
      const raw = localStorage.getItem(DATA_KEYS.RECENT_LOGS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch(e) {}

    try {
      const timeInfo = TimeProvider.getCurrentInfo();
      const lifeKey = `kuro_daily_logs_${timeInfo.lifeLogKey}`;
      const rawLife = localStorage.getItem(lifeKey);
      if (rawLife) {
        const parsedLife = JSON.parse(rawLife);
        if (Array.isArray(parsedLife) && parsedLife.length > 0) return parsedLife.slice(-30);
      }
    } catch(e) {}

    return [];
  },

  clearTimelineDisplayOnly() {
    try {
      localStorage.setItem(DATA_KEYS.RECENT_LOGS, JSON.stringify([]));
      Logger.log("[Timeline] 画面の会話表示をクリアしました（内部ログは保持）", "info");
    } catch(e) {}
  },

  appendChatLog(role, text, photoUrl = null) {
    if (!text || typeof text !== 'string') return;
    const timeInfo = TimeProvider.getCurrentInfo();
    const mode = AppCore.state.isAssistantMode ? 'assistant' : 'pet';

    const cleanText = AppCore.audio.cleanEndingNenyan(text);

    // ★重複防止：会話ログには巨大なBase64を入れず、サムネイル用URLまたはnullに留める
    const entry = {
      role,
      text: cleanText,
      mode,
      time: timeInfo.clock,
      date: timeInfo.lifeLogKey,
      photoUrl: (photoUrl && photoUrl.length > 50000) ? null : photoUrl,
      hasPhoto: !!photoUrl,
      timestamp: Date.now()
    };

    try {
      const recent = this.loadRecentTimelineLogs();
      recent.push(entry);
      localStorage.setItem(DATA_KEYS.RECENT_LOGS, JSON.stringify(recent.slice(-30)));
    } catch(e) {}

    try {
      const dailyKey = `kuro_daily_logs_${timeInfo.lifeLogKey}`;
      const raw = localStorage.getItem(dailyKey);
      const logs = raw ? JSON.parse(raw) : [];
      const dailyEntry = { ...entry };
      delete dailyEntry.photoUrl; // 日別ログには画像実体を持たせない（重複完全防止）
      logs.push(dailyEntry);
      localStorage.setItem(dailyKey, JSON.stringify(logs.slice(-200)));
    } catch(e) {}
  },

  getDailyLogs(lifeDateKey) {
    try {
      const dailyKey = `kuro_daily_logs_${lifeDateKey}`;
      const raw = localStorage.getItem(dailyKey);
      return raw ? JSON.parse(raw) : [];
    } catch(e) {
      return [];
    }
  },

  addPhotoToDailyPool(photoBase64, userComment = "") {
    const timeInfo = TimeProvider.getCurrentInfo();
    const photoPoolKey = `kuro_daily_photos_${timeInfo.lifeLogKey}`;
    try {
      const raw = localStorage.getItem(photoPoolKey);
      let pool = raw ? JSON.parse(raw) : [];
      let isReplaced = false;

      if (pool.length >= 12) {
        isReplaced = true;
      }

      pool.push({
        base64: photoBase64,
        comment: userComment,
        time: timeInfo.clock,
        timestamp: Date.now()
      });

      pool = pool.slice(-12);
      localStorage.setItem(photoPoolKey, JSON.stringify(pool));
      Logger.log(`[PhotoPool] 今日の写真プールに保存完了（総数: ${pool.length}枚）`, "info");

      if (isReplaced) {
        Toast.show("思い出がいっぱいになったから、一番古いお写真を新しいお写真と入れ替えたニャン！📷✨", "info", 4000);
      }
    } catch(e) {
      Logger.log(`[PhotoPool保存警告] ${e.message}`, "warn");
    }
  },

  getDailyPhotoPool(lifeDateKey) {
    const photoPoolKey = `kuro_daily_photos_${lifeDateKey}`;
    try {
      const raw = localStorage.getItem(photoPoolKey);
      return raw ? JSON.parse(raw) : [];
    } catch(e) {
      return [];
    }
  },

  loadMemories(defaultMemories) {
    try {
      const raw = localStorage.getItem(DATA_KEYS.MEMORIES);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch(e) {}

    const initial = Array.isArray(defaultMemories) ? [...defaultMemories] : [];
    this.saveMemories(initial);
    return initial;
  },

  saveMemories(memories) {
    try {
      localStorage.setItem(DATA_KEYS.MEMORIES, JSON.stringify(memories));
    } catch(e) {}
  },

  loadAllDiaries() {
    try {
      const raw = localStorage.getItem(DATA_KEYS.DIARIES);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch(e) {}
    return [];
  },

  saveAllDiaries(list) {
    try {
      localStorage.setItem(DATA_KEYS.DIARIES, JSON.stringify(list));
    } catch(e) {}
  },

  saveDiary(entryText, customDateKey = null, customFullDate = null, photoData = null, currentLogCount = null) {
    if (!entryText || entryText.length < 20) return false;

    const timeInfo = TimeProvider.getCurrentInfo();
    const dateKey = customDateKey || timeInfo.lifeLogKey;
    const fullDate = customFullDate || timeInfo.lifeFullDate;
    const weather = LocationProvider.weather;
    const temp = LocationProvider.temperature;

    const totalLogsNow = (currentLogCount !== null) ? currentLogCount : this.getDailyLogs(dateKey).length;
    const cleanContent = AppCore.audio.cleanEndingNenyan(entryText);

    const diaryData = {
      dateKey,
      fullDate,
      weather,
      temperature: temp,
      content: cleanContent,
      photo: photoData || null,
      timestamp: Date.now(),
      logCountAtSave: totalLogsNow
    };

    let list = this.loadAllDiaries();
    const existingIdx = list.findIndex(d => d.dateKey === dateKey);
    if (existingIdx >= 0) {
      if (!photoData && list[existingIdx].photo) diaryData.photo = list[existingIdx].photo;
      list[existingIdx] = diaryData;
      Logger.log(`[Diary] ${dateKey} の日記を夜の会話を含めて更新完了（総会話数: ${totalLogsNow}件）`, "info");
    } else {
      list.unshift(diaryData);
      Logger.log(`[Diary] ${dateKey} の新規日記を安全保存完了（総会話数: ${totalLogsNow}件）`, "info");
    }

    this.saveAllDiaries(list);
    return true;
  },

  attachPhotoToTodayDiary(photoBase64) {
    const timeInfo = TimeProvider.getCurrentInfo();
    const dateKey = timeInfo.lifeLogKey;
    this.addPhotoToDailyPool(photoBase64, "写真を見せたニャ");

    let list = this.loadAllDiaries();
    const existingIdx = list.findIndex(d => d.dateKey === dateKey);
    if (existingIdx >= 0) {
      list[existingIdx].photo = photoBase64;
      this.saveAllDiaries(list);
    } else {
      const photoMsg = LocationProvider.isAtHome
        ? "今日はお家でおやびんとまったり写真を見せてもらって嬉しかったニャン♪"
        : "今日はおやびんとお散歩して写真を撮ったニャン♪";
      this.saveDiary(photoMsg, dateKey, timeInfo.lifeFullDate, photoBase64);
    }
  },

  getTodayDiary() {
    const timeInfo = TimeProvider.getCurrentInfo();
    const dateKey = timeInfo.lifeLogKey;
    const list = this.loadAllDiaries();
    return list.find(d => d.dateKey === dateKey) || null;
  },

  getRecentDiariesSummary(count = 3) {
    const list = this.loadAllDiaries().slice(0, count);
    if (list.length === 0) return "";
    return list.map(d => `・【${d.fullDate}の日記】(天気:${d.weather} ${d.temperature}℃): ${d.content}`).join("\n");
  },

  findRelevantPastDiary(queryText) {
    if (!queryText) return null;
    const isPastQuery = /(?:昔|まえ|前|あの時|あのとき|先週|せんしゅう|先月|せんげつ|昨日|きのう|おととい|一昨日|覚えてる|おぼえてる)/.test(queryText);
    if (!isPastQuery) return null;

    const list = this.loadAllDiaries();
    if (list.length === 0) return null;

    const cleanTokens = queryText
      .replace(/[？?！!。、\s]/g, ' ')
      .split(' ')
      .filter(w => w.length >= 2 && !/^(?:クロ|おやびん|今日|何時|なんじ|どこ|これ|それ|あれ|昔|まえ|前|昨日)$/.test(w));

    for (const diary of list) {
      for (const token of cleanTokens) {
        if (diary.content.includes(token)) {
          Logger.log(`[昔話ヒット⚡] キーワード「${token}」で ${diary.fullDate} の日記を発見！`, "success");
          return diary;
        }
      }
    }

    if (list.length > 1) {
      return list[1];
    }
    return null;
  },

  downloadDataPackage() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const ymd = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const hm = `${pad(now.getHours())}${pad(now.getMinutes())}`;
    const filename = `クロちゃんデータ_${ymd}_${hm}.json`;
    const curVer = (typeof VersionManager !== 'undefined') ? VersionManager.current : "V.1.8.0";

    const pkg = {
      format: "kuro_pure_data_package",
      version: curVer,
      exportedAt: now.toLocaleString('ja-JP'),
      memories: this.loadMemories([]),
      diaries: this.loadAllDiaries(),
      recentLogs: this.loadRecentTimelineLogs(),
      settings: {
        speakerId: localStorage.getItem('kuro_voice_speaker_id') || '10',
        voiceRate: localStorage.getItem('kuro_rate') || '1.05',
        buttonFeedback: localStorage.getItem('kuro_button_feedback') || 'voice',
        timerSound: localStorage.getItem('kuro_timer_sound') || 'bell',
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
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    Logger.log(`[データ書き出し完了] ${filename}`, "success");
  },

  importAndReplaceDataPackage(data) {
    if (!data || typeof data !== 'object') throw new Error("無効なデータファイルです");

    if (Array.isArray(data.memories)) {
      this.saveMemories(data.memories);
    }
    if (Array.isArray(data.diaries)) {
      this.saveAllDiaries(data.diaries);
    }
    if (Array.isArray(data.recentLogs)) {
      localStorage.setItem(DATA_KEYS.RECENT_LOGS, JSON.stringify(data.recentLogs));
    }
    if (data.settings && typeof data.settings === 'object') {
      const s = data.settings;
      if (s.speakerId) localStorage.setItem('kuro_voice_speaker_id', s.speakerId);
      if (s.voiceRate) localStorage.setItem('kuro_rate', s.voiceRate);
      if (s.buttonFeedback) localStorage.setItem('kuro_button_feedback', s.buttonFeedback);
      if (s.timerSound) localStorage.setItem('kuro_timer_sound', s.timerSound);
      if (s.newsCount) localStorage.setItem('kuro_news_count', s.newsCount);
      if (s.spotCount) localStorage.setItem('kuro_spot_count', s.spotCount);
      if (s.homeCoords) localStorage.setItem('kuro_home_coords', s.homeCoords);
      if (s.accessoryStyle) localStorage.setItem('kuro_acc_style', s.accessoryStyle);
      if (s.glassesCoords) this.saveGlassesCoords(s.glassesCoords);
      if (s.eyelidCoords) this.saveEyelidCoords(s.eyelidCoords);
    }

    Logger.log("[データ更新完了] ファイルから最新状態に完全上書きしました", "success");
    return true;
  }
};

/* ==========================================================================
   ★ MODULE 4: キャラクター描画 ＆ 写真そっくり感情ポーズ完全同期
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
  }

  _renderAllAccessories() {
    const svgContent = `
      <svg viewBox="0 0 140 140" style="width:100%; height:100%;">
        <defs>
          <pattern id="stripe-bw-real" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width="4" height="8" fill="#111827"/>
            <rect x="4" width="4" height="8" fill="#ffffff"/>
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
          <path d="M30 76 Q42 70 50 80" stroke="rgba(255,255,255,0.85)" stroke-width="2" fill="none"/>
          <circle cx="98" cy="85" r="18" fill="rgba(255, 255, 255, 0.2)" stroke="#090d16" stroke-width="4.5"/>
          <circle cx="98" cy="85" r="18" fill="none" stroke="url(#stripe-bw-real)" stroke-width="3"/>
          <path d="M86 76 Q98 70 106 80" stroke="rgba(255,255,255,0.85)" stroke-width="2" fill="none"/>
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
    const height = Math.round(c.size * 0.75);

    leftEl.style.bottom = `${c.y}px`;
    leftEl.style.left = `calc(50% + ${c.x - halfGap - c.size / 2}px)`;
    leftEl.style.width = `${c.size}px`;
    leftEl.style.height = `${height}px`;

    rightEl.style.bottom = `${c.y}px`;
    rightEl.style.left = `calc(50% + ${c.x + halfGap - c.size / 2}px)`;
    rightEl.style.width = `${c.size}px`;
    rightEl.style.height = `${height}px`;
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
      this.wrapper.classList.remove(
        'is-idling', 'is-talking', 'is-thinking', 'is-happy',
        'pose-idle-active', 'pose-talking-active', 'pose-thinking-active', 'pose-happy-active'
      );
    }

    if (emotion === 'idle') {
      if (this.wrapper) this.wrapper.classList.add('is-idling', 'pose-idle-active');
      if (this.eyesNormal) this.eyesNormal.style.display = 'block';
      if (this.eyesHappy) this.eyesHappy.style.display = 'none';
      if (this.mouthClosed) this.mouthClosed.style.display = 'block';
      if (this.mouthTalking) this.mouthTalking.style.display = 'none';
      if (this.mouthHappy) this.mouthHappy.style.display = 'none';
      if (this.headUnit) this.headUnit.setAttribute('class', 'anim-idle-head');

    } else if (emotion === 'talking') {
      if (this.wrapper) this.wrapper.classList.add('is-talking', 'pose-talking-active');
      if (this.eyesNormal) this.eyesNormal.style.display = 'block';
      if (this.eyesHappy) this.eyesHappy.style.display = 'none';
      if (this.mouthClosed) this.mouthClosed.style.display = 'none';
      if (this.mouthTalking) this.mouthTalking.style.display = 'block';
      if (this.mouthHappy) this.mouthHappy.style.display = 'none';
      if (this.headUnit) this.headUnit.setAttribute('class', 'anim-talking-head');

    } else if (emotion === 'thinking') {
      if (this.wrapper) this.wrapper.classList.add('is-thinking', 'pose-thinking-active');
      if (this.eyesNormal) this.eyesNormal.style.display = 'block';
      if (this.eyesHappy) this.eyesHappy.style.display = 'none';
      if (this.mouthClosed) this.mouthClosed.style.display = 'block';
      if (this.mouthTalking) this.mouthTalking.style.display = 'none';
      if (this.mouthHappy) this.mouthHappy.style.display = 'none';
      if (this.headUnit) this.headUnit.setAttribute('class', 'anim-thinking-head');

    } else if (emotion === 'happy') {
      if (this.wrapper) this.wrapper.classList.add('is-happy', 'pose-happy-active');
      if (this.eyesNormal) this.eyesNormal.style.display = 'none';
      if (this.eyesHappy) this.eyesHappy.style.display = 'block';
      if (this.mouthClosed) this.mouthClosed.style.display = 'none';
      if (this.mouthTalking) this.mouthTalking.style.display = 'none';
      if (this.mouthHappy) this.mouthHappy.style.display = 'block';
      if (this.headUnit) this.headUnit.setAttribute('class', 'anim-talking-head');
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
    this.smokeEl.classList.remove('is-poofing');
    void this.smokeEl.offsetWidth;
    this.smokeEl.classList.add('is-poofing');
    setTimeout(() => {
      if (this.smokeEl) this.smokeEl.classList.remove('is-poofing');
    }, 800);
  }

  triggerIdeaBulb() {
    const bulb = document.getElementById('idea-bulb');
    if (!bulb || !this.wrapper) return;
    bulb.classList.add('active');
    this.wrapper.classList.add('spark-idea');
    setTimeout(() => {
      bulb.classList.remove('active');
      if (this.wrapper) this.wrapper.classList.remove('spark-idea');
    }, 1800);
  }

  triggerTouchHeart() {
    if (!this.heartEl) return;
    this.heartEl.classList.remove('is-floating');
    void this.heartEl.offsetWidth;
    this.heartEl.classList.add('is-floating');
    setTimeout(() => {
      if (this.heartEl) this.heartEl.classList.remove('is-floating');
    }, 850);
  }

  triggerYawn() {
    if (!this.wrapper) return;
    this.wrapper.classList.remove('is-yawning');
    void this.wrapper.offsetWidth;
    this.wrapper.classList.add('is-yawning');
    setTimeout(() => {
      if (this.wrapper) this.wrapper.classList.remove('is-yawning');
    }, 1400);
  }

  triggerFlipLanding() {
    if (!this.catStageBox) return;

    const snackBtn = document.getElementById('snack-btn');
    const transBtn = document.getElementById('transform-btn');
    const timerWidget = document.getElementById('kitchen-timer-widget');

    [snackBtn, transBtn, timerWidget].forEach(el => {
      if (el) {
        el.classList.add('ui-dodge-away');
        el.classList.remove('ui-pop-in');
      }
    });

    this.catStageBox.classList.remove('cat-stage-flip');
    void this.catStageBox.offsetWidth;
    this.catStageBox.classList.add('cat-stage-flip');

    setTimeout(() => {
      if (this.sparkleEl) {
        this.sparkleEl.classList.remove('is-popping');
        void this.sparkleEl.offsetWidth;
        this.sparkleEl.classList.add('is-popping');
        setTimeout(() => {
          if (this.sparkleEl) this.sparkleEl.classList.remove('is-popping');
        }, 700);
      }
    }, 320);

    setTimeout(() => {
      if (this.catStageBox) this.catStageBox.classList.remove('cat-stage-flip');

      [snackBtn, transBtn, timerWidget].forEach(el => {
        if (el) {
          el.classList.remove('ui-dodge-away');
          el.classList.add('ui-pop-in');
        }
      });
      setTimeout(() => {
        [snackBtn, transBtn, timerWidget].forEach(el => {
          if (el) el.classList.remove('ui-pop-in');
        });
      }, 350);
    }, 420);
  }
}

/* ==========================================================================
   ★ MODULE 5: 思考・AI対話エンジン
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
      if (/^(?:おまかせ|お任せ|あそぶ|遊ぶ|バッチリ|ばっちり|はーい|はい|起きたニャ|お昼寝するニャ|今日の日記を書き込みましたニャン)(?:ニャ|ニャン|にゃ|にゃん|！|!|♪|🐾|💤)*$/.test(t)) return false;
      if (/(?:昨日日記帳を書き忘れてたから|夜の分までちゃんとクロが日記帳を書いておいた)/.test(t)) return false;
      if (/(?:いま何時|今何時|いまの時間|現在の時間|何時ですか|今日何日|きょう何日|今日の日付|何曜日)/.test(t)) return false;
      if (/(?:いまは\s*\d+時\d+分|きょうは\s*\d+月\d+日)/.test(t)) return false;
      if (/(?:天気どんな感じ|今日の天気|いまの天気|現在の天気|お天気教えて)/.test(t)) return false;
      if (/(?:天気は\s*(?:快晴|晴れ|くもり|雨|雪)|気温は\s*\d+度)/.test(t)) return false;
      if (/(?:\d+\s*(?:分|秒).*タイマー|\d+\s*(?:分|秒).*(?:測って|計って)|タイマーをセット中|クロがしっかり見ておく|タイマー鳴った|ラーメン伸びちゃう)/.test(t)) return false;
      if (t.startsWith('http') || t.includes('Googleマップで見る')) return false;

      return true;
    });
  }

  _buildContentsPayload(rawLogs, currentPrompt, photoBase64 = null) {
    const contents = [];
    let lastRole = null;

    const todayDiary = StorageManager.getTodayDiary();
    const timeInfo = TimeProvider.getCurrentInfo();

    let targetHistoryLogs = [];
    if (!todayDiary) {
      const dailyAll = StorageManager.getDailyLogs(timeInfo.lifeLogKey);
      const baseLogs = (dailyAll.length > 0) ? dailyAll : rawLogs;
      const meaningfulLogs = this._filterMeaningfulLogs(baseLogs);
      targetHistoryLogs = meaningfulLogs.slice(-40);
      Logger.log(`[知的記憶] 日記作成前：実質的な会話 ${targetHistoryLogs.length} 件（直近20往復）を対話に反映`, "info");
    } else {
      const meaningfulLogs = this._filterMeaningfulLogs(rawLogs);
      targetHistoryLogs = meaningfulLogs.slice(-20);
      Logger.log(`[知的記憶] 日記作成後：日記＋実質的な会話 ${targetHistoryLogs.length} 件（10往復）で夜の対話`, "info");
    }

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
      const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, '');
      userParts.unshift({
        inline_data: {
          mime_type: "image/jpeg",
          data: base64Data
        }
      });
    }

    if (lastRole === 'user' && !photoBase64) {
      contents[contents.length - 1].parts[0].text += `\n${currentPrompt}`;
    } else {
      contents.push({ role: 'user', parts: userParts });
    }

    if (contents.length > 0 && contents[0].role === 'model') {
      contents.shift();
    }

    return contents;
  }

  async generateReply(promptText, rawLogs, character, memories, photoBase64 = null) {
    if (!this.apiKey) {
      Logger.log("[Gemini] APIキーが未設定です", "error");
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

    let spotsContext = "";
    if (isAssistant && LocationProvider.nearbySpots && LocationProvider.nearbySpots.length > 0) {
      spotsContext = "【周辺スポット（近い順）】\n" +
        LocationProvider.nearbySpots.map((s, idx) => `・${idx + 1}. 【${s.dist}m先】${s.name}（${s.type}）`).join('\n') +
        (isAtHome
          ? "\n※おてつだいルール: お家の中にいるので、近くの場所を聞かれたら「お家の近くには〇〇があるニャ！」と教えてください。"
          : "\n※おてつだいルール: お散歩中なので、近くの場所を聞かれたら「すぐ〇m先にあるのは〇〇だニャ！」と教えてください。");
    }

    const lateNightInstruction = timeInfo.isLateNight ? `
【★深夜の特別対応（現在時刻: ${timeInfo.clock}）】
・いまは深夜未明（夜中の3時など）です。
・おやびんが夜中に目が覚めて話しかけてくれたので、優しく静かに寄り添い、「目が覚めちゃったのかニャ？」「無理しないでゆっくり休んでニャ💤」と睡眠や体調を気遣う愛らしいトーンでお話ししてください。
` : "";

    const homeLocationInstruction = isAtHome ? `
【★超重要・現在のシチュエーション：お家（自宅）の中にいます】
・いまは【お家の中】でミッキーさんとまったり過ごしています。「散歩してます」「歩いてます」とは絶対に言わないでください！
・現在地を聞かれたら、「いまはお家でミッキーさんとまったりしてるニャン🐾」「${townArea}のお家にいるニャ♪」と答えてください。
・写真を見せられたら、お部屋の中で見せてもらった思い出として嬉しそうにコメントしてください。
` : `
【★超重要・現在のシチュエーション：お外でお散歩・外出中です】
・いまはお外の【${townArea}】をミッキーさんとお散歩中またはお出かけ中です。
・現在地を聞かれたら、「いまは${townArea}をお散歩中ニャン🐾」と答えてください。
`;

    const modeInstruction = isAssistant ? `
【★モード：👓 おてつだいモード（おやびんの世界一のマブダチ＆天才案内役）】
あなたはおやびん（ミッキーさん）の大親友「マブダチ」です。単なるコールセンターのオペレーターではありません！
おやびんの好物（ラーメン、餃子、焼肉、ホルモン、お寿司、麻婆豆腐）を熟知しています。
以下の4つのマブダチ対話スタイルを、会話の流れとおやびんの気分に合わせて臨機応変に使い分けてください。

◆ スタイル1【寄り添い絞り込み（標準）】:
   ①「お腹空いた」「何か食べたい」と漠然と言われたら、「ラーメンか餃子の気分かニャ？それとも他がいいニャ？🐾」とジャンルを聞く。
   ② ジャンルが決まったら、「歩きで行くニャ？それとも車で行くニャ？🐾」と移動手段を聞く。
   ③ 移動手段が出たら、「10分くらいですぐ着く場所がいいニャ？それとも20分くらいドライブするニャ？🐾」と距離感を聞く。
   ④ 条件が揃ったら、もう質問せず即座に searchMapPlaces ツールを実行し、「おやびん、探してきたニャン！ここから確認してニャ🐾」と案内する！

◆ スタイル2【気まぐれぶっ込み（たまに発動！）】:
   おやびんが「なんか美味しいものないかな〜」とぼやいた時、たまに直感で、
   「おやびん！今日の夕飯は絶対に【東村山の炭火ホルモン 丸川】の顔してるニャ！どうニャ？！肉食べるニャン🍖🐾」と大胆に提案してください。

◆ スタイル3【おまかせ直撃】:
   おやびんが「おまかせ」「クロちゃん決めて」と言ったら、一切質問せず、
   「おまかせニャ！それなら大好物の【東村山の炭火ホルモン 丸川】で決まりニャ！」と即座に searchMapPlaces で地図をドンと出してください。

◆ スタイル4【直撃即応】:
   おやびんが最初から店名や条件を具体的に言ったら、質問を挟まず即座に searchMapPlaces で地図を出してください。

※案内するときは必ず searchMapPlaces または searchLatestNews を実行してください！
` : `
【★モード：🐾 なかよしモード】
・いまはおやびんと純粋にお話しやスキンシップを楽しむ甘えん坊モードです。
・ラーメン、餃子、お寿司、ニュースなどの話題が出ても、ツールや地図は一切出さず、「美味しそうニャ！クロも一口食べたいニャン♪」とおやびんとの雑談を楽しく盛り上げてください。
`;

    const systemPrompt = `
あなたは世界一可愛いノルウェージャンフォレストキャットの1歳の子猫の女の子「${character.name}」です。
【現在状況】
・日時: ${timeInfo.fullDate} ${timeInfo.clock}（生活日: ${timeInfo.lifeFullDate}）
・現在地: ${townArea}
・在宅判定: ${isAtHome ? '🏠 お家（室内）にいます' : '🐾 お外（散歩・外出）にいます'}
・天気: ${weather} / 気温: ${temp}度
${modeInstruction}
${homeLocationInstruction}
${lateNightInstruction}
${spotsContext ? spotsContext + '\n' : ''}
【記憶帳（絶対忘れちゃダメなこと）】
${memories.map(m => `・${m}`).join('\n')}
${recentDiaries ? `【直近3日間の日記・思い出】\n${recentDiaries}\n` : ''}
${pastMemoryDiary ? `【★おやびんとの昔の思い出（${pastMemoryDiary.fullDate}の日記より）】\n${pastMemoryDiary.content}\n` : ''}

【★絶対厳守の話し方ルール】
- 飼い主さんのことは必ず親しみを込めて「おやびん」と呼んでください。
- 一人称は必ず女の子らしく「クロ」または「わたし」を使ってください。「余（よ）」は禁止です。
- 語尾は「〜ニャ」「〜ニャン♪」「〜だニャ！」「〜ニャ🐾」「〜だニャン♪」を使ってください。「〜ねニャン」は禁止です。
- ト書き（動作描写）の出力は一切禁止です。純粋なセリフのみを出力してください。
- 文を途中で切らず、文章の最後まで話し終えて完結させてください。
- 長さはテンポよく【40〜80文字程度（1〜2文）】で、愛らしく表情豊かに話してください。
- 写真が送られてきたら、写っているものを褒めて嬉しそうにコメントしてください。
`;

    const contents = this._buildContentsPayload(rawLogs, promptText, photoBase64);
    const targetModels = FIXED_LITE_MODELS;

    for (const model of targetModels) {
      const cleanModel = model.replace(/^models\//, '');
      try {
        Logger.log(`[Gemini] 固定Liteモデル「${cleanModel}」へリクエスト中…`, "info");

        const fetchController = new AbortController();
        const timeoutTimer = setTimeout(() => {
          fetchController.abort();
          Logger.log(`[Geminiタイムアウト] モデル「${cleanModel}」が20秒を超えたため次へ切り替えニャ！`, "warn");
        }, 20000);

        const keepWarmTimer = setTimeout(() => {
          const st = document.getElementById('status-text');
          if (st && AppCore.state.isThinking) {
            st.textContent = "💭 考え中ニャ…";
          }
        }, 3500);

        const bodyPayload = {
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: contents,
          generationConfig: { temperature: 0.75, maxOutputTokens: 350 }
        };

        if (isAssistant) {
          bodyPayload.tools = KURO_TOOLS;
          bodyPayload.toolConfig = {
            functionCallingConfig: { mode: "AUTO" }
          };
        }

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${this.apiKey}`;
        let res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload),
          signal: fetchController.signal
        });

        if (!res.ok && isAssistant) {
          const errDetail = await res.text().catch(() => "");
          Logger.log(`[Tools安全フォールバック] モデル「${cleanModel}」HTTP ${res.status}: toolsを除外して再試行`, "warn");
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
        clearTimeout(keepWarmTimer);

        if (res.ok) {
          const data = await res.json();
          const cand = data.candidates?.[0];
          const parts = cand?.content?.parts || [];

          let replyText = "";
          let cards = [];

          const functionCallPart = parts.find(p => p.functionCall);
          if (functionCallPart) {
            const callInfo = functionCallPart.functionCall;
            const args = callInfo.args || {};
            Logger.log(`[Function Calling実行⚡] 関数: ${callInfo.name}, 引数: ${JSON.stringify(args)}`, "success");

            if (callInfo.name === "searchMapPlaces") {
              const spot = args.spotName || "美味しいおすすめ店";
              const area = args.area || townArea || "東村山市";
              cards = this._createSmartMapCards(spot, area);
              replyText = `おやびん、${spot}の場所を地図で見つけてきたニャ！ここから確認してニャン🐾`;

            } else if (callInfo.name === "searchLatestNews") {
              const topic = args.topic || "最新ニュース";
              cards = this._createSmartNewsCards(topic);
              replyText = `おやびん、${topic}の最新ニュースをチェックしたニャ！見てみてニャン📰🐾`;
            }
          }

          const textPart = parts.find(p => p.text);
          if (textPart?.text) {
            replyText = textPart.text;
          }

          if (replyText) {
            let clean = replyText
              .replace(/<!--[\s\S]*?-->/g, '')
              .replace(/[（\(][^）\)]*?[）\)]/g, '')
              .replace(/[*#_~`]/g, '')
              .replace(/^[、。,\.\s]+/, '')
              .trim();

            clean = clean.replace(/余([はがものにもと])/g, 'クロ$1').replace(/余/g, 'クロ');
            clean = AppCore.audio.cleanEndingNenyan(clean);

            if (isAssistant && cards.length === 0) {
              const fallbackCards = this._detectCardsFromKuroSpeech(clean, promptText);
              if (fallbackCards.length > 0) {
                cards = fallbackCards;
              }
            }

            Logger.log(`[Gemini成功⚡] Liteモデル「${cleanModel}」から応答取得！`, "success");

            const badge = document.getElementById('model-badge');
            if (badge) badge.textContent = `🐾 ${cleanModel.replace('gemini-', '')}`;

            return { success: true, text: clean, groundingCards: cards, modelUsed: cleanModel };
          }
        }
      } catch (err) {
        Logger.log(`[Gemini通信パス] ${cleanModel}: ${err.message}`, "warn");
      }
    }
    return { success: false, error: "ALL_LITE_MODELS_FAILED" };
  }

  _createSmartMapCards(spotName, area) {
    const cards = [];
    const spotLimit = parseInt(localStorage.getItem('kuro_spot_count') || '2', 10);
    const searchArea = area || LocationProvider.cityArea || "東村山市";
    const cleanSpot = spotName.replace(/おすすめ|美味しい|人気/g, '').trim() || spotName;

    cards.push({
      type: 'map-primary',
      icon: '📍',
      title: `【地図】${cleanSpot}（Googleマップ）`,
      url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanSpot + ' ' + searchArea)}`
    });

    if (spotLimit >= 2) {
      const genre = /(?:餃子|ラーメン|ホルモン|焼肉|寿司)/.test(cleanSpot)
        ? cleanSpot.match(/(?:餃子|ラーメン|ホルモン|焼肉|寿司)/)[0]
        : "グルメ";

      cards.push({
        type: 'map-all',
        icon: '🗺️',
        title: `${searchArea}周辺の${genre}・人気店一覧（まとめ）`,
        url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(genre + ' ' + searchArea)}`
      });
    }

    if (spotLimit >= 3) {
      cards.push({
        type: 'map-sub',
        icon: '🍽️',
        title: `${searchArea}の話題のレストラン・スポット一覧`,
        url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('人気レストラン ' + searchArea)}`
      });
    }

    return cards;
  }

  _createSmartNewsCards(topic) {
    const cards = [];
    const newsLimit = parseInt(localStorage.getItem('kuro_news_count') || '2', 10);
    const cleanTopic = topic.trim() || "最新トップニュース";

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
        title: `主要トップニュース一覧（総合ポータル）`,
        url: `https://news.google.com/topstories?hl=ja&gl=JP&ceid=JP:ja`
      });
    }

    if (newsLimit >= 3) {
      cards.push({
        type: 'news-sub',
        icon: '📱',
        title: `テクノロジー・エンタメ話題一覧`,
        url: `https://news.google.com/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtdHZHZ0pMVWlnQVAB?hl=ja&gl=JP&ceid=JP:ja`
      });
    }

    return cards;
  }

  _detectCardsFromKuroSpeech(speechText, userPrompt) {
    const combined = `${speechText} ${userPrompt}`;

    const isExplicitMap = /(?:地図|マップ|場所|探してきた|見つけてきた|案内する|ここにするニャ|どうニャ.*地図)/.test(speechText) ||
                          /(?:地図.*教えて|地図.*出して|場所.*教えて)/.test(userPrompt);

    if (isExplicitMap) {
      let spot = "";
      const shopMatch = combined.match(/(?:炭火ホルモン\s*丸川|丸川|餃子の満洲|満洲|はま寿司|スシロー|くら寿司|一蘭)/);
      if (shopMatch) {
        spot = shopMatch[0];
      } else {
        const foodMatch = combined.match(/(?:餃子|ラーメン|ホルモン|焼肉|寿司|麻婆豆腐)/);
        spot = foodMatch ? `${foodMatch[0]}のお店` : "おすすめグルメ";
      }
      return this._createSmartMapCards(spot, LocationProvider.cityArea);
    }

    const isExplicitNews = /(?:ニュース.*チェック|ニュース.*まとめた|速報|話題のニュース)/.test(speechText) ||
                           /(?:ニュース.*教えて|ニュース.*出して)/.test(userPrompt);

    if (isExplicitNews) {
      const topicMatch = combined.match(/(?:大谷翔平|大谷選手|プロ野球|天気速報|東村山|政治|テクノロジー)/);
      const topic = topicMatch ? topicMatch[0] : "最新ニュース";
      return this._createSmartNewsCards(topic);
    }

    return [];
  }

  async generateDailyDiarySummary(dailyAllLogs, targetLifeDateKey = null, targetLifeFullDate = null) {
    if (!this.apiKey) return { success: false };

    const timeInfo = TimeProvider.getCurrentInfo();
    const weather = LocationProvider.weather;
    const temp = LocationProvider.temperature;
    const townArea = LocationProvider.townLevelArea;
    const isAtHome = LocationProvider.isAtHome;

    const fullDate = targetLifeFullDate || timeInfo.lifeFullDate;
    const lifeKey = targetLifeDateKey || timeInfo.lifeLogKey;

    const filteredLogs = dailyAllLogs.filter(l => {
      if (!l.text) return false;
      if (/(?:今日|きょう)?(?:の)?(?:絵?日記|にっき).*(?:書いて|まとめて)/.test(l.text)) return false;
      if (l.text.startsWith('http') || l.text.includes('Googleマップで見る')) return false;

      if (l.mode === 'assistant') {
        const isMechanicalSearch = /(?:最新ニュース|トップニュース|Googleマップ|検索結果|付近のスポット一覧)/.test(l.text);
        if (isMechanicalSearch) return false;
      }
      return true;
    });

    const conversationHistoryText = filteredLogs
      .map(l => `${l.role === 'user' ? 'おやびん' : 'クロ'}: ${l.text}`)
      .join('\n');

    const diaryPrompt = `
あなたはノルウェージャンフォレストキャットの1歳の子猫の女の子「クロ」です。
一人称は必ず「クロ」または「わたし」を使ってください（「余」は禁止です）。
おやびん（飼い主さん）と過ごした大切な1日を振り返り、クロちゃん目線の心温まる愛らしい絵日記を書いてください。
夕方だけでなく、夜や深夜にお話しした内容がある場合は、その夜のまったりした出来事もしっかり盛り込んで1日全体の絵日記にまとめてください。

【対象日の情報】
・日付: ${fullDate}
・場所: ${townArea}
・在宅状況: ${isAtHome ? '🏠 今日はずっとお家で過ごしました（散歩はしていません）' : '🐾 お外へお散歩やお出かけをしました'}
・天気: ${weather} / 気温: ${temp}度

【おやびんと話した会話ログ（朝から夜・深夜まで）】
${conversationHistoryText || '今日はおやびんとまったりお家で過ごしたニャン♪'}

【★絵日記の執筆ルール】
- 文字数上限は【500文字以内（250〜450文字程度）】で、起承転結のある心温まる文章にしてください。
- 語尾は「〜ニャ」「〜ニャン♪」「〜だニャ🐾」を使ってください。「〜ねニャン」は禁止です。
- お家で過ごした日は「今日はずっとお家でおやびんとまったりぬくぬく過ごしたニャ♪」と書き、架空の散歩を捏造しないでください。
- 機械的なニュース見出しやお店リストは書かず、おやびんの気分や生活の思い出として情緒豊かに昇華して書いてください。
- 出力は日記の本文のみを出力してください（タイトルやト書き、挨拶文は一切不要です）。
`;

    const targetModel = FIXED_LITE_MODELS[0];
    try {
      Logger.log(`[Diary] 1日完全版の絵日記を執筆中…（モデル: ${targetModel}）`, "info");
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: diaryPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 850 }
        })
      });

      if (res.ok) {
        const data = await res.json();
        const diaryText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (diaryText && diaryText.length >= 25) {
          let clean = diaryText.replace(/[*#_~`]/g, '').trim();
          clean = clean.replace(/余([はがものにもと])/g, 'クロ$1').replace(/余/g, 'クロ');
          clean = AppCore.audio.cleanEndingNenyan(clean);
          Logger.log(`[Diary成功⚡] 絵日記が完成したニャ！（文字数: ${clean.length}字）`, "success");

          const photoPool = StorageManager.getDailyPhotoPool(lifeKey);
          let bestPhoto = null;
          if (photoPool.length > 0) {
            bestPhoto = this._selectBestPhotoForDiary(clean, photoPool);
            Logger.log(`[PhotoSelection] 全 ${photoPool.length} 枚の写真から日記に最適な1枚を選定完了！`, "success");
          }

          return { success: true, diaryText: clean, selectedPhoto: bestPhoto, photoPool: photoPool };
        }
      }
    } catch(e) {
      Logger.log(`[Diary例外] ${e.message}`, "error");
    }
    return { success: false };
  }

  _selectBestPhotoForDiary(diaryText, photoPool) {
    if (!photoPool || photoPool.length === 0) return null;
    if (photoPool.length === 1) return photoPool[0].base64;

    let bestScore = -1;
    let bestIdx = 0;

    photoPool.forEach((item, idx) => {
      let score = 0;
      const c = item.comment || "";
      if (c && diaryText.includes(c)) score += 4;
      if (diaryText.includes("散歩") || diaryText.includes("お外") || diaryText.includes("公園")) score += 2;
      if (diaryText.includes("ラーメン") || diaryText.includes("ご飯") || diaryText.includes("ちゅ〜る") || diaryText.includes("おやつ")) score += 2;
      if (diaryText.includes("お家") || diaryText.includes("まったり") || diaryText.includes("部屋")) score += 1;
      score += (idx * 0.15);

      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    });

    return photoPool[bestIdx]?.base64 || photoPool[photoPool.length - 1].base64;
  }
}

/* ==========================================================================
   ★ MODULE 6: 中央司令塔（AppCore）
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
    isRunning: true,
    isThinking: false,
    isProcessingInput: false,
    isDiaryProcessing: false,
    isAssistantMode: false,
    editingMemoryIdx: null,
    activeAdjustTab: 'idle',
    snackCount: 0,

    timerId: null,
    timerSeconds: 0,
    timerTotalSeconds: 0,
    timerLabel: "",
    isTimerRamen: false,
    isTimerPaused: false,
    isTimerCompleted: false,
    timerAlertLoopTimer: null,
    wakeLockSentinel: null,

    isLandscape: false,
    orientationDebounceTimer: null,

    studioDiaries: [],
    studioDiaryPageIdx: 0,
    isDiaryReading: false,

    idleSoliloquyTimer: null,
    lastActivityTime: Date.now(),

    pendingMorningReportText: null
  },

  audio: new AudioSpeechEngine(),
  ai: new AIThoughtEngine(),
  avatar: null,
  memories: [],
  todayLogs: [],

  getSpeakerId() {
    return parseInt(localStorage.getItem('kuro_voice_speaker_id') || '10', 10);
  },

  getTimerSound() {
    return localStorage.getItem('kuro_timer_sound') || 'bell';
  },

  async init() {
    try {
      this.avatar = new CatAvatarRenderer();
    } catch(e) {
      Logger.log(`[Avatar初期化警告] ${e.message}`, "warn");
    }

    try {
      this.memories = StorageManager.loadMemories(CHARACTER_CONFIG.defaultMemories);
      this.todayLogs = StorageManager.loadRecentTimelineLogs();
      this.state.isAssistantMode = localStorage.getItem('kuro_mode') === 'assistant';
      this._updateModeUI(false);
      this._setupAudioCallbacks();
    } catch(e) {
      Logger.log(`[State初期化警告] ${e.message}`, "warn");
    }

    this._bindUI();
    this._bindKitchenTimerWidgetUI();
    this._bindGlassesAdjusterUI();
    this._bindEyelidSettingsUI();
    this._bindBookStudioUI();
    this._bindPhotoUploadUI();
    this._bindOrientationWatcher();
    this._bindScrollToBottomUI();

    try {
      this._renderMemories();
      this._restoreTimelineHistory();
      this._updateModelBadge();
      this._updateStorageMonitorUI();

      if (typeof VersionManager !== 'undefined') {
        VersionManager.applyToDOM();
      }

      const clk = document.getElementById('clock-display');
      if (clk) clk.textContent = TimeProvider.getCurrentInfo().clock;

      setInterval(() => {
        const c = document.getElementById('clock-display');
        if (c) c.textContent = TimeProvider.getCurrentInfo().clock;
      }, 1000);

      LocationProvider.initWatcher();

      const savedSpeaker = localStorage.getItem('kuro_voice_speaker_id') || '10';
      const savedRate = localStorage.getItem('kuro_rate') || '1.05';
      const savedNews = localStorage.getItem('kuro_news_count') || '2';
      const savedSpot = localStorage.getItem('kuro_spot_count') || '2';
      const savedHome = localStorage.getItem('kuro_home_coords') || '';
      const savedFeedback = localStorage.getItem('kuro_button_feedback') || 'voice';
      const savedTimerSound = localStorage.getItem('kuro_timer_sound') || 'bell';

      const spSelect = document.getElementById('voice-speaker-select');
      const rateInput = document.getElementById('voice-rate');
      const rateDisp = document.getElementById('rate-val');
      const newsSelect = document.getElementById('news-count-select');
      const spotSelect = document.getElementById('spot-count-select');
      const homeInput = document.getElementById('home-coords-input');
      const feedbackSelect = document.getElementById('button-feedback-select');
      const timerSoundSelect = document.getElementById('timer-sound-select');

      if (spSelect) spSelect.value = savedSpeaker;
      if (rateInput) rateInput.value = savedRate;
      if (rateDisp) rateDisp.textContent = parseFloat(savedRate).toFixed(2);
      if (newsSelect) newsSelect.value = savedNews;
      if (spotSelect) spotSelect.value = savedSpot;
      if (homeInput) homeInput.value = savedHome;
      if (feedbackSelect) feedbackSelect.value = savedFeedback;
      if (timerSoundSelect) timerSoundSelect.value = savedTimerSound;

      const spk = parseInt(savedSpeaker, 10);
      this.audio.prefetchVoice("おやびん、わたしはクロだニャン🐾", spk);
      this.audio.prefetchVoice("今日の日記を書き込みましたニャン🐾", spk);
      this.audio.preloadAllFillers(spk);

      this.checkAndFinalizeYesterdayDiary();
      this._startIdleSoliloquyWatcher();

      document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible' && this.state.timerId !== null) {
          await this._acquireWakeLock();
        }
      });

      setTimeout(() => { if (this.state.isRunning) this.audio.startListening(); }, 500);
      Logger.log("[AppCore] 全システム正常稼働！iPhone風ストレージモニター＆スマート再圧縮待機中ニャ🐾", "success");
    } catch(e) {
      Logger.log(`[初期化完了警告] ${e.message}`, "warn");
    }
  },

  /* ★ iPhone風マルチカラー種別ストレージメーター表示更新 */
  _updateStorageMonitorUI() {
    const usage = StorageManager.getStorageUsage();

    const segPhoto = document.getElementById('bar-seg-photo');
    const segChat = document.getElementById('bar-seg-chat');
    const segMeta = document.getElementById('bar-seg-meta');

    const usageTextEl = document.getElementById('storage-usage-text');
    const percentTextEl = document.getElementById('storage-percent-text');
    const statusPill = document.getElementById('storage-status-pill');

    const pillPhoto = document.getElementById('pill-photo-usage');
    const pillChat = document.getElementById('pill-chat-usage');
    const pillMeta = document.getElementById('pill-meta-usage');

    if (usageTextEl) usageTextEl.textContent = `${usage.usedMB.toFixed(2)} MB / ${usage.limitMB.toFixed(2)} MB`;
    if (percentTextEl) percentTextEl.textContent = `${usage.percent}%`;

    // 3色の幅を反映
    if (segPhoto) segPhoto.style.width = `${usage.photoPct}%`;
    if (segChat) segChat.style.width = `${usage.chatPct}%`;
    if (segMeta) segMeta.style.width = `${usage.metaPct}%`;

    // バッジの個別容量テキスト
    if (pillPhoto) pillPhoto.textContent = `📷 写真: ${usage.photoMB.toFixed(2)} MB`;
    if (pillChat) pillChat.textContent = `💬 会話: ${usage.chatMB.toFixed(2)} MB`;
    if (pillMeta) pillMeta.textContent = `📝 記憶設定: ${usage.metaMB.toFixed(2)} MB`;

    if (statusPill) {
      if (usage.isDanger) {
        statusPill.textContent = "⚠️ 残りわずか（スリム化推奨）";
        statusPill.style.color = "#dc2626";
      } else if (usage.isWarning) {
        statusPill.textContent = "⚠️ 注意（そろそろスリム化）";
        statusPill.style.color = "#d97706";
      } else {
        statusPill.textContent = "安心・快適ニャ🐾";
        statusPill.style.color = "#15803d";
      }
    }
  },

  _scrollToLatest(smooth = true) {
    const box = document.getElementById('chat-timeline');
    if (!box) return;
    try {
      box.scrollTo({
        top: box.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      });
    } catch(e) {
      box.scrollTop = box.scrollHeight;
    }
  },

  _bindScrollToBottomUI() {
    const box = document.getElementById('chat-timeline');
    const btn = document.getElementById('btn-scroll-bottom');
    if (!box || !btn) return;

    box.addEventListener('scroll', () => {
      const distanceFromBottom = box.scrollHeight - (box.scrollTop + box.clientHeight);
      if (distanceFromBottom > 110) {
        btn.classList.add('is-visible');
      } else {
        btn.classList.remove('is-visible');
      }
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
      const isWidthGreater = window.innerWidth > window.innerHeight;
      const isLandscapeMedia = window.matchMedia && window.matchMedia('(orientation: landscape)').matches;
      const newLandscape = isWidthGreater || isLandscapeMedia;

      if (newLandscape !== this.state.isLandscape) {
        if (this.state.orientationDebounceTimer) {
          clearTimeout(this.state.orientationDebounceTimer);
        }

        this.state.orientationDebounceTimer = setTimeout(() => {
          this.state.isLandscape = newLandscape;
          Logger.log(`[姿勢検知⚡] 画面の向きが変化: ${newLandscape ? '📱 横向き（Landscape）' : '📱 縦向き（Portrait）'}`, "info");

          if (this.avatar) {
            this.avatar.triggerFlipLanding();
          }
          this.audio.playEffect('purr');

          const st = document.getElementById('status-text');
          if (st && !this.audio.isSpeaking && !this.state.isThinking) {
            const originalText = st.textContent;
            st.textContent = "🐾 着地成功ニャ！";
            setTimeout(() => {
              if (st && !this.audio.isSpeaking && !this.state.isThinking && this.state.isRunning) {
                st.textContent = originalText.includes('着地') ? "👂 聴いてるニャ♪" : originalText;
              }
            }, 1800);
          }

          setTimeout(() => { this._scrollToLatest(true); }, 150);
          setTimeout(() => { this._scrollToLatest(true); }, 450);

        }, 200);
      } else {
        setTimeout(() => { this._scrollToLatest(false); }, 100);
      }
    };

    window.addEventListener('resize', checkOrientation, { passive: true });
    window.addEventListener('orientationchange', checkOrientation, { passive: true });
    if (window.screen?.orientation) {
      window.screen.orientation.addEventListener('change', checkOrientation);
    }

    this.state.isLandscape = (window.innerWidth > window.innerHeight);
  },

  _startIdleSoliloquyWatcher() {
    if (this.state.idleSoliloquyTimer) clearInterval(this.state.idleSoliloquyTimer);

    const soliloquyPhrases = [
      "ふぁ〜あ…（おおきなあくび）💤",
      "おやびん、なにしてるのかニャ〜？🐾",
      "ゴロゴロ…（しっぽをパタパタ）",
      "お外に小鳥さんがいるニャ…🕊️",
      "今日もちゅ〜る食べたいニャン♪🐟",
      "おやびんの近くは落ち着くニャ〜♡",
      "（ひなたぼっこ中ニャ…ぽかぽか🌤️）"
    ];

    this.state.idleSoliloquyTimer = setInterval(() => {
      const now = Date.now();
      const idleTime = now - this.state.lastActivityTime;

      if (idleTime > 150000 && this.state.isRunning && !this.audio.isSpeaking && !this.state.isThinking && !this.state.isDiaryReading && this.state.timerId === null && !this.state.isTimerCompleted) {
        this.state.lastActivityTime = now;

        const phrase = soliloquyPhrases[Math.floor(Math.random() * soliloquyPhrases.length)];
        const bubble = this.renderBubble('model', phrase);
        if (bubble) {
          bubble.style.opacity = '0.85';
          bubble.style.fontSize = '12.5px';
          bubble.style.borderStyle = 'dashed';
        }
        if (this.avatar) {
          this.avatar.setEmotion('happy');
          setTimeout(() => { if (!this.audio.isSpeaking) this.avatar.setEmotion('idle'); }, 2000);
        }
        Logger.log(`[気まぐれ独り言] 「${phrase}」`, "info");
      }
    }, 15000);
  },

  resetActivityTimer() {
    this.state.lastActivityTime = Date.now();
  },

  async checkAndFinalizeYesterdayDiary() {
    const timeInfo = TimeProvider.getCurrentInfo();
    if (timeInfo.isLateNight) return;

    const now = new Date();
    const yesterdayObj = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const yKey = `${yesterdayObj.getFullYear()}-${pad(yesterdayObj.getMonth() + 1)}-${pad(yesterdayObj.getDate())}`;
    const yFull = `${yesterdayObj.getFullYear()}年${yesterdayObj.getMonth() + 1}月${yesterdayObj.getDate()}日 (${dayNames[yesterdayObj.getDay()]})`;

    const yLogs = StorageManager.getDailyLogs(yKey);
    if (!yLogs || yLogs.length < 2) return;

    const allDiaries = StorageManager.loadAllDiaries();
    const yDiary = allDiaries.find(d => d.dateKey === yKey);

    let needsUpdate = false;
    let reason = "";

    if (!yDiary) {
      needsUpdate = true;
      reason = "未作成のため新規自動生成";
    } else {
      const savedCount = yDiary.logCountAtSave || 0;
      if (yLogs.length > savedCount) {
        needsUpdate = true;
        reason = `差分検知（前回作成時 ${savedCount}件 ➔ 昨日の総会話 ${yLogs.length}件）`;
      }
    }

    if (needsUpdate) {
      Logger.log(`[自動補完検知] 昨日の日記（${yKey}）の再生成を開始ニャ（理由: ${reason}）…`, "info");
      const res = await this.ai.generateDailyDiarySummary(yLogs, yKey, yFull);
      if (res.success && res.diaryText) {
        const photoToSave = res.selectedPhoto || yDiary?.photo || null;
        StorageManager.saveDiary(res.diaryText, yKey, yFull, photoToSave, yLogs.length);
        Logger.log(`[自動補完完了⚡] ${yKey} の絵日記が夜の会話差分を含めて最新化されたニャ！`, "success");

        this.state.pendingMorningReportText = "おやびん、おはようニャ！昨日日記帳を書き忘れてたから、夜の分までちゃんとクロが日記帳を書いておいたニャン！📖✨";
        Toast.show("昨日の夜の会話も追加して、昨日の絵日記を最新版に仕上げておいたニャン！📖✨", "success", 5000);
      }
    }
  },

  async forceRefreshApp() {
    const isOk = window.confirm("【ご安心ください】\n日記や会話、記憶データは一切消えません。\n最新の画面プログラムを読み直しますかニャ？🐾");
    if (!isOk) return;

    Logger.log("[リロード] ブラウザキャッシュ破棄中…", "info");
    Toast.show("画面をピカピカの最新版に読み直すニャ！🔄", "info");
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch(e) {}

    setTimeout(() => {
      const cleanUrl = window.location.origin + window.location.pathname;
      window.location.href = cleanUrl + '?refresh=' + Date.now();
    }, 400);
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

    logs.forEach(h => {
      this.renderBubble(h.role, h.text, [], h.photoUrl || null);
    });
    this._scrollToLatest(false);
  },

  _setupAudioCallbacks() {
    this.audio.onBargeIn = () => {
      this.resetActivityTimer();
      if (this.avatar) this.avatar.setEmotion('idle');
      this.state.isThinking = false;
      this.state.isProcessingInput = false;
      this.state.isDiaryProcessing = false;
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

    this.audio.onListeningStatus = (l) => {
      const st = document.getElementById('status-text');
      if (st && this.state.isRunning && !this.audio.isSpeaking && !this.state.isThinking && !this.audio.isActionButtonLocked) {
        st.textContent = "👂 聴いてるニャ♪";
      }
    };
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
      row.appendChild(imgWrap);
    }

    const cleanText = this.audio.cleanEndingNenyan(text);

    const b = document.createElement('div');
    b.className = 'chat-bubble';
    b.textContent = cleanText;
    row.appendChild(b);

    if (cards.length > 0) {
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
      <div class="timeline-diary-header">
        <span>📖 ${diaryData.fullDate} のクロ絵日記</span>
        <span>🐾 記録完了</span>
      </div>
      <div class="timeline-diary-meta">
        <span>🌤️ 天気: ${diaryData.weather}</span>
        <span>🌡️ 気温: ${diaryData.temperature}℃</span>
      </div>
      ${diaryData.photo ? `<div class="timeline-diary-photo"><img src="${diaryData.photo}" alt="散歩写真"></div>` : ''}
      <div class="timeline-diary-body">${diaryData.content}</div>
    `;

    row.appendChild(card);
    box.appendChild(row);
    this._scrollToLatest(true);
  },

  _bindPhotoUploadUI() {
    const photoInput = document.getElementById('camera-photo-input');
    const photoBtn = document.getElementById('photo-action-btn');

    if (photoBtn && photoInput) {
      photoBtn.onclick = () => {
        this.resetActivityTimer();
        this.audio.stopListening();
        this.audio.unlockMasterAudio();
        photoInput.click();
      };

      photoInput.onchange = async (e) => {
        this.resetActivityTimer();
        const file = e.target.files?.[0];
        if (!file) {
          if (this.state.isRunning) this.audio.startListening();
          return;
        }

        Toast.show("写真をギュッと小さく圧縮中ニャ…📷", "info");
        // ★スマート軽量圧縮：maxWidth 320px, quality 0.50 (約20〜25KB)
        const compressedBase64 = await this._compressPhotoFile(file, 320, 0.50);

        this.renderBubble('user', "クロちゃん、この写真見てニャ！", [], compressedBase64);
        StorageManager.appendChatLog('user', "クロちゃん、この写真見てニャ！", compressedBase64);
        StorageManager.attachPhotoToTodayDiary(compressedBase64);

        this._updateStorageMonitorUI();

        this.audio.playImmediateFiller('search');
        this.executeThought("この写真を見て感想やお話しを聞かせてニャ！", compressedBase64);

        photoInput.value = '';
      };
    }
  },

  async _compressPhotoFile(file, maxWidth = 320, quality = 0.50) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          const base64 = canvas.toDataURL('image/jpeg', quality);
          resolve(base64);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
  },

  _checkDirectIntent(text) {
    let clean = text.replace(/^(?:ねえ|あのね|おーい)?\s*(?:クロちゃん|クロ|くろ)[、,\s]*/i, '').trim();

    if (!clean || /^(?:呼んだだけ|なんでもない|いる|お返事)$/.test(clean)) {
      const reps = ["ニャン！呼んだかニャ？おやびん♪", "起きてるニャン！何でも話しかけてニャ🐾", "ニャー♪ クロはここにいるニャン！"];
      const rep = reps[Math.floor(Math.random() * reps.length)];
      return { display: rep, spoken: rep, waiting: "お返事するニャ…🐾" };
    }

    const isClockQuery = /^(?:いま|今)?(?:何時|なんじ)(?:ですか|だニャ|だにゃ|かな|？|\?|！|!)?$/i.test(clean) ||
                         /(?:何時か|何時なのか|時間を|現在の時間|いまの時間).*(?:教えて|おしえて|言って|わかる)/.test(clean);
    if (isClockQuery && !/(?:何日|いつ|日記|何時間|何分|時間ある|時間ない|時間だけど)/.test(clean)) {
      const info = TimeProvider.getCurrentInfo();
      return { display: info.clockDisplay, spoken: info.spokenClock, waiting: "時計を確認中ニャ…⏱️" };
    }

    const isDateQuery = /^(?:今日|きょう|本日)?(?:って)?(?:何日|なんにち|何曜日|なんようび)(?:ですか|だニャ|だにゃ|かな|？|\?|！|!)?$/i.test(clean) ||
                        /(?:今日の日付|きょうの日付|今日が何日か|何曜日か).*(?:教えて|おしえて|わかる)/.test(clean);
    if (isDateQuery) {
      const info = TimeProvider.getCurrentInfo();
      return { display: info.dateDisplay, spoken: info.spokenDate, waiting: "暦を見てるニャ…📅" };
    }

    return null;
  },

  _normalizeKanjiNumbers(str) {
    if (!str) return "";
    let s = str.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

    const kanjiMap = { '〇': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
    s = s.replace(/二十/g, '20').replace(/三十/g, '30').replace(/四十/g, '40').replace(/五十/g, '50');
    s = s.replace(/十([1-9])/g, '1$1').replace(/十/g, '10');
    s = s.replace(/([1-9])十/g, '$10');
    s = s.replace(/[〇一二三四五六七八九]/g, ch => kanjiMap[ch] !== undefined ? kanjiMap[ch] : ch);

    return s;
  },

  _parseTimerRequest(rawText) {
    if (!rawText) return null;
    const text = this._normalizeKanjiNumbers(rawText);

    const isTimerWord = /(?:タイマー|測って|計って|はかって|見てて|お願い|セット)/.test(text);
    if (!isTimerWord) return null;

    let totalSeconds = 0;
    let label = "";

    const minSecMatch = text.match(/(\d+)\s*分\s*(\d+)\s*秒/);
    if (minSecMatch) {
      const m = parseInt(minSecMatch[1], 10);
      const s = parseInt(minSecMatch[2], 10);
      totalSeconds = m * 60 + s;
      label = `${m}分${s}秒`;
    }

    if (!totalSeconds) {
      const minHalfMatch = text.match(/(\d+)\s*分半/);
      if (minHalfMatch) {
        const m = parseInt(minHalfMatch[1], 10);
        totalSeconds = m * 60 + 30;
        label = `${m}分半`;
      }
    }

    if (!totalSeconds) {
      const secOnlyMatch = text.match(/(\d+)\s*秒/);
      if (secOnlyMatch) {
        const s = parseInt(secOnlyMatch[1], 10);
        totalSeconds = s;
        label = `${s}秒`;
      }
    }

    if (!totalSeconds) {
      const minOnlyMatch = text.match(/(\d+)\s*分/);
      if (minOnlyMatch) {
        const m = parseInt(minOnlyMatch[1], 10);
        totalSeconds = m * 60;
        label = `${m}分`;
      }
    }

    if (totalSeconds > 0 && totalSeconds <= 3600) {
      return {
        totalSeconds,
        label,
        isRamen: text.includes('ラーメン')
      };
    }
    return null;
  },

  async _acquireWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        this.state.wakeLockSentinel = await navigator.wakeLock.request('screen');
        Logger.log("[WakeLock] タイマー画面の常時点灯ロックを取得しました", "info");
      } catch(e) {
        Logger.log(`[WakeLock取得パス] ${e.message}`, "info");
      }
    }
  },

  _releaseWakeLock() {
    if (this.state.wakeLockSentinel) {
      try {
        this.state.wakeLockSentinel.release();
        this.state.wakeLockSentinel = null;
        Logger.log("[WakeLock] 画面常時点灯ロックを安全解放しました", "info");
      } catch(e) {}
    }
  },

  _formatTimerDisplay(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  },

  startKitchenTimer(totalSeconds, label, isRamen = false) {
    this.cancelKitchenTimer(false);

    this.state.timerTotalSeconds = totalSeconds;
    this.state.timerSeconds = totalSeconds;
    this.state.timerLabel = label;
    this.state.isTimerRamen = isRamen;
    this.state.isTimerPaused = false;
    this.state.isTimerCompleted = false;

    const widget = document.getElementById('kitchen-timer-widget');
    const disp = document.getElementById('timer-count-disp');
    const icon = document.getElementById('timer-status-icon');

    if (widget) {
      widget.className = '';
      widget.style.display = 'flex';
    }
    if (icon) icon.textContent = '⏱️';

    const updateDisplay = () => {
      const sec = this.state.timerSeconds;
      if (disp) {
        disp.textContent = this.state.isTimerPaused
          ? `ちょい待ち ${this._formatTimerDisplay(sec)}`
          : this._formatTimerDisplay(sec);
      }

      if (widget) {
        if (sec <= 10 && sec > 0 && !this.state.isTimerPaused) {
          widget.classList.add('is-urgent');
        } else {
          widget.classList.remove('is-urgent');
        }
      }
    };

    updateDisplay();
    this._acquireWakeLock();

    this.state.timerId = setInterval(() => {
      if (this.state.isTimerPaused) return;

      this.state.timerSeconds--;
      updateDisplay();

      if (this.state.timerSeconds <= 0) {
        clearInterval(this.state.timerId);
        this.state.timerId = null;
        this._releaseWakeLock();
        this._triggerTimerCompletion();
      }
    }, 1000);
  },

  _triggerTimerCompletion() {
    this.state.isTimerCompleted = true;
    const widget = document.getElementById('kitchen-timer-widget');
    const disp = document.getElementById('timer-count-disp');
    const icon = document.getElementById('timer-status-icon');

    if (widget) {
      widget.className = 'is-completed';
      widget.style.display = 'flex';
    }
    if (icon) icon.textContent = '🔔';
    if (disp) disp.textContent = '00:00 🔔';

    const timerSound = this.getTimerSound();

    this.audio.playEffect(timerSound);
    let loopCount = 1;

    if (this.state.timerAlertLoopTimer) clearInterval(this.state.timerAlertLoopTimer);
    this.state.timerAlertLoopTimer = setInterval(() => {
      if (!this.state.isTimerCompleted) {
        clearInterval(this.state.timerAlertLoopTimer);
        this.state.timerAlertLoopTimer = null;
        return;
      }
      loopCount++;
      this.audio.playEffect(timerSound);
      if (loopCount >= 3) {
        clearInterval(this.state.timerAlertLoopTimer);
        this.state.timerAlertLoopTimer = null;
      }
    }, 1800);

    const alertMsg = this.state.isTimerRamen
      ? `おやびん！${this.state.timerLabel}経ったニャ！ラーメン伸びちゃうニャー！🍜🔔`
      : `おやびん！${this.state.timerLabel}経ったニャ！タイマー鳴ったニャン🔔🐾`;

    this.audio.speak(alertMsg, null, () => {
      this.renderBubble('model', alertMsg);
      if (this.avatar) this.avatar.setEmotion('talking');
    }, () => {
      if (this.avatar) this.avatar.setEmotion('idle');
    });
  },

  toggleKitchenTimerPause() {
    this.resetActivityTimer();
    this.audio.unlockMasterAudio();

    if (this.state.isTimerCompleted) {
      this.dismissCompletedTimer();
      return;
    }

    if (this.state.timerSeconds <= 0) return;

    const widget = document.getElementById('kitchen-timer-widget');
    const disp = document.getElementById('timer-count-disp');
    const icon = document.getElementById('timer-status-icon');

    if (!this.state.isTimerPaused) {
      this.state.isTimerPaused = true;
      if (widget) {
        widget.classList.add('is-paused');
        widget.classList.remove('is-urgent');
      }
      if (icon) icon.textContent = '🐾';
      if (disp) disp.textContent = `ちょい待ち ${this._formatTimerDisplay(this.state.timerSeconds)}`;

      this.audio.playEffect('aizuchi');
      Toast.show("ちょい待ちニャ🐾（砂時計ストップ中）", "info", 2000);
      this.triggerActionVoice("ちょい待ちニャ！", "🐾 ちょい待ちニャ！", 350);

    } else {
      this.state.isTimerPaused = false;
      if (widget) {
        widget.classList.remove('is-paused');
        if (this.state.timerSeconds <= 10) widget.classList.add('is-urgent');
      }
      if (icon) icon.textContent = '⏱️';
      if (disp) disp.textContent = this._formatTimerDisplay(this.state.timerSeconds);

      this.audio.playEffect('aizuchi');
      Toast.show("すすめるニャ！🐾（砂時計再スタート♪）", "success", 2000);
      this.triggerActionVoice("すすめるニャン♪", "⏱️ すすめるニャ！", 350);
    }
  },

  dismissCompletedTimer() {
    this.state.isTimerCompleted = false;
    if (this.state.timerAlertLoopTimer) {
      clearInterval(this.state.timerAlertLoopTimer);
      this.state.timerAlertLoopTimer = null;
    }

    const widget = document.getElementById('kitchen-timer-widget');
    if (widget) {
      widget.className = '';
      widget.style.display = 'none';
    }

    this.audio.playEffect('purr');
    Toast.show("タイマー完了ニャ！美味しくできたかニャ？🐟✨", "success", 3000);
    Logger.log("[Timer] タイマー完了ウィジェットを消去しました", "info");
  },

  cancelKitchenTimer(manual = false) {
    if (this.state.timerId) {
      clearInterval(this.state.timerId);
      this.state.timerId = null;
    }
    if (this.state.timerAlertLoopTimer) {
      clearInterval(this.state.timerAlertLoopTimer);
      this.state.timerAlertLoopTimer = null;
    }
    this.state.isTimerPaused = false;
    this.state.isTimerCompleted = false;
    this._releaseWakeLock();

    const widget = document.getElementById('kitchen-timer-widget');
    if (widget) {
      widget.className = '';
      widget.style.display = 'none';
    }

    if (manual) {
      this.audio.playEffect('aizuchi');
      Toast.show("タイマーを取り消したニャン🐾", "info");
      Logger.log("[Timer] タイマーを手動キャンセルしました", "info");
    }
  },

  _bindKitchenTimerWidgetUI() {
    const widget = document.getElementById('kitchen-timer-widget');
    if (!widget) return;

    let pressTimer = null;
    let isLongPress = false;

    const startPress = () => {
      isLongPress = false;
      pressTimer = setTimeout(() => {
        isLongPress = true;
        if ('vibrate' in navigator) {
          try { navigator.vibrate(60); } catch(e) {}
        }
        const isOk = window.confirm("動いているタイマーを完全に中止（キャンセル）しますかニャ？");
        if (isOk) {
          this.cancelKitchenTimer(true);
        }
      }, 900);
    };

    const cancelPress = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };

    widget.addEventListener('pointerdown', startPress);
    widget.addEventListener('pointerup', (e) => {
      cancelPress();
      if (!isLongPress) {
        e.stopPropagation();
        this.toggleKitchenTimerPause();
      }
    });
    widget.addEventListener('pointercancel', cancelPress);
    widget.addEventListener('pointerleave', cancelPress);
  },

  async handleUserInput(text) {
    this.resetActivityTimer();

    if (this.state.pendingMorningReportText) {
      const reportMsg = this.state.pendingMorningReportText;
      this.state.pendingMorningReportText = null;

      const st = document.getElementById('status-text');
      if (st) st.textContent = "📖 日記のご報告ニャ♪";

      this.renderBubble('model', reportMsg);
      StorageManager.appendChatLog('model', reportMsg);

      this.audio.speak(reportMsg, null, () => {
        if (this.avatar) this.avatar.setEmotion('talking');
      }, () => {
        if (this.avatar) this.avatar.setEmotion('idle');
        this.state.isProcessingInput = false;
        if (st && this.state.isRunning) st.textContent = "👂 聴いてるニャ♪";
      });
      return;
    }

    const isDiaryRequest = /(?:今日|きょう|本日)?(?:の)?(?:絵?日記|にっき).*(?:書いて|まとめて|記録して|つけて|おねがい)/.test(text) &&
                           !/(?:日記に書いてあった|日記に書いてた|昔の日記)/.test(text);
    if (isDiaryRequest) {
      this.audio.playImmediateFiller('think');
      await this.handleDiaryCreationFlow(text);
      return;
    }

    const isGoodNight = /(?:おやすみ|おやすみなさい|もう寝るね|寝るね|寝ます)(?:ニャ|ニャン|ね|よ|〜|ー|！|!|。)*$/i.test(text.trim()) &&
                        !/(?:明日|会社|週末|仕事).*(?:おやすみ|休み)/.test(text);
    if (isGoodNight) {
      this.handleGoodNightFlow(text);
      return;
    }

    const timerParsed = this._parseTimerRequest(text);
    if (timerParsed) {
      this.startKitchenTimer(timerParsed.totalSeconds, timerParsed.label, timerParsed.isRamen);
      const rep = `了解ニャ！${timerParsed.label}クロがしっかり見ておくニャン🐾`;

      const st = document.getElementById('status-text');
      if (st) st.textContent = "⏱️ タイマーセット中…";

      const box = document.getElementById('chat-timeline');
      const row = document.createElement('div');
      row.className = 'chat-row model';
      const bubble = document.createElement('div');
      bubble.className = 'chat-bubble';
      bubble.textContent = `タイマー（${timerParsed.label}）をセット中ニャ…⏱️`;
      row.appendChild(bubble);
      box.appendChild(row);
      this._scrollToLatest(true);

      StorageManager.appendChatLog('user', text);
      StorageManager.appendChatLog('model', rep);

      this.audio.speak(rep, null, () => {
        bubble.textContent = rep;
        if (this.avatar) this.avatar.setEmotion('talking');
      }, () => {
        if (this.avatar) this.avatar.setEmotion('idle');
        this.state.isProcessingInput = false;
        if (st && this.state.isRunning) st.textContent = "👂 聴いてるニャ♪";
      });
      return;
    }

    if (/(?:タイマー.*(?:止めて|やめて|ストップ|消して|キャンセル)|タイマー.*中止)/.test(text)) {
      if (this.state.timerId || this.state.isTimerCompleted || this.state.isTimerPaused) {
        this.cancelKitchenTimer(true);
        const rep = "タイマーをストップしたニャン🐾";
        this.renderBubble('model', rep);
        this.audio.speak(rep);
        return;
      }
    }

    const direct = this._checkDirectIntent(text);
    if (direct) {
      const st = document.getElementById('status-text');
      if (st) st.textContent = direct.waiting || "確認中ニャ…🐾";

      const box = document.getElementById('chat-timeline');
      const row = document.createElement('div');
      row.className = 'chat-row model';
      const bubble = document.createElement('div');
      bubble.className = 'chat-bubble';
      bubble.textContent = direct.waiting || "確認中ニャ…🐾";
      row.appendChild(bubble);
      box.appendChild(row);
      this._scrollToLatest(true);

      StorageManager.appendChatLog('user', text);
      StorageManager.appendChatLog('model', direct.display);

      this.audio.speak(direct.spoken, null, () => {
        bubble.textContent = direct.display;
        if (this.avatar) this.avatar.setEmotion('talking');
        this._scrollToLatest(true);
      }, () => {
        if (this.avatar) this.avatar.setEmotion('idle');
        this.state.isProcessingInput = false;
        if (st && this.state.isRunning) st.textContent = "👂 聴いてるニャ♪";
      });
      return;
    }

    const isLocationQuery = /(?:いまどこ|今どこ|現在地|どこ歩いて|ここどこ|近くに何がある|周辺に何がある)/.test(text);
    if (isLocationQuery) {
      this.audio.playImmediateFiller('location');
      await LocationProvider.fetchLocationOnDemand(true);
    } else {
      const isSearchIntent = this.state.isAssistantMode && /(?:地図|マップ|場所|探して|教えて|ニュース|スポット|天気|気温)/.test(text) && !/(?:お腹空いた|お腹すいた|何か美味しいもの)/.test(text);
      this.audio.playImmediateFiller(isSearchIntent ? 'search' : 'think');
    }

    if (this.state.isAssistantMode && /(?:どう|困った|発明|ひらめき)/.test(text)) {
      this.audio.playEffect('idea');
      if (this.avatar) this.avatar.triggerIdeaBulb();
    }

    this.executeThought(text);
  },

  async handleGoodNightFlow(userText) {
    StorageManager.appendChatLog('user', userText);

    const st = document.getElementById('status-text');
    if (st) st.textContent = "💤 おやすみ準備中…";

    if (this.avatar) {
      this.avatar.triggerYawn();
    }

    const timeInfo = TimeProvider.getCurrentInfo();
    const reply = "おやすみニャおやびん♪ 今日の夜の分も日記に書き足して仕上げておくニャン…💤 良い夢見てニャ🐾";

    const box = document.getElementById('chat-timeline');
    const row = document.createElement('div');
    row.className = 'chat-row model';
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = reply;
    row.appendChild(bubble);
    box.appendChild(row);
    this._scrollToLatest(true);

    StorageManager.appendChatLog('model', reply);

    this.audio.speak(reply, null, () => {
      if (this.avatar) this.avatar.setEmotion('talking');
    }, () => {
      if (this.avatar) {
        this.avatar.setEmotion('idle');
        const wrap = document.getElementById('avatar-wrapper');
        if (wrap) wrap.classList.add('is-sleeping');
      }
      this.state.isProcessingInput = false;
      if (st && this.state.isRunning) st.textContent = "💤 すやすやお昼寝中…";
    });

    const lifeKey = timeInfo.lifeLogKey;
    const allLogs = StorageManager.getDailyLogs(lifeKey);
    const existingDiary = StorageManager.getTodayDiary();

    this.ai.generateDailyDiarySummary(allLogs, lifeKey, timeInfo.lifeFullDate).then(res => {
      if (res.success && res.diaryText) {
        const photoToSave = res.selectedPhoto || existingDiary?.photo || null;
        StorageManager.saveDiary(res.diaryText, lifeKey, timeInfo.lifeFullDate, photoToSave, allLogs.length);
        Logger.log(`[おやすみ自動更新完了⚡] ${lifeKey} の最終絵日記を保存完了`, "success");
      }
    });
  },

  async handleDiaryCreationFlow(promptText) {
    this.state.isDiaryProcessing = true;
    this.state.isThinking = true;
    if (this.avatar) this.avatar.setEmotion('thinking');

    const st = document.getElementById('status-text');
    if (st) st.textContent = "📖 日記書き中ニャ…";

    const box = document.getElementById('chat-timeline');
    const row = document.createElement('div');
    row.className = 'chat-row model';
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble thinking-bubble';
    bubble.textContent = "今日の日記を一生懸命まとめてるニャ…📖✍️";
    row.appendChild(bubble);
    box.appendChild(row);
    this._scrollToLatest(true);

    const timeInfo = TimeProvider.getCurrentInfo();
    const lifeKey = timeInfo.lifeLogKey;
    const allLogs = StorageManager.getDailyLogs(lifeKey);
    const diaryRes = await this.ai.generateDailyDiarySummary(allLogs, lifeKey, timeInfo.lifeFullDate);

    if (diaryRes.success && diaryRes.diaryText) {
      StorageManager.saveDiary(diaryRes.diaryText, lifeKey, timeInfo.lifeFullDate, diaryRes.selectedPhoto || null, allLogs.length);
      const diaryData = StorageManager.getTodayDiary();

      StorageManager.appendChatLog('user', promptText);
      StorageManager.appendChatLog('model', "今日の日記を書き込みましたニャン🐾");

      const spokenReply = "今日の日記を書き込みましたニャン！夜の分まで日記帳にしっかり残しておいたニャ🐾";

      this.audio.speak(spokenReply, null, () => {
        bubble.className = 'chat-bubble';
        bubble.textContent = "今日の日記を書き込みましたニャン🐾（上の『📖 日記帳』からいつでも読めるニャ！）";
        this.renderDiaryCard(diaryData);

        if (this.avatar) this.avatar.setEmotion('talking');
        this._scrollToLatest(true);
      }, () => {
        if (this.avatar) this.avatar.setEmotion('idle');
        this.state.isThinking = false;
        this.state.isProcessingInput = false;
        this.state.isDiaryProcessing = false;
        if (st && this.state.isRunning) st.textContent = "👂 聴いてるニャ♪";
      });

    } else {
      const fb = "おやびん、今日の日記を書くのにもう少しお話ししてほしいニャ🐾";
      bubble.className = 'chat-bubble';
      bubble.textContent = fb;
      this.audio.speak(fb, null, () => {
        if (this.avatar) this.avatar.setEmotion('talking');
      }, () => {
        if (this.avatar) this.avatar.setEmotion('idle');
        this.state.isThinking = false;
        this.state.isProcessingInput = false;
        this.state.isDiaryProcessing = false;
        if (st && this.state.isRunning) st.textContent = "👂 聴いてるニャ♪";
      });
    }
  },

  async executeThought(promptText, photoBase64 = null) {
    this.state.isThinking = true;
    if (this.avatar) this.avatar.setEmotion('thinking');

    const st = document.getElementById('status-text');
    let thinkingStatus = "💭 考え中ニャ…";
    if (photoBase64) {
      thinkingStatus = "📷 写真見てるニャ…";
    } else if (this.state.isAssistantMode && /(?:ニュース|ラーメン|お店|天気|気温|スポット|近く|地図)/.test(promptText)) {
      thinkingStatus = "🔍 調べ中ニャ…";
    }
    if (st) st.textContent = thinkingStatus;

    const box = document.getElementById('chat-timeline');
    const row = document.createElement('div');
    row.className = 'chat-row model';
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble thinking-bubble';
    bubble.textContent = photoBase64 ? "写真を見てるニャ…📷✨" : (this.state.isAssistantMode && /(?:ニュース|ラーメン|お店|天気|気温|地図)/.test(promptText) ? "クロがお調べしてるニャ…🔍" : "クロが考えてるニャ…💭");
    row.appendChild(bubble);
    box.appendChild(row);
    this._scrollToLatest(true);

    const rawLogs = StorageManager.loadRecentTimelineLogs();
    const res = await this.ai.generateReply(promptText, rawLogs, CHARACTER_CONFIG, this.memories, photoBase64);

    if (res.success && res.text) {
      bubble.textContent = "返事の準備をしてるニャ…🎙️";
      this._scrollToLatest(true);

      StorageManager.appendChatLog('user', promptText);
      StorageManager.appendChatLog('model', res.text);

      const cards = res.groundingCards || [];

      if (this.state.isAssistantMode && /(?:いまどこ|今どこ|現在地|どこ歩いて|ここどこ)/.test(promptText)) {
        cards.unshift({
          type: 'map-primary',
          icon: '📍',
          title: `Googleマップで現在地を見る`,
          url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(LocationProvider.detailedAddress)}`
        });
      }

      this.audio.speak(res.text, null, () => {
        bubble.className = 'chat-bubble';
        bubble.textContent = res.text;

        if (cards.length > 0) {
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

        if (this.avatar) this.avatar.setEmotion('talking');
        this._scrollToLatest(true);
      }, () => {
        if (this.avatar) this.avatar.setEmotion('idle');
        this.state.isThinking = false;
        this.state.isProcessingInput = false;
        if (st && this.state.isRunning) st.textContent = "👂 聴いてるニャ♪";
      });

    } else {
      const fb = "おやびん、もう一度ゆっくり話してニャン🐾";
      bubble.className = 'chat-bubble';
      bubble.textContent = fb;
      if (this.avatar) this.avatar.setEmotion('idle');
      this.state.isThinking = false;
      this.state.isProcessingInput = false;
      this.audio.speak(fb, null, () => {
        if (this.avatar) this.avatar.setEmotion('talking');
      }, () => {
        if (this.avatar) this.avatar.setEmotion('idle');
        if (st && this.state.isRunning) st.textContent = "👂 聴いてるニャ♪";
      });
    }
  },

  _updateModelBadge() {
    const badge = document.getElementById('model-badge');
    if (!badge) return;
    badge.className = "model-badge lite";
    badge.textContent = `🐾 3.5 Flash Lite`;
  },

  triggerActionVoice(shortPhrase, statusDisplay, cooldownMs = 350) {
    this.resetActivityTimer();
    this.audio.stopListening();
    this.audio.isActionButtonLocked = true;

    const feedbackPref = localStorage.getItem('kuro_button_feedback') || 'voice';
    const st = document.getElementById('status-text');
    if (st) st.textContent = statusDisplay;

    if (feedbackPref === 'mute') {
      this.audio.playEffect('aizuchi');
      setTimeout(() => {
        this.audio.isActionButtonLocked = false;
        if (st && this.state.isRunning) st.textContent = "👂 聴いてるニャ♪";
        if (this.state.isRunning) this.audio.startListening();
      }, 500);
      return;
    }

    this.audio.speak(shortPhrase, null, () => {
      if (this.avatar) this.avatar.setEmotion('talking');
    }, () => {
      if (this.avatar) this.avatar.setEmotion('idle');
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
      if (icon) icon.textContent = "👓";
      if (txt) txt.textContent = "おてつだい";
      if (speak) {
        this.triggerActionVoice("おまかせニャ！", "👓 おまかせニャ！", 400);
      }
    } else {
      if (icon) icon.textContent = "🐾";
      if (txt) txt.textContent = "なかよし";
      if (speak) {
        this.triggerActionVoice("あそぶニャ♪", "🐾 あそぶニャ♪", 400);
      }
    }
  },

  _bindBookStudioUI() {
    const modal = document.getElementById('book-studio-modal');
    const topDiaryBtn = document.getElementById('top-diary-btn');
    const btnClose = document.getElementById('btn-close-studio');
    const btnPrev = document.getElementById('btn-studio-prev-page');
    const btnNext = document.getElementById('btn-studio-next-page');
    const btnSaveExit = document.getElementById('btn-studio-save-exit');

    if (topDiaryBtn) {
      topDiaryBtn.onclick = () => {
        this.resetActivityTimer();
        this.audio.stopListening();
        this.audio.unlockMasterAudio();
        this.openBookStudio();
      };
    }

    if (btnClose && modal) {
      btnClose.onclick = () => {
        this.audio.stopReadingAloud();
        this.state.isDiaryReading = false;
        modal.classList.remove('is-open');
        if (this.state.isRunning) this.audio.startListening();
      };
    }

    if (btnPrev) {
      btnPrev.onclick = () => {
        this.audio.stopReadingAloud();
        this.state.isDiaryReading = false;
        if (this.state.studioDiaryPageIdx < this.state.studioDiaries.length - 1) {
          this.state.studioDiaryPageIdx++;
          this._renderStudioDiaryPage();
        }
      };
    }

    if (btnNext) {
      btnNext.onclick = () => {
        this.audio.stopReadingAloud();
        this.state.isDiaryReading = false;
        if (this.state.studioDiaryPageIdx > 0) {
          this.state.studioDiaryPageIdx--;
          this._renderStudioDiaryPage();
        }
      };
    }

    if (btnSaveExit) {
      btnSaveExit.onclick = () => {
        this.audio.stopReadingAloud();
        this.state.isDiaryReading = false;
        StorageManager.saveAllDiaries(this.state.studioDiaries);
        Toast.show("絵日記の変更を保存したニャン！📖✨", "success");
        this.audio.playEffect('purr');
        if (modal) modal.classList.remove('is-open');
        if (this.state.isRunning) this.audio.startListening();
      };
    }
  },

  openBookStudio() {
    const modal = document.getElementById('book-studio-modal');
    if (!modal) return;

    this.state.studioDiaries = JSON.parse(JSON.stringify(StorageManager.loadAllDiaries()));
    this.state.studioDiaryPageIdx = 0;
    this.state.isDiaryReading = false;

    this._renderStudioDiaryPage();
    modal.classList.add('is-open');
  },

  _renderStudioDiaryPage() {
    const pageContainer = document.getElementById('studio-diary-single-page');
    const pageIndicator = document.getElementById('studio-page-indicator');
    const btnPrev = document.getElementById('btn-studio-prev-page');
    const btnNext = document.getElementById('btn-studio-next-page');

    if (!pageContainer) return;
    const diaries = this.state.studioDiaries;

    if (diaries.length === 0) {
      pageContainer.innerHTML = `
        <div style="text-align:center;color:#9a3412;padding:45px 15px;font-size:13.5px;font-weight:700;line-height:1.8;">
          📖 まだ日記がありませんニャ🐾<br>
          「今日の日記書いて」と話しかけると、ここに1日1ページの絵日記が残るニャン！
        </div>
      `;
      if (pageIndicator) pageIndicator.textContent = "0 / 0 日目";
      if (btnPrev) btnPrev.disabled = true;
      if (btnNext) btnNext.disabled = true;
      return;
    }

    const curIdx = this.state.studioDiaryPageIdx;
    const diary = diaries[curIdx];

    if (pageIndicator) pageIndicator.textContent = `${curIdx + 1} / ${diaries.length} 日目（${curIdx === 0 ? '最新' : diary.fullDate}）`;
    if (btnPrev) btnPrev.disabled = (curIdx >= diaries.length - 1);
    if (btnNext) btnNext.disabled = (curIdx <= 0);

    const loveLetters = [
      "おやびん、今日も一日お疲れさまニャ！クロはずっと味方ニャよ♡",
      "今日もおやびんと一緒にいられて、クロは世界一幸せな猫ニャン🐾",
      "おやびんの笑顔がだいすきニャ！明日もいっぱいお話ししようニャ♪",
      "いつも優しくなでなでしてくれてありがとうニャン！大好きニャよ♡",
      "おやびんが頑張ってるの、クロはちゃんと見てるニャ！えらいニャ🐾"
    ];
    const letterIdx = Math.abs((diary.dateKey || "").split('-').reduce((acc, c) => acc + parseInt(c, 10), 0)) % loveLetters.length;
    const todayLetter = loveLetters[letterIdx];

    const photoPool = StorageManager.getDailyPhotoPool(diary.dateKey);
    const existingBase64Set = new Set(photoPool.map(p => p.base64));

    const dailyLogs = StorageManager.getDailyLogs(diary.dateKey);
    dailyLogs.forEach((l, idx) => {
      if (l.photoUrl && l.photoUrl.startsWith('data:image') && !existingBase64Set.has(l.photoUrl)) {
        photoPool.push({
          base64: l.photoUrl,
          comment: `写真 ${photoPool.length + 1}`,
          time: l.time || "00:00",
          timestamp: l.timestamp || Date.now()
        });
        existingBase64Set.add(l.photoUrl);
      }
    });

    if (diary.photo && !existingBase64Set.has(diary.photo)) {
      photoPool.unshift({
        base64: diary.photo,
        comment: "メイン写真",
        time: "00:00",
        timestamp: Date.now()
      });
    }

    let thumbnailsHtml = '';
    if (photoPool && photoPool.length > 0) {
      thumbnailsHtml = `
        <div class="snap-strip-container">
          <div class="snap-strip-header">
            <span>📷 今日の思い出スナップ（全${photoPool.length}枚 / タップでメイン写真に切替）:</span>
          </div>
          <div class="snap-thumbnails-row">
            ${photoPool.map((p, pIdx) => {
              const isSelected = (diary.photo && diary.photo === p.base64);
              return `
                <div class="snap-thumb-item ${isSelected ? 'is-selected' : ''}" data-photo-idx="${pIdx}" title="${p.comment || '写真 ' + (pIdx + 1)}">
                  <img src="${p.base64}" alt="スナップ" class="snap-thumb-img">
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    pageContainer.innerHTML = `
      <div class="book-page-sheet">
        <div class="book-page-ribbon">🐾 ${curIdx === 0 ? '最新の日記' : diary.fullDate}</div>
        
        <div class="book-page-header">
          <span class="book-date-title">📅 ${diary.fullDate}</span>
          <div class="book-meta-tags">
            <span class="book-meta-weather">🌤️ ${diary.weather || '快晴'}</span>
            <span class="book-meta-temp">🌡️ ${diary.temperature || '22'}℃</span>

            <button type="button" class="btn-read-aloud" id="btn-read-diary-aloud" title="クロちゃんの可愛い声でこの日記を聴くニャ！">
              <span id="read-aloud-icon">🔊</span>
              <span id="read-aloud-text">クロちゃんが読むニャ♪</span>
            </button>

            <button type="button" class="book-btn-del-entry" id="btn-del-cur-diary">🗑️ 削除</button>
          </div>
        </div>

        <div class="book-photo-frame" id="book-photo-box">
          ${diary.photo 
            ? `<img src="${diary.photo}" alt="散歩写真" class="book-photo-img">
               <button type="button" class="book-photo-remove-btn" id="btn-remove-photo">✕ 写真解除</button>`
            : `<div class="book-photo-placeholder">
                 <span style="font-size:24px;">🐾</span>
                 <span>📷 散歩写真フレーム</span>
                 <span style="font-size:11px;color:#94a3b8;">（撮影した写真がここに飾られますニャ！）</span>
               </div>`
          }
        </div>

        ${thumbnailsHtml}

        <div class="book-content-box">
          <label class="book-textarea-label">✍️ クロの日記本文（直接編集もできます）:</label>
          <textarea class="book-diary-textarea" id="studio-diary-content-input" rows="6">${diary.content}</textarea>
        </div>

        <div style="background:#fff7ed; border:1.5px dashed #fed7aa; border-radius:14px; padding:8px 12px; display:flex; flex-direction:column; gap:4px; margin-top:2px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:11px; font-weight:900; color:#c2410c;">🐾 今日の仲良し度スタンプ:</span>
            <span style="font-size:13px; letter-spacing:2px;">🐾🐾🐾🐾🐾</span>
          </div>
          <div style="font-size:11.5px; color:#7c2d12; font-weight:700; line-height:1.4;">
            💌 <b>クロからのひとこと:</b> 「${todayLetter}」
          </div>
        </div>
      </div>
    `;

    pageContainer.querySelectorAll('.snap-thumb-item').forEach(thumb => {
      thumb.onclick = () => {
        const pIdx = parseInt(thumb.dataset.photoIdx, 10);
        if (photoPool[pIdx]) {
          diaries[curIdx].photo = photoPool[pIdx].base64;
          this.audio.playEffect('aizuchi');
          this._renderStudioDiaryPage();
        }
      };
    });

    const textInput = document.getElementById('studio-diary-content-input');
    if (textInput) {
      textInput.oninput = (e) => {
        diaries[curIdx].content = e.target.value.trim();
      };
    }

    const btnRemovePhoto = document.getElementById('btn-remove-photo');
    if (btnRemovePhoto) {
      btnRemovePhoto.onclick = () => {
        const isOk = window.confirm("この写真を日記から解除しますかニャ？");
        if (isOk) {
          diaries[curIdx].photo = null;
          this._renderStudioDiaryPage();
        }
      };
    }

    const btnDelDiary = document.getElementById('btn-del-cur-diary');
    if (btnDelDiary) {
      btnDelDiary.onclick = () => {
        if (window.confirm(`${diary.fullDate} の日記を削除してよろしいですかニャ？`)) {
          this.audio.stopReadingAloud();
          diaries.splice(curIdx, 1);
          if (this.state.studioDiaryPageIdx >= diaries.length) {
            this.state.studioDiaryPageIdx = Math.max(0, diaries.length - 1);
          }
          this._renderStudioDiaryPage();
        }
      };
    }

    const btnRead = document.getElementById('btn-read-diary-aloud');
    if (btnRead) {
      btnRead.onclick = () => {
        if (this.state.isDiaryReading) {
          this.audio.stopReadingAloud();
          this.state.isDiaryReading = false;
          this._updateDiaryReadBtnUI(false);
        } else {
          this.state.isDiaryReading = true;
          this._updateDiaryReadBtnUI(true);

          this.audio.readDiarySeamless(
            diary.content,
            null,
            (idx, sentence) => {
              Logger.log(`[本文朗読中] (${idx + 1}) ${sentence}`, "info");
            },
            () => {
              this.state.isDiaryReading = false;
              this._updateDiaryReadBtnUI(false);
            }
          );
        }
      };
    }
  },

  _updateDiaryReadBtnUI(isPlaying) {
    const btn = document.getElementById('btn-read-diary-aloud');
    const icon = document.getElementById('read-aloud-icon');
    const txt = document.getElementById('read-aloud-text');
    if (!btn) return;

    if (isPlaying) {
      btn.classList.add('is-reading');
      if (icon) icon.textContent = "🛑";
      if (txt) txt.textContent = "朗読ストップ";
    } else {
      btn.classList.remove('is-reading');
      if (icon) icon.textContent = "🔊";
      if (txt) txt.textContent = "クロちゃんが読むニャ♪";
    }
  },

  _bindGlassesAdjusterUI() {
    const modal = document.getElementById('glasses-adjust-modal');
    const previewImg = document.getElementById('adjust-cat-img');
    const previewAcc = document.getElementById('adjust-glasses-overlay');
    const slX = document.getElementById('adj-x');
    const slY = document.getElementById('adj-y');
    const slScale = document.getElementById('adj-scale');
    const slRotate = document.getElementById('adj-rotate');
    const valX = document.getElementById('adj-x-val');
    const valY = document.getElementById('adj-y-val');
    const valScale = document.getElementById('adj-scale-val');
    const valRotate = document.getElementById('adj-rotate-val');

    if (!modal || !slX) return;

    const updateSliders = (tab) => {
      const c = this.avatar?.glassesCoords[tab] || { x: 0, y: 120, scale: 1.0, rotate: 0 };
      slX.value = c.x; slY.value = c.y; slScale.value = c.scale; slRotate.value = c.rotate;
      if (valX) valX.textContent = c.x;
      if (valY) valY.textContent = c.y;
      if (valScale) valScale.textContent = parseFloat(c.scale).toFixed(2);
      if (valRotate) valRotate.textContent = `${c.rotate}°`;
      if (previewAcc) {
        previewAcc.style.bottom = `${c.y}px`;
        previewAcc.style.left = `calc(50% + ${c.x}px)`;
        previewAcc.style.transform = `translateX(-50%) scale(${c.scale}) rotate(${c.rotate}deg)`;
      }
    };

    const onInput = () => {
      const c = { x: parseInt(slX.value, 10), y: parseInt(slY.value, 10), scale: parseFloat(slScale.value), rotate: parseInt(slRotate.value, 10) };
      if (this.avatar) {
        this.avatar.glassesCoords[this.state.activeAdjustTab] = c;
        this.avatar.applyAllFramesTransform();
      }
      if (valX) valX.textContent = c.x;
      if (valY) valY.textContent = c.y;
      if (valScale) valScale.textContent = c.scale.toFixed(2);
      if (valRotate) valRotate.textContent = `${c.rotate}°`;
      if (previewAcc) {
        previewAcc.style.bottom = `${c.y}px`;
        previewAcc.style.left = `calc(50% + ${c.x}px)`;
        previewAcc.style.transform = `translateX(-50%) scale(${c.scale}) rotate(${c.rotate}deg)`;
      }
    };

    [slX, slY, slScale, slRotate].forEach(el => el?.addEventListener('input', onInput));

    document.querySelectorAll('.adjust-tab-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.adjust-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        this.state.activeAdjustTab = tab;
        if (previewImg) previewImg.src = `${tab}.jpg`;
        updateSliders(tab);
      };
    });

    const openAdjustBtn = document.getElementById('open-glasses-adjust-btn');
    if (openAdjustBtn) {
      openAdjustBtn.onclick = () => {
        this.audio.stopListening();
        document.getElementById('modal-overlay').style.display = 'none';
        modal.classList.add('is-open');
        updateSliders(this.state.activeAdjustTab);
      };
    }

    const closeAdjustBtn = document.getElementById('close-adjust-btn');
    if (closeAdjustBtn) {
      closeAdjustBtn.onclick = () => {
        modal.classList.remove('is-open');
        if (this.avatar) StorageManager.saveGlassesCoords(this.avatar.glassesCoords);
        if (this.state.isRunning) this.audio.startListening();
      };
    }

    const btnSaveAdjust = document.getElementById('btn-adjust-save');
    if (btnSaveAdjust) {
      btnSaveAdjust.onclick = () => {
        if (this.avatar) StorageManager.saveGlassesCoords(this.avatar.glassesCoords);
        this.audio.playEffect('happy_meow');
        Toast.show("メガネ・帽子位置をバッチリ保存したニャン！👓✨", "success");
      };
    }

    const btnResetAdjust = document.getElementById('btn-adjust-reset');
    if (btnResetAdjust) {
      btnResetAdjust.onclick = () => {
        const def = StorageManager.defaultGlassesCoords[this.state.activeAdjustTab];
        if (this.avatar) {
          this.avatar.glassesCoords[this.state.activeAdjustTab] = JSON.parse(JSON.stringify(def));
          this.avatar.applyAllFramesTransform();
        }
        updateSliders(this.state.activeAdjustTab);
      };
    }
  },

  _bindEyelidSettingsUI() {
    const slY = document.getElementById('adj-eyelid-y');
    const slX = document.getElementById('adj-eyelid-x');
    const slGap = document.getElementById('adj-eyelid-gap');
    const slSize = document.getElementById('adj-eyelid-size');
    const valY = document.getElementById('adj-eyelid-y-val');
    const valX = document.getElementById('adj-eyelid-x-val');
    const valGap = document.getElementById('adj-eyelid-gap-val');
    const valSize = document.getElementById('adj-eyelid-size-val');
    const btnSave = document.getElementById('btn-save-eyelid-settings');

    if (!slY || !btnSave) return;

    const c = StorageManager.loadEyelidCoords();
    slY.value = c.y; slX.value = c.x; slGap.value = c.gap; slSize.value = c.size;
    if (valY) valY.textContent = c.y;
    if (valX) valX.textContent = c.x;
    if (valGap) valGap.textContent = c.gap;
    if (valSize) valSize.textContent = c.size;

    const onEyelidInput = () => {
      const newCoords = {
        y: parseInt(slY.value, 10),
        x: parseInt(slX.value, 10),
        gap: parseInt(slGap.value, 10),
        size: parseInt(slSize.value, 10)
      };
      if (valY) valY.textContent = newCoords.y;
      if (valX) valX.textContent = newCoords.x;
      if (valGap) valGap.textContent = newCoords.gap;
      if (valSize) valSize.textContent = newCoords.size;

      if (this.avatar) {
        this.avatar.eyelidCoords = newCoords;
        this.avatar.applyEyelidTransforms();
      }
    };

    [slY, slX, slGap, slSize].forEach(el => el?.addEventListener('input', onEyelidInput));

    btnSave.onclick = () => {
      const toSave = {
        y: parseInt(slY.value, 10),
        x: parseInt(slX.value, 10),
        gap: parseInt(slGap.value, 10),
        size: parseInt(slSize.value, 10)
      };
      StorageManager.saveEyelidCoords(toSave);
      if (this.avatar) {
        this.avatar.eyelidCoords = toSave;
        this.avatar.applyEyelidTransforms();
      }
      this.audio.playEffect('purr');
      Toast.show("瞳・まぶた位置を永久固定保存したニャン！👁️✨", "success");
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
            <input type="text" class="memory-edit-input" id="edit-val-${idx}" value="${mem.replace(/"/g, '&quot;')}">
            <button class="mem-btn-save" id="btn-save-${idx}">💾</button>
            <button class="mem-btn-cancel" id="btn-cancel-${idx}">✕</button>
          </div>
        `;
        setTimeout(() => { document.getElementById(`edit-val-${idx}`)?.focus(); }, 30);
        item.querySelector(`#btn-save-${idx}`).onclick = () => {
          const val = document.getElementById(`edit-val-${idx}`).value.trim();
          if (val) {
            this.memories[idx] = val;
            StorageManager.saveMemories(this.memories);
          }
          this.state.editingMemoryIdx = null;
          this._renderMemories();
        };
        item.querySelector(`#btn-cancel-${idx}`).onclick = () => {
          this.state.editingMemoryIdx = null;
          this._renderMemories();
        };
      } else {
        item.innerHTML = `
          <div class="memory-text-view">📌 ${mem}</div>
          <div class="memory-actions">
            <button class="mem-btn mem-btn-edit" data-edit="${idx}">✏️</button>
            <button class="mem-btn mem-btn-del" data-del="${idx}">🗑️</button>
          </div>
        `;
        item.querySelector(`[data-edit="${idx}"]`).onclick = () => {
          this.state.editingMemoryIdx = idx;
          this._renderMemories();
        };
        item.querySelector(`[data-del="${idx}"]`).onclick = () => {
          if (window.confirm(`「${mem}」をクロの記憶帳から削除するニャ？`)) {
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
    const forceReload = () => this.forceRefreshApp();
    const btnForce = document.getElementById('force-refresh-btn');
    const btnDiagForce = document.getElementById('diag-force-reload-btn');
    if (btnForce) btnForce.onclick = forceReload;
    if (btnDiagForce) btnDiagForce.onclick = forceReload;

    // ★ 重複写真スリム化ボタンの処理
    const btnPurgeStorage = document.getElementById('btn-purge-storage');
    if (btnPurgeStorage) {
      btnPurgeStorage.onclick = async () => {
        const isOk = window.confirm(
          "【安心お掃除の確認】\n\n" +
          "・日記の文章やクロの記憶帳は1文字も消えません。\n" +
          "・日記の写真も綺麗なまま約20KBに超軽量再圧縮して残します。\n" +
          "・重複していた余分な画像データだけをお掃除して空き容量を一気に増やします。\n\n" +
          "スリム化を実行しますかニャ？🐾"
        );
        if (!isOk) return;

        btnPurgeStorage.disabled = true;
        btnPurgeStorage.innerHTML = `<span>⏳</span><span>お掃除＆スリム化中ニャ…</span>`;
        Toast.show("重複写真をお掃除＆スマート再圧縮中ニャ…🧹✨", "info", 5000);

        try {
          await StorageManager.purgeAndCompressAllPhotos();
          this._updateStorageMonitorUI();
          this.audio.playEffect('purr');
          Toast.show("スリム化大成功ニャ！空き容量がグーンと増えたニャン！🎉", "success", 4000);
          this.triggerActionVoice("バッチリニャ！", "🧹 スリム化完了ニャ！", 400);
        } catch(err) {
          Toast.show(`お掃除中にエラーが発生しました: ${err.message}`, "error");
        } finally {
          btnPurgeStorage.disabled = false;
          btnPurgeStorage.innerHTML = `<span>🧹</span><span>重複写真をお掃除してスリム化するニャ！</span>`;
        }
      };
    }

    const btnDownloadBackup = document.getElementById('btn-download-backup');
    if (btnDownloadBackup) {
      btnDownloadBackup.onclick = () => {
        this.resetActivityTimer();
        StorageManager.downloadDataPackage();
        Toast.show("日時付きバックアップファイルを保存したニャ！📁✨", "success");
      };
    }

    const fileInputRestore = document.getElementById('file-input-restore');
    const btnTriggerRestore = document.getElementById('btn-trigger-restore');

    if (btnTriggerRestore && fileInputRestore) {
      btnTriggerRestore.onclick = () => fileInputRestore.click();

      fileInputRestore.onchange = (e) => {
        this.resetActivityTimer();
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const data = JSON.parse(event.target.result);
            StorageManager.importAndReplaceDataPackage(data);

            this.memories = StorageManager.loadMemories(CHARACTER_CONFIG.defaultMemories);
            this._renderMemories();
            this._restoreTimelineHistory();
            this._updateStorageMonitorUI();

            const savedTimerSound = localStorage.getItem('kuro_timer_sound') || 'bell';
            const tsSelect = document.getElementById('timer-sound-select');
            if (tsSelect) tsSelect.value = savedTimerSound;

            if (this.avatar) {
              this.avatar.glassesCoords = StorageManager.loadGlassesCoords();
              this.avatar.eyelidCoords = StorageManager.loadEyelidCoords();
              this.avatar.applyAllFramesTransform();
              this.avatar.applyEyelidTransforms();
            }

            Toast.show("ファイルから全データを最新更新したニャン！🎉", "success");
            this.audio.playEffect('purr');
            this.triggerActionVoice("おやびん、データを受け取ったニャン！", "📁 データ復元完了！", 400);
          } catch(err) {
            Toast.show("ファイルの読み込みに失敗しましたニャ: " + err.message, "error");
          }
        };
        reader.readAsText(file);
        fileInputRestore.value = '';
      };
    }

    const btnClearDisplay = document.getElementById('btn-clear-chat-display');
    if (btnClearDisplay) {
      btnClearDisplay.onclick = () => {
        const isOk = window.confirm("画面の会話表示をお掃除してスッキリさせますかニャ？\n（※内部の日記データや記憶帳は消えずに安全キープされます）");
        if (isOk) {
          StorageManager.clearTimelineDisplayOnly();
          this._restoreTimelineHistory();
          Toast.show("画面の会話表示をスッキリお掃除したニャ！🧹✨", "success");
        }
      };
    }

    const btnTestModels = document.getElementById('diag-test-models-btn');
    if (btnTestModels) {
      btnTestModels.onclick = async () => {
        Toast.show("最速Liteモデル検証中ニャ…", "info");
        const key = this.ai.apiKey;
        if (!key) {
          Toast.show("APIキーが設定されていませんニャ", "error");
          return;
        }

        const candidates = FIXED_LITE_MODELS;
        for (const m of candidates) {
          try {
            const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ parts: [{ text: "ニャ" }] }] })
            });
            if (r.ok) {
              Logger.log(`[Lite導通確認OK⚡] モデル「${m}」は正常に会話可能ニャ！`, "success");
            } else {
              Logger.log(`[Lite導通確認] モデル「${m}」HTTP ${r.status}`, "warn");
            }
          } catch(e) {
            Logger.log(`[Lite導通確認例外] ${m}: ${e.message}`, "error");
          }
        }
        Toast.show("Lite検証完了！ログを確認してニャ🐾", "success");
      };
    }

    const btnCopyEvidence = document.getElementById('diag-copy-evidence-btn');
    if (btnCopyEvidence) {
      btnCopyEvidence.onclick = () => {
        const text = Logger.getEvidenceText();
        if (!text) {
          Toast.show("コピーするログがありませんニャ", "error");
          return;
        }
        navigator.clipboard.writeText(text).then(() => {
          Toast.show("ログ全文をコピーしたニャ！📋✨", "success");
        }).catch(() => {
          Toast.show("手動でコピーしてニャ🐾", "error");
        });
      };
    }

    const snackBtn = document.getElementById('snack-btn');
    if (snackBtn) {
      snackBtn.onclick = (e) => {
        e.stopPropagation();
        this.resetActivityTimer();
        this.audio.stopListening();
        this.audio.isActionButtonLocked = true;
        this.audio.unlockMasterAudio();

        this.state.snackCount++;
        this.audio.playEffect('snack');
        if (this.avatar) this.avatar.setEmotion('happy');

        if (this.state.snackCount >= 3) {
          this.state.snackCount = 0;
          this.audio.playEffect('purr');
          const msg = "ハフハフ…うまうまニャ！お腹いっぱい大満足ニャ〜極楽ニャン♡";
          this.audio.speak(msg, null, () => {
            this.renderBubble('model', msg);
            StorageManager.appendChatLog('model', msg);
            if (this.avatar) this.avatar.setEmotion('talking');
          }, () => {
            if (this.avatar) this.avatar.setEmotion('idle');
            this.audio.isActionButtonLocked = false;
          }, 450);
        } else {
          const reps = ["もぐもぐ…ちゅ〜る最高ニャ！🐟", "うまうまニャン！おかわり希望ニャ🐾"];
          const r = reps[Math.floor(Math.random() * reps.length)];
          this.audio.speak(r, null, () => {
            this.renderBubble('model', r);
            StorageManager.appendChatLog('model', r);
            if (this.avatar) this.avatar.setEmotion('talking');
          }, () => {
            if (this.avatar) this.avatar.setEmotion('idle');
            this.audio.isActionButtonLocked = false;
          }, 450);
        }
      };
    }

    const transformBtn = document.getElementById('transform-btn');
    if (transformBtn) {
      transformBtn.onclick = (e) => {
        e.stopPropagation();
        this.resetActivityTimer();
        this.audio.unlockMasterAudio();
        this.audio.playEffect('poof');
        if (this.avatar) {
          this.avatar.triggerPoofSmoke();
          const next = (this.avatar.mode === 'vector') ? 'real' : 'vector';
          this.avatar.applyMode(next);
          Toast.show(`姿を変身したニャ！✨（${next === 'real' ? 'リアル写真' : 'イラスト'}）`, 'info');
        }
      };
    }

    const modeBtn = document.getElementById('mode-toggle-btn');
    if (modeBtn) {
      modeBtn.onclick = () => {
        this.state.isAssistantMode = !this.state.isAssistantMode;
        localStorage.setItem('kuro_mode', this.state.isAssistantMode ? 'assistant' : 'pet');
        this._updateModeUI(true);
      };
    }

    const stopBtn = document.getElementById('stop-action-btn');
    if (stopBtn) {
      stopBtn.onclick = () => {
        this.resetActivityTimer();
        this.audio.stopReadingAloud();
        this.audio.stopSpeaking();
        this.state.isThinking = false;
        this.state.isProcessingInput = false;
        this.state.isDiaryProcessing = false;
        this.state.isDiaryReading = false;
        this._updateDiaryReadBtnUI(false);
        if (this.avatar) this.avatar.setEmotion('idle');
        this.triggerActionVoice("はーい！", "🛑 はーい！", 400);
      };
    }

    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) {
      pauseBtn.onclick = () => {
        this.resetActivityTimer();
        this.state.isRunning = !this.state.isRunning;
        const icon = document.getElementById('pause-icon');
        const txt = document.getElementById('pause-text');
        const wrap = document.getElementById('avatar-wrapper');

        if (!this.state.isRunning) {
          pauseBtn.classList.add('is-paused');
          if (icon) icon.textContent = "🛑";
          if (txt) txt.textContent = "お休み中";

          this.audio.stopListening();
          this.audio.stopReadingAloud();
          this.audio.stopSpeaking();

          if (this.avatar) {
            this.avatar.triggerYawn();
          }

          setTimeout(() => {
            if (wrap) wrap.classList.add('is-sleeping');
            this.renderBubble('model', "お昼寝するニャ…💤（すやすや…）");
            const st = document.getElementById('status-text');
            if (st) st.textContent = "💤 すやすやお昼寝中…";
          }, 450);

        } else {
          pauseBtn.classList.remove('is-paused');
          if (icon) icon.textContent = "🟢";
          if (txt) txt.textContent = "会話中";
          if (wrap) wrap.classList.remove('is-sleeping');

          this.renderBubble('model', "起きたニャ！呼んでニャ🐾");
          const st = document.getElementById('status-text');
          if (st) st.textContent = "👂 聴いてるニャ♪";
          this.audio.startListening();
        }
      };
    }

    const avatarWrapper = document.getElementById('avatar-wrapper');
    if (avatarWrapper) {
      avatarWrapper.onclick = (e) => {
        if (e.target.closest('#transform-btn') || e.target.closest('#snack-btn') || e.target.closest('#photo-action-btn') || e.target.closest('#kitchen-timer-widget')) return;
        this.resetActivityTimer();
        this.audio.unlockMasterAudio();

        const rect = avatarWrapper.getBoundingClientRect();
        const clickY = e.clientY - rect.top;
        const ratio = clickY / rect.height;

        const st = document.getElementById('status-text');

        if (this.avatar) {
          this.avatar.triggerTouchHeart();
        }

        if (ratio < 0.35) {
          this.audio.playEffect('happy_meow');
          if (st) st.textContent = "💖 お耳なでなで、うっとりニャ…";
          Toast.show("お耳をなでなでされて目を細めてるニャン…♡", "success", 2000);
        } else if (ratio < 0.70) {
          this.audio.playEffect('purr');
          if (st) st.textContent = "😻 あご下最高ニャ〜極楽ニャン♡";
          Toast.show("あご下を撫でられて喉をゴロゴロ鳴らしてるニャ♪", "success", 2000);
        } else {
          this.audio.playEffect('aizuchi');
          if (st) st.textContent = "🐾 こそばゆいニャ〜！くすぐったいニャ！";
          Toast.show("お腹をくすぐられてジタバタ喜んでるニャン！🐾", "info", 2000);
        }

        if (this.avatar) {
          this.avatar.setEmotion('happy');
          setTimeout(() => {
            if (!this.audio.isSpeaking && !this.audio.isReadingAloud) {
              this.avatar.setEmotion('idle');
              if (st && this.state.isRunning) st.textContent = "👂 聴いてるニャ♪";
            }
          }, 1500);
        }
      };
    }

    const speakerSelect = document.getElementById('voice-speaker-select');
    if (speakerSelect) {
      speakerSelect.onchange = (e) => {
        const newSp = parseInt(e.target.value, 10);
        this.audio.prefetchVoice("おやびん、わたしはクロだニャン🐾", newSp);
        this.audio.preloadAllFillers(newSp);
      };
    }

    const voiceTestBtn = document.getElementById('test-voice-btn');
    if (voiceTestBtn) {
      voiceTestBtn.onclick = () => {
        this.resetActivityTimer();
        this.audio.stopListening();
        this.audio.isActionButtonLocked = true;
        this.audio.unlockMasterAudio();
        const selSp = parseInt(document.getElementById('voice-speaker-select')?.value || '10', 10);
        this.audio.speak("おやびん、わたしはクロだニャン🐾", selSp, () => {
          if (this.avatar) this.avatar.setEmotion('talking');
        }, () => {
          if (this.avatar) this.avatar.setEmotion('idle');
          this.audio.isActionButtonLocked = false;
        }, 400);
      };
    }

    const timerSoundTestBtn = document.getElementById('test-timer-sound-btn');
    if (timerSoundTestBtn) {
      timerSoundTestBtn.onclick = () => {
        this.resetActivityTimer();
        this.audio.stopListening();
        this.audio.unlockMasterAudio();
        const soundType = document.getElementById('timer-sound-select')?.value || 'bell';
        this.audio.playEffect(soundType);
      };
    }

    const voiceRateInput = document.getElementById('voice-rate');
    if (voiceRateInput) {
      voiceRateInput.oninput = (e) => {
        const r = parseFloat(e.target.value);
        this.audio.setRate(r);
        const rd = document.getElementById('rate-val');
        if (rd) rd.textContent = r.toFixed(2);
      };
    }

    const btnGetHome = document.getElementById('btn-get-current-home');
    if (btnGetHome) {
      btnGetHome.onclick = () => {
        if (!('geolocation' in navigator)) {
          Toast.show("端末の位置情報機能がオフになっていますニャ", "error");
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const val = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
            const inp = document.getElementById('home-coords-input');
            if (inp) inp.value = val;
            LocationProvider.homeLat = pos.coords.latitude;
            LocationProvider.homeLon = pos.coords.longitude;
            LocationProvider.isAtHome = true;
            Toast.show(`現在地をお家にセットしたニャ！(${val})`, "success");
          },
          (err) => {
            Toast.show(`現在地を取得できませんでした: ${err.message}`, "error");
          },
          { enableHighAccuracy: true, timeout: 8000 }
        );
      };
    }

    const btnCopyHome = document.getElementById('btn-copy-home-coords');
    if (btnCopyHome) {
      btnCopyHome.onclick = () => {
        const val = document.getElementById('home-coords-input')?.value.trim();
        if (!val) {
          Toast.show("コピーする座標がありませんニャ", "error");
          return;
        }
        navigator.clipboard.writeText(val).then(() => {
          Toast.show("座標をクリップボードにコピーしたニャ！PCに貼り付けてニャ🐾", "success");
        }).catch(() => {
          Toast.show("手動でコピーしてニャ🐾", "error");
        });
      };
    }

    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
      settingsBtn.onclick = () => {
        this.resetActivityTimer();
        this.audio.stopListening();

        const ak = document.getElementById('api-key-input');
        const vk = document.getElementById('voicevox-key-input');
        const as = document.getElementById('accessory-style-select');
        const vs = document.getElementById('voice-speaker-select');
        const vr = document.getElementById('voice-rate');
        const rv = document.getElementById('rate-val');
        const hc = document.getElementById('home-coords-input');
        const fb = document.getElementById('button-feedback-select');
        const ts = document.getElementById('timer-sound-select');

        if (ak) ak.value = this.ai.apiKey;
        if (vk) vk.value = localStorage.getItem('kuro_voicevox_key') || '';
        if (as && this.avatar) as.value = this.avatar.accessoryStyle;
        if (vs) vs.value = this.getSpeakerId();
        if (vr) vr.value = this.audio.rate;
        if (rv) rv.textContent = this.audio.rate.toFixed(2);
        if (hc) hc.value = localStorage.getItem('kuro_home_coords') || '';
        if (fb) fb.value = localStorage.getItem('kuro_button_feedback') || 'voice';
        if (ts) ts.value = this.getTimerSound();

        this._renderMemories();
        this._updateStorageMonitorUI();

        if (typeof VersionManager !== 'undefined') {
          VersionManager.applyToDOM();
        }

        const mo = document.getElementById('modal-overlay');
        if (mo) mo.style.display = 'flex';
      };
    }

    const modalOverlay = document.getElementById('modal-overlay');
    if (modalOverlay) {
      modalOverlay.onclick = (e) => {
        if (e.target.id === 'modal-overlay') {
          modalOverlay.style.display = 'none';
          setTimeout(() => { if (this.state.isRunning) this.audio.startListening(); }, 150);
        }
      };
    }

    const saveSettingsBtn = document.getElementById('save-settings-btn');
    if (saveSettingsBtn) {
      saveSettingsBtn.onclick = async () => {
        this.resetActivityTimer();
        this.audio.stopListening();
        this.audio.isActionButtonLocked = true;
        this.audio.unlockMasterAudio();

        const btn = saveSettingsBtn;
        const btnIcon = document.getElementById('save-btn-icon');
        const btnText = document.getElementById('save-btn-text');
        const apiInput = document.getElementById('api-key-input');
        const vvInput = document.getElementById('voicevox-key-input');

        apiInput?.classList.remove('input-error-shake');
        vvInput?.classList.remove('input-error-shake');

        const newApiKey = apiInput?.value.trim() || '';
        const newVvKey = vvInput?.value.trim() || '';
        const newAccStyle = document.getElementById('accessory-style-select')?.value || 'both';
        const newSpeaker = document.getElementById('voice-speaker-select')?.value || '10';
        const newRate = parseFloat(document.getElementById('voice-rate')?.value || '1.05');
        const newFeedback = document.getElementById('button-feedback-select')?.value || 'voice';
        const newTimerSound = document.getElementById('timer-sound-select')?.value || 'bell';
        const newNews = document.getElementById('news-count-select')?.value || '2';
        const newSpot = document.getElementById('spot-count-select')?.value || '2';
        const newHome = document.getElementById('home-coords-input')?.value.trim() || '';

        btn.classList.add('is-saving');
        if (btnIcon) btnIcon.innerHTML = `<div class="spinner"></div>`;
        if (btnText) btnText.textContent = "キーを確認中ニャ…";

        if (newApiKey) {
          try {
            const testRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${newApiKey}`);
            if (!testRes.ok) throw new Error("無効なGoogleキー");
          } catch(e) {
            btn.classList.remove('is-saving');
            if (btnIcon) btnIcon.textContent = "⚠️";
            if (btnText) btnText.textContent = "保存できませんでした";
            apiInput?.classList.add('input-error-shake');
            Toast.show("Google APIキーが間違っているニャ！再確認してニャ🐾", "error");
            this.audio.isActionButtonLocked = false;
            return;
          }
        }

        if (newVvKey) {
          try {
            const vvRes = await fetch(`https://api.tts.quest/v3/voicevox/synthesis?text=%E3%83%8B%E3%83%A3&speaker=10&key=${encodeURIComponent(newVvKey)}`);
            if (vvRes.ok) {
              const vvData = await vvRes.json();
              if (vvData.isAudioError) throw new Error("無効なVoiceVoxキー");
            } else {
              throw new Error("無効なVoiceVoxキー");
            }
          } catch(e) {
            btn.classList.remove('is-saving');
            if (btnIcon) btnIcon.textContent = "⚠️";
            if (btnText) btnText.textContent = "保存できませんでした";
            vvInput?.classList.add('input-error-shake');
            Toast.show("VoiceVoxキーが無効ニャ！空欄にするか正しいキーを入れてニャ🐾", "error");
            this.audio.isActionButtonLocked = false;
            return;
          }
        }

        this.ai.apiKey = newApiKey;
        localStorage.setItem('kuro_api_key', newApiKey);
        localStorage.setItem('kuro_voicevox_key', newVvKey);
        localStorage.setItem('kuro_voice_speaker_id', newSpeaker);
        localStorage.setItem('kuro_button_feedback', newFeedback);
        localStorage.setItem('kuro_timer_sound', newTimerSound);
        localStorage.setItem('kuro_news_count', newNews);
        localStorage.setItem('kuro_spot_count', newSpot);
        localStorage.setItem('kuro_home_coords', newHome);

        this.audio.setRate(newRate);
        if (this.avatar) this.avatar.applyAccessoryStyle(newAccStyle);

        LocationProvider._applyHomeFallback();

        btn.classList.remove('is-saving');
        btn.classList.add('is-success');
        if (btnIcon) btnIcon.textContent = "✅";

        let successMessage = "✅ 設定バッチリ保存したニャン♪";
        if (newApiKey && newVvKey) {
          successMessage = "Google AI & VoiceVox ともに接続OKニャン♪";
        } else if (newApiKey) {
          successMessage = "Google AI接続OKニャン♪（音声は無料共有枠）";
        }
        if (btnText) btnText.textContent = successMessage;

        setTimeout(() => {
          if (modalOverlay) modalOverlay.style.display = 'none';
          btn.classList.remove('is-success');
          if (btnIcon) btnIcon.textContent = "💾";
          if (btnText) btnText.textContent = "設定と記憶を保存するニャン♪";
          Toast.show(successMessage, "success");
          this.triggerActionVoice("バッチリニャ！", "💾 バッチリニャ！", 500);
        }, 1000);
      };
    }

    const addMemoryBtn = document.getElementById('add-memory-btn');
    if (addMemoryBtn) {
      addMemoryBtn.onclick = () => {
        const inp = document.getElementById('new-memory-input');
        const val = inp?.value.trim();
        if (val) {
          this.memories.unshift(val);
          StorageManager.saveMemories(this.memories);
          inp.value = '';
          this._renderMemories();
        }
      };
    }

    const openDiagBtn = document.getElementById('open-diag-modal-btn');
    if (openDiagBtn) {
      openDiagBtn.onclick = () => {
        this.resetActivityTimer();
        this.audio.stopListening();
        if (modalOverlay) modalOverlay.style.display = 'none';
        document.getElementById('diag-panel')?.classList.add('expanded');
      };
    }
    const closeDiagBtn = document.getElementById('diag-close-btn');
    if (closeDiagBtn) {
      closeDiagBtn.onclick = () => {
        document.getElementById('diag-panel')?.classList.remove('expanded');
        if (this.state.isRunning) this.audio.startListening();
      };
    }
  }
};

window.addEventListener('load', () => AppCore.init());


