/* ==========================================================================
   Beat The Arcade — js/games/invaders.js
   Space Invaders: endless accelerating waves, destructible bunkers, a bonus
   saucer and the classic step-and-descend formation.

   Logical play area is 480 x 600 units; the canvas is scaled to fit.
   ========================================================================== */

(function (Arcade) {
  "use strict";

  var W = 480;
  var H = 600;

  var storage = Arcade.storage;
  var audio = Arcade.audio;
  var input = Arcade.input;
  var ui = Arcade.ui;

  var GAME_ID = "invaders";

  /* ---------------------------------------------------------------------- */
  /* sprites                                                                */
  /* ---------------------------------------------------------------------- */

  var SPR = {
    squidA: [
      "..1111..",
      ".111111.",
      "11111111",
      "11.11.11",
      "11111111",
      "..1..1..",
      ".1.11.1.",
      "1.1..1.1"
    ],
    squidB: [
      "..1111..",
      ".111111.",
      "11111111",
      "11.11.11",
      "11111111",
      "..1..1..",
      ".11..11.",
      "11....11"
    ],
    crabA: [
      "..1..1..",
      ".111111.",
      "11.11.11",
      "11111111",
      ".1.11.1.",
      "1.1..1.1",
      "1......1",
      ".1....1."
    ],
    crabB: [
      "..1..1..",
      ".111111.",
      "11.11.11",
      "11111111",
      "1.1..1.1",
      ".1.11.1.",
      ".1....1.",
      "1......1"
    ],
    octoA: [
      "..1111..",
      ".111111.",
      "11111111",
      "11.11.11",
      "11111111",
      "..1111..",
      ".1....1.",
      ".1....1."
    ],
    octoB: [
      "..1111..",
      ".111111.",
      "11111111",
      "11.11.11",
      "11111111",
      "..1111..",
      "1.1..1.1",
      "1.1..1.1"
    ],
    ship: [
      ".....1.....",
      "....111....",
      "....111....",
      ".1111111111",
      "11111111111",
      "11111111111",
      "111.111.111",
      "11.......11"
    ],
    ufo: [
      "...111111...",
      "..11111111..",
      ".1111111111.",
      "111111111111",
      "11.11..11.11",
      ".1..1..1..1.",
      "............"
    ]
  };

  var PX = 3; // one sprite pixel
  var INV_W = 8 * PX; // 24
  var INV_H = 8 * PX; // 24
  var SHIP_W = 11 * PX; // 33
  var SHIP_H = 8 * PX; // 24
  var UFO_W = 12 * PX; // 36
  var UFO_H = 7 * PX; // 21

  var COLORS = {
    bg: "#04050b",
    ship: "#b6ff2b",
    bullet: "#e9edff",
    enemyBullet: "#ff2bd6",
    barrier: "#8b5cff",
    ufo: "#ff3b5c",
    rows: ["#ff2bd6", "#00f0ff", "#00f0ff", "#ffb020", "#ffb020", "#ffb020"]
  };

  /* ---------------------------------------------------------------------- */
  /* tuning                                                                 */
  /* ---------------------------------------------------------------------- */

  var DIFFICULTY = {
    easy: {
      cols: 9,
      rows: 4,
      stepStart: 620,
      stepMin: 250,
      descend: 10,
      fireMin: 1500,
      fireMax: 2600,
      bulletSpeed: 175
    },
    normal: {
      cols: 11,
      rows: 5,
      stepStart: 540,
      stepMin: 165,
      descend: 12,
      fireMin: 950,
      fireMax: 1800,
      bulletSpeed: 225
    },
    hard: {
      cols: 11,
      rows: 6,
      stepStart: 430,
      stepMin: 105,
      descend: 14,
      fireMin: 600,
      fireMax: 1150,
      bulletSpeed: 300
    }
  };

  var PAD = 12;
  var ORIGIN_X = 48;
  var ORIGIN_Y = 72;
  var CELL_W = 36;
  var CELL_H = 38;
  var STEP_PX = 6;
  var SHIP_SPEED = 250;
  var PLAYER_BULLET_SPEED = 470;
  var PLAYER_COOLDOWN = 0.24;
  var BARRIER_Y = H - 152;
  var BARRIER_COLS = 6;
  var BARRIER_ROWS = 4;
  var BARRIER_CELL = 4;

  var BARRIER_SHAPE = [
    [1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1],
    [1, 0, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 1]
  ];

  /* ---------------------------------------------------------------------- */
  /* settings                                                               */
  /* ---------------------------------------------------------------------- */

  var SCHEMA = [
    {
      key: "difficulty",
      label: "Difficulty",
      type: "segmented",
      group: "Difficulty",
      default: "normal",
      hint: "Harder settings add rows and speed the fleet up.",
      options: [
        { value: "easy", label: "Easy" },
        { value: "normal", label: "Normal" },
        { value: "hard", label: "Hard" }
      ]
    },
    {
      key: "lives",
      label: "Lives",
      type: "segmented",
      group: "Difficulty",
      default: 3,
      options: [
        { value: 3, label: "3" },
        { value: 5, label: "5" }
      ]
    },
    {
      key: "startWave",
      label: "Starting Wave",
      type: "segmented",
      group: "Difficulty",
      default: 1,
      options: [
        { value: 1, label: "1" },
        { value: 3, label: "3" },
        { value: 5, label: "5" }
      ]
    },
    {
      key: "controls",
      label: "Control Scheme",
      type: "segmented",
      group: "Controls",
      default: "auto",
      hint: "Auto shows the on-screen pad only on touch devices.",
      options: [
        { value: "auto", label: "Auto" },
        { value: "keyboard", label: "Keyboard" },
        { value: "touch", label: "Touch" }
      ]
    },
    {
      key: "autoFire",
      label: "Auto Fire",
      type: "toggle",
      group: "Controls",
      default: false,
      onLabel: "Firing continuously",
      offLabel: "Fire manually"
    },
    {
      key: "barriers",
      label: "Bunkers",
      type: "toggle",
      group: "Arena",
      default: true,
      onLabel: "Four bunkers",
      offLabel: "No cover"
    },
    {
      key: "ufo",
      label: "Bonus Saucer",
      type: "toggle",
      group: "Arena",
      default: true,
      onLabel: "Flies past",
      offLabel: "Disabled"
    },
    {
      key: "shake",
      label: "Screen Shake",
      type: "toggle",
      group: "Presentation",
      default: true,
      onLabel: "On explosions",
      offLabel: "Off"
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

  var canvas = document.getElementById("invCanvas");
  var scoreEl = document.getElementById("invScore");
  var hiEl = document.getElementById("invHi");
  var waveEl = document.getElementById("invWave");
  var livesEl = document.getElementById("invLives");
  var padEl = document.getElementById("invPad");
  var screenEl = document.querySelector(".bezel__screen");

  var panel = Arcade.settings.mount(document.getElementById("settings"), {
    gameId: GAME_ID,
    title: "Space Invaders",
    schema: SCHEMA,
    onChange: function (key) {
      if (key === "controls") {
        applyPad();
        return;
      }
      if (key === "difficulty" || key === "lives" || key === "startWave") {
        restart();
        return;
      }
      if (key === "barriers") buildBarriers();
    }
  });

  function values() {
    return panel.values();
  }

  /* ---------------------------------------------------------------------- */
  /* state                                                                  */
  /* ---------------------------------------------------------------------- */

  var state = {};
  var fighters = []; // the alien formation
  var barriers = [];
  var playerBullets = [];
  var enemyBullets = [];
  var particles = [];
  var saucer = null;
  var ship = { x: W / 2, y: H - 58, alive: true, invulnerable: 0 };
  var touch = { left: false, right: false, fire: false };

  function totalFighters() {
    return fighters.length || 1;
  }

  function aliveFighters() {
    var n = 0;
    for (var i = 0; i < fighters.length; i++) {
      if (fighters[i].alive) n++;
    }
    return n;
  }

  /* ---------------------------------------------------------------------- */
  /* build                                                                  */
  /* ---------------------------------------------------------------------- */

  function buildWave(keepScore) {
    var cfg = DIFFICULTY[values().difficulty] || DIFFICULTY.normal;
    var wave = keepScore === false ? values().startWave : state.wave;

    // extra rows creep in as the waves go up, capped at 6
    var rows = Math.min(6, cfg.rows + Math.floor((wave - 1) / 2));
    var cols = cfg.cols;

    fighters = [];
    for (var r = 0; r < rows; r++) {
      var type = r === 0 ? "squid" : r < 3 ? "crab" : "octo";
      for (var c = 0; c < cols; c++) {
        fighters.push({ row: r, col: c, type: type, alive: true });
      }
    }

    state.dir = 1;
    state.offsetX = 0;
    state.offsetY = 0;
    state.stepTimer = 0;
    state.frame = 0;
    state.banner = 1.5;
    state.enemyFireTimer = rand(cfg.fireMin, cfg.fireMax) / 1000;
    state.saucerTimer = rand(14, 22);

    buildBarriers();
    updateStepInterval();
  }

  function buildBarriers() {
    barriers = [];
    if (!values().barriers) return;

    var count = 4;
    for (var i = 0; i < count; i++) {
      var cellW = BARRIER_COLS * BARRIER_CELL;
      var x = ((i + 0.5) * W) / count - cellW / 2;
      barriers.push({
        x: x,
        y: BARRIER_Y,
        cols: BARRIER_COLS,
        rows: BARRIER_ROWS,
        cell: BARRIER_CELL,
        cells: BARRIER_SHAPE.map(function (row) {
          return row.slice();
        })
      });
    }
  }

  function restart() {
    var v = values();
    state = {
      score: 0,
      wave: v.startWave,
      lives: Number(v.lives) || 3,
      phase: "playing",
      dir: 1,
      offsetX: 0,
      offsetY: 0,
      stepTimer: 0,
      stepInterval: 0.5,
      frame: 0,
      banner: 1.5,
      enemyFireTimer: 1,
      saucerTimer: 18,
      playerCooldown: 0,
      respawn: 0,
      shake: 0,
      over: false
    };

    playerBullets = [];
    enemyBullets = [];
    particles = [];
    saucer = null;
    ship = { x: W / 2, y: H - 58, alive: true, invulnerable: 1.2 };

    buildWave(false);
    syncHud();
    endOv.hide();
    pauseOv.hide();
    applyPad();
    loop.resume();
  }

  function updateStepInterval() {
    var cfg = DIFFICULTY[values().difficulty] || DIFFICULTY.normal;
    var killed = 1 - aliveFighters() / totalFighters();
    var waveFactor = 1 + (state.wave - 1) * 0.14;
    var base = cfg.stepStart + (cfg.stepMin - cfg.stepStart) * killed;
    state.stepInterval = base / 1000 / waveFactor;
  }

  /* ---------------------------------------------------------------------- */
  /* helpers                                                                */
  /* ---------------------------------------------------------------------- */

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function fighterX(f) {
    return ORIGIN_X + f.col * CELL_W + state.offsetX;
  }

  function fighterY(f) {
    return ORIGIN_Y + f.row * CELL_H + state.offsetY;
  }

  function overlap(a, b) {
    return (
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
    );
  }

  function burst(x, y, color, count, speed) {
    var n = count || 12;
    for (var i = 0; i < n; i++) {
      var angle = Math.random() * Math.PI * 2;
      var v = rand(30, speed || 130);
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        life: rand(0.25, 0.6),
        max: 0.6,
        color: color
      });
    }
    if (particles.length > 160) particles.splice(0, particles.length - 160);
  }

  function doShake(amount) {
    if (!values().shake || ui.reducedMotion()) return;
    state.shake = Math.max(state.shake, amount || 6);
  }

  /** Small instant step, so a quick tap always moves the ship. */
  function nudge(dir) {
    if (state.phase !== "playing" || !ship.alive) return;
    ship.x = Math.max(
      SHIP_W / 2 + 4,
      Math.min(W - SHIP_W / 2 - 4, ship.x + dir * 12)
    );
  }

  function tryFire() {
    if (state.phase !== "playing") return;
    if (!ship.alive || state.banner > 0 || state.respawn > 0) return;
    if (state.playerCooldown > 0 || playerBullets.length >= 1) return;
    playerBullets.push({
      x: ship.x - 1.5,
      y: ship.y - SHIP_H / 2 - 14,
      w: 3,
      h: 14
    });
    state.playerCooldown = PLAYER_COOLDOWN;
    audio.play("laser");
  }

  /* ---------------------------------------------------------------------- */
  /* update                                                                 */
  /* ---------------------------------------------------------------------- */

  function update(dt) {
    if (state.phase !== "playing") return;

    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 26);

    updateParticles(dt);

    if (state.banner > 0) {
      state.banner -= dt;
      return;
    }

    if (state.respawn > 0) {
      state.respawn -= dt;
      if (state.respawn <= 0) {
        ship.alive = true;
        ship.invulnerable = 1.4;
        ship.x = W / 2;
      }
    }

    if (ship.alive && ship.invulnerable > 0) {
      ship.invulnerable = Math.max(0, ship.invulnerable - dt);
    }

    // ---------------------------------------------------------------- ship
    if (ship.alive) {
      var left = input.isDown("left") || touch.left;
      var right = input.isDown("right") || touch.right;
      var dx = (right ? 1 : 0) - (left ? 1 : 0);
      ship.x += dx * SHIP_SPEED * dt;
      ship.x = Math.max(SHIP_W / 2 + 4, Math.min(W - SHIP_W / 2 - 4, ship.x));
    }

    state.playerCooldown = Math.max(0, state.playerCooldown - dt);

    var firing = input.isDown("fire") || touch.fire || values().autoFire;
    if (firing) tryFire();

    // --------------------------------------------------------------- fleet
    state.stepTimer += dt;
    if (state.stepTimer >= state.stepInterval) {
      state.stepTimer = 0;
      stepFleet();
    }

    moveBullets(dt);
    updateSaucer(dt);
    collide();
    enemyFire(dt);
  }

  function stepFleet() {
    var cfg = DIFFICULTY[values().difficulty] || DIFFICULTY.normal;
    var min = Infinity;
    var max = -Infinity;

    fighters.forEach(function (f) {
      if (!f.alive) return;
      var x = ORIGIN_X + f.col * CELL_W;
      if (x < min) min = x;
      if (x + INV_W > max) max = x + INV_W;
    });

    if (min === Infinity) return;

    var nextMin = min + state.offsetX + state.dir * STEP_PX;
    var nextMax = max + state.offsetX + state.dir * STEP_PX;

    if (nextMin < PAD || nextMax > W - PAD) {
      state.dir *= -1;
      state.offsetY += cfg.descend;
    } else {
      state.offsetX += state.dir * STEP_PX;
    }

    state.frame = state.frame ? 0 : 1;
    audio.play("invaderStep");
    updateStepInterval();

    // the fleet crashing into cover chews it up
    if (values().barriers) {
      fighters.forEach(function (f) {
        if (!f.alive) return;
        var box = { x: fighterX(f), y: fighterY(f), w: INV_W, h: INV_H };
        barriers.forEach(function (barrier) {
          chewBarrier(barrier, box, 0.4);
        });
      });
    }

    // reached the bottom?
    var lowest = 0;
    fighters.forEach(function (f) {
      if (!f.alive) return;
      lowest = Math.max(lowest, fighterY(f) + INV_H);
    });
    if (lowest >= ship.y - SHIP_H / 2 - 6) {
      loseLife(true);
    }
  }

  function moveBullets(dt) {
    var cfg = DIFFICULTY[values().difficulty] || DIFFICULTY.normal;

    for (var i = playerBullets.length - 1; i >= 0; i--) {
      var b = playerBullets[i];
      b.y -= PLAYER_BULLET_SPEED * dt;
      if (b.y + b.h < 0) {
        playerBullets.splice(i, 1);
        continue;
      }
      if (values().barriers && hitBarrier(b)) {
        playerBullets.splice(i, 1);
      }
    }

    for (var j = enemyBullets.length - 1; j >= 0; j--) {
      var e = enemyBullets[j];
      e.y += cfg.bulletSpeed * dt;
      if (e.y > H) {
        enemyBullets.splice(j, 1);
        continue;
      }
      if (values().barriers && hitBarrier(e)) {
        enemyBullets.splice(j, 1);
      }
    }
  }

  function updateSaucer(dt) {
    if (!values().ufo) {
      saucer = null;
      return;
    }

    if (!saucer) {
      state.saucerTimer -= dt;
      if (state.saucerTimer <= 0 && aliveFighters() > 2) {
        var fromLeft = Math.random() < 0.5;
        saucer = {
          x: fromLeft ? -UFO_W : W,
          y: 40,
          w: UFO_W,
          h: UFO_H,
          vx: (fromLeft ? 1 : -1) * 95
        };
        state.saucerTimer = rand(16, 26);
        audio.play("ufo");
      }
      return;
    }

    saucer.x += saucer.vx * dt;
    if (saucer.x > W + UFO_W || saucer.x < -UFO_W * 2) saucer = null;
  }

  function enemyFire(dt) {
    var cfg = DIFFICULTY[values().difficulty] || DIFFICULTY.normal;
    if (enemyBullets.length >= 3) return;

    state.enemyFireTimer -= dt;
    if (state.enemyFireTimer > 0) return;

    state.enemyFireTimer = rand(cfg.fireMin, cfg.fireMax) / 1000;

    // pick the lowest live fighter in a random occupied column
    var columns = {};
    fighters.forEach(function (f) {
      if (!f.alive) return;
      if (!columns[f.col] || f.row > columns[f.col].row) columns[f.col] = f;
    });

    var keys = Object.keys(columns);
    if (!keys.length) return;

    var shooter = columns[keys[Math.floor(Math.random() * keys.length)]];
    enemyBullets.push({
      x: fighterX(shooter) + INV_W / 2 - 2,
      y: fighterY(shooter) + INV_H,
      w: 4,
      h: 14
    });
  }

  function collide() {
    var i;
    var j;

    // player bullets vs saucer
    if (saucer) {
      for (i = playerBullets.length - 1; i >= 0; i--) {
        if (overlap(playerBullets[i], saucer)) {
          playerBullets.splice(i, 1);
          var bonus = [50, 100, 150, 300][Math.floor(Math.random() * 4)];
          addScore(bonus);
          burst(saucer.x + saucer.w / 2, saucer.y + saucer.h / 2, COLORS.ufo, 22, 190);
          audio.play("explode");
          doShake(7);
          floatScore(saucer.x + saucer.w / 2, saucer.y, bonus);
          saucer = null;
          break;
        }
      }
    }

    // player bullets vs formation
    for (i = playerBullets.length - 1; i >= 0; i--) {
      var bullet = playerBullets[i];
      var hit = null;

      for (j = 0; j < fighters.length; j++) {
        var f = fighters[j];
        if (!f.alive) continue;
        var box = { x: fighterX(f), y: fighterY(f), w: INV_W, h: INV_H };
        if (overlap(bullet, box)) {
          hit = { f: f, box: box };
          break;
        }
      }

      if (!hit) continue;

      playerBullets.splice(i, 1);
      hit.f.alive = false;

      var points = hit.f.row === 0 ? 30 : hit.f.row < 3 ? 20 : 10;
      addScore(points);
      burst(
        hit.box.x + INV_W / 2,
        hit.box.y + INV_H / 2,
        COLORS.rows[Math.min(hit.f.row, COLORS.rows.length - 1)],
        14,
        150
      );
      audio.play("hit");
      updateStepInterval();

      if (aliveFighters() === 0) {
        nextWave();
        return;
      }
    }

    // enemy bullets vs ship
    if (ship.alive && ship.invulnerable <= 0) {
      var shipBox = { x: ship.x - SHIP_W / 2, y: ship.y - SHIP_H / 2, w: SHIP_W, h: SHIP_H };
      for (j = enemyBullets.length - 1; j >= 0; j--) {
        if (overlap(enemyBullets[j], shipBox)) {
          enemyBullets.splice(j, 1);
          loseLife(false);
          break;
        }
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  /* barriers                                                               */
  /* ---------------------------------------------------------------------- */

  function barrierCellAt(barrier, x, y) {
    var cx = Math.floor((x - barrier.x) / barrier.cell);
    var cy = Math.floor((y - barrier.y) / barrier.cell);
    if (cx < 0 || cy < 0 || cx >= barrier.cols || cy >= barrier.rows) return null;
    if (!barrier.cells[cy][cx]) return null;
    return { cx: cx, cy: cy };
  }

  function clearCell(barrier, cx, cy) {
    if (cx < 0 || cy < 0 || cx >= barrier.cols || cy >= barrier.rows) return;
    barrier.cells[cy][cx] = 0;
  }

  /** Remove a small patch of cover around a point. */
  function chewBarrier(barrier, box, chance) {
    for (var x = box.x; x < box.x + box.w; x += barrier.cell) {
      for (var y = box.y; y < box.y + box.h; y += barrier.cell) {
        var cell = barrierCellAt(barrier, x, y);
        if (!cell) continue;
        if (Math.random() > chance) continue;
        clearCell(barrier, cell.cx, cell.cy);
        clearCell(barrier, cell.cx + 1, cell.cy);
        clearCell(barrier, cell.cx - 1, cell.cy);
        clearCell(barrier, cell.cx, cell.cy + 1);
      }
    }
  }

  /** True when the bullet hit cover; also damages it. */
  function hitBarrier(bullet) {
    for (var i = 0; i < barriers.length; i++) {
      var barrier = barriers[i];
      var bh = barrier.rows * barrier.cell;
      var bw = barrier.cols * barrier.cell;
      if (
        bullet.x + bullet.w < barrier.x ||
        bullet.x > barrier.x + bw ||
        bullet.y + bullet.h < barrier.y ||
        bullet.y > barrier.y + bh
      ) {
        continue;
      }

      // only count a hit if it lands on a still-solid cell
      var probes = [
        { x: bullet.x, y: bullet.y },
        { x: bullet.x + bullet.w, y: bullet.y },
        { x: bullet.x, y: bullet.y + bullet.h },
        { x: bullet.x + bullet.w, y: bullet.y + bullet.h }
      ];

      for (var p = 0; p < probes.length; p++) {
        var cell = barrierCellAt(barrier, probes[p].x, probes[p].y);
        if (!cell) continue;
        clearCell(barrier, cell.cx, cell.cy);
        clearCell(barrier, cell.cx + 1, cell.cy);
        clearCell(barrier, cell.cx - 1, cell.cy);
        burst(
          barrier.x + cell.cx * barrier.cell,
          barrier.y + cell.cy * barrier.cell,
          COLORS.barrier,
          5,
          70
        );
        return true;
      }
    }
    return false;
  }

  /* ---------------------------------------------------------------------- */
  /* scoring / lives / waves                                                */
  /* ---------------------------------------------------------------------- */

  var floats = [];

  function floatScore(x, y, points) {
    floats.push({ x: x, y: y, points: points, life: 1 });
  }

  function addScore(points) {
    state.score += points;
    scoreEl.textContent = ui.formatNumber(state.score);
    refreshHi();
  }

  /** Keep the Hi-Score readout live once the run passes the stored best. */
  function refreshHi() {
    hiEl.textContent = ui.formatNumber(Math.max(storage.getBest(GAME_ID), state.score));
  }

  function syncHud() {
    scoreEl.textContent = ui.formatNumber(state.score);
    refreshHi();
    waveEl.textContent = String(state.wave);
    livesEl.textContent = "";
    for (var i = 0; i < state.lives; i++) {
      livesEl.appendChild(ui.el("i"));
    }
  }

  function loseLife(fleetReached) {
    if (!ship.alive && !fleetReached) return;

    ship.alive = false;
    state.lives--;
    burst(ship.x, ship.y, COLORS.ship, 24, 190);
    audio.play("explode");
    doShake(9);
    syncHud();

    if (state.lives <= 0) {
      gameOver();
      return;
    }

    if (fleetReached) {
      // the fleet made it down — push them back up rather than ending the run
      state.offsetY = 0;
      state.offsetX = 0;
      state.dir = 1;
      state.banner = 1;
    }

    state.respawn = 1.3;
  }

  function nextWave() {
    state.wave++;
    addScore(100 + state.wave * 25);
    syncHud();
    audio.play("wave");
    ui.toast("Wave " + state.wave);
    buildWave(true);
    enemyBullets = [];
    playerBullets = [];
  }

  function gameOver() {
    state.phase = "over";
    state.over = true;
    ship.alive = false;
    audio.play("gameOver");
    syncHud();
    hiEl.textContent = ui.formatNumber(Math.max(storage.getBest(GAME_ID), state.score));
    storage.bumpPlays(GAME_ID);
    loop.pause();
    endOv.show({
      score: state.score,
      meta: "Wave " + state.wave
    });
  }

  /* ---------------------------------------------------------------------- */
  /* particles                                                              */
  /* ---------------------------------------------------------------------- */

  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 120 * dt;
    }

    for (var j = floats.length - 1; j >= 0; j--) {
      floats[j].life -= dt * 0.9;
      floats[j].y -= dt * 26;
      if (floats[j].life <= 0) floats.splice(j, 1);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* draw                                                                   */
  /* ---------------------------------------------------------------------- */

  function draw() {
    var ctx = Arcade.canvas.fitVisible(canvas, W, H);
    if (!ctx) return;

    if (state.shake > 0.4) {
      ctx.translate(
        (Math.random() - 0.5) * state.shake,
        (Math.random() - 0.5) * state.shake
      );
    }

    Arcade.canvas.clear(ctx, W, H, COLORS.bg);
    drawStars(ctx);
    drawBarriers(ctx);
    drawFighters(ctx);
    drawSaucer(ctx);
    drawShip(ctx);
    drawBullets(ctx);
    drawParticles(ctx);
    drawFloats(ctx);
    drawBanner(ctx);
  }

  // static star field, generated once
  var stars = (function () {
    var out = [];
    for (var i = 0; i < 60; i++) {
      out.push({
        x: Math.random() * W,
        y: Math.random() * H * 0.9,
        a: Math.random() * 0.5 + 0.15
      });
    }
    return out;
  })();

  function drawStars(ctx) {
    ctx.fillStyle = "#e9edff";
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      ctx.globalAlpha = s.a;
      ctx.fillRect(s.x, s.y, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;
  }

  function drawFighters(ctx) {
    var frames = state.frame;
    fighters.forEach(function (f) {
      if (!f.alive) return;
      var base = f.type;
      var sprite =
        base === "squid"
          ? frames
            ? SPR.squidB
            : SPR.squidA
          : base === "crab"
          ? frames
            ? SPR.crabB
            : SPR.crabA
          : frames
          ? SPR.octoB
          : SPR.octoA;

      var color = COLORS.rows[Math.min(f.row, COLORS.rows.length - 1)];
      Arcade.canvas.sprite(ctx, sprite, fighterX(f), fighterY(f), PX, color);
    });
  }

  function drawSaucer(ctx) {
    if (!saucer) return;
    Arcade.canvas.sprite(ctx, SPR.ufo, saucer.x, saucer.y, PX, COLORS.ufo);
  }

  function drawShip(ctx) {
    if (!ship.alive) return;
    if (ship.invulnerable > 0 && Math.floor(ship.invulnerable * 12) % 2 === 0) return;
    Arcade.canvas.sprite(ctx, SPR.ship, ship.x - SHIP_W / 2, ship.y - SHIP_H / 2, PX, COLORS.ship);
  }

  function drawBullets(ctx) {
    playerBullets.forEach(function (b) {
      Arcade.canvas.rect(ctx, b.x, b.y, b.w, b.h, COLORS.bullet);
    });
    enemyBullets.forEach(function (b) {
      Arcade.canvas.rect(ctx, b.x, b.y, b.w, b.h, COLORS.enemyBullet);
      Arcade.canvas.rect(ctx, b.x - 1, b.y + 4, b.w + 2, 5, "rgba(255,43,214,0.35)");
    });
  }

  function drawBarriers(ctx) {
    barriers.forEach(function (barrier) {
      for (var r = 0; r < barrier.rows; r++) {
        for (var c = 0; c < barrier.cols; c++) {
          if (!barrier.cells[r][c]) continue;
          Arcade.canvas.rect(
            ctx,
            barrier.x + c * barrier.cell,
            barrier.y + r * barrier.cell,
            barrier.cell,
            barrier.cell,
            COLORS.barrier
          );
        }
      }
    });
  }

  function drawParticles(ctx) {
    particles.forEach(function (p) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 3, 3);
    });
    ctx.globalAlpha = 1;
  }

  function drawFloats(ctx) {
    ctx.font = "16px 'Share Tech Mono', monospace";
    ctx.fillStyle = COLORS.ufo;
    ctx.textAlign = "center";
    floats.forEach(function (f) {
      ctx.globalAlpha = Math.max(0, f.life);
      ctx.fillText(String(f.points), f.x, f.y);
    });
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
  }

  function drawBanner(ctx) {
    var text = null;
    if (state.banner > 0) {
      text = "WAVE " + state.wave;
    } else if (state.respawn > 0 && state.lives > 0) {
      text = "GET READY";
    }
    if (!text) return;

    ctx.font = "bold 28px Orbitron, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, H / 2 - 34, W, 58);
    ctx.fillStyle = "#e9edff";
    ctx.fillText(text, W / 2, H / 2 + 4);
    ctx.textAlign = "left";
  }

  /* ---------------------------------------------------------------------- */
  /* overlays + loop                                                        */
  /* ---------------------------------------------------------------------- */

  var pauseOv = ui.pause(screenEl, {
    title: "Paused",
    subtitle: "Arrow keys or the pad to move, space to fire",
    onResume: function () {
      resumeGame();
    },
    onRestart: function () {
      restart();
    }
  });

  var endOv = ui.endGame(screenEl, {
    gameId: GAME_ID,
    title: "Invaded",
    scoreLabel: "Final score",
    onRestart: function () {
      restart();
    }
  });

  var loop = Arcade.createLoop({
    step: update,
    render: draw,
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

  /* ---------------------------------------------------------------------- */
  /* wiring                                                                 */
  /* ---------------------------------------------------------------------- */

  function applyPad() {
    input.applyPadVisibility(padEl, { mode: values().controls });
  }

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
    fire: {
      onDown: function () {
        touch.fire = true;
      },
      onUp: function () {
        touch.fire = false;
      }
    }
  });

  ui.bindPauseKey(function () {
    if (panel.isOpen()) return;
    togglePause();
  });

  input.onKey(function (code, event, repeat) {
    if (repeat || panel.isOpen()) return;

    if (state.phase === "playing") {
      if (code === "ArrowLeft" || code === "KeyA") nudge(-1);
      else if (code === "ArrowRight" || code === "KeyD") nudge(1);
      else if (code === "Space") tryFire();
      return;
    }

    if (code === "KeyR" || code === "Enter") {
      if (event) event.preventDefault();
      restart();
    }
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden && values().autoPause) pauseGame();
  });

  Arcade.ui.init({ settings: panel });
  restart();
})(window.Arcade);
