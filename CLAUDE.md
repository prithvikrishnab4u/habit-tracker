# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A habit tracker PWA for exactly two people (a "pod"), written in vanilla JS with no build step, no dependencies, and no test suite. Cloudflare Pages auto-deploys `main` to https://habits.pporeddy.com, so every push to `main` goes live. There is no backend. The app reads and writes JSON files in a separate private GitHub repo (`prithvikrishnab4u/habit-tracker-data`) through the GitHub Contents API, using a fine-grained PAT stored in `localStorage` on each phone.

## Running locally

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

Test changes by hand in a browser. The app needs a real token for the data repo to get past onboarding. Don't add build tooling, linters or dependencies unless the user asks for them.

## Deploying and cache busting

`index.html` loads every CSS/JS file with a `?v=<build>` query string and sets `<body data-build="<build>">`, which the Habits & settings screen shows as the build tag. `_headers` sets `Cache-Control: no-cache`. The existing history uses one commit per changed file (`Phase X: ...` or `deploy <file>`), followed by a `deploy index.html (build <hash>)` commit that changes every `?v=` and `data-build` to the short hash of the latest content commit. When you change JS or CSS, update all those build strings together so installed PWAs pick up the new files.

## Architecture

Every file in `js/` is a plain script that defines one global through the IIFE module pattern (`var Today = (function () { ... return {...}; })();`). Code is ES5-style: `var`, `function`, and string-concatenated HTML. Modules call each other through these globals, so **script order in `index.html` is the dependency order**: `util` → `api` → `colors` → `demo` → `store` → `data` → `starters` → `backlog` → `today` → `pod` → `manage` → `onboarding` → `app`. When you add a module, add its `<script>` tag in the correct position.

- **`api.js`**: GitHub Contents API client. `getJSON(path)` returns `{data, sha}`, with `data: null` on a 404. `putJSON(path, obj, msg, mutate)` re-reads the file before every attempt and, when a `mutate(freshData)` callback is given, rebuilds the document from fresh data. It retries on 409/422 up to 3 times and refuses to write a null document. UTF-8 goes through TextEncoder, because `btoa` alone only handles Latin-1.
- **`store.js`**: Device state (person id and token in `localStorage` keys `ht.person`, `ht.token`, `ht.owner`, `ht.repo`) plus `pod.json` and `habits.json`, which `Store.load()` fetches. Person colors are stored in `pod.json` as palette ids, and `colors.js` maps those ids to hex values. `applyColor()` sets the `--person` and `--partner` CSS variables.
- **`data.js`**: The check-in layer. Each person has one file per day at `checkins/YYYY-MM-DD/{person}.json` (`{date, person, entries: {habitId: value}}`). Entries are cached in memory. `saveEntry` updates the UI optimistically and saves one undo step. Writes are **serialized per file through `enqueue`**, so fast repeated taps can't interleave their read-modify-write cycles. A failed write refreshes from the file instead of rolling back. `backlog.js` uses the same queue for `backlog/{person}.json` (`{items, done}`), but writes one op at a time (add, remove, update, done, undone) and replays that op onto the fresh file on every attempt. Since `putJSON` always runs the mutator, a mutator that merges whole lists would bring removed items back.
- **Screens**: `app.js` boots the app, switches tabs and calls each screen's `render()`. There are three tabs: `Today`, `Pod` (the "Together" tab), and `Backlog` (the "Free time" tab). `Manage` is "Habits & settings". It is not a tab: the gear on Today opens it with `App.openSettings()`, which hides the tab bar (`body.on-settings`), and `App.closeSettings()` returns to the previous tab. Each screen renders by rewriting its `#*-root` container's HTML. When the app returns to the foreground, `Data.invalidateAll()` runs and the visible screen re-renders. A 401/403 during boot sends the user back to onboarding. Any other error shows a retry screen.
- **`backlog.js`** (the Free time tab): "I have free time" takes a time (15m/30m/1h/2h+) and one of six fixed categories (`TAGS`). It shows the ideas that fill the time best (biggest that fits, then oldest), plus a pair when no single idea fills it. Ideas can carry `first` (one tiny first move), `steps`, `where` and `need` (things or links, one per line), so starting takes no thinking. Start shows all of it with a step checklist. "Just pick one for me" hands over one idea, rotating categories and preferring ideas with steps. Ready-made ideas live in `starters.js` (`Starters.list`), about 70 of them, each with a first step under a minute, numbered steps, a real place, and links only to pages that stay put. Keep new ones to that standard. Just pick one mixes your own ideas (6 in 10 picks, `OWN_SHARE`) with ready-made ones you don't have yet, and Start on a ready-made idea adds it to the list and starts the clock. Tapping an idea opens a sheet with Start as the big button and a row of icon buttons (`quickHTML`) for Done, Not now or Another, Edit and Remove. The running timer shows a countdown ring. A "This week" card shows a dot for each day with something done, the count and minutes, and the latest done items. Today shows a bridge card (`Backlog.bridgeHTML`, only on the real today) that switches to Free time and runs Just pick one, or shows the running block. The picker choice, last category, Not now list and running timer (with step ticks) live in `localStorage` (`ht.blGap`, `ht.blLastTag`, `ht.blSkip`, `ht.blTimer`, `ht.blLastPick`), so a locked phone keeps the timer right.
- **`today.js`**: The largest module. It contains the Today screen plus the sync rules that `pod.js` uses: `Today.habitMet` and `dayFraction`. A day counts as "in sync" when both people meet every daily habit with `syncEligible`. A habit with `syncRule: "if-logged"` doesn't count for a day when it has no value. A habit with `inverted: true` passes when it has no value. Meals are stored as an array in the `meals` entry of the check-in file.

## Conventions

- **Dates are always phone-local.** Use `localDate()` and `addDays()` from `util.js`. Never use `toISOString()` or UTC.
- Don't commit tokens. Repo coordinates default in code, and the token exists only in `localStorage`.
- Code comments refer to phases from the build brief (such as "v2 Phase C: Backlog"). Also keep user-facing copy in the brief's existing plain style.
- The two member ids, `prithvi` and `sowmya`, are hardcoded in a few places (`colors.js` defaults, onboarding, `demo.js`).
- Known limit: the Together screen reads a 31-day window, so weekly streaks can't grow past about 4 weeks.
- **CSS** is split per screen: `css/base.css` holds the tokens, shell, tab bar, sheets, toast and shared controls. `today.css`, `together.css`, `backlog.css`, `habits.css` and `onboarding.css` each style one screen. The design rules (the "Calm glass" style) are: screens use only base tokens (`--surface`, `--surface-2`, `--separator`, `--sync`, `--r-ctl`/`--r-card`/`--r-sheet`); `backdrop-filter` is used only on the tab bar, sheets, toast and status band; no habit tint colors; no infinite animations; font sizes are limited to 34/28/22/17/15/13/11, and inputs are at least 16px.
- **Stage 2 building blocks** (in `base.css` and `util.js`). Each kind of control has its own look, so people can tell what it does before tapping:
  - `.seg` is a segmented control for choosing one of a few options (time, type, repeats).
  - `.fchip` is a filter chip with an icon, in a scrolling `.fchips` row.
  - Filled buttons are actions.
  - Every habit and category shows its identity as an icon in an `.ic-well`. Draw it with `icon(name)` or `iconWell(name)`, and pick a habit's icon with `habitIconName(habit)` from `util.js`. Add new icons to `ICON_PATHS` as 24px line drawings.
  - A Today tile gets the class `met` when its goal is reached, and its icon fills with `--person`.
  - `.section-label` introduces a group of cards. Free time's "Just pick one" is the only filled card on its screen, on purpose.
