/* ==========================================================================
   AIペット クロちゃん🐾 対話エンジン＆システムロジック（app.js 完全版）
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
  log(message, type = 'info') {
    const panel = document.getElementById('diag-logs');
    if (!panel) return;
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
    const row = document.createElement('div');
    row.className = `log-row log-${type}`;
    row.textContent = `[${timeStr}] ${message}`;
    panel.appendChild(row);
    panel.scrollTop = panel.scrollHeight;
  }
};

/* ==========================================================================
   ★ MODULE 1: 音声合成＆音声認識（プリフェッチ・自声エコー遮断・漢数字変換・リアル喉鳴らし）
   ========================================================================== */
class AudioSpeechEngine {
  constructor() {
    this.masterAudio = new Audio();
    this.masterAudio.preload = "auto";
    this.isMasterUnlocked = false;
    this.silentWav = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
    
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.audioCtx = AudioCtx ? new AudioCtx() : null;

    this.rate = parseFloat(localStorage.getItem('kuro_rate') || '1.05');
    this.isSpeaking = false;
    this.isListening = false;
    this.recognition = null;
    this.restartTime = null;
    this.isSpeechCommitted = false;
    this.lastRecognizedText = '';
    this.silenceTimeout = null;
    this.watchdogInterval = null;

    // 話者ID・テキストごとのURLスマートキャッシュ
    this.audioUrlCache = new Map();
    this.recentSpokenTexts = [];
    this.lastSpeechEndTime = 0;

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
    this.masterAudio.play().then(() => {
      this.isMasterUnlocked = true;
      Logger.log("[Audio] オーディオアンカー解放完了", "info");
    }).catch(() => {});
  }

  _setupInteractionUnlock() {
    const unlock = () => this.unlockMasterAudio();
    ['pointerdown', 'touchstart', 'click'].forEach(evt => {
      window.addEventListener(evt, unlock, { passive: true, once: true });
    });
  }

  /* ★ スマホスピーカー限界突破：可聴リアル喉鳴らし（85Hz〜120Hz ＋ 25Hz振幅変調 ＋ 触覚微振動） */
  playEffect(type) {
    const ctx = this._getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (type === 'purr') {
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

  /* ★ 漢数字・日時・単位（度・円・匹・歳など）の網羅的なひらがな読み上げ変換エンジン */
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

  /* ★ 音声の事前先読み（プリフェッチ）：キャラクター選択時に裏で即生成 */
  prefetchVoice(text, speakerId) {
    this._fetchMetanMp3Url(text, speakerId).then(() => {
      Logger.log(`[先読み完了⚡] 話者ID:${speakerId} の音声をキャッシュしました`, "info");
    }).catch(() => {});
  }

  /* ★ ポーリング最適化：早とちりフォールバックを防ぐ粘り強い生成待機 */
  async _fetchMetanMp3Url(text, speakerId) {
    const target = text.slice(0, 45);
    const cacheKey = `${speakerId}_${target}`;
    if (this.audioUrlCache.has(cacheKey)) {
      Logger.log(`[キャッシュHit⚡] 話者:${speakerId}`, "success");
      return this.audioUrlCache.get(cacheKey);
    }

    const vvKey = localStorage.getItem('kuro_voicevox_key') || '';
    let initUrl = `https://api.tts.quest/v3/voicevox/synthesis?text=${encodeURIComponent(target)}&speaker=${speakerId}`;
    if (vvKey) initUrl += `&key=${encodeURIComponent(vvKey)}`;

    const initRes = await fetch(initUrl);
    if (!initRes.ok) throw new Error(`HTTPエラー ${initRes.status}`);

    const initData = await initRes.json();
    if (initData.isAudioError) throw new Error("VoiceVox側エラー");

    let downloadUrl = initData.mp3DownloadUrl || initData.mp3StreamingUrl;
    if (!downloadUrl && initData.audioStatusUrl) {
      const statusUrl = initData.audioStatusUrl;
      // 最大36回（約16秒）ポーリングで生成完了を確実に待機
      for (let i = 1; i <= 36; i++) {
        await new Promise(r => setTimeout(r, 450));
        try {
          const sRes = await fetch(statusUrl);
          if (sRes.ok) {
            const sData = await sRes.json();
            if (sData.isAudioReady) {
              downloadUrl = sData.mp3DownloadUrl || downloadUrl;
              break;
            }
          }
        } catch(e) {}
      }
    }

    if (!downloadUrl) throw new Error("タイムアウト");
    if (this.audioUrlCache.size >= 50) this.audioUrlCache.delete(this.audioUrlCache.keys().next().value);
    this.audioUrlCache.set(cacheKey, downloadUrl);
    return downloadUrl;
  }

  _speakFallback(cleanText, onStart, onEnd) {
    if (!window.speechSynthesis) { if (onStart) onStart(); if (onEnd) onEnd(); return; }
    window.speechSynthesis.cancel();
    const uttr = new SpeechSynthesisUtterance(cleanText);
    uttr.lang = 'ja-JP';
    uttr.rate = this.rate;
    uttr.pitch = 1.45;
    uttr.onstart = () => { this.isSpeaking = true; if (onStart) onStart(); };
    uttr.onend = () => { this.isSpeaking = false; this.lastSpeechEndTime = Date.now(); if (onEnd) onEnd(); };
    uttr.onerror = () => { this.isSpeaking = false; this.lastSpeechEndTime = Date.now(); if (onEnd) onEnd(); };
    window.speechSynthesis.speak(uttr);
  }

  /* ★ 自声の跳ね返り（エコーバック）判定：クロ自身の発声を拾った場合は完全無視 */
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

  /* ★ 全発話で選んだ声キャラクターIDを一元反映＆二重発火ガード */
  async speak(text, speakerIdOverride = null, onStart = null, onEnd = null) {
    this.stopSpeaking();
    this.unlockMasterAudio();

    const speakerId = (speakerIdOverride !== null) ? speakerIdOverride : AppCore.getSpeakerId();

    let clean = this._convertAllNumbersToKana(text)
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/[（\(]\s*約?\d+\s*文字\s*[）\)]/g, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/<[^>]*>/g, '')
      .replace(/[*#_~`🐾🐱✨❤️💖🎀🧠⚡🩺💭🎵🍜🥟📍📰🗺️⭐💥📒📖🌐🔷🔴🌤️🛍️💡🐟]/gu, '')
      .trim();

    if (!clean) { if (onStart) onStart(); if (onEnd) onEnd(); return; }

    this.recentSpokenTexts.unshift(clean);
    if (this.recentSpokenTexts.length > 4) this.recentSpokenTexts.pop();

    let hasTriggeredStart = false;
    const triggerStartOnce = () => {
      if (!hasTriggeredStart) {
        hasTriggeredStart = true;
        this.isSpeaking = true;
        if (onStart) onStart();
      }
    };

    try {
      const mp3Url = await this._fetchMetanMp3Url(clean, speakerId);
      this.masterAudio.src = mp3Url;
      this.masterAudio.playbackRate = this.rate;

      this.masterAudio.onplay = () => { triggerStartOnce(); };
      this.masterAudio.onended = () => {
        this.isSpeaking = false;
        this.lastSpeechEndTime = Date.now();
        if (onEnd) onEnd();
      };
      this.masterAudio.onerror = () => { throw new Error("Audio再生エラー"); };
      await this.masterAudio.play();
    } catch (err) {
      Logger.log(`[肉声フォールバック] 標準音声で再生`, "warn");
      this._speakFallback(clean, triggerStartOnce, onEnd);
    }
  }

  stopSpeaking() {
    this.isSpeaking = false;
    this.masterAudio.pause();
    this.masterAudio.currentTime = 0;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
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

      // 声での割り込み停止（バージイン機能）
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
        if (Date.now() - this.lastSpeechEndTime > 1200) {
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
   ★ MODULE 2: 日時・位置情報・リアルタイムお天気 ＆ 自宅フォールバック
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
  detailedAddress: "現在地を取得中…",
  weather: "晴れ",
  isGpsAvailable: false,

  /* ★ GPS優先 ➔ 失敗時のみ「自宅座標・住所」にフォールバック */
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
        Logger.log(`[GPS測位成功(スマホ等)] 座標: ${this.lat.toFixed(4)}, ${this.lon.toFixed(4)}`, "success");
      },
      () => {
        Logger.log(`[GPS不可(PC等)] 設定された自宅・拠点座標へ切り替えます`, "warn");
        this._applyHomeFallback();
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  },

  /* 自宅座標または住所へのフォールバック処理 */
  async _applyHomeFallback() {
    const homeVal = localStorage.getItem('kuro_home_coords') || '';
    if (!homeVal) {
      this.detailedAddress = "東京都東村山市付近（初期設定）";
      this.cityArea = "東京都東村山市";
      this.lat = 35.7582;
      this.lon = 139.4678;
      this._fetchWeather(this.lat, this.lon);
      return;
    }

    // 1. 数字の座標（例: 35.7582, 139.4678）の場合
    const match = homeVal.match(/([-+]?\d+\.\d+)\s*,\s*([-+]?\d+\.\d+)/);
    if (match) {
      this.lat = parseFloat(match[1]);
      this.lon = parseFloat(match[2]);
      this._reverseGeocode(this.lat, this.lon);
      this._fetchWeather(this.lat, this.lon);
      Logger.log(`[自宅座標適用] 座標: ${this.lat}, ${this.lon}`, "info");
      return;
    }

    // 2. 住所文字列（例: 東京都東村山市本町1丁目）の場合 ➔ ジオコーディング変換
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
        const code = data.current_weather?.weathercode || 0;
        if (code <= 1) this.weather = "快晴";
        else if (code <= 3) this.weather = "くもり";
        else if (code >= 51 && code <= 67) this.weather = "雨";
        else if (code >= 71) this.weather = "雪";
        Logger.log(`[お天気取得] 現在の天気: ${this.weather}`, "info");
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
        this.cityArea = `${pref}${city}`.trim();
        this.detailedAddress = [pref, city, a.suburb, a.road].filter(Boolean).join("");
      }
    } catch(e) {}
  }
};

/* ==========================================================================
   ★ MODULE 3: 履歴・記憶・日記・メガネ座標ストレージ
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

  saveDiary(entryText) {
    const dateKey = TimeProvider.getCurrentInfo().logKey;
    const diaryData = { date: TimeProvider.getCurrentInfo().fullDate, content: entryText };
    localStorage.setItem(`kuro_diary_${dateKey}`, JSON.stringify(diaryData));
  },

  getDiary() {
    const dateKey = TimeProvider.getCurrentInfo().logKey;
    const raw = localStorage.getItem(`kuro_diary_${dateKey}`);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch(e) { return null; }
  },

  saveHistory(history) {
    try { localStorage.setItem('kuro_chat_history', JSON.stringify(history.slice(-40))); } catch(e) {}
  },

  loadHistory() {
    try {
      const raw = localStorage.getItem('kuro_chat_history');
      return raw ? JSON.parse(raw) : [];
    } catch(e) { return []; }
  },

  saveMemories(memories) {
    try { localStorage.setItem('kuro_memories_v6', JSON.stringify(memories)); } catch(e) {}
  },

  loadMemories(defaults) {
    try {
      const raw = localStorage.getItem('kuro_memories_v6');
      if (raw) return JSON.parse(raw);
      localStorage.setItem('kuro_memories_v6', JSON.stringify(defaults));
      return defaults.slice();
    } catch(e) { return defaults.slice(); }
  }
};

/* ==========================================================================
   ★ MODULE 4: キャラクター描画 ＆ 各フレーム一体化アクセサリ
   ========================================================================== */
class CatAvatarRenderer {
  constructor() {
    this.wrapper = document.getElementById('avatar-wrapper');
    this.frames = {
      idle: document.getElementById('frame-idle'),
      talking: document.getElementById('frame-talking'),
      thinking: document.getElementById('frame-thinking'),
      happy: document.getElementById('frame-happy')
    };
    this.mode = localStorage.getItem('kuro_avatar_mode') || 'vector';
    this.accessoryStyle = localStorage.getItem('kuro_acc_style') || 'both';
    this.glassesCoords = StorageManager.loadGlassesCoords();
    this.currentEmotion = 'idle';

    this._renderAllAccessories();
    this.applyMode(this.mode);
    this.applyAllFramesTransform();
  }

  /* ★ 4表情すべてのレイヤーに高精細な博士帽＆丸メガネを個別注入 */
  _renderAllAccessories() {
    const svgContent = `
      <svg viewBox="0 0 140 140" style="width:100%; height:100%;">
        <defs>
          <pattern id="stripe-bw-real" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width="4" height="8" fill="#111827"/>
            <rect x="4" width="4" height="8" fill="#ffffff"/>
          </pattern>
        </defs>

        <!-- 昔の大学の博士帽（角帽） -->
        <g class="real-hat-group">
          <path d="M45 42 Q70 34 95 42 L92 49 Q70 41 48 49 Z" fill="#1e293b"/>
          <polygon points="70,18 116,32 70,46 24,32" fill="#0f172a" stroke="#334155" stroke-width="1.2"/>
          <circle cx="70" cy="32" r="3" fill="#eab308"/>
          <g class="mortar-tassel">
            <path d="M70 32 Q95 35 102 54" stroke="#ca8a04" stroke-width="2.2" fill="none"/>
            <polygon points="99,54 105,54 107,68 97,68" fill="#eab308"/>
          </g>
        </g>

        <!-- 白黒ストライプ丸メガネ -->
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
      if (k === emotion) this.frames[k].classList.add('active');
      else this.frames[k].classList.remove('active');
    });

    this.wrapper.classList.remove('is-idling', 'is-talking', 'is-thinking');
    if (emotion === 'idle') this.wrapper.classList.add('is-idling');
    else if (emotion === 'talking') this.wrapper.classList.add('is-talking');
    else if (emotion === 'thinking') this.wrapper.classList.add('is-thinking');
  }

  applyMode(mode) {
    this.mode = mode;
    localStorage.setItem('kuro_avatar_mode', mode);
    const vec = document.getElementById('cat-vector-avatar');

    if (mode === 'vector') {
      this.wrapper.classList.remove('is-real-mode');
      Object.values(this.frames).forEach(f => f.style.display = 'none');
      if (vec) vec.classList.add('active-mode');
    } else {
      this.wrapper.classList.add('is-real-mode');
      if (vec) vec.classList.remove('active-mode');
      Object.values(this.frames).forEach(f => f.style.display = 'flex');
      this.setEmotion(this.currentEmotion || 'idle');
    }
  }

  triggerIdeaBulb() {
    const bulb = document.getElementById('idea-bulb');
    if (!bulb) return;
    bulb.classList.add('active');
    this.wrapper.classList.add('spark-idea');
    setTimeout(() => {
      bulb.classList.remove('active');
      this.wrapper.classList.remove('spark-idea');
    }, 1800);
  }
}

/* ==========================================================================
   ★ MODULE 5: 思考・AI対話エンジン（Flash 3.5 Lite / 3.8 ＆ 多段自動リトライ）
   ========================================================================== */
class AIThoughtEngine {
  constructor() {
    this.apiKey = localStorage.getItem('kuro_api_key') || '';
    this.availableModels = [];
    this.activeLiteModel = null;
    this.activeProModel = null;
    this.proUsedToday = parseInt(localStorage.getItem('kuro_pro_usage_count') || '0', 10);
  }

  getRemainingProQuota() { return Math.max(0, 20 - this.proUsedToday); }
  incrementProQuota() {
    this.proUsedToday++;
    localStorage.setItem('kuro_pro_usage_count', this.proUsedToday);
  }

  async scanModels() {
    if (!this.apiKey) return false;
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`);
      if (!res.ok) return false;
      const data = await res.json();
      const valid = (data.models || []).map(m => m.name.replace(/^models\//, ''));
      this.availableModels = valid;

      const litePref = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
      this.activeLiteModel = litePref.find(m => valid.includes(m)) || valid.find(m => m.includes('flash')) || valid[0];

      const proPref = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.5-pro", "gemini-2.5-pro"];
      this.activeProModel = proPref.find(m => valid.includes(m)) || valid.find(m => m.includes('pro')) || this.activeLiteModel;

      Logger.log(`[モデル最新同期] 3.5枠: ${this.activeLiteModel} / 3.8枠: ${this.activeProModel}`, "success");
      return true;
    } catch(e) { return false; }
  }

  evaluateComplexity(text) {
    if (!text) return false;
    const t = text.trim();
    if (t.includes('3.8') || t.includes('本気で考えて') || t.includes('プログラミング') || t.includes('コード書いて')) return true;
    const hardWords = ['論文', '論理的', 'アルゴリズム', '数理', '英文翻訳して詳しく', '詳しく比較', 'メリットとデメリット', '徹底解説', '詳細な計画'];
    if (hardWords.some(k => t.includes(k))) return true;
    if (t.length >= 70 && (t.includes('そして') || t.includes('さらに') || t.includes('まとめて'))) return true;
    return false;
  }

  /* ★ 多段自動リトライ：Google検索エラーや混雑時でも必ず返答を死守 */
  async generateReply(promptText, isPro, character, memories, isAssistantMode) {
    const timeInfo = TimeProvider.getCurrentInfo();
    const weather = LocationProvider.weather;
    const address = LocationProvider.detailedAddress;

    const isDiary = /(?:今日|きょう)?(?:の)?(?:日記|にっき).*(?:書いて|教えて)/.test(promptText);

    const systemPrompt = `
あなたはノルウェージャンフォレストキャットの1歳の子猫の女の子「${character.name}」です。
【現在状況】日時：${timeInfo.fullDate} ${timeInfo.clock} / 現在地：${address} / 天気：${weather}
【記憶帳】
${memories.map(m => `・${m}`).join('\n')}
【性格・ルール】
- 飼い主さんのことは「おやびん」と呼びます。語尾は「〜ニャ」「〜ニャン♪」「〜だニャ！」。
- 前世は大発明家。テクノロジーやお悩みの話題では「前世の余の大発明」を自慢げに提案します。
- 夜更かししがちなおやびんを心配するお姉さん気取りです。
- ★セリフは必ず【40〜50文字以内（1〜2文）】で完結させてください。
${isAssistantMode ? '- おてつだいモード発動中！話題の単語を末尾に <!--TOPIC:単語--> で添えてください。' : ''}
`;

    let primaryModel = isPro ? this.activeProModel : this.activeLiteModel;
    if (!primaryModel && this.availableModels.length > 0) primaryModel = this.availableModels[0];
    if (!primaryModel) primaryModel = "gemini-2.5-flash";

    // 試行プラン：検索あり ➔（失敗時）検索なし ➔（失敗時）フォールバックモデル
    const attempts = [{ model: primaryModel, useSearch: isAssistantMode }];
    if (isAssistantMode) attempts.push({ model: primaryModel, useSearch: false });
    if (this.availableModels.length > 1) {
      const fb = this.availableModels.find(m => m !== primaryModel) || this.availableModels[0];
      attempts.push({ model: fb, useSearch: false });
    }

    for (let i = 0; i < attempts.length; i++) {
      const att = attempts[i];
      try {
        const bodyPayload = {
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: promptText }] }]
        };
        if (att.useSearch) bodyPayload.tools = [{ googleSearch: {} }];

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${att.model}:generateContent?key=${this.apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload)
        });

        if (res.ok) {
          const data = await res.json();
          const cand = data.candidates?.[0];
          const raw = cand?.content?.parts?.[0]?.text;
          if (raw) {
            let topicTag = "";
            const tm = raw.match(/<!--TOPIC:(.*?)-->/i);
            if (tm) topicTag = tm[1].trim();

            const clean = raw.replace(/<!--[\s\S]*?-->/g, '').replace(/[（\(].*?[）\)]/g, '').trim();

            const chunks = (cand.groundingMetadata?.groundingChunks || []).map(c => ({
              uri: c.web?.uri || '',
              title: c.web?.title || ''
            })).filter(c => c.uri);

            if (isDiary) StorageManager.saveDiary(clean);
            return { success: true, text: clean, topicTag, chunks };
          }
        }
      } catch(e) {}
    }

    return { success: false, error: "ALL_ATTEMPTS_FAILED" };
  }
}

/* ==========================================================================
   ★ MODULE 6: 中央司令塔（AppCore）
   ========================================================================== */
const CHARACTER_CONFIG = {
  name: "クロ",
  defaultMemories: [
    "名前：クロ（ノルウェージャンフォレストキャット、1歳女の子）",
    "飼い主：おやびん（ミッキーさん。世界一好き！）",
    "大好物：ちゅ〜る、かつおぶし、ラーメン、餃子",
    "前世：世界的に有名な大天才発明家（自慢好き）",
    "家族：ママのかよちゃん、お兄ちゃんのりゅうせいくん、弟分のたいせいくん、大親友のかまぶーくん"
  ]
};

const AppCore = {
  state: {
    isRunning: true,
    isThinking: false,
    isProcessingInput: false,
    isAssistantMode: false,
    pending38Prompt: null,
    editingMemoryIdx: null,
    activeAdjustTab: 'idle',
    snackCount: 0,
    timerId: null,
    timerSeconds: 0
  },

  audio: new AudioSpeechEngine(),
  ai: new AIThoughtEngine(),
  avatar: null,
  memories: [],
  history: [],

  /* ★ 全体で一元化された声のキャラクターID取得 */
  getSpeakerId() {
    return parseInt(localStorage.getItem('kuro_voice_speaker_id') || '0', 10);
  },

  async init() {
    this.avatar = new CatAvatarRenderer();
    this.memories = StorageManager.loadMemories(CHARACTER_CONFIG.defaultMemories);
    this.history = StorageManager.loadHistory();

    this.state.isAssistantMode = localStorage.getItem('kuro_mode') === 'assistant';
    this._updateModeUI(false);

    this._setupAudioCallbacks();
    this._bindUI();
    this._bindGlassesAdjusterUI();
    this._renderMemories();
    this._renderDiaryPreview();
    this._restoreTimelineHistory();
    this._updateModelBadge();

    // GPS優先 ＋ 自宅フォールバック判定
    LocationProvider.initWatcher();

    if (this.ai.apiKey) await this.ai.scanModels();

    // 保存済み設定の復元
    const savedSpeaker = localStorage.getItem('kuro_voice_speaker_id') || '0';
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

    // 初回のテスト音声を裏で先読みキャッシュ
    this.audio.prefetchVoice("おやびん、わたしはクロだニャン🐾", parseInt(savedSpeaker, 10));

    setInterval(() => {
      document.getElementById('clock-display').textContent = TimeProvider.getCurrentInfo().clock;
    }, 1000);

    setTimeout(() => { if (this.state.isRunning) this.audio.startListening(); }, 600);
    Logger.log("[AppCore] 準備完了ニャ！いつでも話しかけてニャ🐾", "success");
  },

  _restoreTimelineHistory() {
    const box = document.getElementById('chat-timeline');
    box.innerHTML = '';
    if (this.history.length === 0) {
      this.renderBubble('model', "おやびん、わたしはクロだニャ🐾 何でも話しかけてニャン♪");
      return;
    }
    this.history.forEach(h => this.renderBubble(h.role, h.text));
  },

  _setupAudioCallbacks() {
    this.audio.onBargeIn = () => {
      this.avatar.setEmotion('idle');
      this.state.isThinking = false;
      this.state.isProcessingInput = false;
      document.getElementById('status-text').textContent = "👂 聴いてるニャ…";
      this.audio.playEffect('aizuchi');
    };

    this.audio.onInterimUpdate = (text) => {
      if (!this.state.isRunning || this.state.isThinking || this.state.isProcessingInput) return;
      document.body.classList.add('is-hearing');
      document.getElementById('status-text').textContent = "👂 聴いてるニャ…";
    };

    this.audio.onSpeechFinal = (finalText) => {
      if (this.state.isProcessingInput) return;
      this.state.isProcessingInput = true;
      document.body.classList.remove('is-hearing');
      this.renderBubble('user', finalText);
      this.handleUserInput(finalText);
    };

    this.audio.onListeningStatus = (l) => {
      document.getElementById('status-text').textContent = l ? (this.state.isAssistantMode ? "👓 お調べするニャ！" : "👂 聴いてるニャ♪") : "💭 待機中ニャ…";
    };
  },

  renderBubble(role, text, cards = []) {
    const box = document.getElementById('chat-timeline');
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
  },

  /* ★ 即答ロジック（呼びかけ・時間・日付等の0秒即座返答） */
  _checkDirectIntent(text) {
    let clean = text.replace(/^(?:ねえ|あのね|おーい)?\s*(?:クロちゃん|クロ|くろ)[、,\s]*/i, '').trim();

    if (!clean || /^(?:呼んだだけ|なんでもない|いる|お返事)$/.test(clean)) {
      const reps = ["ニャン！呼んだかニャ？おやびん♪", "起きてるニャン！何でも話しかけてニャ🐾", "ニャー♪ クロはここにいるニャン！"];
      const rep = reps[Math.floor(Math.random() * reps.length)];
      return { display: rep, spoken: rep };
    }

    if (/^(?:おはよう|おはよー)/.test(clean)) return { display: "おやびん、おはようニャン🐾 今日もいい日にするニャ！", spoken: "おやびん、おはようニャン！" };
    if (/^(?:こんにちは|こんにちわ)/.test(clean)) return { display: "おやびん、こんにちはニャ♪ 元気いっぱいニャン！", spoken: "おやびん、こんにちはニャ！" };
    if (/^(?:おやすみ|寝るね)/.test(clean)) return { display: "おやすみニャン…いい夢見てニャ、おやびん💤", spoken: "おやすみニャン、いい夢見てニャ！" };

    if (/(?:いま|今)?(?:何時|なんじ|時間)/.test(clean) && !/(?:何日|いつ|日記)/.test(clean)) {
      const info = TimeProvider.getCurrentInfo();
      return { display: info.clockDisplay, spoken: info.spokenClock };
    }

    if (/(?:今日|きょう).*(?:何日|なんにち|いつ|何曜日|なんようび)|日付/.test(clean)) {
      const info = TimeProvider.getCurrentInfo();
      return { display: info.dateDisplay, spoken: info.spokenDate };
    }

    if (/(?:現在地|いまどこ|今どこ|ここどこ)/.test(clean)) {
      const disp = LocationProvider.cityArea || "現在地付近";
      const cards = this.state.isAssistantMode ? [{
        type: 'map-primary',
        icon: '📍',
        title: `Googleマップで現在地を見る`,
        url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(LocationProvider.detailedAddress)}`
      }] : [];
      return { display: `いまは${disp}にいるニャン🐾`, spoken: `今の場所は、${disp}にいるニャン！`, cards };
    }

    return null;
  },

  _generateSmartCards(userText, topic, chunks) {
    if (!this.state.isAssistantMode) return [];
    const cards = [];
    const area = LocationProvider.cityArea || "";
    const desiredSpots = parseInt(localStorage.getItem('kuro_spot_count') || '2', 10);
    const desiredNews = parseInt(localStorage.getItem('kuro_news_count') || '2', 10);

    if (/(?:ラーメン|餃子|タイ料理|焼肉|ランチ|ご飯|居酒屋|お店|スポット|グルメ|寿司|カレー)/.test(userText)) {
      const shop = topic || "人気店";
      cards.push({
        type: 'map-primary',
        icon: '📍',
        title: `【イチオシ】${shop}（Googleマップ）`,
        url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop + ' ' + area)}`
      });

      let added = 1;
      for (const ch of chunks) {
        if (added >= desiredSpots) break;
        if (ch.uri && ch.uri.startsWith('http')) {
          cards.push({ type: 'map-sub', icon: '🏪', title: ch.title || '周辺店舗情報', url: ch.uri });
          added++;
        }
      }

      cards.push({
        type: 'map-all',
        icon: '🗺️',
        title: `現在地近くのお店一覧`,
        url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((topic || 'グルメ') + ' ' + area)}`
      });
    }

    if (/(?:ニュース|速報|話題|出来事)/.test(userText)) {
      const t = topic || "最新ニュース";
      cards.push({
        type: 'news-primary',
        icon: '📰',
        title: `「${t}」の詳細ニュース`,
        url: `https://news.google.com/search?q=${encodeURIComponent(t)}&hl=ja&gl=JP&ceid=JP:ja`
      });

      let nAdded = 1;
      for (const ch of chunks) {
        if (nAdded >= desiredNews) break;
        if (ch.uri && ch.uri.startsWith('http')) {
          cards.push({ type: 'news-sub', icon: '💡', title: ch.title || '関連記事', url: ch.uri });
          nAdded++;
        }
      }
    }
    return cards;
  },

  async handleUserInput(text) {
    this.audio.playEffect('aizuchi');

    // 1. タイマー判定
    const timerMatch = text.match(/(\d+)\s*分.*(?:測って|タイマー|計って|おしえて)/);
    if (timerMatch) {
      const mins = parseInt(timerMatch[1], 10);
      this.startKitchenTimer(mins);
      const rep = `了解ニャ！${mins}分クロがしっかり見ておくニャン🐾`;
      this.audio.speak(rep, null, () => this.renderBubble('model', rep));
      return;
    }

    // 2. 即答ロジック判定（0秒即答）
    const direct = this._checkDirectIntent(text);
    if (direct) {
      this.audio.speak(direct.spoken, null, () => {
        this.renderBubble('model', direct.display, direct.cards || []);
      }, () => {
        this.state.isProcessingInput = false;
        if (this.state.isRunning) setTimeout(() => this.audio.startListening(), 800);
      });
      return;
    }

    // 3. ひらめき演出（珍発明や質問）
    if (/(?:どう|困った|疲れた|発明|ひらめき|教えて)/.test(text)) {
      this.audio.playEffect('idea');
      this.avatar.triggerIdeaBulb();
    }

    // 4. Flash 3.8提案判定
    if (this.ai.evaluateComplexity(text) && this.ai.getRemainingProQuota() > 0) {
      this.askProApproval(text);
      return;
    }

    this.executeThought(text, false);
  },

  askProApproval(promptText) {
    this.state.pending38Prompt = promptText;
    const remaining = this.ai.getRemainingProQuota();
    this._updateModelBadge(true);

    const ask = `難しそうだニャ…！本気モードの『Flash 3.8』で考えてもいいかニャ？（今日あと${remaining}回ニャ🐾）`;

    const row = document.createElement('div');
    row.className = 'chat-row model';
    row.innerHTML = `
      <div class="chat-bubble">
        <div>${ask}</div>
        <div class="confirm-actions">
          <button class="confirm-btn yes" id="btn-approve">✨ 3.8でお願い</button>
          <button class="confirm-btn no" id="btn-deny">🐾 3.5 Liteでいいよ</button>
        </div>
      </div>
    `;
    document.getElementById('chat-timeline').appendChild(row);
    document.getElementById('chat-timeline').scrollTop = document.getElementById('chat-timeline').scrollHeight;

    document.getElementById('btn-approve').onclick = () => {
      this.renderBubble('user', "3.8でお願いニャ！");
      const p = this.state.pending38Prompt;
      this.state.pending38Prompt = null;
      this.executeThought(p, true);
    };
    document.getElementById('btn-deny').onclick = () => {
      this.renderBubble('user', "3.5 Liteでいいよ");
      const p = this.state.pending38Prompt;
      this.state.pending38Prompt = null;
      this.executeThought(p, false);
    };

    this.audio.speak(ask, null, null, () => { this.state.isProcessingInput = false; });
  },

  async executeThought(promptText, isPro) {
    this.state.isThinking = true;
    this.avatar.setEmotion('thinking');
    document.getElementById('status-text').textContent = "💭 考え中ニャ…";

    if (isPro) {
      this.ai.incrementProQuota();
      this._updateModelBadge(false, true);
    } else {
      this._updateModelBadge(false, false);
    }

    const res = await this.ai.generateReply(promptText, isPro, CHARACTER_CONFIG, this.memories, this.state.isAssistantMode);

    if (res.success && res.text) {
      this.history.push({ role: 'user', text: promptText });
      this.history.push({ role: 'model', text: res.text });
      StorageManager.saveHistory(this.history);

      const cards = this._generateSmartCards(promptText, res.topicTag, res.chunks);
      this.audio.speak(res.text, null, () => {
        this.renderBubble('model', res.text, cards);
        this.avatar.setEmotion('talking');
      }, () => {
        this.avatar.setEmotion('idle');
        this.state.isThinking = false;
        this.state.isProcessingInput = false;
        this._updateModelBadge(false, false);
        if (this.state.isRunning) setTimeout(() => this.audio.startListening(), 800);
      });
    } else {
      this.avatar.setEmotion('idle');
      this.state.isThinking = false;
      this.state.isProcessingInput = false;
      this._updateModelBadge(false, false);
      const fb = "うまく聞き取れなかったニャ。もう一度お話ししてニャン🐾";
      this.audio.speak(fb, null, () => this.renderBubble('model', fb));
    }
  },

  startKitchenTimer(minutes) {
    if (this.state.timerId) clearInterval(this.state.timerId);
    this.state.timerSeconds = minutes * 60;
    const badge = document.getElementById('timer-active-badge');
    const disp = document.getElementById('timer-count-disp');
    badge.style.display = 'inline-flex';

    this.state.timerId = setInterval(() => {
      this.state.timerSeconds--;
      const m = Math.floor(this.state.timerSeconds / 60);
      const s = this.state.timerSeconds % 60;
      disp.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

      if (this.state.timerSeconds <= 0) {
        clearInterval(this.state.timerId);
        badge.style.display = 'none';
        this.audio.playEffect('bell');
        const alertMsg = `おやびん！${minutes}分経ったニャ！ラーメン伸びちゃうニャー！🍜🔔`;
        this.audio.speak(alertMsg, null, () => this.renderBubble('model', alertMsg));
      }
    }, 1000);
  },

  _updateModelBadge(isProProposing = false, isProExecuting = false) {
    const badge = document.getElementById('model-badge');
    const remaining = this.ai.getRemainingProQuota();

    if (isProProposing) {
      badge.className = "model-badge pro";
      badge.textContent = `✨ 3.8提案中(残:${remaining})`;
    } else if (isProExecuting) {
      badge.className = "model-badge pro";
      badge.textContent = `🧠 3.8 Flash`;
    } else {
      badge.className = "model-badge lite";
      badge.textContent = `🐾 3.5 Lite`;
    }
  },

  _renderMemories() {
    const container = document.getElementById('memory-list-container');
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

  _renderDiaryPreview() {
    const c = document.getElementById('diary-preview-container');
    const diary = StorageManager.getDiary();
    if (diary) {
      c.innerHTML = `<div class="diary-preview-title">🐾 ${diary.date} のクロ日記</div><div>${diary.content}</div>`;
    }
  },

  _updateModeUI(speak = true) {
    const btn = document.getElementById('mode-toggle-btn');
    const icon = document.getElementById('mode-icon');
    const txt = document.getElementById('mode-text');
    const wrap = document.getElementById('avatar-wrapper');

    btn.classList.toggle('is-assistant', this.state.isAssistantMode);
    wrap.classList.toggle('is-assistant-mode', this.state.isAssistantMode);

    if (this.state.isAssistantMode) {
      icon.textContent = "👓"; txt.textContent = "おてつだい";
      if (speak) this.audio.speak("前世の天才頭脳でバッチリ調べるニャ！");
    } else {
      icon.textContent = "🐾"; txt.textContent = "なかよし";
      if (speak) this.audio.speak("ニャン♪ のんびり遊ぶニャ！");
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

    const updateSliders = (tab) => {
      const c = this.avatar.glassesCoords[tab] || { x: 0, y: 120, scale: 1.0, rotate: 0 };
      slX.value = c.x; slY.value = c.y; slScale.value = c.scale; slRotate.value = c.rotate;
      valX.textContent = c.x; valY.textContent = c.y; valScale.textContent = parseFloat(c.scale).toFixed(2); valRotate.textContent = `${c.rotate}°`;
      previewAcc.style.bottom = `${c.y}px`;
      previewAcc.style.left = `calc(50% + ${c.x}px)`;
      previewAcc.style.transform = `translateX(-50%) scale(${c.scale}) rotate(${c.rotate}deg)`;
    };

    const onInput = () => {
      const c = { x: parseInt(slX.value, 10), y: parseInt(slY.value, 10), scale: parseFloat(slScale.value), rotate: parseInt(slRotate.value, 10) };
      this.avatar.glassesCoords[this.state.activeAdjustTab] = c;
      valX.textContent = c.x; valY.textContent = c.y; valScale.textContent = c.scale.toFixed(2); valRotate.textContent = `${c.rotate}°`;
      previewAcc.style.bottom = `${c.y}px`;
      previewAcc.style.left = `calc(50% + ${c.x}px)`;
      previewAcc.style.transform = `translateX(-50%) scale(${c.scale}) rotate(${c.rotate}deg)`;
      this.avatar.applyAllFramesTransform();
    };

    [slX, slY, slScale, slRotate].forEach(el => el.addEventListener('input', onInput));

    document.querySelectorAll('.adjust-tab-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.adjust-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        this.state.activeAdjustTab = tab;
        previewImg.src = `${tab}.jpg`;
        updateSliders(tab);
      };
    });

    document.getElementById('open-glasses-adjust-btn').onclick = () => {
      document.getElementById('modal-overlay').style.display = 'none';
      modal.classList.add('is-open');
      updateSliders(this.state.activeAdjustTab);
    };

    document.getElementById('close-adjust-btn').onclick = () => {
      modal.classList.remove('is-open');
      StorageManager.saveGlassesCoords(this.avatar.glassesCoords);
    };

    document.getElementById('btn-adjust-save').onclick = () => {
      StorageManager.saveGlassesCoords(this.avatar.glassesCoords);
      this.audio.playEffect('happy_meow');
      Toast.show("位置をバッチリ保存したニャン！👓✨", "success");
    };

    document.getElementById('btn-adjust-reset').onclick = () => {
      const def = StorageManager.defaultGlassesCoords[this.state.activeAdjustTab];
      this.avatar.glassesCoords[this.state.activeAdjustTab] = JSON.parse(JSON.stringify(def));
      updateSliders(this.state.activeAdjustTab);
      this.avatar.applyAllFramesTransform();
    };
  },

  _bindUI() {
    // おやつ（ちゅ〜る）ボタン
    document.getElementById('snack-btn').onclick = () => {
      this.audio.unlockMasterAudio();
      this.state.snackCount++;
      this.audio.playEffect('snack');
      this.avatar.setEmotion('happy');

      if (this.state.snackCount >= 3) {
        this.state.snackCount = 0;
        this.audio.playEffect('purr');
        const msg = "ハフハフ…うまうまニャ！お腹いっぱい大満足ニャ〜極楽ニャン♡";
        this.audio.speak(msg, null, () => this.renderBubble('model', msg));
      } else {
        const reps = ["もぐもぐ…ちゅ〜る最高ニャ！🐟", "うまうまニャン！おかわり希望ニャ🐾"];
        const r = reps[Math.floor(Math.random() * reps.length)];
        this.audio.speak(r, null, () => this.renderBubble('model', r));
      }
    };

    // 変身ボタン
    document.getElementById('transform-btn').onclick = () => {
      this.audio.unlockMasterAudio();
      const next = (this.avatar.mode === 'vector') ? 'real' : 'vector';
      this.avatar.applyMode(next);
      Toast.show(`姿を変身したニャ！✨（${next === 'real' ? 'リアル写真' : 'イラスト'}）`, 'info');
    };

    // モード切替
    document.getElementById('mode-toggle-btn').onclick = () => {
      this.state.isAssistantMode = !this.state.isAssistantMode;
      localStorage.setItem('kuro_mode', this.state.isAssistantMode ? 'assistant' : 'pet');
      this._updateModeUI(true);
    };

    // ストップ
    document.getElementById('stop-action-btn').onclick = () => {
      this.audio.stopSpeaking();
      this.state.isThinking = false;
      this.state.isProcessingInput = false;
      this.avatar.setEmotion('idle');
      this.audio.speak("ストップしたニャ！ゆっくり話してニャン🐾");
    };

    // 会話中 / お休み切替
    document.getElementById('pause-btn').onclick = () => {
      this.state.isRunning = !this.state.isRunning;
      const icon = document.getElementById('pause-icon');
      const txt = document.getElementById('pause-text');
      const btn = document.getElementById('pause-btn');

      if (!this.state.isRunning) {
        btn.classList.add('is-paused');
        icon.textContent = "🛑"; txt.textContent = "お休み中";
        this.audio.stopListening();
        this.audio.stopSpeaking();
        this.renderBubble('model', "お昼寝するニャ…💤");
      } else {
        btn.classList.remove('is-paused');
        icon.textContent = "🟢"; txt.textContent = "会話中";
        this.renderBubble('model', "起きたニャ！呼んでニャ🐾");
        this.audio.startListening();
      }
    };

    // なでなで
    document.getElementById('avatar-wrapper').onclick = (e) => {
      if (e.target.closest('#transform-btn') || e.target.closest('#snack-btn')) return;
      this.audio.unlockMasterAudio();
      this.audio.playEffect('purr');
      this.avatar.setEmotion('happy');
      setTimeout(() => { if (!this.audio.isSpeaking) this.avatar.setEmotion('idle'); }, 900);
    };

    // ★ 声キャラクター変更時に即座に先読みプリフェッチ
    document.getElementById('voice-speaker-select').onchange = (e) => {
      const newSp = parseInt(e.target.value, 10);
      this.audio.prefetchVoice("おやびん、わたしはクロだニャン🐾", newSp);
    };

    // 音声テストボタン（選択中のボイスで即座にリアル肉声再生）
    document.getElementById('test-voice-btn').onclick = () => {
      this.audio.unlockMasterAudio();
      const selSp = parseInt(document.getElementById('voice-speaker-select').value, 10);
      this.audio.speak("おやびん、わたしはクロだニャン🐾", selSp);
    };

    // 話すスピードスライダー
    document.getElementById('voice-rate').oninput = (e) => {
      const r = parseFloat(e.target.value);
      this.audio.setRate(r);
      document.getElementById('rate-val').textContent = r.toFixed(2);
    };

    // ★ 自宅座標：スマホの現在地をセットボタン
    document.getElementById('btn-get-current-home').onclick = () => {
      if (!('geolocation' in navigator)) {
        Toast.show("端末の位置情報機能がオフになっていますニャ", "error");
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const val = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
          document.getElementById('home-coords-input').value = val;
          Toast.show(`現在地の座標をセットしたニャ！(${val})`, "success");
        },
        (err) => {
          Toast.show(`現在地を取得できませんでした: ${err.message}`, "error");
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    };

    // ★ 自宅座標：クリップボードへコピーボタン（PC移行用）
    document.getElementById('btn-copy-home-coords').onclick = () => {
      const val = document.getElementById('home-coords-input').value.trim();
      if (!val) {
        Toast.show("コピーする座標がありませんニャ", "error");
        return;
      }
      navigator.clipboard.writeText(val).then(() => {
        Toast.show("座標をクリップボードにコピーしたニャ！PCに貼り付けてニャ🐾", "success");
      }).catch(() => {
        Toast.show("コピーに失敗しました。手動でコピーしてニャ🐾", "error");
      });
    };

    // 設定モーダル開閉
    document.getElementById('settings-btn').onclick = () => {
      document.getElementById('api-key-input').value = this.ai.apiKey;
      document.getElementById('voicevox-key-input').value = localStorage.getItem('kuro_voicevox_key') || '';
      document.getElementById('accessory-style-select').value = this.avatar.accessoryStyle;
      document.getElementById('voice-speaker-select').value = this.getSpeakerId();
      document.getElementById('voice-rate').value = this.audio.rate;
      document.getElementById('rate-val').textContent = this.audio.rate.toFixed(2);
      document.getElementById('home-coords-input').value = localStorage.getItem('kuro_home_coords') || '';

      this._renderMemories();
      this._renderDiaryPreview();
      document.getElementById('modal-overlay').style.display = 'flex';
    };

    document.getElementById('modal-overlay').onclick = (e) => {
      if (e.target.id === 'modal-overlay') document.getElementById('modal-overlay').style.display = 'none';
    };

    // ★ 2つのAPI個別チェック＆完全連動保存ボタン
    document.getElementById('save-settings-btn').onclick = async () => {
      this.audio.unlockMasterAudio();
      const btn = document.getElementById('save-settings-btn');
      const btnIcon = document.getElementById('save-btn-icon');
      const btnText = document.getElementById('save-btn-text');
      const apiInput = document.getElementById('api-key-input');
      const vvInput = document.getElementById('voicevox-key-input');

      apiInput.classList.remove('input-error-shake');
      vvInput.classList.remove('input-error-shake');

      const newApiKey = apiInput.value.trim();
      const newVvKey = vvInput.value.trim();
      const newAccStyle = document.getElementById('accessory-style-select').value;
      const newSpeaker = document.getElementById('voice-speaker-select').value;
      const newRate = parseFloat(document.getElementById('voice-rate').value);
      const newNews = document.getElementById('news-count-select').value;
      const newSpot = document.getElementById('spot-count-select').value;
      const newHome = document.getElementById('home-coords-input').value.trim();

      btn.classList.add('is-saving');
      btnIcon.innerHTML = `<div class="spinner"></div>`;
      btnText.textContent = "キーを確認中ニャ…";

      // 1. Google APIキーの検証
      if (newApiKey) {
        try {
          const testRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${newApiKey}`);
          if (!testRes.ok) throw new Error("無効なGoogleキー");
        } catch(e) {
          btn.classList.remove('is-saving');
          btnIcon.textContent = "⚠️";
          btnText.textContent = "保存できませんでした";
          apiInput.classList.add('input-error-shake');
          Toast.show("Google APIキーが間違っているニャ！再確認してニャ🐾", "error");
          return;
        }
      }

      // 2. VoiceVox APIキーの検証（入力がある場合のみ）
      if (newVvKey) {
        try {
          const vvRes = await fetch(`https://api.tts.quest/v3/voicevox/synthesis?text=%E3%83%8B%E3%83%A3&speaker=0&key=${encodeURIComponent(newVvKey)}`);
          if (vvRes.ok) {
            const vvData = await vvRes.json();
            if (vvData.isAudioError) throw new Error("無効なVoiceVoxキー");
          } else {
            throw new Error("無効なVoiceVoxキー");
          }
        } catch(e) {
          btn.classList.remove('is-saving');
          btnIcon.textContent = "⚠️";
          btnText.textContent = "保存できませんでした";
          vvInput.classList.add('input-error-shake');
          Toast.show("VoiceVoxキーが無効ニャ！空欄にするか正しいキーを入れてニャ🐾", "error");
          return;
        }
      }

      // 値の保存確定
      this.ai.apiKey = newApiKey;
      localStorage.setItem('kuro_api_key', newApiKey);
      localStorage.setItem('kuro_voicevox_key', newVvKey);
      localStorage.setItem('kuro_voice_speaker_id', newSpeaker);
      localStorage.setItem('kuro_news_count', newNews);
      localStorage.setItem('kuro_spot_count', newSpot);
      localStorage.setItem('kuro_home_coords', newHome);

      this.audio.setRate(newRate);
      this.avatar.applyAccessoryStyle(newAccStyle);

      // 自宅座標の更新反映
      LocationProvider._applyHomeFallback();

      btn.classList.remove('is-saving');
      btn.classList.add('is-success');
      btnIcon.textContent = "✅";

      let successMessage = "✅ 設定バッチリ保存したニャン♪";
      if (newApiKey && newVvKey) {
        successMessage = "Google AI & VoiceVox ともに接続OKニャン♪";
      } else if (newApiKey) {
        successMessage = "Google AI接続OKニャン♪（音声は無料共有枠）";
      }
      btnText.textContent = successMessage;

      setTimeout(() => {
        document.getElementById('modal-overlay').style.display = 'none';
        btn.classList.remove('is-success');
        btnIcon.textContent = "💾";
        btnText.textContent = "設定と記憶を保存するニャン♪";
        Toast.show(successMessage, "success");
        this.audio.playEffect('purr');
        this.audio.speak("設定バッチリ保存したニャ！");
      }, 1800);
    };

    // 記憶帳の新規追加
    document.getElementById('add-memory-btn').onclick = () => {
      const inp = document.getElementById('new-memory-input');
      const val = inp.value.trim();
      if (val) {
        this.memories.unshift(val);
        StorageManager.saveMemories(this.memories);
        inp.value = '';
        this._renderMemories();
      }
    };

    // 診断モニタ
    document.getElementById('open-diag-modal-btn').onclick = () => {
      document.getElementById('modal-overlay').style.display = 'none';
      document.getElementById('diag-panel').classList.add('expanded');
    };
    document.getElementById('diag-close-btn').onclick = () => {
      document.getElementById('diag-panel').classList.remove('expanded');
    };
  }
};

window.addEventListener('load', () => AppCore.init());


