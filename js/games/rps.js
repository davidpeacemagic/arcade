/* ==========================================================================
   Beat The Arcade — js/games/rps.js
   Rock paper scissors against the machine. Endless: you play on for as long as
   you like and the score just keeps counting.

   THE OPENING SCRIPT — deliberate, do not "fix":
   The first three rounds are not luck. Round one goes to you, round two to the
   machine, round three is a dead heat — whatever you throw. The machine does
   not roll dice: its throw is derived from yours at reveal time.

     round 1   it throws the one thing your throw beats   -> you win
     round 2   it throws the one thing that beats yours   -> you lose
     round 3   it throws exactly what you threw           -> dead heat
     round 4+  genuine random. Perfectly fair from here on.

   So the tell is that the SAME throw from you produces three different outcomes
   in the first three rounds, and then the machine abruptly stops reading you.
   The banner text is computed from the two throws that actually landed
   (outcomeOf), not asserted from the script, so if the squeezing ever stops
   working the screen says so rather than lying about it. Resetting the game
   re-arms the opening three.
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

  // what the opening rounds are scripted to hand the player, in order
  var SCRIPT = ["win", "lose", "tie"];

  // rock beats scissors, paper beats rock, scissors beats paper
  var BEATS = { rock: "scissors", paper: "rock", scissors: "paper" };
  var BEATEN_BY = { rock: "paper", paper: "scissors", scissors: "rock" };
  var THROWS = ["rock", "paper", "scissors"];
  var NAMES = { rock: "Rock", paper: "Paper", scissors: "Scissors" };

  // R and S are free; P is deliberately a throw here, so this page does not
  // bind ui.bindPauseKey() (which would claim KeyP for the settings panel).
  var KEYS = { KeyR: "rock", KeyP: "paper", KeyS: "scissors" };

  var REVEAL_MS = 640;

  /** The result the opening rounds are scripted to hand the player, else null. */
  function scriptedResult(round) {
    return round <= SCRIPT.length ? SCRIPT[round - 1] : null;
  }

  /**
   * The machine's throw. `wanted` is the scripted result for the opening three
   * rounds, and null from round four on — where it throws genuinely at random.
   */
  function machineThrowFor(playerThrow, wanted) {
    if (wanted === null) return THROWS[Math.floor(Math.random() * THROWS.length)];
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
      key: "countdown",
      label: "Reveal",
      type: "toggle",
      group: "Play",
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
  var promptEl = document.getElementById("rpsPrompt");
  var resetBtn = document.getElementById("rpsReset");
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
    schema: SCHEMA
  });

  var state = {
    round: 1,
    score: { wins: 0, losses: 0, draws: 0 },
    playerThrow: null,
    machineThrow: null,
    result: null,
    throwInFlight: false,
    roundOver: false
  };

  var revealTimer = 0;
  var revealToken = 0;

  function values() {
    return panel.values();
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

  /** The line directly above the throw buttons: what to do next. */
  function setPrompt(text) {
    promptEl.textContent = text;
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

  /** Round is a plain running count: the game has no end to count towards. */
  function paintHud() {
    roundEl.textContent = String(state.round);
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
   * One round of the endless tally. Per round rather than per match because the
   * game has no end — the record on the homepage is a running total.
   */
  function bumpStat(kind) {
    var stats = storage.getStats(GAME_ID, {});
    if (!stats["1p"] || typeof stats["1p"] !== "object") {
      stats["1p"] = { wins: 0, losses: 0, draws: 0 };
    }
    stats["1p"][kind] = (stats["1p"][kind] || 0) + 1;
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
    setPrompt("Pick your throw");
    setNote("Round " + state.round + ".");
    paintHud();
  }

  function startGame() {
    state.score = { wins: 0, losses: 0, draws: 0 };
    state.round = 1;
    state.roundOver = false;
    prepareRound();
  }

  function throwHand(hand) {
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
      if (token !== revealToken) return;
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
      bumpStat("wins");
      audio.play("win");
      setStatus("Round won", "var(--lime)");
      setNote("Your " + NAMES[state.playerThrow] + " beats its " + NAMES[state.machineThrow] + ".");
    } else if (state.result === "lose") {
      machineHandEl.classList.add("is-win");
      state.score.losses++;
      bumpStat("losses");
      audio.play("lose");
      setStatus("Round lost", "var(--magenta)");
      setNote("Its " + NAMES[state.machineThrow] + " beats your " + NAMES[state.playerThrow] + ".");
    } else {
      state.score.draws++;
      bumpStat("draws");
      audio.play("draw");
      setStatus("Dead heat", "var(--ink-dim)");
      setNote("Both threw " + NAMES[state.playerThrow] + ".");
    }

    flashScreen();
    paintHud();

    // No auto-advance and no finish: the round result stays up, and the prompt
    // above the buttons spells out that another throw is how you play on.
    setThrowsEnabled(true);
    setPrompt("Pick a new throw to play on");
  }

  /* ---------------------------------------------------------------------- */
  /* controls                                                               */
  /* ---------------------------------------------------------------------- */

  throwBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      throwHand(btn.dataset.throw);
    });
  });

  resetBtn.addEventListener("click", function () {
    audio.play("select");
    startGame();
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
  startGame();
})((window.Arcade = window.Arcade || {}));
