/* ==========================================================================
   Beat The Arcade — js/games/rps.js
   Rock paper scissors against the machine. Best of three.

   THE FORCE — deliberate, do not "fix":
   Every match finishes exactly level. Round one goes to you, round two to the
   machine, round three is a dead heat — whatever you throw. The machine does
   not roll dice: its throw is derived from yours at reveal time.

     round 1   it throws the one thing your throw beats   -> you win
     round 2   it throws the one thing that beats yours   -> you lose
     round 3   it throws exactly what you threw           -> dead heat

   So the result is forced rather than chanced, and the tell is that the SAME
   throw from you produces three different outcomes in three rounds in a row.
   Nothing else about the game needs to know: the banner text is computed from
   the two throws that actually landed (outcomeOf), not asserted from the
   script, so if the squeezing ever stops working the screen says so rather
   than lying about it.
   ========================================================================== */

(function (Arcade) {
  "use strict";

  var storage = Arcade.storage;
  var audio = Arcade.audio;
  var input = Arcade.input;
  var ui = Arcade.ui;

  var GAME_ID = "rps";

  /* ---------------------------------------------------------------------- */
  /* throws                                                                 */
  /* ---------------------------------------------------------------------- */

  // round 1, round 2, round 3 … repeats for longer matches
  var SCRIPT = ["win", "lose", "tie"];

  // rock beats scissors, paper beats rock, scissors beats paper
  var BEATS = { rock: "scissors", paper: "rock", scissors: "paper" };
  var BEATEN_BY = { rock: "paper", paper: "scissors", scissors: "rock" };
  var NAMES = { rock: "Rock", paper: "Paper", scissors: "Scissors" };

  // R and S are free; P is deliberately a throw here, so this page does not
  // bind ui.bindPauseKey() (which would claim KeyP for the settings panel).
  var KEYS = { KeyR: "rock", KeyP: "paper", KeyS: "scissors" };

  var REVEAL_MS = 640;

  /** What the round is scripted to hand the player. */
  function scriptedResult(round) {
    return SCRIPT[(round - 1) % SCRIPT.length];
  }

  /** The one throw that produces `wanted` for the player. */
  function machineThrowFor(playerThrow, wanted) {
    if (wanted === "win") return BEATS[playerThrow];
    if (wanted === "lose") return BEATEN_BY[playerThrow];
    return playerThrow;
  }

  /** Honest result of two throws, seen from the player's side. */
  function outcomeOf(playerThrow, machineThrow) {
    if (playerThrow === machineThrow) return "tie";
    return BEATS[playerThrow] === machineThrow ? "win" : "lose";
  }

  /* ---------------------------------------------------------------------- */
  /* icons — original geometry, drawn from primitives                        */
  /* ---------------------------------------------------------------------- */

  var ICONS = {
    // faceted boulder
    rock:
      '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.3" ' +
      'stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">' +
      '<path d="M16 5.5l8.5 5.9v9.2L16 26.5l-8.5-5.9v-9.2z"/>' +
      '<path d="M9.6 15.4L16 12l6.4 3.4"/>' +
      "</svg>",
    // sheet with a turned corner
    paper:
      '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.3" ' +
      'stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">' +
      '<path d="M7.5 5.5h11.2l5.8 5.8v15.2H7.5z"/>' +
      '<path d="M18.7 5.5v5.8h5.8"/>' +
      '<path d="M11.5 17h9M11.5 21.5h6"/>' +
      "</svg>",
    // crossed blades over two rings
    scissors:
      '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.3" ' +
      'stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">' +
      '<path d="M10.5 5.5l11 14M21.5 5.5l-11 14"/>' +
      '<circle cx="9.6" cy="24.4" r="3.3"/>' +
      '<circle cx="22.4" cy="24.4" r="3.3"/>' +
      "</svg>"
  };

  /* ---------------------------------------------------------------------- */
  /* settings                                                               */
  /* ---------------------------------------------------------------------- */

  var SCHEMA = [
    {
      key: "rounds",
      label: "Match Length",
      type: "segmented",
      group: "Match",
      default: "3",
      options: [
        { value: "3", label: "3 rounds" },
        { value: "6", label: "6 rounds" }
      ]
    },
    {
      key: "countdown",
      label: "Reveal",
      type: "toggle",
      group: "Match",
      default: true,
      onLabel: "Countdown",
      offLabel: "Straight in",
      hint: "A short beat before both throws are turned over."
    },
    {
      key: "animations",
      label: "Shake",
      type: "toggle",
      group: "Presentation",
      default: true,
      onLabel: "Fists shake",
      offLabel: "Still frames"
    }
  ];

  /* ---------------------------------------------------------------------- */
  /* dom                                                                    */
  /* ---------------------------------------------------------------------- */

  var statusEl = document.getElementById("rpsStatus");
  var noteEl = document.getElementById("rpsNote");
  var roundEl = document.getElementById("rpsRound");
  var youEl = document.getElementById("rpsYou");
  var machineEl = document.getElementById("rpsMachine");
  var drawnEl = document.getElementById("rpsDrawn");
  var youHandEl = document.getElementById("rpsYouHand");
  var machineHandEl = document.getElementById("rpsMachineHand");
  var throwsEl = document.getElementById("rpsThrows");
  var newMatchBtn = document.getElementById("rpsNewMatch");
  var screenEl = document.querySelector(".bezel__screen");

  var throwBtns = Array.prototype.slice.call(throwsEl.querySelectorAll("[data-throw]"));

  throwBtns.forEach(function (btn) {
    btn.querySelector(".rps__icon").innerHTML = ICONS[btn.dataset.throw];
  });

  /* ---------------------------------------------------------------------- */
  /* state                                                                  */
  /* ---------------------------------------------------------------------- */

  var panel = Arcade.settings.mount(document.getElementById("settings"), {
    gameId: GAME_ID,
    title: "Rock Paper Scissors",
    schema: SCHEMA,
    onChange: function (key) {
      // presentation can change mid-match; a different match length cannot
      if (key === "animations" || key === "countdown") return;
      startMatch();
    }
  });

  var state = {
    round: 1,
    score: { wins: 0, losses: 0, draws: 0 },
    playerThrow: null,
    machineThrow: null,
    result: null,
    throwInFlight: false,
    roundOver: false,
    matchOver: false
  };

  var revealTimer = 0;
  var revealToken = 0;

  function values() {
    return panel.values();
  }

  function roundCount() {
    return Number(values().rounds) === 6 ? 6 : 3;
  }

  function animate() {
    return values().animations && !ui.reducedMotion();
  }

  /* ---------------------------------------------------------------------- */
  /* rendering                                                              */
  /* ---------------------------------------------------------------------- */

  function setStatus(text, tone) {
    statusEl.textContent = text;
    statusEl.style.color = tone || "";
  }

  function setNote(text) {
    noteEl.textContent = text;
  }

  /** Face-down when `hand` is null. */
  function setHand(el, hand) {
    el.dataset.hand = hand || "none";
    el.querySelector(".rps__icon").innerHTML = hand ? ICONS[hand] : "";
  }

  function clearHand(el) {
    setHand(el, null);
    el.classList.remove("is-win", "is-lose", "is-shaking", "is-revealed");
  }

  function setThrowsEnabled(on) {
    throwBtns.forEach(function (btn) {
      btn.disabled = !on;
    });
  }

  function paintHud() {
    roundEl.textContent = state.matchOver ? "—" : state.round + "/" + roundCount();
    youEl.textContent = String(state.score.wins);
    machineEl.textContent = String(state.score.losses);
    drawnEl.textContent = String(state.score.draws);
  }

  function flashScreen() {
    if (!screenEl) return;
    screenEl.classList.remove("flash");
    void screenEl.offsetWidth;
    screenEl.classList.add("flash");
  }

  /**
   * Fold a *completed* match into the persistent record. Deliberately not
   * per-round: a round abandoned mid-match would leave the record lopsided,
   * and the record is meant to always read level (n – n – n) on the homepage.
   */
  function addStats(score) {
    var stats = storage.getStats(GAME_ID, {});
    if (!stats["1p"] || typeof stats["1p"] !== "object") {
      stats["1p"] = { wins: 0, losses: 0, draws: 0 };
    }
    stats["1p"].wins = (stats["1p"].wins || 0) + score.wins;
    stats["1p"].losses = (stats["1p"].losses || 0) + score.losses;
    stats["1p"].draws = (stats["1p"].draws || 0) + score.draws;
    storage.saveStats(GAME_ID, stats);
  }

  /* ---------------------------------------------------------------------- */
  /* flow                                                                   */
  /* ---------------------------------------------------------------------- */

  function cancelReveal() {
    window.clearTimeout(revealTimer);
    revealToken++;
  }

  /** Clear the table for the round in `state.round` and hand over to the player. */
  function prepareRound() {
    cancelReveal();
    state.playerThrow = null;
    state.machineThrow = null;
    state.result = null;
    state.throwInFlight = false;

    clearHand(youHandEl);
    clearHand(machineHandEl);
    setThrowsEnabled(true);
    setStatus("The machine has locked in. Your throw.");
    setNote("Round " + state.round + " of " + roundCount() + ".");
    newMatchBtn.classList.remove("btn--invite");
    paintHud();
  }

  function startMatch() {
    state.score = { wins: 0, losses: 0, draws: 0 };
    state.round = 1;
    state.matchOver = false;
    state.roundOver = false;
    prepareRound();
  }

  function throwHand(hand) {
    if (state.matchOver) startMatch();
    if (state.throwInFlight) return;
    if (!NAMES[hand]) return;

    // the first throw after a settled round opens the next one
    if (state.roundOver) {
      state.round++;
      state.roundOver = false;
      prepareRound();
    }

    state.throwInFlight = true;
    state.playerThrow = hand;
    setHand(youHandEl, hand);
    setThrowsEnabled(false);
    audio.play("select");
    setStatus("Revealing…");

    var token = ++revealToken;
    revealTimer = window.setTimeout(function () {
      if (token !== revealToken || state.matchOver) return;
      reveal();
    }, values().countdown ? REVEAL_MS : 140);
  }

  function reveal() {
    state.machineThrow = machineThrowFor(state.playerThrow, scriptedResult(state.round));
    state.result = outcomeOf(state.playerThrow, state.machineThrow);
    state.throwInFlight = false;
    state.roundOver = true;

    if (animate()) {
      machineHandEl.classList.add("is-shaking");
      window.setTimeout(function () {
        machineHandEl.classList.remove("is-shaking");
      }, 260);
    }

    setHand(machineHandEl, state.machineThrow);
    youHandEl.classList.add("is-revealed");
    machineHandEl.classList.add("is-revealed");

    if (state.result === "win") {
      youHandEl.classList.add("is-win");
      state.score.wins++;
      audio.play("win");
      setStatus("Round won", "var(--lime)");
      setNote("Your " + NAMES[state.playerThrow] + " beats its " + NAMES[state.machineThrow] + ".");
    } else if (state.result === "lose") {
      machineHandEl.classList.add("is-win");
      state.score.losses++;
      audio.play("lose");
      setStatus("Round lost", "var(--magenta)");
      setNote("Its " + NAMES[state.machineThrow] + " beats your " + NAMES[state.playerThrow] + ".");
    } else {
      state.score.draws++;
      audio.play("draw");
      setStatus("Dead heat", "var(--ink-dim)");
      setNote("Both threw " + NAMES[state.playerThrow] + ".");
    }

    flashScreen();
    paintHud();

    if (state.round >= roundCount()) {
      endMatch();
      return;
    }

    // No auto-advance: the round result stays up and the throw buttons are the
    // invitation to play the next one.
    setThrowsEnabled(true);
  }

  function endMatch() {
    state.matchOver = true;
    state.roundOver = true;
    setThrowsEnabled(false);

    storage.bumpPlays(GAME_ID);
    addStats(state.score);
    var plays = storage.getPlays(GAME_ID);
    var s = state.score;

    setStatus("Match drawn " + s.wins + " – " + s.losses + " – " + s.draws);
    setNote(plays > 1 ? "Level again. Same as last time." : "Level. Every time.");
    newMatchBtn.classList.add("btn--invite");
    paintHud();
  }

  /* ---------------------------------------------------------------------- */
  /* controls                                                               */
  /* ---------------------------------------------------------------------- */

  throwBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      throwHand(btn.dataset.throw);
    });
  });

  newMatchBtn.addEventListener("click", function () {
    audio.play("select");
    startMatch();
  });

  input.onKey(function (code, event, repeat) {
    if (repeat || panel.isOpen()) return;
    var hand = KEYS[code];
    if (!hand) return;
    event.preventDefault();
    throwHand(hand);
  });

  /* ---------------------------------------------------------------------- */
  /* boot                                                                   */
  /* ---------------------------------------------------------------------- */

  Arcade.ui.init({ settings: panel });
  startMatch();
})((window.Arcade = window.Arcade || {}));
