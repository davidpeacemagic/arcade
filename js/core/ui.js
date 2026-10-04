/* ==========================================================================
   Beat The Arcade — js/core/ui.js
   Shared page chrome and the reusable game-over / hi-score flow.

     Arcade.ui.init()                  wire CRT layers, header, best scores
     Arcade.ui.renderScores(...)       draw a top-5 table
     Arcade.ui.promptInitials(...)     3-letter arcade initials entry
     Arcade.ui.endGame(...)            game over + hi-score + replay overlay
     Arcade.ui.pause(...)              pause overlay
     Arcade.ui.toast(...)              transient message
   ========================================================================== */

(function (Arcade) {
  "use strict";

  var storage = Arcade.storage;
  var audio = Arcade.audio;
  var input = Arcade.input;

  var ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  /* ---------------------------------------------------------------------- */
  /* small utils                                                            */
  /* ---------------------------------------------------------------------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function formatNumber(n) {
    var value = Math.round(Number(n) || 0);
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function reducedMotion() {
    return !!(
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function lastInitials() {
    return storage.normaliseName(storage.get("name.last", "AAA"));
  }

  function rememberInitials(name) {
    storage.set("name.last", storage.normaliseName(name));
  }

  function gameTitle(gameId) {
    var map = {
      tictactoe: "Tic Tac Toe",
      invasion: "Invasion",
      blocks: "Blocks"
    };
    return map[gameId] || "Arcade";
  }

  /* ---------------------------------------------------------------------- */
  /* toasts                                                                 */
  /* ---------------------------------------------------------------------- */

  var toastRoot = null;

  function toast(message, options) {
    var opts = options || {};
    if (!toastRoot) {
      toastRoot = el("div", "toasts");
      toastRoot.setAttribute("role", "status");
      toastRoot.setAttribute("aria-live", "polite");
      document.body.appendChild(toastRoot);
    }
    var node = el("div", "toast", message);
    toastRoot.appendChild(node);
    window.setTimeout(function () {
      node.style.transition = "opacity 200ms linear";
      node.style.opacity = "0";
      window.setTimeout(function () {
        if (node.parentNode) node.parentNode.removeChild(node);
      }, 220);
    }, opts.duration || 1600);
  }

  /* ---------------------------------------------------------------------- */
  /* hi-score table                                                         */
  /* ---------------------------------------------------------------------- */

  /**
   * @param {string} gameId
   * @param {Element} host
   * @param {Object} [opts] {highlight: rank, showMeta: boolean, limit: number}
   */
  function renderScores(gameId, host, opts) {
    var options = opts || {};
    var limit = options.limit || storage.MAX_SCORES;
    var list = storage.getScores(gameId).slice(0, limit);

    host.textContent = "";

    if (!list.length) {
      host.appendChild(el("p", "scores-empty", "No scores yet — be the first"));
      return;
    }

    var table = el("table", "scores");
    var thead = el("thead");
    var hrow = el("tr");
    ["#", "Name", "Score"].forEach(function (label) {
      hrow.appendChild(el("th", null, label));
    });
    thead.appendChild(hrow);
    table.appendChild(thead);

    var tbody = el("tbody");
    list.forEach(function (row, index) {
      var tr = el("tr");
      if (options.highlight && index + 1 === options.highlight) {
        tr.className = "is-new";
      }
      tr.appendChild(el("td", null, String(index + 1)));
      var name = el("td", null, row.name || "AAA");
      if (row.meta) name.title = row.meta;
      tr.appendChild(name);
      tr.appendChild(el("td", "mono", formatNumber(row.score)));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    host.appendChild(table);
  }

  /* ---------------------------------------------------------------------- */
  /* 3-letter initials entry                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * Arcade-style initials picker: three columns, up/down arrows, plus
   * keyboard typing / arrow support.
   *
   * @param {string} defaultValue
   * @returns {Object} {node, value(), focus(), onChange(fn)}
   */
  function initialsPicker(defaultValue) {
    var chars = storage.normaliseName(defaultValue || lastInitials()).split("");
    while (chars.length < 3) chars.push("A");

    var active = 0;
    var changeHandlers = [];

    var wrap = el("div", "initials");
    var columns = [];

    chars.forEach(function (_, index) {
      var col = el("div", "initials__col");
      col.dataset.index = String(index);

      var up = el("button", "initials__up");
      up.type = "button";
      up.setAttribute("aria-label", "Next letter for position " + (index + 1));
      up.textContent = "▲";

      var val = el("div", "initials__val mono");
      val.setAttribute("aria-live", "polite");

      var down = el("button", "initials__down");
      down.type = "button";
      down.setAttribute("aria-label", "Previous letter for position " + (index + 1));
      down.textContent = "▼";

      up.addEventListener("click", function () {
        bump(index, 1);
      });
      down.addEventListener("click", function () {
        bump(index, -1);
      });
      col.addEventListener("pointerdown", function () {
        setActive(index);
      });

      col.appendChild(up);
      col.appendChild(val);
      col.appendChild(down);
      wrap.appendChild(col);
      columns.push({ col: col, val: val });
    });

    var inputEl = el("input", "visually-hidden");
    inputEl.type = "text";
    inputEl.maxLength = 3;
    inputEl.setAttribute("aria-label", "High score name, three characters");
    inputEl.autocomplete = "off";
    inputEl.spellcheck = false;
    inputEl.value = chars.join("");
    wrap.appendChild(inputEl);

    function setActive(index) {
      active = Math.max(0, Math.min(2, index));
      columns.forEach(function (col, i) {
        col.col.classList.toggle("is-active", i === active);
      });
    }

    function bump(index, delta) {
      var current = ALPHABET.indexOf(chars[index]);
      if (current < 0) current = 0;
      var next = (current + delta + ALPHABET.length) % ALPHABET.length;
      chars[index] = ALPHABET.charAt(next);
      render();
      audio.play("blip");
      changeHandlers.forEach(function (fn) {
        fn(chars.join(""));
      });
    }

    function setChar(index, ch) {
      var upper = String(ch).toUpperCase();
      var at = ALPHABET.indexOf(upper);
      if (at < 0) return false;
      chars[index] = upper;
      render();
      changeHandlers.forEach(function (fn) {
        fn(chars.join(""));
      });
      return true;
    }

    function render() {
      columns.forEach(function (col, i) {
        col.val.textContent = chars[i];
      });
      inputEl.value = chars.join("");
    }

    function onKey(event) {
      var key = event.key;
      if (key === "ArrowLeft") {
        event.preventDefault();
        setActive(active - 1);
      } else if (key === "ArrowRight") {
        event.preventDefault();
        setActive(active + 1);
      } else if (key === "ArrowUp") {
        event.preventDefault();
        bump(active, 1);
      } else if (key === "ArrowDown") {
        event.preventDefault();
        bump(active, -1);
      } else if (/^[a-zA-Z0-9]$/.test(key)) {
        event.preventDefault();
        setChar(active, key);
        if (active < 2) setActive(active + 1);
        audio.play("blip");
      }
    }

    wrap.addEventListener("keydown", onKey);
    inputEl.addEventListener("keydown", onKey);

    render();
    setActive(0);

    return {
      node: wrap,
      value: function () {
        return storage.normaliseName(chars.join(""));
      },
      set: function (name) {
        var clean = storage.normaliseName(name).split("");
        chars[0] = clean[0];
        chars[1] = clean[1];
        chars[2] = clean[2];
        render();
      },
      focus: function () {
        setActive(0);
        inputEl.focus();
      },
      onChange: function (fn) {
        changeHandlers.push(fn);
      }
    };
  }

  /* ---------------------------------------------------------------------- */
  /* initials modal (promise based)                                         */
  /* ---------------------------------------------------------------------- */

  function promptInitials(options) {
    var opts = options || {};
    return new Promise(function (resolve) {
      var picker = initialsPicker(opts.defaultValue);
      var scrim = el("div", "ov");
      scrim.style.position = "fixed";
      scrim.style.zIndex = "9150";
      scrim.style.background = "rgba(4,5,11,0.92)";

      scrim.appendChild(el("h2", "ov__title", opts.title || "New High Score"));
      if (opts.subtitle) scrim.appendChild(el("p", "ov__sub", opts.subtitle));
      scrim.appendChild(picker.node);

      var actions = el("div", "ov__actions");
      var save = el("button", "btn btn--solid", "Save Score");
      save.type = "button";
      actions.appendChild(save);
      scrim.appendChild(actions);
      document.body.appendChild(scrim);

      function finish() {
        var name = picker.value();
        rememberInitials(name);
        window.removeEventListener("keydown", onKey, true);
        if (scrim.parentNode) scrim.parentNode.removeChild(scrim);
        resolve(name);
      }

      function onKey(event) {
        if (event.key === "Enter") {
          event.preventDefault();
          finish();
        }
      }

      save.addEventListener("click", finish);
      window.addEventListener("keydown", onKey, true);
      picker.focus();
    });
  }

  /* ---------------------------------------------------------------------- */
  /* game over / hi-score overlay                                            */
  /* ---------------------------------------------------------------------- */

  /**
   * @param {Element} host    the .bezel__screen element to overlay
   * @param {Object} opts     {gameId, title, subtitle, onRestart, scoreLabel, autoSave}
   * @returns {Object} {show(result), hide(), isOpen(), refresh()}
   */
  function endGame(host, opts) {
    var options = opts || {};
    var gameId = options.gameId || "game";
    var saved = false;
    var pendingResult = null;
    var rank = 0;

    var node = el("div", "ov ov--top");
    node.hidden = true;
    node.setAttribute("role", "dialog");
    node.setAttribute("aria-modal", "true");
    node.setAttribute("aria-label", options.title || "Game over");

    var titleEl = el("h2", "ov__title", options.title || "Game Over");
    var subEl = el("p", "ov__sub");
    var scoreEl = el("div", "ov__score mono");
    var newTag = el("p", "ov__sub");
    newTag.style.color = "var(--accent-2)";
    newTag.hidden = true;

    var initialsHost = el("div");
    initialsHost.hidden = true;
    var picker = initialsPicker();

    var actions = el("div", "ov__actions");
    var againBtn = el("button", "btn btn--solid", "Play Again");
    againBtn.type = "button";
    var saveBtn = el("button", "btn btn--ghost", "Save Score");
    saveBtn.type = "button";
    saveBtn.hidden = true;
    var exitBtn = el("a", "btn btn--ghost", "Back to Arcade");
    exitBtn.href = "index.html";
    actions.appendChild(againBtn);
    actions.appendChild(saveBtn);
    actions.appendChild(exitBtn);

    var tableHost = el("div");
    tableHost.style.width = "100%";
    tableHost.style.display = "grid";
    tableHost.style.justifyItems = "center";

    node.appendChild(titleEl);
    node.appendChild(subEl);
    node.appendChild(scoreEl);
    node.appendChild(newTag);
    node.appendChild(initialsHost);
    node.appendChild(actions);
    node.appendChild(tableHost);
    host.appendChild(node);

    function commitScore() {
      if (saved || !pendingResult) return rank;
      saved = true;
      var outcome = storage.addScore(gameId, {
        name: picker.value(),
        score: pendingResult.score,
        meta: pendingResult.meta || ""
      });
      rank = outcome.rank;
      rememberInitials(picker.value());
      saveBtn.hidden = true;
      initialsHost.hidden = true;
      newTag.hidden = true;
      renderScores(gameId, tableHost, { highlight: rank });
      return rank;
    }

    againBtn.addEventListener("click", function () {
      commitScore();
      audio.play("select");
      hide();
      if (options.onRestart) options.onRestart();
    });

    saveBtn.addEventListener("click", function () {
      audio.play("select");
      commitScore();
      toast("Score saved");
    });

    exitBtn.addEventListener("click", function () {
      commitScore();
    });

    node.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" || node.hidden) return;
      event.preventDefault();
      audio.play("select");
      commitScore();
      hide();
      if (options.onRestart) options.onRestart();
    });

    function show(result) {
      pendingResult = result || { score: 0 };
      saved = false;
      rank = 0;

      node.hidden = false;
      titleEl.textContent = options.title || "Game Over";
      subEl.textContent = options.subtitle || "";
      subEl.hidden = !options.subtitle;
      scoreEl.textContent =
        (options.scoreLabel || "Score") + " " + formatNumber(pendingResult.score);

      var qualifies = storage.qualifies(gameId, pendingResult.score);
      newTag.hidden = !qualifies;
      newTag.textContent = qualifies ? "New high score — enter your initials" : "";

      initialsHost.textContent = "";
      if (qualifies) {
        initialsHost.appendChild(picker.node);
        initialsHost.hidden = false;
        saveBtn.hidden = false;
        renderScores(gameId, tableHost, { highlight: 0 });
        picker.focus();
      } else {
        initialsHost.hidden = true;
        saveBtn.hidden = true;
        renderScores(gameId, tableHost, { highlight: 0 });
        againBtn.focus();
      }
    }

    function hide() {
      node.hidden = true;
    }

    function refresh() {
      renderScores(gameId, tableHost, { highlight: rank });
    }

    return {
      node: node,
      show: show,
      hide: hide,
      refresh: refresh,
      isOpen: function () {
        return !node.hidden;
      },
      /** Save anything outstanding (e.g. before leaving the page). */
      flush: commitScore,
      isSaved: function () {
        return saved;
      }
    };
  }

  /* ---------------------------------------------------------------------- */
  /* pause overlay                                                          */
  /* ---------------------------------------------------------------------- */

  function pause(host, options) {
    var opts = options || {};

    var node = el("div", "ov");
    node.hidden = true;
    node.setAttribute("role", "dialog");
    node.setAttribute("aria-label", "Paused");

    node.appendChild(el("h2", "ov__title", opts.title || "Paused"));
    if (opts.subtitle) node.appendChild(el("p", "ov__sub", opts.subtitle));

    var actions = el("div", "ov__actions");
    var resumeBtn = el("button", "btn btn--solid", "Resume");
    resumeBtn.type = "button";
    var restartBtn = el("button", "btn btn--ghost", "Restart");
    restartBtn.type = "button";
    actions.appendChild(resumeBtn);
    if (opts.onRestart) actions.appendChild(restartBtn);
    node.appendChild(actions);
    host.appendChild(node);

    resumeBtn.addEventListener("click", function () {
      if (opts.onResume) opts.onResume();
    });
    restartBtn.addEventListener("click", function () {
      if (opts.onRestart) opts.onRestart();
    });

    return {
      node: node,
      show: function () {
        node.hidden = false;
        resumeBtn.focus();
      },
      hide: function () {
        node.hidden = true;
      },
      isOpen: function () {
        return !node.hidden;
      }
    };
  }

  /* ---------------------------------------------------------------------- */
  /* page bootstrap                                                         */
  /* ---------------------------------------------------------------------- */

  function addCrtLayers() {
    if (document.querySelector(".crt__scan")) return;
    var scan = el("div", "crt__scan");
    scan.setAttribute("aria-hidden", "true");
    var vig = el("div", "crt__vig");
    vig.setAttribute("aria-hidden", "true");
    document.body.appendChild(scan);
    document.body.appendChild(vig);
  }

  function wireMute() {
    var buttons = document.querySelectorAll('[data-tool="mute"]');
    if (!buttons.length) return;

    function paint() {
      var muted = audio.isMuted();
      Array.prototype.forEach.call(buttons, function (btn) {
        btn.textContent = muted ? "🔇" : "🔊";
        btn.setAttribute("aria-pressed", muted ? "true" : "false");
        btn.setAttribute(
          "aria-label",
          muted ? "Sound off — click to enable" : "Sound on — click to mute"
        );
        btn.title = muted ? "Sound off" : "Sound on";
      });
    }

    Array.prototype.forEach.call(buttons, function (btn) {
      btn.addEventListener("click", function () {
        audio.toggle();
      });
    });

    audio.onChange(paint);
    paint();
  }

  function fillBestScores() {
    var nodes = document.querySelectorAll("[data-best]");
    Array.prototype.forEach.call(nodes, function (node) {
      var id = node.getAttribute("data-best");
      var best = storage.getBest(id);
      node.textContent = best > 0 ? formatNumber(best) : "—";
    });

    // tic tac toe has no score, so its card shows the one-player win count
    var wins = document.querySelectorAll("[data-solo-wins]");
    Array.prototype.forEach.call(wins, function (node) {
      var id = node.getAttribute("data-solo-wins");
      var stats = storage.getStats(id, {});
      var solo = (stats && stats["1p"]) || {};
      var count = solo.wins || 0;
      node.textContent = count > 0 ? formatNumber(count) : "—";
    });
  }

  function fillYear() {
    var nodes = document.querySelectorAll("[data-year]");
    Array.prototype.forEach.call(nodes, function (node) {
      node.textContent = String(new Date().getFullYear());
    });
  }

  /**
   * Called by every page.
   * @param {Object} [options] {settings: panelApi}
   */
  function init(options) {
    var opts = options || {};
    input.setup();
    addCrtLayers();
    wireMute();
    fillBestScores();
    fillYear();

    if (opts.settings) {
      var gears = document.querySelectorAll('[data-tool="settings"]');
      Array.prototype.forEach.call(gears, function (gear) {
        gear.addEventListener("click", function () {
          opts.settings.toggle();
        });
      });
    }

    // muted-by-default hint on first visit
    if (!storage.get("hint.shown", false)) {
      storage.set("hint.shown", true);
      window.setTimeout(function () {
        toast("Sound is off — tap the speaker to enable");
      }, 900);
    }
  }

  /** Bind the pause key for a game; returns an unsubscribe function. */
  function bindPauseKey(handler) {
    return input.onKey(function (code, event, repeat) {
      if (repeat) return;
      if (code === "KeyP" || code === "Escape") {
        event.preventDefault();
        handler();
      }
    });
  }

  Arcade.ui = {
    init: init,
    el: el,
    toast: toast,
    renderScores: renderScores,
    initialsPicker: initialsPicker,
    promptInitials: promptInitials,
    endGame: endGame,
    pause: pause,
    bindPauseKey: bindPauseKey,
    formatNumber: formatNumber,
    reducedMotion: reducedMotion,
    gameTitle: gameTitle,
    lastInitials: lastInitials,
    rememberInitials: rememberInitials
  };
})((window.Arcade = window.Arcade || {}));
