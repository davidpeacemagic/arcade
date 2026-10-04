/* ==========================================================================
   Beat The Arcade — js/core/input.js
   Shared keyboard + touch input.

   Keyboard state is tracked by `event.code` (layout independent). Touch
   controls are wired declaratively: mark an element with
   `data-control="fire"` and register a handler for "fire".
   ========================================================================== */

(function (Arcade) {
  "use strict";

  /* ---------------------------------------------------------------------- */
  /* keyboard                                                               */
  /* ---------------------------------------------------------------------- */

  var down = Object.create(null); // code -> true while held
  var fresh = Object.create(null); // code -> true until consumed
  var keyHandlers = [];
  var blockedCodes = {
    ArrowLeft: 1,
    ArrowRight: 1,
    ArrowUp: 1,
    ArrowDown: 1,
    Space: 1,
    PageUp: 1,
    PageDown: 1
  };

  var ALIASES = {
    left: ["ArrowLeft", "KeyA"],
    right: ["ArrowRight", "KeyD"],
    up: ["ArrowUp", "KeyW"],
    down: ["ArrowDown", "KeyS"],
    fire: ["Space", "Enter"],
    rotate: ["ArrowUp", "KeyW", "KeyX"],
    rotateCcw: ["KeyZ", "ControlLeft"],
    hardDrop: ["Space"],
    hold: ["KeyC", "ShiftLeft"],
    pause: ["KeyP", "Escape"],
    restart: ["KeyR"]
  };

  function onKeyDown(event) {
    var code = event.code;
    if (!code) return;

    if (blockedCodes[code] && shouldBlock(event.target)) {
      event.preventDefault();
    }

    if (event.repeat) {
      keyHandlers.slice().forEach(function (fn) {
        fn(code, event, true);
      });
      return;
    }

    down[code] = true;
    fresh[code] = true;
    keyHandlers.slice().forEach(function (fn) {
      fn(code, event, false);
    });
  }

  function onKeyUp(event) {
    if (!event.code) return;
    down[event.code] = false;
  }

  function onBlur() {
    clear();
  }

  /** Don't hijack arrows/space while the user is typing in a field. */
  function shouldBlock(target) {
    if (!target) return true;
    var tag = (target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return false;
    if (target.isContentEditable) return false;
    return true;
  }

  function clear() {
    for (var k in down) down[k] = false;
    for (var f in fresh) delete fresh[f];
  }

  /* ---------------------------------------------------------------------- */
  /* touch                                                                  */
  /* ---------------------------------------------------------------------- */

  var touchDetected = (function () {
    var coarse =
      window.matchMedia &&
      window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    return !!coarse || "ontouchstart" in window;
  })();

  /** Wire `[data-control]` elements inside `root` to handlers by name. */
  function bindControls(root, handlers) {
    if (!root || !handlers) return function () {};
    var bound = [];

    Object.keys(handlers).forEach(function (name) {
      var els = root.querySelectorAll('[data-control="' + name + '"]');
      Array.prototype.forEach.call(els, function (el) {
        bound.push(bindHold(el, handlers[name]));
      });
    });

    return function unbind() {
      bound.forEach(function (off) {
        off();
      });
    };
  }

  /**
   * Press/release wiring for one element using pointer events, so mouse,
   * touch and pen all behave the same.
   *
   * @param {Element} el
   * @param {Object} opts {onDown, onUp, hold: boolean, repeatMs: number}
   * @returns {Function} unbind
   */
  function bindHold(el, opts) {
    var config = typeof opts === "function" ? { onDown: opts } : opts || {};
    var active = false;
    var timer = 0;

    function press(event) {
      if (event) {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        event.preventDefault();
      }
      if (active) return;
      active = true;
      el.classList.add("is-down");
      if (config.onDown) config.onDown();

      if (config.hold) {
        var repeat = config.repeatMs == null ? 90 : config.repeatMs;
        var delay = config.delayMs == null ? 170 : config.delayMs;
        timer = window.setTimeout(function tick() {
          if (!active) return;
          if (config.onRepeat) config.onRepeat();
          timer = window.setTimeout(tick, repeat);
        }, delay);
      }
    }

    function release(event) {
      if (event) event.preventDefault();
      if (!active) return;
      active = false;
      el.classList.remove("is-down");
      window.clearTimeout(timer);
      timer = 0;
      if (config.onUp) config.onUp();
    }

    el.addEventListener("pointerdown", press);
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    el.addEventListener("pointerleave", release);
    el.addEventListener("contextmenu", function (e) {
      e.preventDefault();
    });

    // stop the browser scrolling / long-press-selecting on the pad
    el.addEventListener("touchstart", function (e) {
      e.preventDefault();
    }, { passive: false });

    return function unbind() {
      release();
      el.removeEventListener("pointerdown", press);
      el.removeEventListener("pointerup", release);
      el.removeEventListener("pointercancel", release);
      el.removeEventListener("pointerleave", release);
    };
  }

  /**
   * Drag gestures on a surface.
   * @param {Element} el
   * @param {Object} opts {onStart, onMove(dx,dy), onEnd(dx,dy,durationMs,tap)}
   */
  function bindSwipe(el, opts) {
    var config = opts || {};
    var id = null;
    var startX = 0;
    var startY = 0;
    var lastX = 0;
    var lastY = 0;
    var startTime = 0;
    var moved = false;

    function downHandler(event) {
      if (id !== null) return;
      id = event.pointerId;
      startX = lastX = event.clientX;
      startY = lastY = event.clientY;
      startTime = Date.now();
      moved = false;
      if (el.setPointerCapture) {
        try {
          el.setPointerCapture(id);
        } catch (err) {
          /* ignore */
        }
      }
      if (config.onStart) config.onStart();
    }

    function moveHandler(event) {
      if (event.pointerId !== id) return;
      lastX = event.clientX;
      lastY = event.clientY;
      var dx = lastX - startX;
      var dy = lastY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
      if (config.onMove) config.onMove(dx, dy, lastX, lastY);
    }

    function upHandler(event) {
      if (event.pointerId !== id) return;
      var dx = lastX - startX;
      var dy = lastY - startY;
      var duration = Date.now() - startTime;
      id = null;
      if (config.onEnd) config.onEnd(dx, dy, duration, !moved && duration < 260);
    }

    el.addEventListener("pointerdown", downHandler);
    el.addEventListener("pointermove", moveHandler);
    el.addEventListener("pointerup", upHandler);
    el.addEventListener("pointercancel", upHandler);

    return function unbind() {
      id = null;
      el.removeEventListener("pointerdown", downHandler);
      el.removeEventListener("pointermove", moveHandler);
      el.removeEventListener("pointerup", upHandler);
      el.removeEventListener("pointercancel", upHandler);
    };
  }

  /* ---------------------------------------------------------------------- */
  /* public api                                                             */
  /* ---------------------------------------------------------------------- */

  var input = {
    /** Called once by ui.js on load. */
    setup: function () {
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
      window.addEventListener("blur", onBlur);
      document.addEventListener("visibilitychange", function () {
        if (document.hidden) clear();
      });
      if (touchDetected) {
        document.documentElement.classList.add("is-touch");
      }
    },

    /** True while any of the given codes (or aliases) is held. */
    isDown: function (codeOrAlias) {
      var codes = resolve(codeOrAlias);
      for (var i = 0; i < codes.length; i++) {
        if (down[codes[i]]) return true;
      }
      return false;
    },

    /** True once per physical press. Consumes the event. */
    consume: function (codeOrAlias) {
      var codes = resolve(codeOrAlias);
      for (var i = 0; i < codes.length; i++) {
        if (fresh[codes[i]]) {
          delete fresh[codes[i]];
          return true;
        }
      }
      return false;
    },

    /** Clear a pending press without acting on it. */
    discard: function (codeOrAlias) {
      resolve(codeOrAlias).forEach(function (code) {
        delete fresh[code];
      });
    },

    /** Drop all transient state (on pause, on game restart). */
    clear: clear,

    /** Subscribe to raw keydown. Returns an unsubscribe function. */
    onKey: function (fn) {
      keyHandlers.push(fn);
      return function () {
        var i = keyHandlers.indexOf(fn);
        if (i > -1) keyHandlers.splice(i, 1);
      };
    },

    isTouch: function () {
      return touchDetected;
    },

    /** Show the on-screen pad only when the input actually needs it. */
    applyPadVisibility: function (padEl, opts) {
      if (!padEl) return;
      var mode = (opts && opts.mode) || "auto";
      var show = mode === "touch" || (mode === "auto" && touchDetected);
      padEl.classList.toggle("is-on", show);
      return show;
    },

    bindControls: bindControls,
    bindHold: bindHold,
    bindSwipe: bindSwipe,
    ALIASES: ALIASES
  };

  function resolve(codeOrAlias) {
    if (Array.isArray(codeOrAlias)) return codeOrAlias;
    return ALIASES[codeOrAlias] || [codeOrAlias];
  }

  Arcade.input = input;
})((window.Arcade = window.Arcade || {}));
