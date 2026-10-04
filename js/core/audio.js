/* ==========================================================================
   Beat The Arcade — js/core/audio.js
   Retro sound effects generated entirely with the Web Audio API.

   There are no audio files. Every sound is an oscillator sweep or a burst of
   filtered noise, which keeps the whole site self-contained and instant.

   Browsers block audio until the user interacts, so the context is created
   lazily on the first pointer/key press. Sound is muted by default and the
   preference is persisted.
   ========================================================================== */

(function (Arcade) {
  "use strict";

  var storage = Arcade.storage;

  var ctx = null;
  var master = null;
  var noiseBuffer = null;
  var muted = storage.get("audio.muted", true) !== false;
  var listeners = [];
  var armed = false;

  /* ---------------------------------------------------------------------- */
  /* context bootstrap                                                      */
  /* ---------------------------------------------------------------------- */

  function ensureContext() {
    if (ctx) return ctx;
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch (err) {
      ctx = null;
      return null;
    }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;
    master.connect(ctx.destination);
    return ctx;
  }

  function resume() {
    if (ctx && ctx.state === "suspended") {
      var p = ctx.resume();
      if (p && p.catch) p.catch(function () {});
    }
  }

  /** Attach one-shot gesture listeners so the first tap/keypress unlocks audio. */
  function arm() {
    if (armed) return;
    armed = true;
    var events = ["pointerdown", "touchstart", "keydown", "mousedown"];
    function unlock() {
      ensureContext();
      resume();
      events.forEach(function (name) {
        window.removeEventListener(name, unlock, true);
      });
    }
    events.forEach(function (name) {
      window.addEventListener(name, unlock, true);
    });
  }

  /**
   * Create the context now (call from a user gesture handler).
   * Safe to call repeatedly.
   */
  function init() {
    ensureContext();
    resume();
    arm();
    return !!ctx;
  }

  /* ---------------------------------------------------------------------- */
  /* primitives                                                             */
  /* ---------------------------------------------------------------------- */

  /**
   * A single shaped tone.
   * @param {Object} o freq, to, dur, type, vol, delay, attack, release
   */
  function beep(o) {
    if (muted) return;
    var c = ensureContext();
    if (!c) return;
    resume();

    var opts = o || {};
    var now = c.currentTime + (opts.delay || 0);
    var dur = opts.dur == null ? 0.09 : opts.dur;
    var attack = opts.attack == null ? 0.005 : opts.attack;
    var release = opts.release == null ? 0.06 : opts.release;
    var vol = opts.vol == null ? 0.25 : opts.vol;

    var osc = c.createOscillator();
    var gain = c.createGain();

    osc.type = opts.type || "square";
    osc.frequency.setValueAtTime(Math.max(20, opts.freq || 440), now);
    if (opts.to) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), now + dur);
    }

    // simple AD envelope; never ramp to exactly 0 (InvalidStateError)
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(vol, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur + release);

    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + dur + release + 0.02);
  }

  function noiseBufferFor(c) {
    if (noiseBuffer) return noiseBuffer;
    var len = Math.floor(c.sampleRate * 0.6);
    var buf = c.createBuffer(1, len, c.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    noiseBuffer = buf;
    return buf;
  }

  /**
   * Filtered noise burst — used for explosions and line clears.
   * @param {Object} o dur, vol, from, to, q, type, delay
   */
  function noise(o) {
    if (muted) return;
    var c = ensureContext();
    if (!c) return;
    resume();

    var opts = o || {};
    var now = c.currentTime + (opts.delay || 0);
    var dur = opts.dur == null ? 0.3 : opts.dur;

    var src = c.createBufferSource();
    src.buffer = noiseBufferFor(c);

    var filter = c.createBiquadFilter();
    filter.type = opts.type || "lowpass";
    filter.frequency.setValueAtTime(opts.from == null ? 1600 : opts.from, now);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(40, opts.to == null ? 120 : opts.to),
      now + dur
    );
    filter.Q.value = opts.q == null ? 1 : opts.q;

    var gain = c.createGain();
    var vol = opts.vol == null ? 0.3 : opts.vol;
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  /* ---------------------------------------------------------------------- */
  /* preset bank                                                            */
  /* ---------------------------------------------------------------------- */

  var presets = {
    /* ui */
    blip: function () {
      beep({ freq: 880, to: 1320, dur: 0.05, type: "square", vol: 0.16 });
    },
    select: function () {
      beep({ freq: 620, to: 980, dur: 0.07, type: "square", vol: 0.2 });
    },
    back: function () {
      beep({ freq: 700, to: 420, dur: 0.08, type: "square", vol: 0.18 });
    },
    toggle: function () {
      beep({ freq: 1200, to: 1600, dur: 0.035, type: "triangle", vol: 0.14 });
    },
    error: function () {
      beep({ freq: 220, to: 150, dur: 0.16, type: "sawtooth", vol: 0.2 });
    },

    /* tic tac toe */
    place: function () {
      beep({ freq: 520, to: 700, dur: 0.06, type: "triangle", vol: 0.26 });
    },
    oplace: function () {
      beep({ freq: 400, to: 540, dur: 0.06, type: "triangle", vol: 0.26 });
    },
    win: function () {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
        beep({ freq: f, dur: 0.1, type: "square", vol: 0.2, delay: i * 0.085 });
      });
    },
    lose: function () {
      [392, 329.63, 261.63].forEach(function (f, i) {
        beep({ freq: f, dur: 0.16, type: "sawtooth", vol: 0.18, delay: i * 0.13 });
      });
    },
    draw: function () {
      beep({ freq: 440, dur: 0.12, type: "triangle", vol: 0.2 });
      beep({ freq: 440, dur: 0.12, type: "triangle", vol: 0.2, delay: 0.18 });
    },

    /* invasion */
    laser: function () {
      beep({ freq: 1400, to: 380, dur: 0.1, type: "square", vol: 0.16 });
    },
    alienStep: function () {
      beep({ freq: 150, to: 110, dur: 0.07, type: "square", vol: 0.13 });
    },
    explode: function () {
      noise({ dur: 0.34, vol: 0.34, from: 1800, to: 90, type: "lowpass" });
      beep({ freq: 180, to: 60, dur: 0.28, type: "sawtooth", vol: 0.14 });
    },
    hit: function () {
      noise({ dur: 0.22, vol: 0.3, from: 900, to: 140 });
    },
    drone: function () {
      beep({ freq: 900, to: 1500, dur: 0.12, type: "sine", vol: 0.16 });
      beep({ freq: 1500, to: 900, dur: 0.12, type: "sine", vol: 0.16, delay: 0.13 });
    },
    wave: function () {
      [440, 587.33, 880].forEach(function (f, i) {
        beep({ freq: f, dur: 0.12, type: "square", vol: 0.18, delay: i * 0.1 });
      });
    },

    /* blocks */
    move: function () {
      beep({ freq: 300, dur: 0.025, type: "square", vol: 0.1 });
    },
    rotate: function () {
      beep({ freq: 520, to: 680, dur: 0.04, type: "square", vol: 0.13 });
    },
    lock: function () {
      beep({ freq: 200, to: 150, dur: 0.07, type: "triangle", vol: 0.2 });
      noise({ dur: 0.1, vol: 0.14, from: 700, to: 160 });
    },
    hold: function () {
      beep({ freq: 700, to: 1000, dur: 0.08, type: "sine", vol: 0.18 });
    },
    hardDrop: function () {
      beep({ freq: 320, to: 120, dur: 0.08, type: "square", vol: 0.2 });
      noise({ dur: 0.12, vol: 0.16, from: 1200, to: 200 });
    },
    lineClear: function () {
      [659.25, 783.99, 987.77].forEach(function (f, i) {
        beep({ freq: f, dur: 0.09, type: "square", vol: 0.19, delay: i * 0.055 });
      });
      noise({ dur: 0.18, vol: 0.16, from: 3000, to: 600, type: "bandpass", q: 2 });
    },
    quadClear: function () {
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach(function (f, i) {
        beep({ freq: f, dur: 0.12, type: "square", vol: 0.2, delay: i * 0.07 });
      });
      noise({ dur: 0.3, vol: 0.2, from: 4000, to: 500, type: "bandpass", q: 1.4 });
    },
    levelUp: function () {
      [523.25, 783.99, 1046.5].forEach(function (f, i) {
        beep({ freq: f, dur: 0.11, type: "triangle", vol: 0.22, delay: i * 0.08 });
      });
    },
    gameOver: function () {
      [392, 349.23, 311.13, 261.63].forEach(function (f, i) {
        beep({ freq: f, dur: 0.24, type: "sawtooth", vol: 0.19, delay: i * 0.2 });
      });
      noise({ dur: 0.7, vol: 0.14, from: 800, to: 60 });
    }
  };

  /* ---------------------------------------------------------------------- */
  /* public api                                                             */
  /* ---------------------------------------------------------------------- */

  var audio = {
    /** Play a named preset. Unknown names are ignored. */
    play: function (name) {
      var fn = presets[name];
      if (typeof fn === "function") fn();
    },

    /** Low-level helpers, exposed for custom sounds in games. */
    beep: beep,
    noise: noise,

    init: init,

    isMuted: function () {
      return muted;
    },

    setMuted: function (value) {
      muted = !!value;
      storage.set("audio.muted", muted);
      if (master && ctx) {
        try {
          master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.01);
        } catch (err) {
          master.gain.value = muted ? 0 : 0.55;
        }
      }
      if (!muted) {
        init();
        beep({ freq: 720, to: 1080, dur: 0.06, type: "square", vol: 0.2 });
      }
      emit();
      return muted;
    },

    toggle: function () {
      return audio.setMuted(!muted);
    },

    /** Subscribe to mute changes; returns an unsubscribe function. */
    onChange: function (fn) {
      listeners.push(fn);
      return function () {
        var i = listeners.indexOf(fn);
        if (i > -1) listeners.splice(i, 1);
      };
    },

    isSupported: function () {
      return !!(window.AudioContext || window.webkitAudioContext);
    }
  };

  function emit() {
    listeners.slice().forEach(function (fn) {
      try {
        fn(muted);
      } catch (err) {
        /* a broken listener must not break the game */
      }
    });
  }

  arm();

  Arcade.audio = audio;
})((window.Arcade = window.Arcade || {}));
