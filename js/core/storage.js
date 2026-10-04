/* ==========================================================================
   Beat The Arcade — js/core/storage.js
   Namespaced, crash-proof localStorage access.

   Every key is written as `arcade.v1.<key>`. If localStorage is unavailable
   (private mode, disabled, quota) the module transparently falls back to an
   in-memory store so the games still run for the session.
   ========================================================================== */

(function (Arcade) {
  "use strict";

  var PREFIX = "arcade.v1.";
  var MAX_SCORES = 5;

  var memory = {};
  var hasLocal = (function () {
    try {
      var k = PREFIX + "__probe";
      window.localStorage.setItem(k, "1");
      window.localStorage.removeItem(k);
      return true;
    } catch (err) {
      return false;
    }
  })();

  function readRaw(key) {
    if (!hasLocal) {
      return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
    }
    try {
      return window.localStorage.getItem(PREFIX + key);
    } catch (err) {
      return null;
    }
  }

  function writeRaw(key, value) {
    if (!hasLocal) {
      memory[key] = value;
      return true;
    }
    try {
      window.localStorage.setItem(PREFIX + key, value);
      return true;
    } catch (err) {
      // quota exceeded / disabled mid-session — degrade to memory
      memory[key] = value;
      return false;
    }
  }

  function removeRaw(key) {
    delete memory[key];
    if (!hasLocal) return;
    try {
      window.localStorage.removeItem(PREFIX + key);
    } catch (err) {
      /* ignore */
    }
  }

  var storage = {
    /** True when real localStorage is in use (false = memory fallback). */
    persistent: hasLocal,

    /** Read and parse a value. Corrupt data falls back to `fallback`. */
    get: function (key, fallback) {
      var raw = readRaw(key);
      if (raw === null || raw === undefined) return fallback;
      try {
        var value = JSON.parse(raw);
        return value === undefined ? fallback : value;
      } catch (err) {
        removeRaw(key);
        return fallback;
      }
    },

    /** Serialise and store any JSON-safe value. Returns the value. */
    set: function (key, value) {
      try {
        writeRaw(key, JSON.stringify(value));
      } catch (err) {
        /* circular / unserialisable — ignore rather than break the game */
      }
      return value;
    },

    remove: function (key) {
      removeRaw(key);
    },

    /* ------------------------------------------------------------------ */
    /* per-game settings                                                    */
    /* ------------------------------------------------------------------ */

    /** Stored settings object for a game (never null). */
    getSettings: function (gameId) {
      var value = storage.get("settings." + gameId, {});
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    },

    saveSettings: function (gameId, values) {
      return storage.set("settings." + gameId, values || {});
    },

    /* ------------------------------------------------------------------ */
    /* high scores                                                          */
    /* ------------------------------------------------------------------ */

    /** Top scores, highest first. Entry: {name, score, meta, date}. */
    getScores: function (gameId) {
      var list = storage.get("scores." + gameId, []);
      if (!Array.isArray(list)) return [];
      return list.filter(function (row) {
        return row && typeof row.score === "number" && isFinite(row.score);
      });
    },

    /** Best score for a game, or 0 when nothing has been played yet. */
    getBest: function (gameId) {
      var list = storage.getScores(gameId);
      return list.length ? list[0].score : 0;
    },

    /**
     * Insert a score, keep the top `limit`, and report the new entry's rank.
     * Returns {list, rank, entry} where rank is 1-based, or 0 if it did not
     * make the table.
     */
    addScore: function (gameId, entry, limit) {
      var max = limit || MAX_SCORES;
      var row = {
        name: normaliseName(entry && entry.name),
        score: Math.max(0, Math.round((entry && entry.score) || 0)),
        meta: (entry && entry.meta) || "",
        date: (entry && entry.date) || new Date().toISOString()
      };

      var list = storage.getScores(gameId).slice();
      list.push(row);
      list.sort(function (a, b) {
        return b.score - a.score || String(a.date).localeCompare(String(b.date));
      });
      list = list.slice(0, max);
      storage.set("scores." + gameId, list);

      var rank = 0;
      for (var i = 0; i < list.length; i++) {
        if (list[i] === row) {
          rank = i + 1;
          break;
        }
      }
      return { list: list, rank: rank, entry: row };
    },

    /** Would this score make the table? */
    qualifies: function (gameId, score, limit) {
      var max = limit || MAX_SCORES;
      var list = storage.getScores(gameId);
      if (list.length < max) return true;
      return score > list[list.length - 1].score;
    },

    clearScores: function (gameId) {
      removeRaw("scores." + gameId);
    },

    /** Total number of plays recorded for a game. */
    getPlays: function (gameId) {
      return storage.get("plays." + gameId, 0);
    },

    bumpPlays: function (gameId) {
      return storage.set("plays." + gameId, storage.getPlays(gameId) + 1);
    },

    /* ------------------------------------------------------------------ */
    /* free-form stats blob (used by tic tac toe)                           */
    /* ------------------------------------------------------------------ */

    getStats: function (gameId, fallback) {
      var value = storage.get("stats." + gameId, fallback || {});
      return value && typeof value === "object" && !Array.isArray(value) ? value : fallback || {};
    },

    saveStats: function (gameId, stats) {
      return storage.set("stats." + gameId, stats || {});
    },

    /** Reset everything this app owns. Mainly a debugging escape hatch. */
    clearAll: function () {
      memory = {};
      if (!hasLocal) return;
      try {
        var keys = [];
        for (var i = 0; i < window.localStorage.length; i++) {
          var k = window.localStorage.key(i);
          if (k && k.indexOf(PREFIX) === 0) keys.push(k);
        }
        keys.forEach(function (k) {
          window.localStorage.removeItem(k);
        });
      } catch (err) {
        /* ignore */
      }
    }
  };

  /** Uppercase A-Z, max 3 chars, defaulting to "AAA". */
  function normaliseName(name) {
    var clean = String(name == null ? "" : name)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 3);
    return clean || "AAA";
  }

  storage.normaliseName = normaliseName;
  storage.MAX_SCORES = MAX_SCORES;

  Arcade.storage = storage;
})((window.Arcade = window.Arcade || {}));
