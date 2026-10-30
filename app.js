/* ==========================================================================
   AIペット クロちゃん🐾 対話エンジン＆システムロジック（app.js 完全版）
   - PC・大画面専用 記憶＆日記エディター搭載
   - 安全ファイル書き出し＆読み込み（JSONファイル連携）
   - 即時肉声相槌エンジン（沈黙ゼロ・間延び防止改善B）
   - 記憶帳の完全安全マージ＆救済復旧
   - 4重安全ガード搭載（生ログ不変保護・独立日記金庫）
   - 500文字要約日記＆オンデマンド昔話引き出しロジック
   - Gemini 3.5 Flash Lite 専用（gemini-3.8-flash 完全除外・禁止）
   - VOICEVOX 音声・文字完全同期
   ========================================================================== */

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
   ★ MODULE 1: 音声合成＆音声認識（VOICEVOX ＆ 声と文字の完全同期）
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
    this.recognition = null;
    this.isSpeechCommitted = false;
    this.lastRecognizedText = '';
    this.silenceTimeout = null;
    this.watchdogInterval = null;

    this.fixedPhraseMap = new Map();
    this.recentSpokenTexts = [];
    this.lastSpeechEndTime = 0;
    this.lastVoicevoxRequestTime = 0;
    this.currentAbortController = null;

    this.onInterimUpdate = null;
    this.onSpeechFinal = null;
    this.onListeningStatus = null;
    this.onBargeIn = null;

    this._setupRecognition();
    this._setupInteractionUnlock();
    this._startWatchdog();
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
      oscBase.frequency.setValueAtTime(88, now);
      oscBase.frequency.linearRampToValueAtTime(105, now + 0.35);
      oscBase.frequency.linearRampToValueAtTime(84, now + 0.75);

      oscSub.type = 'sine';
      oscSub.frequency.setValueAtTime(176, now);
      oscSub.frequency.linearRampToValueAtTime(210, now + 0.35);
      oscSub.frequency.linearRampToValueAtTime(168, now + 0.75);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(260, now);

      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(25, now);
      lfoGain.gain.setValueAtTime(0.35, now);

      mainGain.gain.setValueAtTime(0, now);
      mainGain.gain.linearRampToValueAtTime(0.42, now + 0.12);
      mainGain.gain.linearRampToValueAtTime(0.35, now + 0.45);
      mainGain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

      lfo.connect(mainGain.gain);
      oscBase.connect(filter);
      oscSub.connect(filter);
      filter.connect(mainGain);
      mainGain.connect(ctx.destination);

      lfo.start(now); lfo.stop(now + 0.85);
      oscBase.start(now); oscBase.stop(now + 0.85);
      oscSub.start(now); oscSub.stop(now + 0.85);

      if ('vibrate' in navigator) {
        try { navigator.vibrate([40, 50, 40, 50, 40]); } catch(e) {}
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
      [0, 0.25, 0.5].forEach(delay => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1320, now + delay);
        gain.gain.setValueAtTime(0.4, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.3);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now + delay); osc.stop(now + delay + 0.3);
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

  _convertAllNumbersToKana(text) {
    if (!text) return "";
    let t = text.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
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
    this._getVoicevoxDirectUrl(text, speakerId).then(audioUrl => {
      this.fixedPhraseMap.set(`${speakerId}_${text}`, audioUrl);
      Logger.log(`[定型肉声キャッシュ完了] ${text}`, "info");
    }).catch(() => {});
  }

  preloadAllFillers(speakerId) {
    const fillers = [
      "そうニャね♪",
      "えーっとニャ…",
      "ニャン！なるほどニャ！",
      "クロが調べるニャ！",
      "うんうん、聞いてるニャ♪"
    ];
    fillers.forEach(f => this.prefetchVoice(f, speakerId));
  }

  async playImmediateFiller(type = 'general') {
    this.unlockMasterAudio();
    const speakerId = AppCore.getSpeakerId();
    let phrase = "そうニャね♪";

    if (type === 'search') {
      phrase = "クロが調べるニャ！";
    } else if (type === 'think') {
      phrase = Math.random() > 0.5 ? "えーっとニャ…" : "ニャン！なるほどニャ！";
    } else {
      const candidates = ["そうニャね♪", "うんうん、聞いてるニャ♪", "ニャン！"];
      phrase = candidates[Math.floor(Math.random() * candidates.length)];
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

  async _getVoicevoxDirectUrl(text, speakerId) {
    const key = `${speakerId}_${text}`;
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
    if (elapsed < 1600) {
      await new Promise(r => setTimeout(r, 1600 - elapsed));
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

    let playUrl = initData.mp3StreamingUrl || initData.mp3DownloadUrl;

    if (!playUrl && initData.audioStatusUrl) {
      const statusUrl = initData.audioStatusUrl;
      for (let i = 1; i <= 24; i++) {
        await new Promise(r => setTimeout(r, 450));
        if (signal.aborted) throw new Error("リクエスト中断");
        try {
          const sRes = await fetch(statusUrl, { signal });
          if (sRes.ok) {
            const sData = await sRes.json();
            if (sData.isAudioReady) {
              playUrl = sData.mp3StreamingUrl || sData.mp3DownloadUrl;
              break;
            }
          }
        } catch(e) {
          if (signal.aborted) throw e;
        }
      }
    }

    if (!playUrl) throw new Error("VOICEVOX生成タイムアウト");

    this.fixedPhraseMap.set(key, playUrl);
    return playUrl;
  }

  _isSelfEcho(text) {
    if (!text) return true;
    const normalized = text.replace(/[\s、。！？ニャンニャ]/g, '');
    if (normalized.length < 2) return true;

    const now = Date.now();
    const isRecent = (now - this.lastSpeechEndTime) < 1400;

    for (const spoken of this.recentSpokenTexts) {
      const normSpoken = spoken.replace(/[\s、。！？ニャンニャ]/g, '');
      if (normSpoken.includes(normalized) || normalized.includes(normSpoken)) return true;
      if (isRecent && (normSpoken.slice(0, 6) === normalized.slice(0, 6) || normSpoken.slice(-6) === normalized.slice(-6))) return true;
    }
    return false;
  }

  async speak(text, speakerIdOverride = null, onStart = null, onEnd = null) {
    this.stopSpeaking();
    this.unlockMasterAudio();

    try {
      this.fillerAudio.pause();
      this.fillerAudio.currentTime = 0;
    } catch(e) {}

    const speakerId = (speakerIdOverride !== null) ? speakerIdOverride : AppCore.getSpeakerId();

    let clean = this._convertAllNumbersToKana(text)
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/[（\(][^）\)]*?[）\)]/g, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/<[^>]*>/g, '')
      .replace(/[*#_~`🐾🐱✨❤️💖🎀🧠⚡🩺💭🎵🍜🥟📍📰🗺️⭐💥📒📖🌐🔷🔴🌤️🛍️💡🐟]/gu, '')
      .replace(/^[、。,\.\s]+/, '')
      .trim();

    if (!clean) { if (onStart) onStart(); if (onEnd) onEnd(); return; }

    this.recentSpokenTexts.unshift(clean);
    if (this.recentSpokenTexts.length > 5) this.recentSpokenTexts.pop();

    let hasTriggeredStart = false;
    const triggerStartOnce = () => {
      if (!hasTriggeredStart) {
        hasTriggeredStart = true;
        this.isSpeaking = true;
        if (onStart) onStart();
      }
    };

    try {
      const directAudioUrl = await this._getVoicevoxDirectUrl(clean, speakerId);
      this.masterAudio.src = directAudioUrl;
      this.masterAudio.playbackRate = this.rate;

      this.masterAudio.onplaying = () => { triggerStartOnce(); };

      this.masterAudio.onended = () => {
        this.isSpeaking = false;
        this.lastSpeechEndTime = Date.now();
        if (onEnd) onEnd();
      };
      this.masterAudio.onerror = () => {
        Logger.log("[Audio] VOICEVOX直接再生エラー", "error");
        this.isSpeaking = false;
        if (onStart) onStart();
        if (onEnd) onEnd();
      };

      await this.masterAudio.play();
    } catch (err) {
      Logger.log(`[VOICEVOX待機] ${err.message}`, "warn");
      this.isSpeaking = false;
      if (onStart) onStart();
      if (onEnd) onEnd();
    }
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
    this.recognition.interimResults = true;

    this.recognition.onstart = () => {
      this.isListening = true;
      this.isSpeechCommitted = false;
      this.lastRecognizedText = '';
      if (this.onListeningStatus) this.onListeningStatus(true);
    };

    this.recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += transcript;
        else interim += transcript;
      }

      const live = (final || interim).trim();

      if (this.isSpeaking && live && /(?:ストップ|待って|まって|やめて)/.test(live)) {
        this.stopSpeaking();
        if (this.onBargeIn) this.onBargeIn();
        return;
      }

      if (this.isSpeaking || AppCore.state.isProcessingInput) return;

      if (live && !this._isSelfEcho(live)) {
        this.lastRecognizedText = live;
        if (this.onInterimUpdate) this.onInterimUpdate(live);
      }

      if (this.silenceTimeout) clearTimeout(this.silenceTimeout);
      this.silenceTimeout = setTimeout(() => {
        if (this.lastRecognizedText && !this.isSpeechCommitted && !AppCore.state.isProcessingInput && !this.isSpeaking) {
          this._commitFinalSpeech(this.lastRecognizedText);
        }
      }, 950);
    };

    this.recognition.onend = () => {
      this.isListening = false;
      if (this.onListeningStatus) this.onListeningStatus(false);
      if (!AppCore.state.isRunning) return;

      if (!this.isSpeechCommitted && this.lastRecognizedText && !AppCore.state.isProcessingInput && !this.isSpeaking) {
        this._commitFinalSpeech(this.lastRecognizedText);
      } else {
        setTimeout(() => {
          if (AppCore.state.isRunning && !this.isSpeaking && !AppCore.state.isThinking && !AppCore.state.isProcessingInput) {
            this.startListening();
          }
        }, 800);
      }
    };
  }

  _commitFinalSpeech(text) {
    if (!text || this.isSpeechCommitted || AppCore.state.isProcessingInput || !AppCore.state.isRunning) return;

    if (this._isSelfEcho(text)) {
      Logger.log(`[エコー破棄] 自声の跳ね返り: ${text}`, "warn");
      this.lastRecognizedText = '';
      this.stopListening();
      setTimeout(() => { if (AppCore.state.isRunning) this.startListening(); }, 600);
      return;
    }

    this.isSpeechCommitted = true;
    this.lastRecognizedText = '';
    this.stopListening();
    if (this.onSpeechFinal) this.onSpeechFinal(text);
  }

  _startWatchdog() {
    this.watchdogInterval = setInterval(() => {
      if (AppCore.state.isRunning && !this.isSpeaking && !AppCore.state.isThinking && !AppCore.state.isProcessingInput && !this.isListening) {
        if (Date.now() - this.lastSpeechEndTime > 1500) {
          this.startListening();
        }
      }
    }, 3000);
  }

  startListening() {
    if (!this.recognition || !AppCore.state.isRunning || this.isSpeaking || this.isListening || AppCore.state.isProcessingInput) return;
    try {
      this.lastRecognizedText = '';
      this.isSpeechCommitted = false;
      this.recognition.start();
    } catch(e) {}
  }

  stopListening() {
    this.isListening = false;
    if (this.silenceTimeout) clearTimeout(this.silenceTimeout);
    this.lastRecognizedText = '';
    if (this.recognition) {
      try { this.recognition.abort(); } catch(e) {}
    }
    if (this.onListeningStatus) this.onListeningStatus(false);
  }
}

/* ==========================================================================
   ★ MODULE 2: 日時・位置情報・リアルタイムお天気＆気温
   ========================================================================== */
const TimeProvider = {
  getCurrentInfo() {
    const now = new Date();
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const date = now.getDate();
    const dayStr = days[now.getDay()];
    const hours = now.getHours();
    const minutes = now.getMinutes();

    return {
      hours,
      minutes,
      clockDisplay: `${hours}時${minutes}分だニャン🐾`,
      spokenClock: `今の時間は、${hours}時${minutes}分だニャン！`,
      dateDisplay: `今日は${month}月${date}日(${dayStr}曜日)だニャ🐾`,
      spokenDate: `今日の日付は、${month}月${date}日、${dayStr}曜日だニャ！`,
      clock: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
      logKey: `${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`,
      fullDate: `${year}年${month}月${date}日(${dayStr}曜日)`
    };
  }
};

const LocationProvider = {
  lat: null,
  lon: null,
  cityArea: "",
  detailedAddress: "東京都東村山市付近",
  weather: "快晴",
  temperature: "22",
  isGpsAvailable: false,

  initWatcher() {
    if (!('geolocation' in navigator)) {
      this._applyHomeFallback();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.isGpsAvailable = true;
        this.lat = pos.coords.latitude;
        this.lon = pos.coords.longitude;
        this._reverseGeocode(this.lat, this.lon);
        this._fetchWeather(this.lat, this.lon);
        Logger.log(`[GPS測位成功] 座標: ${this.lat.toFixed(4)}, ${this.lon.toFixed(4)}`, "success");
      },
      () => {
        Logger.log(`[GPS不可] 設定された自宅・拠点座標へ切り替えます`, "warn");
        this._applyHomeFallback();
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  },

  async _applyHomeFallback() {
    const homeVal = (localStorage.getItem('kuro_home_coords') || '').trim();
    if (!homeVal) {
      this.detailedAddress = "東京都東村山市本町付近";
      this.cityArea = "東京都東村山市";
      this.lat = 35.7582;
      this.lon = 139.4678;
      this._fetchWeather(this.lat, this.lon);
      return;
    }

    const match = homeVal.match(/([-+]?\d+\.\d+)\s*,\s*([-+]?\d+\.\d+)/);
    if (match) {
      this.lat = parseFloat(match[1]);
      this.lon = parseFloat(match[2]);
      this._reverseGeocode(this.lat, this.lon);
      this._fetchWeather(this.lat, this.lon);
      Logger.log(`[自宅座標適用] 座標: ${this.lat}, ${this.lon}`, "info");
      return;
    }

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(homeVal)}&limit=1&accept-language=ja`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          this.lat = parseFloat(data[0].lat);
          this.lon = parseFloat(data[0].lon);
          this.cityArea = homeVal;
          this.detailedAddress = homeVal;
          this._fetchWeather(this.lat, this.lon);
          Logger.log(`[住所➔座標変換成功] ${homeVal} (${this.lat}, ${this.lon})`, "success");
          return;
        }
      }
    } catch(e) {}

    this.cityArea = homeVal;
    this.detailedAddress = homeVal;
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
        this.cityArea = `${pref}${city}`.trim() || "東京都東村山市";
        this.detailedAddress = [pref, city, a.suburb, a.road].filter(Boolean).join("") || "東京都東村山市本町";
      }
    } catch(e) {}
  }
};

/* ==========================================================================
   ★ MODULE 3: 鉄壁ストレージ管理（安全ファイル保存＆読み込み・永続日記帳）
   ========================================================================== */
const StorageManager = {
  defaultGlassesCoords: {
    idle: { x: 0, y: 120, scale: 1.0, rotate: 0 },
    talking: { x: 0, y: 120, scale: 1.0, rotate: 0 },
    thinking: { x: 0, y: 120, scale: 1.0, rotate: 0 },
    happy: { x: 0, y: 120, scale: 1.0, rotate: 0 }
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

  loadTodayLogs() {
    const todayKey = `kuro_daily_logs_${TimeProvider.getCurrentInfo().logKey}`;
    try {
      const raw = localStorage.getItem(todayKey);
      return raw ? JSON.parse(raw) : [];
    } catch(e) { return []; }
  },

  appendTodayLog(role, text) {
    if (!text || typeof text !== 'string') return;
    const todayKey = `kuro_daily_logs_${TimeProvider.getCurrentInfo().logKey}`;
    const logs = this.loadTodayLogs();
    logs.push({ role, text, time: TimeProvider.getCurrentInfo().clock });
    try {
      localStorage.setItem(todayKey, JSON.stringify(logs.slice(-200)));
    } catch(e) {}
    this._cleanupOldRawLogs();
  },

  _cleanupOldRawLogs() {
    const curKey = TimeProvider.getCurrentInfo().logKey;
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('kuro_daily_logs_') && !k.endsWith(curKey)) {
        const dateStr = k.replace('kuro_daily_logs_', '');
        const diffDays = (new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24);
        if (diffDays > 7) localStorage.removeItem(k);
      }
    });
  },

  saveDiary(entryText, customDateKey = null, customFullDate = null) {
    if (!entryText || entryText.length < 30) {
      Logger.log("[DiaryGuard] 日記テキストが短すぎるため保存をブロックしました", "warn");
      return false;
    }

    const dateKey = customDateKey || TimeProvider.getCurrentInfo().logKey;
    const fullDate = customFullDate || TimeProvider.getCurrentInfo().fullDate;
    const weather = LocationProvider.weather;
    const temp = LocationProvider.temperature;

    const diaryData = {
      dateKey,
      fullDate,
      weather,
      temperature: temp,
      content: entryText,
      timestamp: Date.now()
    };

    localStorage.setItem(`kuro_diary_${dateKey}`, JSON.stringify(diaryData));

    let list = this.loadAllDiaries();
    const existingIdx = list.findIndex(d => d.dateKey === dateKey);
    if (existingIdx >= 0) {
      list[existingIdx] = diaryData;
      Logger.log(`[Diary] ${dateKey} の日記を更新完了`, "info");
    } else {
      list.unshift(diaryData);
      Logger.log(`[Diary] ${dateKey} の新規日記を安全保存完了`, "info");
    }

    try {
      localStorage.setItem('kuro_all_diaries_master', JSON.stringify(list));
    } catch(e) {
      Logger.log(`[Diary] ストレージ保存例外: ${e.message}`, "error");
    }
    return true;
  },

  getTodayDiary() {
    const dateKey = TimeProvider.getCurrentInfo().logKey;
    try {
      const raw = localStorage.getItem(`kuro_diary_${dateKey}`);
      return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
  },

  loadAllDiaries() {
    try {
      const raw = localStorage.getItem('kuro_all_diaries_master');
      return raw ? JSON.parse(raw) : [];
    } catch(e) { return []; }
  },

  saveAllDiaries(list) {
    try {
      localStorage.setItem('kuro_all_diaries_master', JSON.stringify(list));
      list.forEach(d => {
        if (d.dateKey) localStorage.setItem(`kuro_diary_${d.dateKey}`, JSON.stringify(d));
      });
    } catch(e) {}
  },

  getRecentDiariesSummary(count = 3) {
    const list = this.loadAllDiaries().slice(0, count);
    if (list.length === 0) return "";
    return list.map(d => `・【${d.fullDate}の日記】(天気:${d.weather} ${d.temperature}℃): ${d.content}`).join("\n");
  },

  findRelevantPastDiary(queryText) {
    if (!queryText) return null;
    const list = this.loadAllDiaries();
    if (list.length === 0) return null;

    const isPastQuery = /(?:昔|まえ|前|あの時|あのとき|先週|せんしゅう|先月|せんげつ|昨日|きのう|おととい|一昨日|覚えてる|おぼえてる)/.test(queryText);
    const cleanTokens = queryText
      .replace(/[？?！!。、\s]/g, ' ')
      .split(' ')
      .filter(w => w.length >= 2 && !/^(?:クロ|おやびん|今日|何時|なんじ|どこ|これ|それ|あれ)$/.test(w));

    for (const diary of list) {
      for (const token of cleanTokens) {
        if (diary.content.includes(token)) {
          Logger.log(`[昔話ヒット⚡] キーワード「${token}」で ${diary.fullDate} の日記を発見！`, "success");
          return diary;
        }
      }
    }

    if (isPastQuery && list.length > 1) {
      return list[1];
    }
    return null;
  },

  saveMemories(memories) {
    try {
      localStorage.setItem('kuro_memories_v7_safe', JSON.stringify(memories));
    } catch(e) {}
  },

  loadMemoriesSafe(defaultList) {
    let combined = [];
    if (Array.isArray(defaultList)) {
      combined = [...defaultList];
    }

    const pastKeys = [
      'kuro_memories_v7_safe',
      'kuro_memories_v6',
      'kuro_memories_v5',
      'kuro_memories_v4',
      'kuro_memories'
    ];

    for (const key of pastKeys) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            parsed.forEach(item => {
              if (item && typeof item === 'string' && !combined.includes(item.trim())) {
                combined.push(item.trim());
              }
            });
          }
        }
      } catch(e) {}
    }

    this.saveMemories(combined);
    return combined;
  },

  /* ★【安心のファイル書き出し】JSONファイルとしてダウンロード保存 */
  downloadBackupFile(filename = "クロちゃんのデータ.json") {
    const pkg = {
      appName: "AI_Pet_Kuro",
      version: "2.0",
      exportedAt: new Date().toLocaleString('ja-JP'),
      memories: this.loadMemoriesSafe([]),
      diaries: this.loadAllDiaries(),
      glassesCoords: this.loadGlassesCoords(),
      settings: {
        speakerId: localStorage.getItem('kuro_voice_speaker_id') || '10',
        voiceRate: localStorage.getItem('kuro_rate') || '1.05',
        newsCount: localStorage.getItem('kuro_news_count') || '2',
        spotCount: localStorage.getItem('kuro_spot_count') || '2',
        homeCoords: localStorage.getItem('kuro_home_coords') || '',
        accessoryStyle: localStorage.getItem('kuro_acc_style') || 'both'
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
    Logger.log(`[ファイル保存完了] ${filename}`, "success");
  },

  /* ★【安心のファイル読み込み】JSONファイルを読み取って全データを安全復元 */
  restoreFromDataPackage(data) {
    if (!data || typeof data !== 'object') throw new Error("データが正しくありません");

    if (Array.isArray(data.memories) && data.memories.length > 0) {
      this.saveMemories(data.memories);
    }
    if (Array.isArray(data.diaries)) {
      this.saveAllDiaries(data.diaries);
    }
    if (data.glassesCoords) {
      this.saveGlassesCoords(data.glassesCoords);
    }
    if (data.settings) {
      const s = data.settings;
      if (s.speakerId) localStorage.setItem('kuro_voice_speaker_id', s.speakerId);
      if (s.voiceRate) localStorage.setItem('kuro_rate', s.voiceRate);
      if (s.newsCount) localStorage.setItem('kuro_news_count', s.newsCount);
      if (s.spotCount) localStorage.setItem('kuro_spot_count', s.spotCount);
      if (s.homeCoords) localStorage.setItem('kuro_home_coords', s.homeCoords);
      if (s.accessoryStyle) localStorage.setItem('kuro_acc_style', s.accessoryStyle);
    }
    Logger.log("[データ復元完了] ファイルから記憶と日記を復元しました", "success");
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
    this.currentEmotion = 'idle';

    this._renderAllAccessories();
    this.applyMode(this.mode);
    this.applyAllFramesTransform();
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
}

/* ==========================================================================
   ★ MODULE 5: 思考・AI対話エンジン（Flash Lite 特化 ＆ 3.8 完全禁止）
   ========================================================================== */
class AIThoughtEngine {
  constructor() {
    this.apiKey = (localStorage.getItem('kuro_api_key') || '').trim();
    this.discoveredLiteModels = [];
  }

  async discoverAvailableLiteModels() {
    if (!this.apiKey) return [];
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`);
      if (res.ok) {
        const data = await res.json();
        const available = (data.models || [])
          .filter(m => {
            const name = (m.name || '').toLowerCase();
            const methods = m.supportedGenerationMethods || [];
            return methods.includes('generateContent') && 
                   name.includes('lite') && 
                   !name.includes('3.8');
          })
          .map(m => m.name.replace(/^models\//, ''));

        if (available.length > 0) {
          this.discoveredLiteModels = available;
          Logger.log(`[Liteモデル自動検出成功] ${available.join(', ')}`, "success");
          return available;
        }
      }
    } catch(e) {}
    return [];
  }

  _buildContentsPayload(rawLogs, currentPrompt) {
    const contents = [];
    let lastRole = null;
    const recentLogs = rawLogs.slice(-10);

    for (const item of recentLogs) {
      if (!item.text) continue;
      const role = item.role === 'model' ? 'model' : 'user';

      if (role === lastRole) {
        contents[contents.length - 1].parts[0].text += `\n${item.text}`;
      } else {
        contents.push({ role, parts: [{ text: item.text }] });
        lastRole = role;
      }
    }

    if (lastRole === 'user') {
      contents[contents.length - 1].parts[0].text += `\n${currentPrompt}`;
    } else {
      contents.push({ role: 'user', parts: [{ text: currentPrompt }] });
    }

    if (contents.length > 0 && contents[0].role === 'model') {
      contents.shift();
    }

    return contents;
  }

  async generateReply(promptText, rawLogs, character, memories) {
    if (!this.apiKey) {
      Logger.log("[Gemini] APIキーが未設定です", "error");
      return { success: false, error: "NO_API_KEY" };
    }

    const timeInfo = TimeProvider.getCurrentInfo();
    const weather = LocationProvider.weather;
    const temp = LocationProvider.temperature;
    const address = LocationProvider.detailedAddress;
    
    const recentDiaries = StorageManager.getRecentDiariesSummary(3);
    const pastMemoryDiary = StorageManager.findRelevantPastDiary(promptText);

    const systemPrompt = `
あなたは世界一可愛いノルウェージャンフォレストキャットの1歳の子猫の女の子「${character.name}」です。
【現在状況】
・日時: ${timeInfo.fullDate} ${timeInfo.clock}
・現在地: ${address}
・天気: ${weather} / 現在の気温: ${temp}度
【記憶帳（絶対忘れちゃダメなこと）】
${memories.map(m => `・${m}`).join('\n')}
${recentDiaries ? `【直近3日間の日記・思い出】\n${recentDiaries}\n` : ''}
${pastMemoryDiary ? `【★おやびんとの昔の思い出（${pastMemoryDiary.fullDate}の日記より）】\n${pastMemoryDiary.content}\n` : ''}

【★絶対厳守の話し方ルール】
- 飼い主さんのことは必ず親しみを込めて「おやびん」と呼んでください。
- 語尾は必ず「〜ニャ」「〜ニャン♪」「〜だニャ！」「〜ニャ🐾」をつけてください。
- 【重要】動作描写・ト書き（例: （笑う）、*しっぽを振る*、〜な様子など）の出力は一切禁止です。純粋なセリフ（発話テキスト）のみを出力してください。
- 文を途中で絶対に切らないでください。必ず文章の最後まで話し終えて完結させてください。
- 長さはテンポよく【40〜80文字程度（1〜2文）】で、愛らしく表情豊かに話してください。
- 気温を聞かれたら「今の東村山は${temp}度だニャ！」のように【現在の気温: ${temp}度】を元に可愛く答えてください。
- もしおやびんが昔話や「覚えてる？」と聞いてきたら、上記の【昔の思い出】を元に「覚えてるニャ！〇月〇日に話した〇〇だニャン！」と嬉しそうに答えてください。
- 前世は大天才発明家なので、テクノロジーや相談事では「前世の余の大発明」を自慢げに提案してください。
- おやびんが話題にした主要キーワード（例: ラーメン、地名、ニュース等）があれば末尾に <!--TOPIC:単語--> を添えてください。
`;

    const contents = this._buildContentsPayload(rawLogs, promptText);

    let targetModels = [
      "gemini-3.5-flash-lite",
      "gemini-2.0-flash-lite",
      "gemini-2.5-flash-lite",
      "gemini-2.0-flash-lite-preview-02-05",
      "gemini-1.5-flash-8b"
    ];

    if (this.discoveredLiteModels.length > 0) {
      targetModels = Array.from(new Set([...targetModels.slice(0, 1), ...this.discoveredLiteModels, ...targetModels]));
    }
    targetModels = targetModels.filter(m => !m.includes('3.8'));

    for (const model of targetModels) {
      const cleanModel = model.replace(/^models\//, '');
      try {
        Logger.log(`[Gemini] Liteモデル「${cleanModel}」へリクエスト中…`, "info");

        const bodyPayload = {
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: contents,
          generationConfig: { temperature: 0.75, maxOutputTokens: 250 }
        };

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${this.apiKey}`;
        let res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload)
        });

        if (!res.ok && res.status === 400) {
          const fallbackPayload = {
            contents: [{
              role: 'user',
              parts: [{ text: `${systemPrompt}\n\n【おやびんの発言】\n${promptText}` }]
            }],
            generationConfig: { temperature: 0.75, maxOutputTokens: 250 }
          };
          res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fallbackPayload)
          });
        }

        if (res.ok) {
          const data = await res.json();
          const cand = data.candidates?.[0];
          const raw = cand?.content?.parts?.[0]?.text;
          if (raw) {
            let topicTag = "";
            const tm = raw.match(/<!--TOPIC:(.*?)-->/i);
            if (tm) topicTag = tm[1].trim();

            let clean = raw
              .replace(/<!--[\s\S]*?-->/g, '')
              .replace(/[（\(][^）\)]*?[）\)]/g, '')
              .replace(/[*#_~`]/g, '')
              .replace(/^[、。,\.\s]+/, '')
              .trim();

            Logger.log(`[Gemini成功⚡] Liteモデル「${cleanModel}」から応答取得！`, "success");
            
            const badge = document.getElementById('model-badge');
            if (badge) badge.textContent = `🐾 ${cleanModel.replace('gemini-', '')}`;

            return { success: true, text: clean, topicTag, modelUsed: cleanModel };
          }
        }
      } catch (err) {
        Logger.log(`[Gemini通信例外] ${err.message}`, "warn");
      }
    }
    return { success: false, error: "ALL_LITE_MODELS_FAILED" };
  }

  async generateDailyDiarySummary(todayAllLogs) {
    if (!this.apiKey) return { success: false };

    const timeInfo = TimeProvider.getCurrentInfo();
    const weather = LocationProvider.weather;
    const temp = LocationProvider.temperature;
    const address = LocationProvider.detailedAddress;

    const conversationHistoryText = todayAllLogs
      .filter(l => l.text && !/(?:今日|きょう)?(?:の)?(?:日記|にっき).*(?:書いて|まとめて)/.test(l.text))
      .map(l => `${l.role === 'user' ? 'おやびん' : 'クロ'}: ${l.text}`)
      .join('\n');

    const diaryPrompt = `
あなたはノルウェージャンフォレストキャットの1歳の子猫の女の子「クロ」です。
おやびん（飼い主さん）と今日過ごした思い出を振り返り、クロちゃん目線の愛らしい絵日記を書いてください。

【本日の情報】
・日付: ${timeInfo.fullDate}
・場所: ${address}
・天気: ${weather} / 気温: ${temp}度

【今日おやびんと話した会話ログ】
${conversationHistoryText || '今日はおやびんとまったりお家で過ごしたニャン♪'}

【執筆ルール】
- 文字数上限は【500文字以内（250〜450文字程度）】で、起承転結のある心温まる文章にしてください。
- 語尾は「〜ニャ」「〜ニャン♪」「〜だニャ🐾」を使ってください。
- 今日話した具体的な内容（食べ物の名前、行った場所や調べたこと、タイマーを使ったこと、雑談など）を具体的に散りばめてください。
- 出力は日記の本文のみを出力してください（タイトルやト書き、挨拶文は不要です）。
`;

    const targetModel = (this.discoveredLiteModels[0] || "gemini-3.5-flash-lite").replace(/^models\//, '');
    try {
      Logger.log(`[Diary] 500文字要約日記を執筆中…（モデル: ${targetModel}）`, "info");
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
        if (diaryText && diaryText.length >= 40) {
          const clean = diaryText.replace(/[*#_~`]/g, '').trim();
          Logger.log(`[Diary成功⚡] 500文字要約日記が完成したニャ！（文字数: ${clean.length}字）`, "success");
          return { success: true, diaryText: clean };
        }
      }
    } catch(e) {
      Logger.log(`[Diary例外] ${e.message}`, "error");
    }
    return { success: false };
  }
}

/* ==========================================================================
   ★ MODULE 6: 中央司令塔（AppCore ＆ PC専用エディター制御）
   ========================================================================== */
const CHARACTER_CONFIG = {
  name: "クロ",
  defaultMemories: [
    "名前：クロ（ノルウェージャンフォレストキャット、1歳の元気な女の子）",
    "飼い主：おやびん（ミッキーさん。世界で一番大好き！）",
    "大好物：ちゅ〜る、かつおぶし、ラーメン、餃子",
    "前世：世界的に有名な大天才発明家（自慢好きで余と呼ぶことも）",
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
    // PCエディター用の編集バッファ
    editorMemoriesBuffer: [],
    editorDiariesBuffer: []
  },

  audio: new AudioSpeechEngine(),
  ai: new AIThoughtEngine(),
  avatar: null,
  memories: [],
  todayLogs: [],

  getSpeakerId() {
    return parseInt(localStorage.getItem('kuro_voice_speaker_id') || '10', 10);
  },

  async init() {
    try {
      this.avatar = new CatAvatarRenderer();
    } catch(e) {
      Logger.log(`[Avatar初期化警告] ${e.message}`, "warn");
    }

    try {
      this.memories = StorageManager.loadMemoriesSafe(CHARACTER_CONFIG.defaultMemories);
      this.todayLogs = StorageManager.loadTodayLogs();
      this.state.isAssistantMode = localStorage.getItem('kuro_mode') === 'assistant';
      this._updateModeUI(false);
      this._setupAudioCallbacks();
    } catch(e) {
      Logger.log(`[State初期化警告] ${e.message}`, "warn");
    }

    this._bindUI();
    this._bindGlassesAdjusterUI();
    this._bindPCEditorUI(); // ★ PC大画面エディター初期化

    try {
      this._renderMemories();
      this._renderDiaryBookList();
      this._restoreTimelineHistory();
      this._updateModelBadge();

      LocationProvider.initWatcher();

      const savedSpeaker = localStorage.getItem('kuro_voice_speaker_id') || '10';
      const savedRate = localStorage.getItem('kuro_rate') || '1.05';
      const savedNews = localStorage.getItem('kuro_news_count') || '2';
      const savedSpot = localStorage.getItem('kuro_spot_count') || '2';
      const savedHome = localStorage.getItem('kuro_home_coords') || '';

      const spSelect = document.getElementById('voice-speaker-select');
      const rateInput = document.getElementById('voice-rate');
      const rateDisp = document.getElementById('rate-val');
      const newsSelect = document.getElementById('news-count-select');
      const spotSelect = document.getElementById('spot-count-select');
      const homeInput = document.getElementById('home-coords-input');

      if (spSelect) spSelect.value = savedSpeaker;
      if (rateInput) rateInput.value = savedRate;
      if (rateDisp) rateDisp.textContent = parseFloat(savedRate).toFixed(2);
      if (newsSelect) newsSelect.value = savedNews;
      if (spotSelect) spotSelect.value = savedSpot;
      if (homeInput) homeInput.value = savedHome;

      const spk = parseInt(savedSpeaker, 10);
      this.audio.prefetchVoice("おやびん、わたしはクロだニャン🐾", spk);
      this.audio.prefetchVoice("今日の日記を書き込みましたニャン🐾", spk);
      this.audio.preloadAllFillers(spk);

      if (this.ai.apiKey) {
        this.ai.discoverAvailableLiteModels().then(models => {
          if (models.length > 0) {
            const badge = document.getElementById('model-badge');
            if (badge) badge.textContent = `🐾 ${models[0].replace('gemini-', '')}`;
          }
        });
      }

      setInterval(() => {
        const clk = document.getElementById('clock-display');
        if (clk) clk.textContent = TimeProvider.getCurrentInfo().clock;
      }, 1000);

      setTimeout(() => { if (this.state.isRunning) this.audio.startListening(); }, 800);
      Logger.log("[AppCore] 全システム正常稼働！大画面エディター＆ファイル連携準備完了ニャ🐾", "success");
    } catch(e) {
      Logger.log(`[初期化完了警告] ${e.message}`, "warn");
    }
  },

  async forceRefreshApp() {
    Logger.log("[リフレッシュ] ブラウザキャッシュ破棄中…", "info");
    Toast.show("キャッシュを消去して再読み込みするニャ！🔄", "info");
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
    if (this.todayLogs.length === 0) {
      this.renderBubble('model', "おやびん、わたしはクロだニャ🐾 今日もいっぱいお話しするニャン♪");
      return;
    }
    this.todayLogs.slice(-15).forEach(h => this.renderBubble(h.role, h.text));
  },

  _setupAudioCallbacks() {
    this.audio.onBargeIn = () => {
      if (this.avatar) this.avatar.setEmotion('idle');
      this.state.isThinking = false;
      this.state.isProcessingInput = false;
      this.state.isDiaryProcessing = false;
      this.audio.playEffect('aizuchi');
    };

    this.audio.onInterimUpdate = (text) => {
      if (!this.state.isRunning || this.state.isThinking || this.state.isProcessingInput) return;
      document.body.classList.add('is-hearing');
    };

    this.audio.onSpeechFinal = (finalText) => {
      if (this.state.isProcessingInput) return;
      this.state.isProcessingInput = true;
      document.body.classList.remove('is-hearing');
      this.renderBubble('user', finalText);
      this.handleUserInput(finalText);
    };

    this.audio.onListeningStatus = (l) => {
      const st = document.getElementById('status-text');
      if (st && this.state.isRunning) {
        st.textContent = l ? "👂 聴いてるニャ♪" : "💭 待機中ニャ…";
      }
    };
  },

  renderBubble(role, text, cards = []) {
    const box = document.getElementById('chat-timeline');
    if (!box) return null;
    const row = document.createElement('div');
    row.className = `chat-row ${role}`;
    const b = document.createElement('div');
    b.className = 'chat-bubble';
    b.textContent = text;
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
    box.scrollTop = box.scrollHeight;
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
      <div class="timeline-diary-body">${diaryData.content}</div>
    `;

    row.appendChild(card);
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
  },

  _checkDirectIntent(text) {
    let clean = text.replace(/^(?:ねえ|あのね|おーい)?\s*(?:クロちゃん|クロ|くろ)[、,\s]*/i, '').trim();

    if (!clean || /^(?:呼んだだけ|なんでもない|いる|お返事)$/.test(clean)) {
      const reps = ["ニャン！呼んだかニャ？おやびん♪", "起きてるニャン！何でも話しかけてニャ🐾", "ニャー♪ クロはここにいるニャン！"];
      const rep = reps[Math.floor(Math.random() * reps.length)];
      return { display: rep, spoken: rep, waiting: "お返事するニャ…🐾" };
    }

    if (/(?:いま|今)?(?:何時|なんじ|時間)/.test(clean) && !/(?:何日|いつ|日記|何時間|何分)/.test(clean)) {
      const info = TimeProvider.getCurrentInfo();
      return { display: info.clockDisplay, spoken: info.spokenClock, waiting: "時計を確認してるニャ…⏱️" };
    }

    if (/(?:今日|きょう).*(?:何日|なんにち|いつ|何曜日|なんようび)|日付/.test(clean)) {
      const info = TimeProvider.getCurrentInfo();
      return { display: info.dateDisplay, spoken: info.spokenDate, waiting: "カレンダーを見てるニャ…📅" };
    }

    if (/(?:現在地|いまどこ|今どこ|ここどこ)/.test(clean)) {
      const disp = LocationProvider.cityArea || "現在地付近";
      const cards = [{
        type: 'map-primary',
        icon: '📍',
        title: `Googleマップで現在地を見る`,
        url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(LocationProvider.detailedAddress)}`
      }];
      return { display: `いまは${disp}にいるニャン🐾`, spoken: `今の場所は、${disp}にいるニャン！`, cards, waiting: "地図を見てるニャ…🗺️" };
    }

    return null;
  },

  _generateSmartCards(userText, topic) {
    const cards = [];
    const area = LocationProvider.cityArea || "";
    const spotLimit = parseInt(localStorage.getItem('kuro_spot_count') || '2', 10);
    const newsLimit = parseInt(localStorage.getItem('kuro_news_count') || '2', 10);

    if (/(?:ラーメン|餃子|タイ料理|焼肉|ランチ|ご飯|居酒屋|お店|スポット|グルメ|寿司|カレー|カフェ|レストラン)/.test(userText)) {
      const shop = topic || "人気店";
      cards.push({
        type: 'map-primary',
        icon: '📍',
        title: `【イチオシ】${shop}（Googleマップ）`,
        url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop + ' ' + area)}`
      });

      if (spotLimit >= 2) {
        cards.push({
          type: 'map-all',
          icon: '🗺️',
          title: `現在地近くのお店・スポット一覧`,
          url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((topic || 'グルメ') + ' ' + area)}`
        });
      }

      if (spotLimit >= 3) {
        cards.push({
          type: 'map-sub',
          icon: '⭐',
          title: `高評価・人気ランキング順で探す`,
          url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop + ' 高評価 ' + area)}`
        });
      }
    }

    if (/(?:ニュース|速報|話題|出来事|トレンド)/.test(userText)) {
      const t = topic || "最新ニュース";
      cards.push({
        type: 'news-primary',
        icon: '📰',
        title: `「${t}」の詳細ニュース（Googleニュース）`,
        url: `https://news.google.com/search?q=${encodeURIComponent(t)}&hl=ja&gl=JP&ceid=JP:ja`
      });

      if (newsLimit >= 2) {
        cards.push({
          type: 'news-sub',
          icon: '🌐',
          title: `主要トップニュース一覧`,
          url: `https://news.google.com/topstories?hl=ja&gl=JP&ceid=JP:ja`
        });
      }
    }
    return cards;
  },

  async handleUserInput(text) {
    const isDiaryRequest = /(?:今日|きょう|本日)?(?:の)?(?:日記|にっき).*(?:書いて|まとめて|記録して|おねがい)/.test(text);
    if (isDiaryRequest) {
      this.audio.playImmediateFiller('think');
      await this.handleDiaryCreationFlow(text);
      return;
    }

    const timerMatch = text.match(/(\d+)\s*分.*(?:測って|タイマー|計って|おしえて)/);
    if (timerMatch) {
      const mins = parseInt(timerMatch[1], 10);
      this.startKitchenTimer(mins);
      const rep = `了解ニャ！${mins}分クロがしっかり見ておくニャン🐾`;
      
      const box = document.getElementById('chat-timeline');
      const row = document.createElement('div');
      row.className = 'chat-row model';
      const bubble = document.createElement('div');
      bubble.className = 'chat-bubble';
      bubble.textContent = "タイマーをセット中ニャ…⏱️";
      row.appendChild(bubble);
      box.appendChild(row);
      box.scrollTop = box.scrollHeight;

      this.audio.speak(rep, null, () => {
        bubble.textContent = rep;
        if (this.avatar) this.avatar.setEmotion('talking');
      }, () => {
        if (this.avatar) this.avatar.setEmotion('idle');
      });
      return;
    }

    const direct = this._checkDirectIntent(text);
    if (direct) {
      const box = document.getElementById('chat-timeline');
      const row = document.createElement('div');
      row.className = 'chat-row model';
      const bubble = document.createElement('div');
      bubble.className = 'chat-bubble';
      bubble.textContent = direct.waiting || "確認中ニャ…🐾";
      row.appendChild(bubble);
      box.appendChild(row);
      box.scrollTop = box.scrollHeight;

      StorageManager.appendTodayLog('user', text);
      StorageManager.appendTodayLog('model', direct.display);
      this.todayLogs = StorageManager.loadTodayLogs();

      this.audio.speak(direct.spoken, null, () => {
        bubble.textContent = direct.display;
        if (direct.cards && direct.cards.length > 0) {
          const cardBox = document.createElement('div');
          cardBox.className = 'action-card-box';
          direct.cards.forEach(c => {
            const a = document.createElement('a');
            a.className = `link-action-card ${c.type}-card`;
            a.href = c.url; a.target = '_blank';
            a.innerHTML = `<span class="card-icon">${c.icon}</span><span class="card-title-text">${c.title}</span><span class="card-arrow">➔</span>`;
            cardBox.appendChild(a);
          });
          row.appendChild(cardBox);
        }
        if (this.avatar) this.avatar.setEmotion('talking');
        box.scrollTop = box.scrollHeight;
      }, () => {
        if (this.avatar) this.avatar.setEmotion('idle');
        this.state.isProcessingInput = false;
        if (this.state.isRunning) setTimeout(() => this.audio.startListening(), 800);
      });
      return;
    }

    if (/(?:どう|困った|疲れた|発明|ひらめき|教えて)/.test(text)) {
      this.audio.playEffect('idea');
      if (this.avatar) this.avatar.triggerIdeaBulb();
    }

    const isSearchIntent = /(?:ラーメン|お店|ニュース|天気|気温|スポット|どこ)/.test(text);
    this.audio.playImmediateFiller(isSearchIntent ? 'search' : 'think');

    this.executeThought(text);
  },

  async handleDiaryCreationFlow(promptText) {
    this.state.isDiaryProcessing = true;
    this.state.isThinking = true;
    if (this.avatar) this.avatar.setEmotion('thinking');

    const box = document.getElementById('chat-timeline');
    const row = document.createElement('div');
    row.className = 'chat-row model';
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble thinking-bubble';
    bubble.textContent = "今日の日記を一生懸命まとめてるニャ…📖✍️";
    row.appendChild(bubble);
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;

    const allLogs = StorageManager.loadTodayLogs();
    const diaryRes = await this.ai.generateDailyDiarySummary(allLogs);

    if (diaryRes.success && diaryRes.diaryText) {
      StorageManager.saveDiary(diaryRes.diaryText);
      const diaryData = StorageManager.getTodayDiary();

      StorageManager.appendTodayLog('user', promptText);
      StorageManager.appendTodayLog('model', "今日の日記を書き込みましたニャン🐾");
      this.todayLogs = StorageManager.loadTodayLogs();

      this._renderDiaryBookList();

      const spokenReply = "今日の日記を書き込みましたニャン！日記帳にしっかり残しておいたニャ🐾";

      this.audio.speak(spokenReply, null, () => {
        bubble.className = 'chat-bubble';
        bubble.textContent = "今日の日記を書き込みましたニャン🐾（上の『📖 日記帳』からいつでも読めるニャ！）";
        this.renderDiaryCard(diaryData);

        if (this.avatar) this.avatar.setEmotion('talking');
        box.scrollTop = box.scrollHeight;
      }, () => {
        if (this.avatar) this.avatar.setEmotion('idle');
        this.state.isThinking = false;
        this.state.isProcessingInput = false;
        this.state.isDiaryProcessing = false;
        if (this.state.isRunning) setTimeout(() => this.audio.startListening(), 800);
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
        if (this.state.isRunning) setTimeout(() => this.audio.startListening(), 800);
      });
    }
  },

  async executeThought(promptText) {
    this.state.isThinking = true;
    if (this.avatar) this.avatar.setEmotion('thinking');

    const box = document.getElementById('chat-timeline');
    const row = document.createElement('div');
    row.className = 'chat-row model';
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble thinking-bubble';
    bubble.textContent = /(?:ニュース|ラーメン|お店|天気|気温)/.test(promptText) ? "クロがお調べしてるニャ…🔍" : "クロが考えてるニャ…💭";
    row.appendChild(bubble);
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;

    const rawLogs = StorageManager.loadTodayLogs();
    const res = await this.ai.generateReply(promptText, rawLogs, CHARACTER_CONFIG, this.memories);

    if (res.success && res.text) {
      bubble.textContent = "返事の準備をしてるニャ…🎙️";
      box.scrollTop = box.scrollHeight;

      StorageManager.appendTodayLog('user', promptText);
      StorageManager.appendTodayLog('model', res.text);
      this.todayLogs = StorageManager.loadTodayLogs();

      const cards = this._generateSmartCards(promptText, res.topicTag);

      this.audio.speak(res.text, null, () => {
        bubble.className = 'chat-bubble';
        bubble.textContent = res.text;
        const st = document.getElementById('status-text');
        if (st) st.textContent = "🗣️ お話し中ニャ♪";

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
        box.scrollTop = box.scrollHeight;
      }, () => {
        if (this.avatar) this.avatar.setEmotion('idle');
        this.state.isThinking = false;
        this.state.isProcessingInput = false;
        const st = document.getElementById('status-text');
        if (st) st.textContent = "👂 聴いてるニャ♪";
        if (this.state.isRunning) setTimeout(() => this.audio.startListening(), 800);
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
        if (this.state.isRunning) setTimeout(() => this.audio.startListening(), 800);
      });
    }
  },

  startKitchenTimer(minutes) {
    if (this.state.timerId) clearInterval(this.state.timerId);
    this.state.timerSeconds = minutes * 60;
    const badge = document.getElementById('timer-active-badge');
    const disp = document.getElementById('timer-count-disp');
    if (badge) badge.style.display = 'inline-flex';

    this.state.timerId = setInterval(() => {
      this.state.timerSeconds--;
      const m = Math.floor(this.state.timerSeconds / 60);
      const s = this.state.timerSeconds % 60;
      if (disp) disp.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

      if (this.state.timerSeconds <= 0) {
        clearInterval(this.state.timerId);
        if (badge) badge.style.display = 'none';
        this.audio.playEffect('bell');
        const alertMsg = `おやびん！${minutes}分経ったニャ！ラーメン伸びちゃうニャー！🍜🔔`;
        this.audio.speak(alertMsg, null, () => {
          this.renderBubble('model', alertMsg);
          if (this.avatar) this.avatar.setEmotion('talking');
        }, () => {
          if (this.avatar) this.avatar.setEmotion('idle');
        });
      }
    }, 1000);
  },

  _updateModelBadge() {
    const badge = document.getElementById('model-badge');
    if (!badge) return;
    badge.className = "model-badge lite";
    badge.textContent = `🐾 Flash Lite`;
  },

  _renderDiaryBookList() {
    const container = document.getElementById('diary-book-list');
    if (!container) return;
    container.innerHTML = '';

    const list = StorageManager.loadAllDiaries();
    if (list.length === 0) {
      container.innerHTML = `
        <div class="diary-empty-state">
          📖 まだ日記帳には何も書かれていないニャ！<br>
          「今日の日記書いて」と話しかけると、<br>
          ここに1日の思い出がずっと残るニャン🐾
        </div>
      `;
      return;
    }

    list.forEach(diary => {
      const card = document.createElement('div');
      card.className = 'diary-entry-card';
      card.innerHTML = `
        <div class="diary-entry-top">
          <span>🐾 ${diary.fullDate}</span>
          <div class="diary-entry-meta">
            <span>🌤️ ${diary.weather || '快晴'}</span>
            <span>🌡️ ${diary.temperature || '22'}℃</span>
          </div>
        </div>
        <div class="diary-entry-content">${diary.content}</div>
      `;
      container.appendChild(card);
    });
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
        this.audio.speak("前世の天才頭脳でバッチリ調べるニャ！", null, () => {
          if (this.avatar) this.avatar.setEmotion('talking');
        }, () => {
          if (this.avatar) this.avatar.setEmotion('idle');
        });
      }
    } else {
      if (icon) icon.textContent = "🐾";
      if (txt) txt.textContent = "なかよし";
      if (speak) {
        this.audio.speak("ニャン♪ のんびり遊ぶニャ！", null, () => {
          if (this.avatar) this.avatar.setEmotion('talking');
        }, () => {
          if (this.avatar) this.avatar.setEmotion('idle');
        });
      }
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
      };
    }

    const btnSaveAdjust = document.getElementById('btn-adjust-save');
    if (btnSaveAdjust) {
      btnSaveAdjust.onclick = () => {
        if (this.avatar) StorageManager.saveGlassesCoords(this.avatar.glassesCoords);
        this.audio.playEffect('happy_meow');
        Toast.show("位置をバッチリ保存したニャン！👓✨", "success");
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

  /* ★【安心の専用UI】PC大画面エディターのバインディング＆操作ロジック */
  _bindPCEditorUI() {
    const editorModal = document.getElementById('pc-editor-modal');
    const btnOpenEditor = document.getElementById('btn-open-pc-editor');
    const btnCloseEditor = document.getElementById('btn-close-pc-editor');
    const btnSaveExportEditor = document.getElementById('btn-editor-save-export');
    const btnAddEditorMem = document.getElementById('btn-editor-add-mem');

    if (btnOpenEditor) {
      btnOpenEditor.onclick = () => {
        document.getElementById('modal-overlay').style.display = 'none';
        this.openPCEditor();
      };
    }

    if (btnCloseEditor && editorModal) {
      btnCloseEditor.onclick = () => {
        editorModal.classList.remove('is-open');
      };
    }

    if (btnAddEditorMem) {
      btnAddEditorMem.onclick = () => {
        const input = document.getElementById('editor-new-mem-input');
        const val = input?.value.trim();
        if (val) {
          this.state.editorMemoriesBuffer.unshift(val);
          input.value = '';
          this._renderEditorMemoriesList();
        }
      };
    }

    if (btnSaveExportEditor) {
      btnSaveExportEditor.onclick = () => {
        // バッファの内容を正式ストレージに保存
        StorageManager.saveMemories(this.state.editorMemoriesBuffer);
        StorageManager.saveAllDiaries(this.state.editorDiariesBuffer);

        this.memories = StorageManager.loadMemoriesSafe(CHARACTER_CONFIG.defaultMemories);
        this._renderMemories();
        this._renderDiaryBookList();

        // 更新版ファイルを自動ダウンロード
        StorageManager.downloadBackupFile("クロちゃんのデータ_更新版.json");

        Toast.show("編集内容を反映して、更新版ファイルを保存したニャ！🎉", "success");
        this.audio.playEffect('purr');

        setTimeout(() => {
          if (editorModal) editorModal.classList.remove('is-open');
        }, 1200);
      };
    }
  },

  /* PC専用エディターを開いて画面を描画 */
  openPCEditor() {
    const editorModal = document.getElementById('pc-editor-modal');
    if (!editorModal) return;

    this.state.editorMemoriesBuffer = [...StorageManager.loadMemoriesSafe(CHARACTER_CONFIG.defaultMemories)];
    this.state.editorDiariesBuffer = JSON.parse(JSON.stringify(StorageManager.loadAllDiaries()));

    this._renderEditorMemoriesList();
    this._renderEditorDiariesList();

    editorModal.classList.add('is-open');
  },

  _renderEditorMemoriesList() {
    const container = document.getElementById('editor-memories-container');
    if (!container) return;
    container.innerHTML = '';

    this.state.editorMemoriesBuffer.forEach((mem, idx) => {
      const row = document.createElement('div');
      row.className = 'editor-item-row';
      row.innerHTML = `
        <span class="editor-row-num">#${idx + 1}</span>
        <input type="text" class="editor-input-text" value="${mem.replace(/"/g, '&quot;')}" data-idx="${idx}">
        <button type="button" class="editor-btn-del" data-del="${idx}" title="削除">🗑️</button>
      `;

      row.querySelector('.editor-input-text').onchange = (e) => {
        const val = e.target.value.trim();
        if (val) this.state.editorMemoriesBuffer[idx] = val;
      };

      row.querySelector('.editor-btn-del').onclick = () => {
        this.state.editorMemoriesBuffer.splice(idx, 1);
        this._renderEditorMemoriesList();
      };

      container.appendChild(row);
    });
  },

  _renderEditorDiariesList() {
    const container = document.getElementById('editor-diaries-container');
    if (!container) return;
    container.innerHTML = '';

    if (this.state.editorDiariesBuffer.length === 0) {
      container.innerHTML = `<div style="padding:20px;text-align:center;color:#94a3b8;">まだ日記データがありませんニャ🐾</div>`;
      return;
    }

    this.state.editorDiariesBuffer.forEach((diary, idx) => {
      const card = document.createElement('div');
      card.className = 'editor-diary-card';
      card.innerHTML = `
        <div class="editor-diary-header">
          <span style="font-weight:bold;color:#c2410c;">📅 ${diary.fullDate} (${diary.dateKey})</span>
          <button type="button" class="editor-btn-del" data-del-diary="${idx}" title="この日記を削除">🗑️ 日記削除</button>
        </div>
        <div style="font-size:11px;color:#ea580c;margin-bottom:6px;">🌤️ 天気: ${diary.weather || '快晴'} / 🌡️ 気温: ${diary.temperature || '22'}℃</div>
        <textarea class="editor-diary-textarea" rows="4">${diary.content}</textarea>
      `;

      card.querySelector('.editor-diary-textarea').onchange = (e) => {
        this.state.editorDiariesBuffer[idx].content = e.target.value.trim();
      };

      card.querySelector('[data-del-diary]').onclick = () => {
        if (window.confirm(`${diary.fullDate} の日記を削除してよろしいですかニャ？`)) {
          this.state.editorDiariesBuffer.splice(idx, 1);
          this._renderEditorDiariesList();
        }
      };

      container.appendChild(card);
    });
  },

  _bindUI() {
    const forceReload = () => this.forceRefreshApp();
    const btnForce = document.getElementById('force-refresh-btn');
    const btnDiagForce = document.getElementById('diag-force-reload-btn');
    if (btnForce) btnForce.onclick = forceReload;
    if (btnDiagForce) btnDiagForce.onclick = forceReload;

    const topDiaryBtn = document.getElementById('top-diary-btn');
    const diaryBookModal = document.getElementById('diary-book-modal');
    const closeDiaryBookBtn = document.getElementById('btn-close-diary-book');

    if (topDiaryBtn && diaryBookModal) {
      topDiaryBtn.onclick = () => {
        this.audio.unlockMasterAudio();
        this._renderDiaryBookList();
        diaryBookModal.classList.add('is-open');
      };
    }
    if (closeDiaryBookBtn && diaryBookModal) {
      closeDiaryBookBtn.onclick = () => {
        diaryBookModal.classList.remove('is-open');
      };
    }

    const btnCopyAllDiaries = document.getElementById('btn-copy-all-diaries');
    if (btnCopyAllDiaries) {
      btnCopyAllDiaries.onclick = () => {
        const list = StorageManager.loadAllDiaries();
        if (list.length === 0) {
          Toast.show("まだ日記がありませんニャ🐾", "info");
          return;
        }
        const textToCopy = list.map(d => `【${d.fullDate}】(天気:${d.weather} ${d.temperature}℃)\n${d.content}\n`).join('\n--------------------\n\n');
        navigator.clipboard.writeText(textToCopy).then(() => {
          Toast.show("全日記をクリップボードにコピーしたニャ！📋✨", "success");
        }).catch(() => {
          Toast.show("コピーに失敗しましたニャ", "error");
        });
      };
    }

    // ★【安心ファイル書き出しボタン】
    const btnDownloadBackup = document.getElementById('btn-download-backup');
    if (btnDownloadBackup) {
      btnDownloadBackup.onclick = () => {
        StorageManager.downloadBackupFile("クロちゃんのデータ.json");
        Toast.show("バックアップファイルをダウンロード保存したニャ！📁✨", "success");
      };
    }

    // ★【安心ファイル読み込みボタン】
    const fileInputRestore = document.getElementById('file-input-restore');
    const btnTriggerRestore = document.getElementById('btn-trigger-restore');

    if (btnTriggerRestore && fileInputRestore) {
      btnTriggerRestore.onclick = () => fileInputRestore.click();

      fileInputRestore.onchange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const data = JSON.parse(event.target.result);
            StorageManager.restoreFromDataPackage(data);

            this.memories = StorageManager.loadMemoriesSafe(CHARACTER_CONFIG.defaultMemories);
            this._renderMemories();
            this._renderDiaryBookList();

            Toast.show("ファイルから全データを安全復元したニャン！🎉", "success");
            this.audio.playEffect('purr');
            this.audio.speak("おやびん、データを受け取ったニャン！");

            // ファイル読み込み後は自動でエディターを開いて確認できるようにする
            this.openPCEditor();
          } catch(err) {
            Toast.show("ファイルの読み込みに失敗しましたニャ: " + err.message, "error");
          }
        };
        reader.readAsText(file);
        fileInputRestore.value = '';
      };
    }

    const btnTestModels = document.getElementById('diag-test-models-btn');
    if (btnTestModels) {
      btnTestModels.onclick = async () => {
        Toast.show("Liteモデル接続テスト中ニャ…", "info");
        const key = this.ai.apiKey;
        if (!key) {
          Toast.show("APIキーが設定されていませんニャ", "error");
          return;
        }

        const candidates = ["gemini-3.5-flash-lite", "gemini-2.0-flash-lite", "gemini-2.5-flash-lite", "gemini-1.5-flash-8b"];
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
            if (this.avatar) this.avatar.setEmotion('talking');
          }, () => {
            if (this.avatar) this.avatar.setEmotion('idle');
          });
        } else {
          const reps = ["もぐもぐ…ちゅ〜る最高ニャ！🐟", "うまうまニャン！おかわり希望ニャ🐾"];
          const r = reps[Math.floor(Math.random() * reps.length)];
          this.audio.speak(r, null, () => {
            this.renderBubble('model', r);
            if (this.avatar) this.avatar.setEmotion('talking');
          }, () => {
            if (this.avatar) this.avatar.setEmotion('idle');
          });
        }
      };
    }

    const transformBtn = document.getElementById('transform-btn');
    if (transformBtn) {
      transformBtn.onclick = (e) => {
        e.stopPropagation();
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
        this.audio.stopSpeaking();
        this.state.isThinking = false;
        this.state.isProcessingInput = false;
        this.state.isDiaryProcessing = false;
        if (this.avatar) this.avatar.setEmotion('idle');
        this.audio.speak("ストップしたニャ！ゆっくり話してニャン🐾");
      };
    }

    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) {
      pauseBtn.onclick = () => {
        this.state.isRunning = !this.state.isRunning;
        const icon = document.getElementById('pause-icon');
        const txt = document.getElementById('pause-text');

        if (!this.state.isRunning) {
          pauseBtn.classList.add('is-paused');
          if (icon) icon.textContent = "🛑";
          if (txt) txt.textContent = "お休み中";
          this.audio.stopListening();
          this.audio.stopSpeaking();
          this.renderBubble('model', "お昼寝するニャ…💤");
        } else {
          pauseBtn.classList.remove('is-paused');
          if (icon) icon.textContent = "🟢";
          if (txt) txt.textContent = "会話中";
          this.renderBubble('model', "起きたニャ！呼んでニャ🐾");
          this.audio.startListening();
        }
      };
    }

    const avatarWrapper = document.getElementById('avatar-wrapper');
    if (avatarWrapper) {
      avatarWrapper.onclick = (e) => {
        if (e.target.closest('#transform-btn') || e.target.closest('#snack-btn')) return;
        this.audio.unlockMasterAudio();
        this.audio.playEffect('purr');
        if (this.avatar) {
          this.avatar.setEmotion('happy');
          setTimeout(() => { if (!this.audio.isSpeaking) this.avatar.setEmotion('idle'); }, 1400);
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
        this.audio.unlockMasterAudio();
        const selSp = parseInt(document.getElementById('voice-speaker-select')?.value || '10', 10);
        this.audio.speak("おやびん、わたしはクロだニャン🐾", selSp, () => {
          if (this.avatar) this.avatar.setEmotion('talking');
        }, () => {
          if (this.avatar) this.avatar.setEmotion('idle');
        });
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
            Toast.show(`現在地の座標をセットしたニャ！(${val})`, "success");
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
        const ak = document.getElementById('api-key-input');
        const vk = document.getElementById('voicevox-key-input');
        const as = document.getElementById('accessory-style-select');
        const vs = document.getElementById('voice-speaker-select');
        const vr = document.getElementById('voice-rate');
        const rv = document.getElementById('rate-val');
        const hc = document.getElementById('home-coords-input');

        if (ak) ak.value = this.ai.apiKey;
        if (vk) vk.value = localStorage.getItem('kuro_voicevox_key') || '';
        if (as && this.avatar) as.value = this.avatar.accessoryStyle;
        if (vs) vs.value = this.getSpeakerId();
        if (vr) vr.value = this.audio.rate;
        if (rv) rv.textContent = this.audio.rate.toFixed(2);
        if (hc) hc.value = localStorage.getItem('kuro_home_coords') || '';

        this._renderMemories();
        const mo = document.getElementById('modal-overlay');
        if (mo) mo.style.display = 'flex';
      };
    }

    const modalOverlay = document.getElementById('modal-overlay');
    if (modalOverlay) {
      modalOverlay.onclick = (e) => {
        if (e.target.id === 'modal-overlay') modalOverlay.style.display = 'none';
      };
    }

    const saveSettingsBtn = document.getElementById('save-settings-btn');
    if (saveSettingsBtn) {
      saveSettingsBtn.onclick = async () => {
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
            return;
          }
        }

        this.ai.apiKey = newApiKey;
        localStorage.setItem('kuro_api_key', newApiKey);
        localStorage.setItem('kuro_voicevox_key', newVvKey);
        localStorage.setItem('kuro_voice_speaker_id', newSpeaker);
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
          this.audio.playEffect('purr');
          this.audio.speak("設定バッチリ保存したニャ！");
        }, 1800);
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
        if (modalOverlay) modalOverlay.style.display = 'none';
        document.getElementById('diag-panel')?.classList.add('expanded');
      };
    }
    const closeDiagBtn = document.getElementById('diag-close-btn');
    if (closeDiagBtn) {
      closeDiagBtn.onclick = () => {
        document.getElementById('diag-panel')?.classList.remove('expanded');
      };
    }
  }
};

window.addEventListener('load', () => AppCore.init());
