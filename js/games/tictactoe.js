/* ==========================================================================
   Beat The Arcade — js/games/tictactoe.js
   Tic tac toe: one or two players, configurable starting player, three CPU
   strengths (up to an unbeatable memoised minimax) and best-of-N matches.
   ========================================================================== */

(function (Arcade) {
  "use strict";

  var storage = Arcade.storage;
  var audio = Arcade.audio;
  var input = Arcade.input;
  var ui = Arcade.ui;

  var GAME_ID = "tictactoe";

  var LINES = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6]
  ];

  // When the CPU takes a round's opening move it always claims the centre and
  // then answers from this fixed table: the key is the cell the human just
  // played, the value is the cell the CPU replies with. There is no entry for
  // cell 4 because the CPU is already sitting on it.
  //
  // This mirrors the scripted computer in the sibling tictactoe project. The
  // difficulty setting only governs the fallback, which is reached when the
  // scripted cell has already been taken.
  var OPENING_REPLIES = {
    0: 1,
    1: 0,
    2: 5,
    3: 6,
    5: 2,
    6: 3,
    7: 8,
    8: 7
  };

  var CENTRE = 4;

  var SCHEMA = [
    {
      key: "mode",
      label: "Mode",
      type: "segmented",
      group: "Players",
      default: "1p",
      options: [
        { value: "1p", label: "1 Player" },
        { value: "2p", label: "2 Players" }
      ]
    },
    {
      key: "symbol",
      label: "Your Mark",
      type: "segmented",
      default: "O",
      hint: "X always moves first unless you choose a different starting player.",
      visible: function (v) {
        return v.mode === "1p";
      },
      options: [
        { value: "X", label: "X" },
        { value: "O", label: "O" }
      ]
    },
    {
      key: "first1p",
      label: "Starting Player",
      type: "segmented",
      default: "cpu",
      visible: function (v) {
        return v.mode === "1p";
      },
      options: [
        { value: "you", label: "You" },
        { value: "cpu", label: "CPU" },
        { value: "alternate", label: "Alternate" }
      ]
    },
    {
      key: "first2p",
      label: "Starting Player",
      type: "segmented",
      default: "X",
      visible: function (v) {
        return v.mode === "2p";
      },
      options: [
        { value: "X", label: "X" },
        { value: "O", label: "O" },
        { value: "alternate", label: "Alternate" }
      ]
    },
    {
      key: "difficulty",
      label: "CPU Difficulty",
      type: "segmented",
      group: "Computer",
      default: "medium",
      visible: function (v) {
        return v.mode === "1p";
      },
      hint: "Hard plays perfectly when you move first. Let it open and it follows one fixed pattern.",
      options: [
        { value: "easy", label: "Easy" },
        { value: "medium", label: "Medium" },
        { value: "hard", label: "Hard" }
      ]
    },
    {
      key: "bestOf",
      label: "Match Length",
      type: "stepper",
      group: "Match",
      default: 1,
      min: 1,
      max: 5,
      step: 2,
      format: function (v) {
        return v === 1 ? "Single game" : "Best of " + v;
      }
    },
    {
      key: "animations",
      label: "Win Animation",
      type: "toggle",
      group: "Presentation",
      default: true,
      onLabel: "Glow the line",
      offLabel: "Plain highlight"
    }
  ];

  /* ---------------------------------------------------------------------- */
  /* dom                                                                    */
  /* ---------------------------------------------------------------------- */

  var boardEl = document.getElementById("tttBoard");
  var statusEl = document.getElementById("tttStatus");
  var scoreEl = document.getElementById("tttScore");
  var modeEl = document.getElementById("tttMode");
  var turnEl = document.getElementById("tttTurn");
  var roundEl = document.getElementById("tttRound");
  var targetEl = document.getElementById("tttTarget");
  var noteEl = document.getElementById("tttRoundNote");
  var newRoundBtn = document.getElementById("tttNewRound");
  var resetMatchBtn = document.getElementById("tttResetMatch");
  var screenEl = document.querySelector(".bezel__screen");

  var cells = [];

  for (var i = 0; i < 9; i++) {
    var cell = document.createElement("button");
    cell.type = "button";
    cell.className = "ttt__cell";
    cell.dataset.index = String(i);
    cell.addEventListener("click", onCellClick);
    boardEl.appendChild(cell);
    cells.push(cell);
  }

  /* ---------------------------------------------------------------------- */
  /* settings                                                               */
  /* ---------------------------------------------------------------------- */

  var panel = Arcade.settings.mount(document.getElementById("settings"), {
    gameId: GAME_ID,
    title: "Tic Tac Toe",
    schema: SCHEMA,
    onChange: function (key) {
      if (key === "animations") return;
      startMatch();
    }
  });

  /* ---------------------------------------------------------------------- */
  /* state                                                                  */
  /* ---------------------------------------------------------------------- */

  var state = {
    board: new Array(9).fill(null),
    turn: "X",
    humanMark: "X",
    cpuMark: "O",
    round: 1,
    matchScore: { X: 0, O: 0, draws: 0 },
    locked: true,
    starter: "X",
    matchOver: false,
    // True when the CPU took this round's opening move, so it plays the scripted
    // OPENING_REPLIES rather than the difficulty's own logic.
    cpuOpened: false,
    // The cell the human just played, which keys OPENING_REPLIES. It stays -1
    // until they move, which is what makes the CPU's first move the centre.
    lastHumanMove: -1
  };

  var aiToken = 0;
  var roundTimer = 0;

  function values() {
    return panel.values();
  }

  function isOnePlayer() {
    return values().mode === "1p";
  }

  function isCpuTurn() {
    return isOnePlayer() && state.turn === state.cpuMark;
  }

  function starterForRound(roundNumber) {
    var v = values();
    if (v.mode === "1p") {
      var human = v.symbol === "O" ? "O" : "X";
      var cpu = human === "X" ? "O" : "X";
      if (v.first1p === "cpu") return cpu;
      if (v.first1p === "alternate") return roundNumber % 2 === 1 ? human : cpu;
      return human;
    }
    if (v.first2p === "alternate") return roundNumber % 2 === 1 ? "X" : "O";
    return v.first2p === "O" ? "O" : "X";
  }

  function targetWins() {
    var best = values().bestOf;
    return Math.max(1, Math.ceil(best / 2));
  }

  /* ---------------------------------------------------------------------- */
  /* stats                                                                  */
  /* ---------------------------------------------------------------------- */

  function statsFor(mode) {
    var all = storage.getStats(GAME_ID, {});
    var row = all[mode];
    return {
      wins: row && row.wins ? row.wins : 0,
      losses: row && row.losses ? row.losses : 0,
      draws: row && row.draws ? row.draws : 0
    };
  }

  function bumpStats(field) {
    var all = storage.getStats(GAME_ID, {});
    var mode = values().mode;
    if (!all[mode]) all[mode] = { wins: 0, losses: 0, draws: 0 };
    all[mode][field] = (all[mode][field] || 0) + 1;
    storage.saveStats(GAME_ID, all);
    renderScore();
  }

  function renderScore() {
    var row = statsFor(values().mode);
    var oneP = isOnePlayer();
    var left = oneP ? "You" : "X";
    var right = oneP ? "CPU" : "O";

    scoreEl.textContent = "";
    [
      { label: left, value: row.wins, cls: "is-x" },
      { label: right, value: row.losses, cls: "is-o" },
      { label: "Draws", value: row.draws, cls: "" }
    ].forEach(function (item) {
      var span = ui.el("span", item.cls);
      span.appendChild(document.createTextNode(item.label + " "));
      var b = ui.el("b", null, String(item.value));
      span.appendChild(b);
      scoreEl.appendChild(span);
    });
  }

  /* ---------------------------------------------------------------------- */
  /* rendering                                                              */
  /* ---------------------------------------------------------------------- */

  function renderBoard(winLine, markLast) {
    var animate = values().animations && !ui.reducedMotion();

    cells.forEach(function (cell, index) {
      var mark = state.board[index];
      cell.textContent = mark || "";
      if (mark) {
        cell.dataset.mark = mark;
      } else {
        delete cell.dataset.mark;
      }
      cell.disabled = !!mark || state.locked || isCpuTurn();
      cell.classList.toggle("is-win", !!(winLine && winLine.indexOf(index) > -1));
      cell.classList.toggle("no-anim", !animate);
      cell.classList.toggle("is-last", markLast === index);

      var row = Math.floor(index / 3) + 1;
      var col = (index % 3) + 1;
      cell.setAttribute(
        "aria-label",
        "Row " + row + ", column " + col + ", " + (mark ? mark : "empty")
      );
    });
  }

  function setStatus(text, tone) {
    statusEl.textContent = text;
    statusEl.style.color = tone || "";
  }

  function renderHud() {
    var oneP = isOnePlayer();
    modeEl.textContent = oneP ? "1P" : "2P";
    turnEl.textContent = state.matchOver ? "—" : state.turn;
    roundEl.textContent = state.matchOver ? "—" : String(state.round);
    targetEl.textContent = String(targetWins());
    noteEl.textContent = state.matchOver
      ? "Match complete"
      : "Round " + state.round + " of " + values().bestOf + " · " + state.starter + " starts";
  }

  /* ---------------------------------------------------------------------- */
  /* rules                                                                  */
  /* ---------------------------------------------------------------------- */

  function winnerOf(board) {
    for (var i = 0; i < LINES.length; i++) {
      var line = LINES[i];
      var a = board[line[0]];
      if (a && a === board[line[1]] && a === board[line[2]]) {
        return { mark: a, line: line };
      }
    }
    return null;
  }

  function emptyCells(board) {
    var out = [];
    for (var i = 0; i < board.length; i++) {
      if (!board[i]) out.push(i);
    }
    return out;
  }

  function other(mark) {
    return mark === "X" ? "O" : "X";
  }

  /** Unambiguous memo key: every cell contributes exactly one character. */
  function boardKey(board) {
    var out = "";
    for (var i = 0; i < board.length; i++) {
      out += board[i] || "-";
    }
    return out;
  }

  /* ---------------------------------------------------------------------- */
  /* cpu                                                                    */
  /* ---------------------------------------------------------------------- */

  /**
   * The scripted reply, used whenever the CPU took the round's opening move:
   * claim the centre first, then answer the human's last cell from
   * OPENING_REPLIES. An immediate win always outranks the script.
   *
   * Returns -1 for "no scripted move available", so the caller can fall back to
   * the difficulty logic. That happens when the scripted cell is already taken —
   * the CPU must never overwrite a mark.
   */
  function scriptedReply(board, mark) {
    var win = findWinning(board, mark);
    if (win > -1) return win;

    if (state.lastHumanMove === -1) {
      return board[CENTRE] === null ? CENTRE : -1;
    }

    var reply = OPENING_REPLIES[state.lastHumanMove];
    if (reply === undefined) return -1;
    return board[reply] === null ? reply : -1;
  }

  function cpuChoose() {
    var board = state.board;
    var mark = state.cpuMark;
    var human = state.humanMark;
    var free = emptyCells(board);

    if (!free.length) return -1;

    // Scripted opening: the CPU takes the centre, then answers each human move
    // from OPENING_REPLIES. Only when that yields nothing does the chosen
    // difficulty get a say.
    if (state.cpuOpened) {
      var scripted = scriptedReply(board, mark);
      if (scripted > -1) return scripted;
    }

    var difficulty = values().difficulty;
    if (difficulty === "easy") {
      return free[Math.floor(Math.random() * free.length)];
    }

    if (difficulty === "medium") {
      // win if possible, block if the human is about to win, otherwise play
      // a centre/corner-biased random move
      var win = findWinning(board, mark);
      if (win > -1) return win;
      var block = findWinning(board, human);
      if (block > -1) return block;

      if (Math.random() < 0.35) {
        return free[Math.floor(Math.random() * free.length)];
      }
      if (board[4] === null) return 4;
      var corners = [0, 2, 6, 8].filter(function (i) {
        return board[i] === null;
      });
      if (corners.length) return corners[Math.floor(Math.random() * corners.length)];
      return free[Math.floor(Math.random() * free.length)];
    }

    return bestMove(board, mark, human);
  }

  function findWinning(board, mark) {
    for (var i = 0; i < LINES.length; i++) {
      var line = LINES[i];
      var marks = 0;
      var empty = -1;
      for (var j = 0; j < 3; j++) {
        var value = board[line[j]];
        if (value === mark) marks++;
        else if (!value) empty = line[j];
      }
      if (marks === 2 && empty > -1) return empty;
    }
    return -1;
  }

  var memo = Object.create(null);

  function bestMove(board, aiMark, humanMark) {
    var best = -Infinity;
    var choice = -1;

    for (var i = 0; i < 9; i++) {
      if (board[i]) continue;
      board[i] = aiMark;
      var score = minimax(board, other(aiMark), aiMark, humanMark, 1);
      board[i] = null;
      if (score > best) {
        best = score;
        choice = i;
      }
    }
    return choice;
  }

  function minimax(board, turn, aiMark, humanMark, depth) {
    var win = winnerOf(board);
    if (win) {
      return win.mark === aiMark ? 10 - depth : depth - 10;
    }

    var free = emptyCells(board);
    if (!free.length) return 0;

    // Empty cells must occupy a slot in the key, otherwise [X,null,null] and
    // [null,null,X] would collide and poison the memo.
    var key = boardKey(board) + turn;
    if (memo[key] !== undefined) return memo[key];

    var best = turn === aiMark ? -Infinity : Infinity;

    for (var i = 0; i < free.length; i++) {
      var index = free[i];
      board[index] = turn;
      var score = minimax(board, other(turn), aiMark, humanMark, depth + 1);
      board[index] = null;

      if (turn === aiMark) {
        if (score > best) best = score;
      } else if (score < best) {
        best = score;
      }
    }

    memo[key] = best;
    return best;
  }

  /* ---------------------------------------------------------------------- */
  /* flow                                                                   */
  /* ---------------------------------------------------------------------- */

  function startMatch() {
    window.clearTimeout(roundTimer);
    aiToken++;

    var v = values();
    state.humanMark = v.symbol === "O" ? "O" : "X";
    state.cpuMark = other(state.humanMark);
    state.matchScore = { X: 0, O: 0, draws: 0 };
    state.round = 1;
    state.matchOver = false;

    renderScore();
    startRound();
  }

  function startRound() {
    window.clearTimeout(roundTimer);
    aiToken++;
    input.clear();

    state.board = new Array(9).fill(null);
    state.starter = starterForRound(state.round);
    state.turn = state.starter;
    state.locked = false;
    state.lastHumanMove = -1;
    // The CPU plays its scripted opening whenever it takes a round's first move,
    // on every difficulty. Rounds the human opens are unaffected.
    state.cpuOpened = isCpuTurn();

    renderBoard(null, -1);
    renderHud();

    if (isCpuTurn()) {
      setStatus("CPU is thinking…");
      scheduleCpu();
    } else {
      setStatus(statusForTurn());
    }
  }

  function statusForTurn() {
    if (isOnePlayer()) {
      return state.turn === state.humanMark ? "Your turn" : "CPU's turn";
    }
    return "Player " + state.turn + "'s turn";
  }

  function onCellClick(event) {
    var index = Number(event.currentTarget.dataset.index);
    if (state.locked || state.board[index] || state.matchOver) return;
    if (isCpuTurn()) return;
    play(index);
  }

  function play(index) {
    state.board[index] = state.turn;
    if (state.turn === state.humanMark) {
      state.lastHumanMove = index;
    }
    audio.play(state.turn === "X" ? "place" : "oplace");

    var win = winnerOf(state.board);
    var full = emptyCells(state.board).length === 0;

    if (!win && !full) {
      state.turn = other(state.turn);
      renderBoard(null, index);
      renderHud();
      if (isCpuTurn()) {
        setStatus("CPU is thinking…");
        scheduleCpu();
      } else {
        setStatus(statusForTurn());
      }
      return;
    }

    state.locked = true;
    renderBoard(win ? win.line : null, index);
    finishRound(win ? win.mark : null);
  }

  function scheduleCpu() {
    var token = ++aiToken;
    var delay = 260 + Math.random() * 220;
    window.setTimeout(function () {
      if (token !== aiToken) return;
      if (state.locked || state.matchOver) return;
      var move = cpuChoose();
      if (move > -1) play(move);
    }, delay);
  }

  function finishRound(winner) {
    state.locked = true;

    if (!winner) {
      state.matchScore.draws++;
      bumpStats("draws");
      setStatus("Draw");
      audio.play("draw");
    } else {
      state.matchScore[winner]++;
    }

    if (winner) {
      var oneP = isOnePlayer();
      var humanWon = winner === state.humanMark;
      if (oneP) {
        if (humanWon) {
          bumpStats("wins");
          setStatus("You win!", "var(--cyan)");
        } else {
          bumpStats("losses");
          setStatus("CPU wins", "var(--magenta)");
        }
        audio.play(humanWon ? "win" : "lose");
      } else {
        bumpStats(winner === "X" ? "wins" : "losses");
        setStatus("Player " + winner + " wins", winner === "X" ? "var(--cyan)" : "var(--magenta)");
        audio.play("win");
      }
    }

    if (screenEl) {
      screenEl.classList.remove("flash");
      void screenEl.offsetWidth;
      screenEl.classList.add("flash");
    }

    renderHud();

    var target = targetWins();
    var decided =
      state.matchScore.X >= target || state.matchScore.O >= target || state.matchScore.draws >= target;

    if (decided) {
      endMatch();
      return;
    }

    roundTimer = window.setTimeout(function () {
      state.round++;
      startRound();
    }, 1600);
  }

  function endMatch() {
    state.matchOver = true;
    state.locked = true;
    renderHud();

    var s = state.matchScore;
    var oneP = isOnePlayer();
    var summary = s.X + " – " + s.O + (s.draws ? " (" + s.draws + " drawn)" : "");

    var drawn = s.X === s.O;
    var leftWon = s.X > s.O;

    if (oneP) {
      var humanWon = drawn ? false : (state.humanMark === "X" ? leftWon : !leftWon);
      var message = drawn
        ? "Match drawn " + summary
        : humanWon
        ? "You take the match " + summary
        : "CPU takes the match " + summary;

      setStatus(
        message,
        drawn ? "var(--ink-dim)" : humanWon ? "var(--cyan)" : "var(--magenta)"
      );
      audio.play(drawn ? "draw" : humanWon ? "win" : "lose");
    } else {
      setStatus(
        drawn ? "Match drawn " + summary : "Player " + (leftWon ? "X" : "O") + " takes the match " + summary,
        drawn ? "var(--ink-dim)" : ""
      );
      audio.play(drawn ? "draw" : "win");
    }

    if (screenEl) {
      screenEl.classList.remove("flash");
      void screenEl.offsetWidth;
      screenEl.classList.add("flash");
    }

    ui.toast("Match complete — starting a new one");
    roundTimer = window.setTimeout(startMatch, 2600);
  }

  /* ---------------------------------------------------------------------- */
  /* controls                                                               */
  /* ---------------------------------------------------------------------- */

  newRoundBtn.addEventListener("click", function () {
    if (state.matchOver) {
      startMatch();
      return;
    }
    startRound();
    audio.play("select");
  });

  resetMatchBtn.addEventListener("click", function () {
    audio.play("select");
    startMatch();
    ui.toast("Match reset");
  });

  input.onKey(function (code, event, repeat) {
    if (repeat) return;
    if (code === "Enter" && !panel.isOpen()) {
      event.preventDefault();
      startRound();
    }
  });

  ui.bindPauseKey(function () {
    panel.toggle();
  });

  /* ---------------------------------------------------------------------- */
  /* boot                                                                   */
  /* ---------------------------------------------------------------------- */

  Arcade.ui.init({ settings: panel });
  renderScore();
  startMatch();
})(window.Arcade);
