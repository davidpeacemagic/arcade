# Beat The Arcade

Four arcade classics rebuilt as a plain static site: **Tic Tac Toe**, **Invasion**,
**Blocks** and **Rock Paper Scissors**. Neon/CRT styling, working high-score
tables and per-game settings that persist on the device.

No build step, no package manager, no dependencies except a Google Fonts
stylesheet. Every sound effect is generated in the browser with the Web Audio
API, so there are no audio files to ship.

## Run it locally

From this folder:

```sh
python3 -m http.server 8080
```

Then open <http://localhost:8080>. You can also just double-click
`index.html` — the scripts are classic (non-module) files specifically so the
site works from `file://` as well as from a host.

## Deploy

Upload the whole folder to any static host. All asset paths are relative, so it
works at a domain root or in a subfolder such as `example.com/games/arcade/`.
There is no server-side code and no service worker.

The included `.htaccess` is **Apache only**. It serves the pages from
extensionless URLs (`/tictactoe` instead of `/tictactoe.html`, with the `.html`
form 301-ing to it) and needs `AllowOverride FileInfo` or `All` to take effect.
Other hosts ignore the file and simply serve the `.html` URLs; on
`python3 -m http.server` nothing changes at all.

### Caching (read this before wondering why a change did not appear)

The CDN in front of the site sends `Cache-Control: public, max-age=604800` for
static files — seven days — and it **overrides** the `no-cache` header set in
`.htaccess` (verified: `/css/game.css` still answers with `max-age=604800` in
production). With no build step and no hashed filenames, that means:

- **Bump the `?v=` tag on the asset URLs whenever you change a stylesheet or
  script.** The tag is the date of the change, with a `-2`, `-3` … suffix if you
  change something twice in a day (`?v=20261004-2`). Bump every reference so one
  version covers the whole site. This is mandatory, not belt-and-braces: the
  changed URL is the only thing that reliably gets a browser past a copy it
  already holds. A stale stylesheet shows up as a page with new HTML and new
  JavaScript but old styling — the RPS hand panels losing their grid, inline
  SVGs falling back to their default 150px size.
- **HTML is cached for seven days too**, so a returning visitor can keep an old
  page (and therefore old `?v=` references) for up to a week. Purge the CDN
  cache in the hosting panel after a deploy, or shorten the TTL for
  `html`/`css`/`js` there. Failing that, a hard refresh clears it for one
  device.
- The header block stays in `.htaccess` because it is harmless and correct on a
  host that does not override it.

## Files

```
index.html              homepage — hero, ticker and the four game cards
tictactoe.html          game pages: header, HUD, play area, settings host
invasion.html
blocks.html
rps.html
.htaccess               Apache only: extensionless URLs, .html 301s to clean

css/theme.css           design tokens, reset, CRT + glitch effects, keyframes
css/layout.css          page shell, header, hero, cards, footer
css/game.css            in-game chrome, pads, settings panel, overlays

js/core/storage.js      namespaced localStorage with an in-memory fallback
js/core/audio.js        Web Audio SFX bank (no files), muted by default
js/core/canvas.js       device pixel ratio canvas fitting + sprite helpers
js/core/loop.js         fixed 60Hz timestep loop with pause/visibility handling
js/core/input.js        keyboard state, aliases, touch pads, swipe gestures
js/core/ui.js           header wiring, hi-score tables, initials entry, overlays
js/core/settings.js     declarative settings schema → slide-in panel

js/games/tictactoe.js   DOM board, minimax CPU, best-of-N matches
js/games/invasion.js    waves, bunkers, drone, particles
js/games/blocks.js      SRS, seven-bag, hold, ghost, next queue
js/games/rps.js         DOM throws, honest by default, scripted 2–1 after a reset
```

Each page loads `js/core/*` in dependency order, then its own game file.

## Retuning the look

Everything visual comes from custom properties at the top of
`css/theme.css`. Change `--cyan`, `--magenta`, `--lime` and friends there and
the whole site follows. Each game page also sets its own `--accent` on `<body>`.

## Notes

- Settings, high scores and stats live in `localStorage` under the `arcade.v1.`
  prefix. If storage is unavailable the games keep working for the session.
- Sound starts muted; the speaker button in the header toggles it and the
  choice is remembered.
- Touch devices get on-screen pads (and for Blocks, swipe gestures on the play
  field). The control scheme can be forced to keyboard or touch in settings.
- `prefers-reduced-motion` disables the flicker, scanlines, glitch and most
  transitions.
