/* ==========================================================================
   Beat The Arcade — js/core/canvas.js
   Canvas sizing for crisp pixel art on any display.

   Games draw in a fixed "logical" coordinate space (e.g. 480x600). `fit()`
   maps that space onto the canvas backing store at the device pixel ratio,
   and re-runs only when the element's size or the DPR actually changes.
   ========================================================================== */

(function (Arcade) {
  "use strict";

  var MAX_DPR = 3;

  function devicePixelRatio() {
    return Math.min(window.devicePixelRatio || 1, MAX_DPR);
  }

  /**
   * Fit a canvas to its CSS box and return a context scaled to `logical` units.
   *
   * @param {HTMLCanvasElement} canvas
   * @param {number} logicalW  width in game units
   * @param {number} logicalH  height in game units
   * @param {Object} [opts]    {smooth: boolean}
   * @returns {CanvasRenderingContext2D|null}
   */
  function fit(canvas, logicalW, logicalH, opts) {
    if (!canvas || !canvas.getContext) return null;

    var rect = canvas.getBoundingClientRect();
    var cssW = Math.max(1, Math.round(rect.width));
    var cssH = Math.max(1, Math.round(rect.height));
    var dpr = devicePixelRatio();
    var wantW = Math.round(cssW * dpr);
    var wantH = Math.round(cssH * dpr);

    var state = canvas.__fit || (canvas.__fit = {});
    var ctx = state.ctx || (state.ctx = canvas.getContext("2d"));
    if (!ctx) return null;

    if (state.w !== wantW || state.h !== wantH) {
      canvas.width = wantW;
      canvas.height = wantH;
      state.w = wantW;
      state.h = wantH;
    }

    // reset then scale so game code works in logical units
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(wantW / logicalW, wantH / logicalH);
    ctx.imageSmoothingEnabled = !(opts && opts.smooth === true) ? false : true;

    state.scaleX = wantW / logicalW;
    state.scaleY = wantH / logicalH;
    return ctx;
  }

  /**
   * Same as fit() but skips work while the element has no layout yet
   * (e.g. inside a hidden panel). Returns null in that case.
   */
  function fitVisible(canvas, logicalW, logicalH, opts) {
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    return fit(canvas, logicalW, logicalH, opts);
  }

  /** Clear the whole logical surface. */
  function clear(ctx, w, h, color) {
    if (!ctx) return;
    ctx.fillStyle = color || "#04050b";
    ctx.fillRect(0, 0, w, h);
  }

  /** Fill a rectangle in logical units — the pixel-art workhorse. */
  function rect(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  /**
   * Draw a sprite defined as an array of strings ("1" = on).
   * @param {CanvasRenderingContext2D} ctx
   * @param {string[]} sprite
   * @param {number} x  left edge
   * @param {number} y  top edge
   * @param {number} px size of one sprite pixel
   * @param {string} color
   */
  function sprite(ctx, rows, x, y, px, color) {
    ctx.fillStyle = color;
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      var runStart = -1;
      for (var c = 0; c <= row.length; c++) {
        var on = c < row.length && row.charAt(c) === "1";
        if (on && runStart === -1) {
          runStart = c;
        } else if (!on && runStart !== -1) {
          ctx.fillRect(x + runStart * px, y + r * px, (c - runStart) * px, px);
          runStart = -1;
        }
      }
    }
  }

  /** Sprite dimensions in sprite pixels. */
  function spriteSize(rows) {
    return { w: rows[0].length, h: rows.length };
  }

  /** Rounded rectangle path (no fill) — used for tetromino blocks. */
  function roundRect(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  /** Observation of element size changes, with a graceful fallback. */
  function observe(el, fn) {
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () {
        fn();
      });
      ro.observe(el);
      return function () {
        ro.disconnect();
      };
    }
    var handler = function () {
      fn();
    };
    window.addEventListener("resize", handler);
    window.addEventListener("orientationchange", handler);
    return function () {
      window.removeEventListener("resize", handler);
      window.removeEventListener("orientationchange", handler);
    };
  }

  Arcade.canvas = {
    fit: fit,
    fitVisible: fitVisible,
    clear: clear,
    rect: rect,
    sprite: sprite,
    spriteSize: spriteSize,
    roundRect: roundRect,
    observe: observe,
    devicePixelRatio: devicePixelRatio
  };
})((window.Arcade = window.Arcade || {}));
