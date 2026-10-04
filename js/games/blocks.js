/* ==========================================================================
   Beat The Arcade — js/games/blocks.js
   Blocks: SRS rotation with wall kicks, seven-bag randomiser, hold, ghost
   piece, configurable next queue, lock delay and DAS/ARR.

   Logical play field is 10 x 20 cells at 30 units per cell (300 x 600).
   ========================================================================== */

(function (Arcade) {
  "use strict";

  var COLS = 10;
  var ROWS = 20;
  var CELL = 30;
  var W = COLS * CELL;
  var H = ROWS * CELL;

  var storage = Arcade.storage;
  var audio = Arcade.audio;
  var input = Arcade.input;
  var ui = Arcade.ui;

  var GAME_ID = "blocks";

  /* ---------------------------------------------------------------------- */
  /* pieces                                                                 */
  /* ---------------------------------------------------------------------- */

  var TYPES = ["I", "J", "L", "O", "S", "T", "Z"];

  var COLORS = {
    I: "#00f0ff",
    J: "#4d7cff",
    L: "#ffb020",
    O: "#ffd93d",
    S: "#b6ff2b",
    T: "#b14dff",
    Z: "#ff2bd6"
  };

  var SPAWN_X = { I: 3, J: 3, L: 3, O: 4, S: 3, T: 3, Z: 3 };

  /* Four rotation states per piece, SRS compatible. */
  var SHAPES = {
    I: [
      [
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
      ],
      [
        [0, 0, 1, 0],
        [0, 0, 1, 0],
        [0, 0, 1, 0],
        [0, 0, 1, 0]
      ],
      [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 0, 0, 0]
      ],
      [
        [0, 1, 0, 0],
        [0, 1, 0, 0],
        [0, 1, 0, 0],
        [0, 1, 0, 0]
      ]
    ],
    J: [
      [
        [1, 0, 0],
        [1, 1, 1],
        [0, 0, 0]
      ],
      [
        [0, 1, 1],
        [0, 1, 0],
        [0, 1, 0]
      ],
      [
        [0, 0, 0],
        [1, 1, 1],
        [0, 0, 1]
      ],
      [
        [0, 1, 0],
        [0, 1, 0],
        [1, 1, 0]
      ]
    ],
    L: [
      [
        [0, 0, 1],
        [1, 1, 1],
        [0, 0, 0]
      ],
      [
        [0, 1, 0],
        [0, 1, 0],
        [0, 1, 1]
      ],
      [
        [0, 0, 0],
        [1, 1, 1],
        [1, 0, 0]
      ],
      [
        [1, 1, 0],
        [0, 1, 0],
        [0, 1, 0]
      ]
    ],
    O: [
      [
        [1, 1],
        [1, 1]
      ],
      [
        [1, 1],
        [1, 1]
      ],
      [
        [1, 1],
        [1, 1]
      ],
      [
        [1, 1],
        [1, 1]
      ]
    ],
    S: [
      [
        [0, 1, 1],
        [1, 1, 0],
        [0, 0, 0]
      ],
      [
        [0, 1, 0],
        [0, 1, 1],
        [0, 0, 1]
      ],
      [
        [0, 0, 0],
        [0, 1, 1],
        [1, 1, 0]
      ],
      [
        [1, 0, 0],
        [1, 1, 0],
        [0, 1, 0]
      ]
    ],
    T: [
      [
        [0, 1, 0],
        [1, 1, 1],
        [0, 0, 0]
      ],
      [
        [0, 1, 0],
        [0, 1, 1],
        [0, 1, 0]
      ],
      [
        [0, 0, 0],
        [1, 1, 1],
        [0, 1, 0]
      ],
      [
        [0, 1, 0],
        [1, 1, 0],
        [0, 1, 0]
      ]
    ],
    Z: [
      [
        [1, 1, 0],
        [0, 1, 1],
        [0, 0, 0]
      ],
      [
        [0, 0, 1],
        [0, 1, 1],
        [0, 1, 0]
      ],
      [
        [0, 0, 0],
        [1, 1, 0],
        [0, 1, 1]
      ],
      [
        [0, 1, 0],
        [1, 1, 0],
        [1, 0, 0]
      ]
    ]
  };

  /* SRS kicks, already converted to screen coordinates (y grows downwards). */
  var JLSTZ_KICKS = {
    "0>1": [
      [0, 0],
      [-1, 0],
      [-1, -1],
      [0, 2],
      [-1, 2]
    ],
    "1>0": [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, -2],
      [1, -2]
    ],
    "1>2": [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, -2],
      [1, -2]
    ],
    "2>1": [
      [0, 0],
      [-1, 0],
      [-1, -1],
      [0, 2],
      [-1, 2]
    ],
    "2>3": [
      [0, 0],
      [1, 0],
      [1, -1],
      [0, 2],
      [1, 2]
    ],
    "3>2": [
      [0, 0],
      [-1, 0],
      [-1, 1],
      [0, -2],
      [-1, -2]
    ],
    "3>0": [
      [0, 0],
      [-1, 0],
      [-1, 1],
      [0, -2],
      [-1, -2]
    ],
    "0>3": [
      [0, 0],
      [1, 0],
      [1, -1],
      [0, 2],
      [1, 2]
    ]
  };

  var I_KICKS = {
    "0>1": [
      [0, 0],
      [-2, 0],
      [1, 0],
      [-2, 1],
      [1, -2]
    ],
    "1>0": [
      [0, 0],
      [2, 0],
      [-1, 0],
      [2, -1],
      [-1, 2]
    ],
    "1>2": [
      [0, 0],
      [-1, 0],
      [2, 0],
      [-1, -2],
      [2, 1]
    ],
    "2>1": [
      [0, 0],
      [1, 0],
      [-2, 0],
      [1, 2],
      [-2, -1]
    ],
    "2>3": [
      [0, 0],
      [2, 0],
      [-1, 0],
      [2, -1],
      [-1, 2]
    ],
    "3>2": [
      [0, 0],
      [-2, 0],
      [1, 0],
      [-2, 1],
      [1, -2]
    ],
    "3>0": [
      [0, 0],
      [1, 0],
      [-2, 0],
      [1, 2],
      [-2, -1]
    ],
    "0>3": [
      [0, 0],
      [-1, 0],
      [2, 0],
      [-1, -2],
      [2, 1]
    ]
  };

  var GRAVITY = [
    1.0, 0.793, 0.618, 0.473, 0.355, 0.262, 0.19, 0.135, 0.094, 0.064, 0.043, 0.028,
    0.018, 0.011, 0.007
  ];

  var LOCK_DELAY = 0.5;
  var MAX_LOCK_RESETS = 15;
  var DAS = 0.17;
  var ARR = 0.05;
  var SOFT_FACTOR = 0.05;

  /* ---------------------------------------------------------------------- */
  /* settings                                                               */
  /* ---------------------------------------------------------------------- */

  var SCHEMA = [
    {
      key: "startLevel",
      label: "Starting Level",
      type: "stepper",
      group: "Game",
      default: 1,
      min: 1,
      max: 10,
      format: function (v) {
        return "Level " + v;
      },
      hint: "Gravity gets serious fast. Applies to the next game."
    },
    {
      key: "ghost",
      label: "Ghost Piece",
      type: "toggle",
      group: "Pieces",
      default: true,
      onLabel: "Shows landing spot",
      offLabel: "Hidden"
    },
    {
      key: "hold",
      label: "Hold Slot",
      type: "toggle",
      group: "Pieces",
      default: true,
      onLabel: "Hold enabled",
      offLabel: "Hold disabled"
    },
    {
      key: "next",
      label: "Next Queue",
      type: "stepper",
      group: "Pieces",
      default: 3,
      min: 1,
      max: 5,
      format: function (v) {
        return v + (v === 1 ? " piece" : " pieces");
      }
    },
    {
      key: "controls",
      label: "Control Scheme",
      type: "segmented",
      group: "Controls",
      default: "auto",
      hint: "Swipe the play field to move and tap to rotate. Auto shows the pad on touch devices.",
      options: [
        { value: "auto", label: "Auto" },
        { value: "keyboard", label: "Keyboard" },
        { value: "touch", label: "Touch" }
      ]
    },
    {
      key: "hardDrop",
      label: "Hard Drop",
      type: "toggle",
      group: "Controls",
      default: true,
      onLabel: "Space slams down",
      offLabel: "Soft drop only"
    },
    {
      key: "effects",
      label: "Line Clear Effects",
      type: "toggle",
      group: "Presentation",
      default: true,
      onLabel: "Flash and shake",
      offLabel: "Plain"
    },
    {
      key: "autoPause",
      label: "Pause When Hidden",
      type: "toggle",
      group: "Presentation",
      default: true,
      onLabel: "Pauses in background",
      offLabel: "Keeps running"
    }
  ];

  /* ---------------------------------------------------------------------- */
  /* dom                                                                    */
  /* ---------------------------------------------------------------------- */

  var canvas = document.getElementById("blocksCanvas");
  var holdCanvas = document.getElementById("blocksHold");
  var nextCanvas = document.getElementById("blocksNext");
  var scoreEl = document.getElementById("blocksScore");
  var levelEl = document.getElementById("blocksLevel");
  var linesEl = document.getElementById("blocksLines");
  var bestEl = document.getElementById("blocksBest");
  var padEl = document.getElementById("blocksPad");
  var screenEl = document.querySelector(".bezel__screen");

  var panel = Arcade.settings.mount(document.getElementById("settings"), {
    gameId: GAME_ID,
    title: "Blocks",
    schema: SCHEMA,
    onChange: function (key) {
      if (key === "next" || key === "hold") paintSide();
      else if (key === "controls") applyPad();
      else if (key === "startLevel") ui.toast("Applies on the next game");
    }
  });

  function values() {
    return panel.values();
  }

  function applyPad() {
    input.applyPadVisibility(padEl, { mode: values().controls });
  }

  /* ---------------------------------------------------------------------- */
  /* state                                                                  */
  /* ---------------------------------------------------------------------- */

  var grid = [];
  var piece = null;
  var queue = [];
  var holdType = null;
  var holdUsed = false;
  var touch = { left: false, right: false, down: false };
  var repeat = { dir: 0, elapsed: 0, charged: false, arr: 0 };

  var state = {
    phase: "playing",
    score: 0,
    lines: 0,
    level: 1,
    startLevel: 1,
    gravityTimer: 0,
    softTimer: 0,
    lockTimer: 0,
    lockResets: 0,
    pendingClear: null,
    shake: 0
  };

  /* ---------------------------------------------------------------------- */
  /* board helpers                                                          */
  /* ---------------------------------------------------------------------- */

  function emptyRow() {
    var row = [];
    for (var i = 0; i < COLS; i++) row.push(null);
    return row;
  }

  function resetGrid() {
    grid = [];
    for (var r = 0; r < ROWS; r++) grid.push(emptyRow());
  }

  function newBag() {
    var bag = TYPES.slice();
    for (var i = bag.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = bag[i];
      bag[i] = bag[j];
      bag[j] = tmp;
    }
    return bag;
  }

  function refillQueue() {
    while (queue.length < 6) {
      queue = queue.concat(newBag());
    }
  }

  function shapeOf(type, rot) {
    return SHAPES[type][((rot % 4) + 4) % 4];
  }

  /** Filled cells of a piece at a hypothetical position. */
  function cellsFor(type, rot, px, py) {
    var shape = shapeOf(type, rot);
    var out = [];
    for (var r = 0; r < shape.length; r++) {
      for (var c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) out.push({ row: py + r, col: px + c });
      }
    }
    return out;
  }

  function collides(type, rot, px, py) {
    var cells = cellsFor(type, rot, px, py);
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      if (cell.col < 0 || cell.col >= COLS) return true;
      if (cell.row >= ROWS) return true;
      if (cell.row >= 0 && grid[cell.row][cell.col]) return true;
    }
    return false;
  }

  function makePiece(type) {
    var shape = shapeOf(type, 0);
    var top = 0;
    for (var r = 0; r < shape.length; r++) {
      if (shape[r].indexOf(1) > -1) {
        top = r;
        break;
      }
    }
    return { type: type, rot: 0, x: SPAWN_X[type], y: -top };
  }

  /* ---------------------------------------------------------------------- */
  /* movement                                                               */
  /* ---------------------------------------------------------------------- */

  function canAct() {
    return state.phase === "playing" && !state.pendingClear && piece;
  }

  function moveBy(dx, dy, player) {
    if (!canAct()) return false;
    if (collides(piece.type, piece.rot, piece.x + dx, piece.y + dy)) return false;
    piece.x += dx;
    piece.y += dy;
    if (player) notePlayerMove();
    return true;
  }

  function notePlayerMove() {
    if (!collides(piece.type, piece.rot, piece.x, piece.y + 1) && state.lockResets < MAX_LOCK_RESETS) {
      state.lockTimer = 0;
      state.lockResets++;
    }
  }

  /**
   * A fresh left/right press moves immediately. Held keys then continue via
   * the DAS/ARR logic in update() — this makes a fast tap impossible to lose.
   */
  function pressHorizontal(dir) {
    if (!canAct()) return;
    if (moveBy(dir, 0, true)) audio.play("move");
    repeat.dir = dir;
    repeat.elapsed = 0;
    repeat.charged = false;
    repeat.arr = 0;
  }

  function rotate(delta) {
    if (!canAct()) return;
    var from = piece.rot;
    var to = (from + (delta > 0 ? 1 : 3)) % 4;

    var kicks;
    if (piece.type === "O") kicks = [[0, 0]];
    else if (piece.type === "I") kicks = I_KICKS[from + ">" + to] || [[0, 0]];
    else kicks = JLSTZ_KICKS[from + ">" + to] || [[0, 0]];

    for (var i = 0; i < kicks.length; i++) {
      var nx = piece.x + kicks[i][0];
      var ny = piece.y + kicks[i][1];
      if (!collides(piece.type, to, nx, ny)) {
        piece.rot = to;
        piece.x = nx;
        piece.y = ny;
        notePlayerMove();
        audio.play("rotate");
        return;
      }
    }
  }

  function dropDistance() {
    var d = 0;
    while (!collides(piece.type, piece.rot, piece.x, piece.y + d + 1)) d++;
    return d;
  }

  function hardDrop() {
    if (!canAct() || !values().hardDrop) return;
    var d = dropDistance();
    if (d > 0) {
      piece.y += d;
      addScore(d * 2);
      audio.play("hardDrop");
    }
    lockPiece();
  }

  function hold() {
    if (!canAct() || !values().hold || holdUsed) return;
    var current = piece.type;
    if (holdType) {
      piece = makePiece(holdType);
    } else {
      holdType = current;
      piece = makePiece(queue.shift());
      refillQueue();
    }
    holdType = current;
    holdUsed = true;
    state.lockTimer = 0;
    state.lockResets = 0;
    state.gravityTimer = 0;
    audio.play("hold");
    paintSide();

    if (collides(piece.type, piece.rot, piece.x, piece.y)) gameOver();
  }

  function softStep() {
    if (!canAct()) return;
    if (moveBy(0, 1, true)) {
      addScore(1);
      state.lockTimer = 0;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* locking + clearing                                                     */
  /* ---------------------------------------------------------------------- */

  function lockPiece() {
    if (!piece) return;
    var cells = cellsFor(piece.type, piece.rot, piece.x, piece.y);
    var aboveField = 0;

    cells.forEach(function (cell) {
      if (cell.row < 0) {
        aboveField++;
        return;
      }
      grid[cell.row][cell.col] = piece.type;
    });

    piece = null;
    audio.play("lock");

    if (aboveField === cells.length) {
      gameOver();
      return;
    }
    var rows = [];
    for (var r = 0; r < ROWS; r++) {
      if (grid[r].indexOf(null) === -1) rows.push(r);
    }

    if (rows.length) {
      state.pendingClear = { rows: rows, t: 0.2 };
      audio.play(rows.length === 4 ? "quadClear" : "lineClear");
      if (rows.length === 4 && values().effects) state.shake = 8;
    } else {
      spawnNext();
    }
  }

  function applyClear() {
    var rows = state.pendingClear.rows.slice();
    var count = rows.length;
    state.pendingClear = null;

    rows.sort(function (a, b) {
      return b - a;
    });
    rows.forEach(function (r) {
      grid.splice(r, 1);
    });
    for (var i = 0; i < count; i++) grid.unshift(emptyRow());

    state.lines += count;
    var table = [0, 100, 300, 500, 800];
    addScore((table[count] || 0) * state.level);

    var level = Math.min(15, state.startLevel + Math.floor(state.lines / 10));
    if (level > state.level) {
      state.level = level;
      audio.play("levelUp");
      ui.toast("Level " + level);
    }

    syncHud();
    spawnNext();
  }

  function spawnNext() {
    refillQueue();
    piece = makePiece(queue.shift());
    refillQueue();
    holdUsed = false;
    state.lockTimer = 0;
    state.lockResets = 0;
    state.gravityTimer = 0;
    paintSide();

    if (collides(piece.type, piece.rot, piece.x, piece.y)) gameOver();
  }

  /* ---------------------------------------------------------------------- */
  /* scoring / hud                                                          */
  /* ---------------------------------------------------------------------- */

  function addScore(points) {
    state.score += points;
    syncHud();
  }

  function syncHud() {
    scoreEl.textContent = ui.formatNumber(state.score);
    levelEl.textContent = String(state.level);
    linesEl.textContent = String(state.lines);
    bestEl.textContent = ui.formatNumber(Math.max(storage.getBest(GAME_ID), state.score));
  }

  /* ---------------------------------------------------------------------- */
  /* update                                                                 */
  /* ---------------------------------------------------------------------- */

  function gravityInterval() {
    var index = Math.max(0, Math.min(GRAVITY.length - 1, state.level - 1));
    return GRAVITY[index];
  }

  function update(dt) {
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 30);

    if (state.pendingClear) {
      state.pendingClear.t -= dt;
      if (state.pendingClear.t <= 0) applyClear();
      return;
    }

    if (state.phase !== "playing" || !piece) return;

    handleMoveKeys(dt);

    var soft = input.isDown("down") || touch.down;
    if (soft) {
      state.softTimer += dt;
      var softInterval = Math.max(0.02, gravityInterval() * SOFT_FACTOR);
      var guard = 0;
      while (state.softTimer >= softInterval && guard < 6) {
        state.softTimer -= softInterval;
        guard++;
        softStep();
      }
    } else {
      state.softTimer = 0;
    }

    if (!soft) {
      state.gravityTimer += dt;
      var g = gravityInterval();
      var steps = 0;
      while (state.gravityTimer >= g && steps < 8) {
        state.gravityTimer -= g;
        steps++;
        if (!moveBy(0, 1, false)) break;
      }
    }

    if (!collides(piece.type, piece.rot, piece.x, piece.y + 1)) {
      state.lockTimer = 0;
    } else {
      state.lockTimer += dt;
      if (state.lockTimer >= LOCK_DELAY) lockPiece();
    }
  }

  function handleMoveKeys(dt) {
    var left = input.isDown("left") || touch.left;
    var right = input.isDown("right") || touch.right;
    var dir = (right ? 1 : 0) - (left ? 1 : 0);

    if (dir === 0) {
      repeat.dir = 0;
      repeat.elapsed = 0;
      repeat.charged = false;
      repeat.arr = 0;
      return;
    }

    if (dir !== repeat.dir) {
      repeat.dir = dir;
      repeat.elapsed = 0;
      repeat.charged = false;
      repeat.arr = 0;
      if (moveBy(dir, 0, true)) audio.play("move");
      return;
    }

    repeat.elapsed += dt;

    if (!repeat.charged) {
      if (repeat.elapsed >= DAS) {
        repeat.charged = true;
        repeat.arr = 0;
        if (moveBy(dir, 0, true)) audio.play("move");
      }
      return;
    }

    repeat.arr += dt;
    var guard = 0;
    while (repeat.arr >= ARR && guard < 8) {
      repeat.arr -= ARR;
      guard++;
      if (!moveBy(dir, 0, true)) break;
      audio.play("move");
    }
  }

  /* ---------------------------------------------------------------------- */
  /* draw                                                                   */
  /* ---------------------------------------------------------------------- */

  function drawBlock(ctx, x, y, size, color, alpha) {
    var inset = Math.max(1, size * 0.06);
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = color;
    Arcade.canvas.roundRect(
      ctx,
      x + inset,
      y + inset,
      size - inset * 2,
      size - inset * 2,
      Math.max(2, size * 0.16)
    );
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.26)";
    ctx.fillRect(
      x + inset * 2,
      y + inset * 2,
      size - inset * 4,
      Math.max(1.5, size * 0.14)
    );
    ctx.globalAlpha = 1;
  }

  function drawGhost(ctx) {
    if (!values().ghost || !piece) return;
    var d = dropDistance();
    if (d === 0) return;
    var cells = cellsFor(piece.type, piece.rot, piece.x, piece.y + d);
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = COLORS[piece.type];
    ctx.lineWidth = 2;
    cells.forEach(function (cell) {
      if (cell.row < 0) return;
      Arcade.canvas.roundRect(
        ctx,
        cell.col * CELL + 3,
        cell.row * CELL + 3,
        CELL - 6,
        CELL - 6,
        4
      );
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  function drawBoard(ctx) {
    Arcade.canvas.clear(ctx, W, H, "#04050b");

    // grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.045)";
    ctx.lineWidth = 1;
    for (var c = 1; c < COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * CELL, 0);
      ctx.lineTo(c * CELL, H);
      ctx.stroke();
    }
    for (var r = 1; r < ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * CELL);
      ctx.lineTo(W, r * CELL);
      ctx.stroke();
    }
  }

  function drawStack(ctx) {
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var type = grid[r][c];
        if (!type) continue;
        drawBlock(ctx, c * CELL, r * CELL, CELL, COLORS[type]);
      }
    }
  }

  function drawPiece(ctx) {
    if (!piece) return;
    var cells = cellsFor(piece.type, piece.rot, piece.x, piece.y);
    cells.forEach(function (cell) {
      if (cell.row < 0) return;
      drawBlock(ctx, cell.col * CELL, cell.row * CELL, CELL, COLORS[piece.type]);
    });
  }

  function drawClearFlash(ctx) {
    if (!state.pendingClear) return;
    var pulse = 0.35 + 0.65 * Math.abs(Math.sin(state.pendingClear.t * 40));
    state.pendingClear.rows.forEach(function (r) {
      ctx.globalAlpha = pulse;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, r * CELL, W, CELL);
      ctx.globalAlpha = 1;
    });
  }

  function render() {
    var ctx = Arcade.canvas.fitVisible(canvas, W, H);
    if (!ctx) return;

    if (state.shake > 0.4 && values().effects) {
      ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }

    drawBoard(ctx);
    drawStack(ctx);
    drawGhost(ctx);
    drawPiece(ctx);
    drawClearFlash(ctx);
  }

  /* ---------------------------------------------------------------------- */
  /* side panels                                                            */
  /* ---------------------------------------------------------------------- */

  var PREVIEW_W = 120;
  var PREVIEW_CELL = 22;

  function paintPreview(canvasEl, types) {
    if (!canvasEl) return;
    var boxH = PREVIEW_CELL * 3.4;
    var logicalH = Math.max(1, types.length) * boxH + 6;
    var dpr = Arcade.canvas.devicePixelRatio();
    var wantW = Math.round(PREVIEW_W * dpr);
    var wantH = Math.round(logicalH * dpr);

    if (canvasEl.width !== wantW || canvasEl.height !== wantH) {
      canvasEl.width = wantW;
      canvasEl.height = wantH;
    }

    var ctx = canvasEl.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, PREVIEW_W, logicalH);

    types.forEach(function (type, index) {
      var shape = shapeOf(type, 0);
      var minC = 99;
      var maxC = -1;
      var minR = 99;
      var maxR = -1;

      for (var r = 0; r < shape.length; r++) {
        for (var c = 0; c < shape[r].length; c++) {
          if (!shape[r][c]) continue;
          if (c < minC) minC = c;
          if (c > maxC) maxC = c;
          if (r < minR) minR = r;
          if (r > maxR) maxR = r;
        }
      }

      if (maxC < 0) return;

      var cols = maxC - minC + 1;
      var rows = maxR - minR + 1;
      var ox = (PREVIEW_W - cols * PREVIEW_CELL) / 2;
      var oy = index * boxH + (boxH - rows * PREVIEW_CELL) / 2;

      for (var rr = minR; rr <= maxR; rr++) {
        for (var cc = minC; cc <= maxC; cc++) {
          if (!shape[rr][cc]) continue;
          drawBlock(
            ctx,
            ox + (cc - minC) * PREVIEW_CELL,
            oy + (rr - minR) * PREVIEW_CELL,
            PREVIEW_CELL,
            COLORS[type]
          );
        }
      }
    });
  }

  function paintSide() {
    var v = values();
    paintPreview(holdCanvas, v.hold && holdType ? [holdType] : []);
    paintPreview(nextCanvas, queue.slice(0, v.next));
  }

  /* ---------------------------------------------------------------------- */
  /* overlays + loop                                                        */
  /* ---------------------------------------------------------------------- */

  var pauseOv = ui.pause(screenEl, {
    title: "Paused",
    subtitle: "Arrows to move, up to rotate, space to slam",
    onResume: function () {
      resumeGame();
    },
    onRestart: function () {
      restart();
    }
  });

  var endOv = ui.endGame(screenEl, {
    gameId: GAME_ID,
    title: "Top Out",
    scoreLabel: "Final score",
    onRestart: function () {
      restart();
    }
  });

  var loop = Arcade.createLoop({
    step: update,
    render: render,
    autoPause: false
  });

  function pauseGame() {
    if (state.phase !== "playing") return;
    state.phase = "paused";
    loop.pause();
    pauseOv.show();
  }

  function resumeGame() {
    if (state.phase !== "paused") return;
    state.phase = "playing";
    pauseOv.hide();
    loop.resume();
  }

  function togglePause() {
    if (state.phase === "playing") pauseGame();
    else if (state.phase === "paused") resumeGame();
  }

  function gameOver() {
    state.phase = "over";
    piece = null;
    audio.play("gameOver");
    storage.bumpPlays(GAME_ID);
    loop.pause();
    endOv.show({
      score: state.score,
      meta: "Level " + state.level + " · " + state.lines + " lines"
    });
  }

  /* ---------------------------------------------------------------------- */
  /* lifecycle                                                              */
  /* ---------------------------------------------------------------------- */

  function restart() {
    var v = values();
    state.phase = "playing";
    state.score = 0;
    state.lines = 0;
    state.startLevel = Number(v.startLevel) || 1;
    state.level = state.startLevel;
    state.gravityTimer = 0;
    state.softTimer = 0;
    state.lockTimer = 0;
    state.lockResets = 0;
    state.pendingClear = null;
    state.shake = 0;

    repeat = { dir: 0, elapsed: 0, charged: false, arr: 0 };
    holdType = null;
    holdUsed = false;
    queue = [];
    refillQueue();

    resetGrid();
    syncHud();
    endOv.hide();
    pauseOv.hide();
    applyPad();
    piece = null;
    spawnNext();
    loop.resume();
  }

  /* ---------------------------------------------------------------------- */
  /* wiring                                                                 */
  /* ---------------------------------------------------------------------- */

  input.bindControls(padEl, {
    left: {
      onDown: function () {
        touch.left = true;
      },
      onUp: function () {
        touch.left = false;
      }
    },
    right: {
      onDown: function () {
        touch.right = true;
      },
      onUp: function () {
        touch.right = false;
      }
    },
    down: {
      onDown: function () {
        touch.down = true;
      },
      onUp: function () {
        touch.down = false;
      }
    },
    rotate: {
      onDown: function () {
        rotate(1);
      }
    },
    hold: {
      onDown: function () {
        hold();
      }
    },
    hardDrop: {
      onDown: function () {
        hardDrop();
      }
    }
  });

  // swipe gestures directly on the play field
  var swipe = { x: 0, y: 0, active: false };

  input.bindSwipe(canvas, {
    onStart: function () {
      swipe.active = true;
      swipe.x = 0;
      swipe.y = 0;
    },
    onMove: function (dx, dy) {
      if (!swipe.active || !canAct()) return;
      while (dx - swipe.x >= CELL) {
        swipe.x += CELL;
        if (moveBy(1, 0, true)) audio.play("move");
      }
      while (swipe.x - dx >= CELL) {
        swipe.x -= CELL;
        if (moveBy(-1, 0, true)) audio.play("move");
      }
      while (dy - swipe.y >= CELL) {
        swipe.y += CELL;
        softStep();
      }
    },
    onEnd: function (dx, dy, duration, tap) {
      swipe.active = false;
      if (tap) rotate(1);
    }
  });

  input.onKey(function (code, event, repeatFlag) {
    if (panel.isOpen()) return;
    if (event && event.repeat) return;
    if (state.phase !== "playing" && state.phase !== "paused") {
      if (code === "KeyR" || code === "Enter") {
        if (event) event.preventDefault();
        restart();
      }
      return;
    }
    if (state.phase === "paused") {
      if (code === "KeyR") {
        if (event) event.preventDefault();
        restart();
      }
      return;
    }

    switch (code) {
      case "ArrowLeft":
      case "KeyA":
        if (event) event.preventDefault();
        pressHorizontal(-1);
        break;
      case "ArrowRight":
      case "KeyD":
        if (event) event.preventDefault();
        pressHorizontal(1);
        break;
      case "ArrowUp":
      case "KeyX":
      case "KeyW":
        if (event) event.preventDefault();
        rotate(1);
        break;
      case "KeyZ":
      case "ControlLeft":
        if (event) event.preventDefault();
        rotate(-1);
        break;
      case "Space":
        if (event) event.preventDefault();
        if (!repeatFlag) hardDrop();
        break;
      case "KeyC":
      case "ShiftLeft":
        if (event) event.preventDefault();
        hold();
        break;
      default:
        break;
    }
  });

  ui.bindPauseKey(function () {
    if (panel.isOpen()) return;
    togglePause();
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden && values().autoPause) pauseGame();
  });

  Arcade.ui.init({ settings: panel });
  restart();
})(window.Arcade);
