/* ==========================================================================
   Beat The Arcade — js/core/loop.js
   Fixed-timestep game loop.

   Game logic always advances in whole 60Hz steps so movement is identical on
   a 60Hz laptop and a 144Hz monitor; rendering happens once per animation
   frame. The loop also parks itself when the tab is hidden so games do not
   play themselves in a background tab.
   ========================================================================== */

(function (Arcade) {
  "use strict";

  var STEP = 1000 / 60; // ms of simulated time per logic tick
  var MAX_FRAME = 250; // clamp after tab-switch stalls
  var MAX_STEPS = 5; // catch-up budget per frame

  /**
   * @param {Object} opts
   *   step(seconds)   advance simulation
   *   render(alpha)   draw a frame
   *   onVisibility(bool)  tab hidden / shown (optional)
   *   autoPause       default true
   * @returns {Object} controller
   */
  function createLoop(opts) {
    var config = opts || {};
    var stepFn = config.step || function () {};
    var renderFn = config.render || function () {};
    var autoPause = config.autoPause !== false;

    var rafId = 0;
    var running = false;
    var paused = false;
    var last = 0;
    var acc = 0;
    var frames = 0;

    function frame(now) {
      rafId = window.requestAnimationFrame(frame);

      var dt = now - last;
      last = now;
      if (!isFinite(dt) || dt < 0) dt = 0;
      if (dt > MAX_FRAME) dt = MAX_FRAME;

      // while paused the simulation is frozen but we keep drawing, so the
      // last frame stays on screen behind the pause overlay
      if (paused) {
        acc = 0;
        renderFn(0);
        return;
      }

      acc += dt;

      var steps = 0;
      while (acc >= STEP && steps < MAX_STEPS) {
        stepFn(STEP / 1000);
        acc -= STEP;
        steps++;
      }

      // if we blew the catch-up budget, drop the backlog rather than spiral
      if (steps === MAX_STEPS) acc = 0;

      renderFn(acc / STEP);
      frames++;
    }

    function start() {
      if (running) return;
      running = true;
      paused = false;
      last = now();
      acc = 0;
      rafId = window.requestAnimationFrame(frame);
    }

    function stop() {
      if (!running) return;
      running = false;
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }

    function pause(reason) {
      if (!running || paused) return;
      paused = true;
      acc = 0;
      if (config.onPause) config.onPause(reason || "manual");
    }

    function resume(reason) {
      if (!running) {
        start();
        return;
      }
      if (!paused) return;
      paused = false;
      last = now();
      acc = 0;
      if (config.onResume) config.onResume(reason || "manual");
    }

    function now() {
      return window.performance && performance.now ? performance.now() : Date.now();
    }

    if (autoPause) {
      document.addEventListener("visibilitychange", function () {
        var hidden = document.hidden;
        if (hidden) {
          pause("hidden");
        } else if (running && paused && config.resumeOnVisible === true) {
          resume("visible");
        }
        if (config.onVisibility) config.onVisibility(!hidden);
      });
    }

    return {
      start: start,
      stop: stop,
      pause: pause,
      resume: resume,
      isRunning: function () {
        return running;
      },
      isPaused: function () {
        return paused;
      },
      /** Steps advanced since start — handy for debugging. */
      frames: function () {
        return frames;
      }
    };
  }

  Arcade.createLoop = createLoop;
  Arcade.LOOP_STEP = STEP;
})((window.Arcade = window.Arcade || {}));
