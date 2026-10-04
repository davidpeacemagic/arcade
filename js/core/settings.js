/* ==========================================================================
   Beat The Arcade — js/core/settings.js
   Declarative settings → slide-in overlay panel.

   Each game describes its options as data and this module does the rest:
   builds the panel, persists every change, keeps dependent options in sync
   and fires a callback so the game can react live.

   Row types
     {type:'segmented'}  radio group rendered as neon buttons
     {type:'toggle'}     on/off switch
     {type:'stepper'}    −  value  + control
   Every row may also carry: key, label, default, hint, group, visible(values)
   ========================================================================== */

(function (Arcade) {
  "use strict";

  var storage = Arcade.storage;
  var audio = Arcade.audio;

  /* ---------------------------------------------------------------------- */
  /* helpers                                                                */
  /* ---------------------------------------------------------------------- */

  function defaultsOf(schema) {
    var out = {};
    schema.forEach(function (row) {
      if (row.type === "heading" || !row.key) return;
      out[row.key] = clone(row.default);
    });
    return out;
  }

  function clone(value) {
    if (Array.isArray(value)) return value.slice();
    if (value && typeof value === "object") {
      return JSON.parse(JSON.stringify(value));
    }
    return value;
  }

  function clamp(value, min, max) {
    if (min != null && value < min) return min;
    if (max != null && value > max) return max;
    return value;
  }

  /** Current merged values for a game without building a panel. */
  function read(gameId, schema) {
    return merge(defaultsOf(schema), storage.getSettings(gameId), schema);
  }

  /** Stored values take priority, but only for keys the schema declares. */
  function merge(base, stored, schema) {
    var out = {};
    var known = Object.create(null);
    schema.forEach(function (row) {
      if (row.key) known[row.key] = row;
    });

    Object.keys(base).forEach(function (k) {
      out[k] = base[k];
    });

    Object.keys(stored || {}).forEach(function (k) {
      if (!known[k]) return;
      var row = known[k];
      var value = stored[k];
      if (row.type === "toggle") {
        out[k] = !!value;
      } else if (row.type === "stepper") {
        var n = Number(value);
        out[k] = isFinite(n) ? clamp(n, row.min, row.max) : out[k];
      } else if (row.type === "segmented") {
        var ok = (row.options || []).some(function (opt) {
          return opt.value === value;
        });
        out[k] = ok ? value : out[k];
      } else {
        out[k] = value;
      }
    });

    return out;
  }

  function focusables(root) {
    return Array.prototype.filter.call(
      root.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ),
      function (el) {
        return !el.disabled && el.offsetParent !== null;
      }
    );
  }

  /* ---------------------------------------------------------------------- */
  /* mount                                                                  */
  /* ---------------------------------------------------------------------- */

  /**
   * @param {Element} root      container that will hold the panel
   * @param {Object} options    {gameId, title, schema, onChange, footer}
   * @returns {Object} api
   */
  function mount(root, options) {
    var opts = options || {};
    var gameId = opts.gameId || "game";
    var schema = opts.schema || [];
    var values = read(gameId, schema);

    var wrap = document.createElement("div");
    wrap.className = "settings";
    wrap.innerHTML =
      '<div class="settings__scrim" data-close></div>' +
      '<aside class="settings__panel" role="dialog" aria-modal="true" aria-label="' +
      escapeHtml(opts.title || "Settings") +
      '" aria-hidden="true" tabindex="-1">' +
      '<div class="settings__head">' +
      '<span class="eyebrow">Options</span>' +
      '<h2>' +
      escapeHtml(opts.title || "Settings") +
      "</h2>" +
      '<button type="button" class="btn btn--icon btn--ghost" data-close aria-label="Close settings">✕</button>' +
      "</div>" +
      '<div class="settings__body"></div>' +
      '<div class="settings__foot">' +
      '<button type="button" class="btn btn--ghost" data-reset>Reset to defaults</button>' +
      "</div>" +
      "</aside>";

    var panel = wrap.querySelector(".settings__panel");
    var body = wrap.querySelector(".settings__body");
    var rows = [];

    buildRows(body, rows, schema, gameId, commit);
    root.appendChild(wrap);

    var lastFocus = null;

    /* ---------------------------------------------------------------- */
    /* sync                                                             */
    /* ---------------------------------------------------------------- */

    function sync() {
      rows.forEach(function (row) {
        if (row.def.visible) {
          row.el.hidden = !row.def.visible(values);
        }
        row.apply(values[row.def.key]);
      });
    }

    function emit(key) {
      if (typeof opts.onChange === "function") {
        opts.onChange(key, key ? values[key] : undefined, values, api);
      }
    }

    function commit(key, value, silent) {
      values[key] = value;
      storage.saveSettings(gameId, values);
      sync();
      if (!silent) emit(key);
    }

    /* ---------------------------------------------------------------- */
    /* open / close                                                     */
    /* ---------------------------------------------------------------- */

    function open() {
      if (wrap.classList.contains("is-open")) return;
      lastFocus = document.activeElement;
      wrap.classList.add("is-open");
      panel.setAttribute("aria-hidden", "false");
      document.documentElement.classList.add("is-locked");
      document.documentElement.style.overflow = "hidden";
      sync();
      var first = body.querySelector(".set-row:not([hidden]) input, .set-row:not([hidden]) button");
      (first || panel.querySelector("[data-close]")).focus();
      document.addEventListener("keydown", onPanelKey, true);
      audio.play("blip");
    }

    function close() {
      if (!wrap.classList.contains("is-open")) return;
      wrap.classList.remove("is-open");
      panel.setAttribute("aria-hidden", "true");
      document.documentElement.classList.remove("is-locked");
      document.documentElement.style.overflow = "";
      document.removeEventListener("keydown", onPanelKey, true);
      audio.play("back");
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    function onPanelKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== "Tab") return;

      var list = focusables(panel);
      if (!list.length) return;
      var first = list[0];
      var last = list[list.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    /* ---------------------------------------------------------------- */
    /* events                                                           */
    /* ---------------------------------------------------------------- */

    wrap.addEventListener("click", function (event) {
      if (event.target.closest("[data-close]")) {
        close();
      } else if (event.target.closest("[data-reset]")) {
        reset();
      }
    });

    /* ---------------------------------------------------------------- */
    /* public api                                                       */
    /* ---------------------------------------------------------------- */

    var api = {
      gameId: gameId,
      root: wrap,
      panel: panel,

      values: function () {
        return values;
      },

      get: function (key) {
        return values[key];
      },

      set: function (key, value, silent) {
        commit(key, value, silent);
        var row = rows.filter(function (r) {
          return r.def.key === key;
        })[0];
        if (row && row.apply) row.apply(value);
        return value;
      },

      open: open,
      close: close,
      isOpen: function () {
        return wrap.classList.contains("is-open");
      },
      toggle: function () {
        if (api.isOpen()) close();
        else open();
      },

      reset: function () {
        values = defaultsOf(schema);
        storage.saveSettings(gameId, values);
        sync();
        audio.play("select");
        if (typeof opts.onChange === "function") {
          opts.onChange(undefined, undefined, values, api);
        }
      },

      /** Re-read stored values (e.g. after a schema change). */
      refresh: function () {
        values = read(gameId, schema);
        rows.forEach(function (row) {
          if (row.apply) row.apply(values[row.def.key]);
        });
        sync();
      },

      destroy: function () {
        document.removeEventListener("keydown", onPanelKey, true);
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      }
    };

    sync();
    return api;
  }

  /* ---------------------------------------------------------------------- */
  /* row rendering                                                          */
  /* ---------------------------------------------------------------------- */

  function buildRows(container, rows, schema, gameId, commit) {
    var currentGroup = null;

    schema.forEach(function (def, index) {
      if (def.type === "heading") {
        container.appendChild(heading(def.label));
        currentGroup = def.label;
        return;
      }
      if (!def.key) return;

      if (def.group && def.group !== currentGroup) {
        container.appendChild(heading(def.group));
        currentGroup = def.group;
      }

      var row = document.createElement("div");
      row.className = "set-row";
      row.dataset.key = def.key;

      var label = document.createElement("label");
      label.className = "set-row__label";
      label.id = "lbl-" + gameId + "-" + def.key;
      label.textContent = def.label || def.key;
      row.appendChild(label);

      var onPick = function (value) {
        commit(def.key, value);
      };

      var control;
      if (def.type === "segmented") {
        control = buildSegmented(def, gameId, index, onPick);
      } else if (def.type === "toggle") {
        control = buildToggle(def, onPick);
      } else if (def.type === "stepper") {
        control = buildStepper(def, onPick);
      } else {
        control = { node: document.createElement("div"), apply: function () {} };
      }

      row.appendChild(control.node);
      if (def.hint) {
        var hint = document.createElement("span");
        hint.className = "set-row__hint";
        hint.textContent = def.hint;
        row.appendChild(hint);
      }

      rows.push({ def: def, el: row, apply: control.apply });
      container.appendChild(row);
    });
  }

  function heading(text) {
    var el = document.createElement("h3");
    el.className = "set-group";
    el.textContent = text;
    return el;
  }

  function buildSegmented(def, gameId, index, onPick) {
    var group = document.createElement("div");
    group.className = "seg";
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-labelledby", "lbl-" + gameId + "-" + def.key);

    var name = "set-" + gameId + "-" + def.key + "-" + index;
    var inputs = [];

    (def.options || []).forEach(function (opt) {
      var wrapEl = document.createElement("label");
      wrapEl.className = "seg__opt";

      var input = document.createElement("input");
      input.type = "radio";
      input.name = name;
      input.value = String(opt.value);
      input.addEventListener("change", function () {
        if (!input.checked) return;
        audio.play("toggle");
        onPick(opt.value);
      });

      var span = document.createElement("span");
      span.textContent = opt.label;

      wrapEl.appendChild(input);
      wrapEl.appendChild(span);
      group.appendChild(wrapEl);
      inputs.push({ input: input, value: opt.value });
    });

    return {
      node: group,
      apply: function (value) {
        inputs.forEach(function (pair) {
          pair.input.checked = pair.value === value;
        });
      },
      sync: function () {}
    };
  }

  function buildToggle(def, onPick) {
    var label = document.createElement("label");
    label.className = "switch";

    var input = document.createElement("input");
    input.type = "checkbox";
    input.addEventListener("change", function () {
      audio.play("toggle");
      onPick(input.checked);
    });

    var track = document.createElement("span");
    track.className = "switch__track";

    var text = document.createElement("span");
    text.className = "switch__text";

    label.appendChild(input);
    label.appendChild(track);
    label.appendChild(text);

    return {
      node: label,
      apply: function (value) {
        input.checked = !!value;
        text.textContent = value ? def.onLabel || "On" : def.offLabel || "Off";
      },
      sync: function () {}
    };
  }

  function buildStepper(def, onPick) {
    var group = document.createElement("div");
    group.className = "stepper";

    var dec = document.createElement("button");
    dec.type = "button";
    dec.className = "stepper__btn";
    dec.setAttribute("aria-label", "Decrease " + (def.label || def.key));
    dec.textContent = "−";

    var val = document.createElement("span");
    val.className = "stepper__val mono";
    val.setAttribute("aria-live", "polite");

    var inc = document.createElement("button");
    inc.type = "button";
    inc.className = "stepper__btn";
    inc.setAttribute("aria-label", "Increase " + (def.label || def.key));
    inc.textContent = "+";

    var step = def.step == null ? 1 : def.step;

    dec.addEventListener("click", function () {
      audio.play("toggle");
      onPick(clamp(current - step, def.min, def.max));
    });
    inc.addEventListener("click", function () {
      audio.play("toggle");
      onPick(clamp(current + step, def.min, def.max));
    });

    var current = def.default;

    group.appendChild(dec);
    group.appendChild(val);
    group.appendChild(inc);

    return {
      node: group,
      apply: function (value) {
        current = clamp(Number(value), def.min, def.max);
        val.textContent = def.format ? def.format(current) : String(current);
        dec.disabled = def.min != null && current <= def.min;
        inc.disabled = def.max != null && current >= def.max;
      },
      sync: function () {}
    };
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  Arcade.settings = {
    mount: mount,
    read: read,
    defaults: defaultsOf
  };
})((window.Arcade = window.Arcade || {}));
