/* v2 Phase C: Backlog. v2 Phase D: Free time picker, Start and Done.
   - One personal file per person: backlog/{person}.json
     { items: [ { id, what, size, tag, added, kept? } ],
       done:  [ { id, what, size, tag, added, doneOn } ] }
     size in minutes: 15 | 30 | 60 | 120. tag is one of TAGS or null.
     done is newest first and keeps the last DONE_KEEP entries.
   - Writes go through one op at a time (add, remove, update, done,
     undone). On every attempt the op is replayed onto the fresh file, so
     a remove really removes and a second device's changes survive.
   - "I have free time": pick a time and a category, get the ideas that
     fill the time best. Shuffle, Not now (hidden until tomorrow), and a
     pair of ideas when no single one fills the time.
   - Tap an idea: Start (countdown kept in localStorage), Done, Edit,
     Remove. Ideas older than STALE_DAYS ask "Still want this?". */

var Backlog = (function () {
  var SIZES = [15, 30, 60, 120];
  var DEFAULT_SIZE = 30;
  var CAP = 20;
  var DONE_KEEP = 50;
  var STALE_DAYS = 30;
  var TAGS = ["Work", "Home", "Learn", "Body", "Family", "Admin"];

  var LS_GAP = "ht.blGap";       // { gap, tag } last picker choice
  var LS_TAG = "ht.blLastTag";   // last category used when adding
  var LS_SKIP = "ht.blSkip";     // { date, ids } Not now, for today only
  var LS_TIMER = "ht.blTimer";   // { id, what, size, start } running block

  var cache = null;      // { items, done } for the current person
  var cachePerson = null;
  var undoStack = [];
  var queues = {};
  var pending = 0;

  function path(personId) { return "backlog/" + personId + ".json"; }

  function enqueue(filePath, fn) {
    var tail = queues[filePath] || Promise.resolve();
    var run = tail.then(fn, fn);
    queues[filePath] = run.catch(function () {});
    return run;
  }

  function sizeLabel(min) {
    if (min === 60) return "1h";
    if (min === 120) return "2h+";
    return min + "m";
  }

  // Any total in minutes, for the "Or do two" line: 45m, 1h, 1h 30m.
  function durLabel(min) {
    var h = Math.floor(min / 60), m = min % 60;
    if (!h) return m + "m";
    return h + "h" + (m ? " " + m + "m" : "");
  }

  function lsGet(k) {
    try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {}
  }

  function daysBetween(a, b) {
    var pa = a.split("-").map(Number), pb = b.split("-").map(Number);
    var da = new Date(pa[0], pa[1] - 1, pa[2]), db = new Date(pb[0], pb[1] - 1, pb[2]);
    return Math.round((db - da) / 86400000);
  }

  function mondayOf(dateStr) {
    var p = dateStr.split("-").map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    return addDays(dateStr, -((d.getDay() + 6) % 7));
  }

  /* ----- data ----- */

  function normalize(doc) {
    return {
      items: (doc && doc.items ? doc.items : []).map(clone),
      done: (doc && doc.done ? doc.done : []).map(clone)
    };
  }

  function clone(o) {
    var out = {};
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) out[k] = o[k];
    return out;
  }

  function indexOf(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return i;
    return -1;
  }

  // Pure: returns a new doc with op applied. Safe to replay on a fresh file.
  function applyOp(doc, op) {
    var d = normalize(doc);
    var i;
    if (op.type === "add") {
      if (indexOf(d.items, op.item.id) < 0) {
        var at = op.idx === undefined ? d.items.length : Math.min(op.idx, d.items.length);
        d.items.splice(at, 0, clone(op.item));
      }
    } else if (op.type === "remove") {
      i = indexOf(d.items, op.id);
      if (i >= 0) d.items.splice(i, 1);
    } else if (op.type === "update") {
      i = indexOf(d.items, op.id);
      if (i >= 0) for (var k in op.fields) d.items[i][k] = op.fields[k];
    } else if (op.type === "done") {
      i = indexOf(d.items, op.id);
      if (i >= 0) {
        var it = d.items.splice(i, 1)[0];
        it.doneOn = op.doneOn;
        d.done.unshift(it);
        d.done = d.done.slice(0, DONE_KEEP);
      }
    } else if (op.type === "undone") {
      i = indexOf(d.done, op.item.id);
      if (i >= 0) d.done.splice(i, 1);
      if (indexOf(d.items, op.item.id) < 0) {
        var back = clone(op.item);
        delete back.doneOn;
        d.items.splice(Math.min(op.idx, d.items.length), 0, back);
      }
    }
    return d;
  }

  function load() {
    var me = Store.get("person");
    if (!me) return Promise.resolve([]);
    if (cache && cachePerson === me) return Promise.resolve(cache.items);
    return Api.getJSON(path(me)).then(function (res) {
      cache = normalize(res.data);
      cachePerson = me;
      return cache.items;
    });
  }

  // Foreground refresh: drop the cache so another device's changes show.
  // Skipped while a write is in flight so the optimistic state survives.
  function invalidate() {
    if (!pending) cache = null;
  }

  function items() {
    return cache ? cache.items.slice() : [];
  }

  function doneList() {
    return cache ? cache.done.slice() : [];
  }

  function count() {
    return cache ? cache.items.length : 0;
  }

  function find(id) {
    var list = items();
    var i = indexOf(list, id);
    return i >= 0 ? list[i] : null;
  }

  // Apply locally now, then write. Each attempt replays the op onto the
  // fresh file. A failed write reloads from the file instead of rolling back.
  function commit(op, message) {
    var me = Store.get("person");
    cache = applyOp(cache, op);
    cachePerson = me;
    pending++;
    return enqueue(path(me), function () {
      return Api.putJSON(path(me), cache, message || "Backlog update",
        function (fresh) { return applyOp(fresh, op); });
    }).then(function (r) {
      pending--;
      return r;
    }, function (err) {
      pending--;
      cache = null;
      showToast("Couldn't save. Check your connection.");
      render();
      throw err;
    });
  }

  function pushUndo(op) {
    undoStack.push(op);
    if (undoStack.length > 20) undoStack.shift();
  }

  function nextId() {
    return "b" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  }

  function addItem(what, size, tag) {
    if (count() >= CAP) return Promise.reject(new Error("full"));
    var item = {
      id: nextId(),
      what: what,
      size: SIZES.indexOf(size) >= 0 ? size : DEFAULT_SIZE,
      tag: TAGS.indexOf(tag) >= 0 ? tag : null,
      added: localDate()
    };
    pushUndo({ type: "remove", id: item.id });
    return commit({ type: "add", item: item }, "Backlog add").then(function () { return item; });
  }

  function removeItem(id) {
    var list = items();
    var idx = indexOf(list, id);
    if (idx < 0) return Promise.resolve(false);
    pushUndo({ type: "add", item: list[idx], idx: idx });
    return commit({ type: "remove", id: id }, "Backlog remove").then(function () { return true; });
  }

  function updateItem(id, fields) {
    var it = find(id);
    if (!it) return Promise.resolve(false);
    var prev = {};
    for (var k in fields) prev[k] = it[k] === undefined ? null : it[k];
    pushUndo({ type: "update", id: id, fields: prev });
    return commit({ type: "update", id: id, fields: fields }, "Backlog edit").then(function () { return true; });
  }

  function markDone(id) {
    var list = items();
    var idx = indexOf(list, id);
    if (idx < 0) return Promise.resolve(false);
    pushUndo({ type: "undone", item: list[idx], idx: idx });
    var t = lsGet(LS_TIMER);
    if (t && t.id === id) lsSet(LS_TIMER, null);
    return commit({ type: "done", id: id, doneOn: localDate() }, "Backlog done").then(function () { return true; });
  }

  function undoLast() {
    var op = undoStack.pop();
    if (!op) return Promise.resolve(false);
    var p = commit(op, "Backlog undo");
    render();
    return p.then(function () { return true; });
  }

  function doneThisWeek() {
    var monday = mondayOf(localDate());
    return doneList().filter(function (d) { return d.doneOn >= monday; }).length;
  }

  function isStale(it) {
    return daysBetween(it.kept || it.added, localDate()) >= STALE_DAYS;
  }

  /* ----- toast with Undo ----- */

  var toastTimer = null;
  function toastUndo(msg) {
    var el = document.getElementById("toast");
    el.innerHTML = "";
    el.appendChild(document.createTextNode(msg));
    var b = document.createElement("button");
    b.className = "toast-action";
    b.textContent = "Undo";
    b.addEventListener("click", function () {
      el.classList.add("hidden");
      clearTimeout(toastTimer);
      undoLast().catch(function () {});
    });
    el.appendChild(b);
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    clearTimeout(showToast._t);
    toastTimer = setTimeout(function () { el.classList.add("hidden"); }, 6000);
  }

  /* ----- bottom sheet (same pattern as Today) ----- */

  function openSheet(title, sub, bodyHTML) {
    var scrim = document.createElement("div");
    scrim.className = "scrim";
    var sheet = document.createElement("div");
    sheet.className = "sheet glass";
    sheet.setAttribute("role", "dialog");
    sheet.innerHTML = '<span class="grab" aria-hidden="true"></span>' +
      '<div class="sheet-headrow"><span class="sheet-title">' + esc(title) + "</span>" +
      '<button class="sheet-x" aria-label="Close"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>' +
      (sub ? '<p class="sheet-sub">' + esc(sub) + "</p>" : "") + bodyHTML;
    document.body.appendChild(scrim);
    document.body.appendChild(sheet);
    blockScrimScroll(scrim);
    lockScroll();
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        scrim.classList.add("show");
        sheet.classList.add("show");
      });
    });
    var closed = false;
    function close() {
      // Scrim, X and Save can all race to close; unlock exactly once.
      if (closed) return;
      closed = true;
      unlockScroll();
      scrim.classList.remove("show");
      sheet.classList.remove("show");
      setTimeout(function () { scrim.remove(); sheet.remove(); }, 240);
    }
    scrim.addEventListener("click", close);
    sheet.querySelector(".sheet-x").addEventListener("click", close);
    return { el: sheet, close: close };
  }

  /* ----- add / edit sheet ----- */

  // opts: { item } to edit, or { size, tag } to prefill a new idea.
  function openEditSheet(opts) {
    opts = opts || {};
    var editing = opts.item || null;
    if (!editing && count() >= CAP) { openFullSheet(opts); return; }

    var size = editing ? editing.size : (opts.size || DEFAULT_SIZE);
    if (SIZES.indexOf(size) < 0) size = DEFAULT_SIZE;
    var tag = editing ? (editing.tag || null) :
      (opts.tag !== undefined ? opts.tag : lsGet(LS_TAG));
    if (TAGS.indexOf(tag) < 0) tag = null;

    var sizeBtns = SIZES.map(function (s) {
      return '<button class="bl-size' + (s === size ? " on" : "") + '" data-size="' + s + '">' +
        sizeLabel(s) + "</button>";
    }).join("");
    var tagBtns = TAGS.map(function (t) {
      return '<button class="bl-cat' + (t === tag ? " on" : "") + '" data-tag="' + t + '">' + t + "</button>";
    }).join("");

    var sheet = openSheet(editing ? "Edit idea" : "Add an idea",
      editing ? "" : "What it is, how long it takes, and what kind.",
      '<div class="bl-add">' +
      '<input id="bl-what" class="bl-input" type="text" maxlength="80" placeholder="What would you do with a free hour?" autocomplete="off">' +
      '<div class="bl-label">How long</div>' +
      '<div class="bl-sizes">' + sizeBtns + "</div>" +
      '<div class="bl-label">Category</div>' +
      '<div class="bl-cats">' + tagBtns + "</div>" +
      '<button class="btn bl-save" id="bl-save">' + (editing ? "Save" : "Add") + "</button>" +
      "</div>");

    var input = sheet.el.querySelector("#bl-what");
    if (editing) input.value = editing.what;

    sheet.el.querySelectorAll(".bl-size").forEach(function (b) {
      b.addEventListener("click", function () {
        sheet.el.querySelectorAll(".bl-size").forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        size = Number(b.dataset.size);
      });
    });
    // Tap the chosen category again to clear it.
    sheet.el.querySelectorAll(".bl-cat").forEach(function (b) {
      b.addEventListener("click", function () {
        var t = b.dataset.tag;
        tag = tag === t ? null : t;
        sheet.el.querySelectorAll(".bl-cat").forEach(function (x) {
          x.classList.toggle("on", x.dataset.tag === tag);
        });
      });
    });

    function save() {
      var what = input.value.trim();
      if (!what) { input.focus(); return; }
      if (tag) lsSet(LS_TAG, tag);
      sheet.close();
      if (editing) {
        var fields = {};
        if (what !== editing.what) fields.what = what;
        if (size !== editing.size) fields.size = size;
        if (tag !== (editing.tag || null)) fields.tag = tag;
        if (!Object.keys(fields).length) return;
        var p = updateItem(editing.id, fields);
        render();
        p.then(function (ok) { if (ok) toastUndo("Saved."); }, function () {});
      } else {
        var p2 = addItem(what, size, tag);
        render();
        p2.then(function () { toastUndo("Added."); }, function () {});
      }
    }
    sheet.el.querySelector("#bl-save").addEventListener("click", save);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") save(); });
    if (!editing) setTimeout(function () { input.focus(); }, 350);
  }

  // Cap of 20: when full, adding asks you to drop one first.
  function openFullSheet(opts) {
    var rows = items().map(function (it) {
      return '<div class="bl-fullrow"><span class="bl-fullwhat">' + esc(it.what) + "</span>" +
        '<button class="bl-drop" data-id="' + esc(it.id) + '">Drop</button></div>';
    }).join("");
    var sheet = openSheet("Your list is full",
      CAP + " of " + CAP + ". Drop one to make room, then add yours.",
      '<div class="bl-full">' + rows + "</div>");
    sheet.el.querySelectorAll(".bl-drop").forEach(function (b) {
      b.addEventListener("click", function () {
        sheet.close();
        removeItem(b.dataset.id).catch(function () {});
        render();
        openEditSheet(opts);
      });
    });
  }

  /* ----- idea sheet: Start, Done, Edit, Remove ----- */

  function ageLabel(it) {
    var n = daysBetween(it.added, localDate());
    if (n <= 0) return "added today";
    if (n === 1) return "added yesterday";
    return "added " + n + " days ago";
  }

  // fromPicker: offer Not now.
  function openIdeaSheet(id, fromPicker) {
    var it = find(id);
    if (!it) return;
    var sub = sizeLabel(it.size) + (it.tag ? " · " + it.tag : "") + " · " + ageLabel(it);
    var stale = isStale(it);
    var timer = lsGet(LS_TIMER);
    var running = timer && timer.id === id;
    var sheet = openSheet(it.what, sub,
      (stale ? '<p class="bl-stalenote">Still want this? It has been here a while.</p>' : "") +
      '<div class="bl-actions">' +
      (running ? "" : '<button class="btn" data-act="start">Start ' + sizeLabel(it.size) + "</button>") +
      '<button class="bl-act" data-act="done">Done</button>' +
      (stale ? '<button class="bl-act" data-act="keep">Keep it</button>' : "") +
      (fromPicker ? '<button class="bl-act" data-act="skip">Not now</button>' : "") +
      '<button class="bl-act" data-act="edit">Edit</button>' +
      '<button class="bl-act bl-act-del" data-act="remove">Remove</button>' +
      "</div>");
    sheet.el.querySelectorAll("[data-act]").forEach(function (b) {
      b.addEventListener("click", function () {
        var act = b.dataset.act;
        sheet.close();
        if (act === "start") startTimer(it);
        else if (act === "done") doDone(id);
        else if (act === "keep") {
          updateItem(id, { kept: localDate() }).catch(function () {});
          render();
          showToast("Kept.");
        } else if (act === "skip") {
          skipToday(id);
          render();
          showToast("Hidden until tomorrow.");
        } else if (act === "edit") openEditSheet({ item: it });
        else if (act === "remove") {
          var t = lsGet(LS_TIMER);
          if (t && t.id === id) lsSet(LS_TIMER, null);
          removeItem(id).catch(function () {});
          render();
          toastUndo("Removed.");
        }
      });
    });
  }

  function doDone(id) {
    markDone(id).catch(function () {});
    render();
    var n = doneThisWeek();
    toastUndo("Nice. " + n + " done this week.");
  }

  /* ----- Not now: hidden from suggestions for the rest of today ----- */

  function skipped() {
    var s = lsGet(LS_SKIP);
    if (!s || s.date !== localDate()) return [];
    return s.ids || [];
  }

  function skipToday(id) {
    var ids = skipped();
    if (ids.indexOf(id) < 0) ids.push(id);
    lsSet(LS_SKIP, { date: localDate(), ids: ids });
  }

  /* ----- timer: start time lives in localStorage, so a locked phone or a
     closed app still shows the right time on return ----- */

  var tickTimer = null;

  function startTimer(it) {
    lsSet(LS_TIMER, { id: it.id, what: it.what, size: it.size, start: Date.now() });
    render();
    window.scrollTo(0, 0);
  }

  function stopTimer() {
    lsSet(LS_TIMER, null);
    clearInterval(tickTimer);
    tickTimer = null;
  }

  function remainingMs(t) {
    return t.start + t.size * 60000 - Date.now();
  }

  function clockText(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    var mm = h ? String(m).padStart(2, "0") : String(m);
    return (h ? h + ":" : "") + mm + ":" + String(sec).padStart(2, "0");
  }

  function timerCardHTML() {
    var t = lsGet(LS_TIMER);
    if (!t) return "";
    // The idea was removed or done on another device.
    if (cache && indexOf(cache.items, t.id) < 0) { stopTimer(); return ""; }
    var cur = find(t.id);
    if (cur) t.what = cur.what;
    var left = remainingMs(t);
    if (left <= 0) {
      return '<section class="bl-timer glass" aria-label="Time block">' +
        '<div class="bl-timerlabel">Time\'s up</div>' +
        '<div class="bl-timerwhat">' + esc(t.what) + "</div>" +
        '<p class="bl-timerq">Did you get to it?</p>' +
        '<div class="bl-timerbtns">' +
        '<button class="btn" id="bl-t-done">Done</button>' +
        '<button class="bl-act" id="bl-t-stop">Not yet</button></div>' +
        "</section>";
    }
    return '<section class="bl-timer glass" aria-label="Time block">' +
      '<div class="bl-timerlabel">Now</div>' +
      '<div class="bl-timerwhat">' + esc(t.what) + "</div>" +
      '<div class="bl-clock" id="bl-clock">' + clockText(left) + "</div>" +
      '<div class="bl-timerbtns">' +
      '<button class="btn" id="bl-t-done">Done</button>' +
      '<button class="bl-act" id="bl-t-stop">Stop</button></div>' +
      "</section>";
  }

  function bindTimer() {
    clearInterval(tickTimer);
    tickTimer = null;
    var t = lsGet(LS_TIMER);
    if (!t) return;
    var done = document.getElementById("bl-t-done");
    var stop = document.getElementById("bl-t-stop");
    if (done) done.addEventListener("click", function () { stopTimer(); doDone(t.id); });
    if (stop) stop.addEventListener("click", function () { stopTimer(); render(); });
    if (remainingMs(t) <= 0) return;
    // One text update a second while the countdown is on screen.
    tickTimer = setInterval(function () {
      var clock = document.getElementById("bl-clock");
      var now = lsGet(LS_TIMER);
      if (!clock || !now) { clearInterval(tickTimer); tickTimer = null; return; }
      var left = remainingMs(now);
      if (left <= 0) { render(); return; }
      clock.textContent = clockText(left);
    }, 1000);
  }

  /* ----- "I have free time" picker ----- */

  var gapState = (function () {
    var s = lsGet(LS_GAP) || {};
    return {
      gap: SIZES.indexOf(s.gap) >= 0 ? s.gap : 0,
      tag: TAGS.indexOf(s.tag) >= 0 ? s.tag : "Any",
      shuffled: null
    };
  })();

  function saveGap() {
    lsSet(LS_GAP, { gap: gapState.gap, tag: gapState.tag });
  }

  function inCategory(it, tag) {
    return tag === "Any" || it.tag === tag;
  }

  // Ideas that fit, best fill first (biggest that fits), then oldest first.
  function matches(gapMin, tag, withSkipped) {
    var skip = withSkipped ? [] : skipped();
    var list = items().filter(function (it) {
      return it.size <= gapMin && inCategory(it, tag) && skip.indexOf(it.id) < 0;
    });
    list.sort(function (a, b) {
      if (a.size !== b.size) return b.size - a.size;
      if (a.added !== b.added) return a.added < b.added ? -1 : 1;
      return 0;
    });
    return list;
  }

  function shuffleThree(pool) {
    pool = pool.slice();
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    return pool.slice(0, 3);
  }

  // When no single idea fills the gap, the pair that fills it best.
  function bestPair(pool, gapMin) {
    if (!pool.length || pool[0].size >= gapMin) return null;
    var best = null, bestSum = pool[0].size;
    for (var i = 0; i < pool.length; i++) {
      for (var j = i + 1; j < pool.length; j++) {
        var sum = pool[i].size + pool[j].size;
        if (sum <= gapMin && sum > bestSum) { best = [pool[i], pool[j]]; bestSum = sum; }
      }
    }
    return best;
  }

  function pickHTML(it) {
    return '<button class="gap-pick" data-id="' + esc(it.id) + '">' +
      '<span class="gap-pickwhat">' + esc(it.what) + "</span>" +
      (it.tag ? '<span class="gap-picktag">' + esc(it.tag) + "</span>" : "") +
      '<span class="bl-sizechip">' + sizeLabel(it.size) + "</span></button>";
  }

  function gapCardHTML() {
    var sizes = SIZES.map(function (s) {
      return '<button class="gap-size' + (s === gapState.gap ? " on" : "") + '" data-gap="' + s + '">' + sizeLabel(s) + "</button>";
    }).join("");
    var tags = ["Any"].concat(TAGS).map(function (t) {
      return '<button class="gap-tag' + (t === gapState.tag ? " on" : "") + '" data-tag="' + t + '">' + t + "</button>";
    }).join("");
    return '<section class="gap-card glass" aria-label="I have free time">' +
      '<div class="gap-head"><span class="gap-title">I have free time</span></div>' +
      '<div class="gap-sizes">' + sizes + "</div>" +
      '<div class="gap-tags">' + tags + "</div>" +
      '<div class="gap-results" id="gap-results">' + gapResultsHTML() + "</div>" +
      "</section>";
  }

  function gapResultsHTML() {
    var gap = gapState.gap, tag = gapState.tag;
    if (!gap) return '<p class="gap-hint">How much time do you have?</p>';
    if (!count()) {
      return '<p class="gap-hint">Nothing saved yet.</p>' +
        '<div class="gap-btns"><button class="gap-btn" data-go="add">Add an idea</button></div>';
    }
    var all = matches(gap, tag, false);
    var catName = tag === "Any" ? "" : tag + " ";
    if (!all.length) {
      var btns = [];
      var msg;
      var inCat = items().filter(function (it) { return inCategory(it, tag); });
      if (matches(gap, tag, true).length) {
        msg = "You set aside everything that fits for today.";
        btns.push('<button class="gap-btn" data-go="unskip">Show them again</button>');
      } else if (!inCat.length) {
        msg = "No " + catName + "ideas yet.";
      } else {
        var bigger = inCat.filter(function (it) { return it.size > gap; }).length;
        msg = "Nothing " + (tag === "Any" ? "" : "in " + tag + " ") + "fits " + sizeLabel(gap) + ". " +
          bigger + " " + catName + (bigger === 1 ? "idea needs" : "ideas need") + " more time.";
      }
      if (tag !== "Any" && matches(gap, "Any", false).length) {
        btns.push('<button class="gap-btn" data-go="any">Show any category</button>');
      }
      btns.push('<button class="gap-btn" data-go="add">Add ' + (tag === "Any" ? "an" : "a " + esc(tag)) + " idea</button>");
      return '<p class="gap-hint">' + esc(msg) + "</p>" +
        '<div class="gap-btns">' + btns.join("") + "</div>";
    }

    var shown = gapState.shuffled || all.slice(0, 3);
    var html = shown.map(pickHTML).join("");
    var pair = gapState.shuffled ? null : bestPair(all, gap);
    if (pair) {
      html += '<p class="gap-pair">Or do two (' + durLabel(pair[0].size + pair[1].size) + "): " +
        '<button class="gap-pairlink" data-id="' + esc(pair[0].id) + '">' + esc(pair[0].what) + "</button> + " +
        '<button class="gap-pairlink" data-id="' + esc(pair[1].id) + '">' + esc(pair[1].what) + "</button></p>";
    }
    if (all.length > 3) html += '<button class="gap-shuffle" id="gap-shuffle">Shuffle</button>';
    if (tag !== "Any") {
      var untagged = items().filter(function (it) { return !it.tag && it.size <= gap; }).length;
      if (untagged) {
        html += '<p class="gap-hint">' + untagged + (untagged === 1 ? " idea has" : " ideas have") +
          " no category. Tap one below to give it one.</p>";
      }
    }
    return html;
  }

  function paintGapResults() {
    var box = document.getElementById("gap-results");
    if (!box) return;
    box.innerHTML = gapResultsHTML();
    box.querySelectorAll(".gap-pick, .gap-pairlink").forEach(function (b) {
      b.addEventListener("click", function () { openIdeaSheet(b.dataset.id, true); });
    });
    box.querySelectorAll(".gap-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        var go = b.dataset.go;
        if (go === "add") {
          openEditSheet({ size: gapState.gap, tag: gapState.tag === "Any" ? undefined : gapState.tag });
        } else if (go === "any") {
          setGap(gapState.gap, "Any");
        } else if (go === "unskip") {
          lsSet(LS_SKIP, null);
          paintGapResults();
        }
      });
    });
    var sh = document.getElementById("gap-shuffle");
    if (sh) sh.addEventListener("click", function () {
      gapState.shuffled = shuffleThree(matches(gapState.gap, gapState.tag, false));
      paintGapResults();
    });
  }

  function setGap(gap, tag) {
    gapState.gap = gap;
    gapState.tag = tag;
    gapState.shuffled = null;
    saveGap();
    var card = document.querySelector(".gap-card");
    if (!card) return;
    card.querySelectorAll(".gap-size").forEach(function (x) {
      x.classList.toggle("on", Number(x.dataset.gap) === gap);
    });
    card.querySelectorAll(".gap-tag").forEach(function (x) {
      x.classList.toggle("on", x.dataset.tag === tag);
    });
    paintGapResults();
  }

  function bindGapCard() {
    var card = document.querySelector(".gap-card");
    if (!card) return;
    card.querySelectorAll(".gap-size").forEach(function (b) {
      b.addEventListener("click", function () { setGap(Number(b.dataset.gap), gapState.tag); });
    });
    card.querySelectorAll(".gap-tag").forEach(function (b) {
      b.addEventListener("click", function () { setGap(gapState.gap, b.dataset.tag); });
    });
    paintGapResults();
  }

  /* ----- screen ----- */

  function rowHTML(it) {
    return '<button class="bl-row" data-id="' + esc(it.id) + '">' +
      '<span class="bl-main"><span class="bl-what">' + esc(it.what) + "</span>" +
      '<span class="bl-meta"><span class="bl-sizechip">' + sizeLabel(it.size) + "</span>" +
      '<span class="bl-tag' + (it.tag ? "" : " none") + '">' + esc(it.tag || "No category") + "</span>" +
      (isStale(it) ? '<span class="bl-stale">Still want this?</span>' : "") +
      "</span></span>" +
      '<svg class="bl-chev" viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      "</button>";
  }

  function doneDayLabel(dateStr) {
    var n = daysBetween(dateStr, localDate());
    if (n === 0) return "Today";
    if (n === 1) return "Yesterday";
    var p = dateStr.split("-").map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    if (n < 7) return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
    return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()] + " " + d.getDate();
  }

  function doneHTML() {
    var done = doneList().slice(0, 10);
    if (!done.length) return "";
    var rows = done.map(function (d) {
      return '<div class="bl-donerow"><span class="bl-donewhat">' + esc(d.what) + "</span>" +
        '<span class="bl-donewhen">' + doneDayLabel(d.doneOn) + "</span></div>";
    }).join("");
    return '<details class="bl-done glass"><summary>Done lately</summary>' + rows + "</details>";
  }

  function render() {
    var root = document.getElementById("backlog-root");
    if (!root || !Store.get("person")) return;
    var token = (render._t = (render._t || 0) + 1);
    if (!cache) root.innerHTML = '<div class="bl-loading">Loading...</div>';
    load().then(function (list) {
      if (token !== render._t) return;
      var sub = list.length + (list.length === 1 ? " idea saved" : " ideas saved");
      var wk = doneThisWeek();
      if (wk) sub += " · " + wk + " done this week";
      var head = '<div class="bl-head">' +
        '<div><h1 class="screen-title">Free time</h1>' +
        '<p class="screen-sub">' + sub + "</p></div>" +
        '<button class="bl-addbtn" id="bl-add" aria-label="Add an idea">' +
        '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>';
      var body;
      if (!list.length) {
        body = '<div class="bl-empty glass"><p>Nothing saved yet.</p>' +
          '<p class="bl-emptysub">Save things you want to do. When free time shows up, pick from here instead of deciding on the spot.</p></div>';
      } else {
        body = '<div class="bl-list glass">' + list.map(rowHTML).join("") + "</div>";
      }
      var open = root.querySelector(".bl-done[open]") !== null;
      root.innerHTML = head + timerCardHTML() + gapCardHTML() + body + doneHTML();
      if (open && root.querySelector(".bl-done")) root.querySelector(".bl-done").open = true;

      document.getElementById("bl-add").addEventListener("click", function () { openEditSheet(); });
      bindTimer();
      bindGapCard();
      root.querySelectorAll(".bl-row").forEach(function (b) {
        b.addEventListener("click", function () { openIdeaSheet(b.dataset.id, false); });
      });
    }, function () {
      if (token !== render._t) return;
      root.innerHTML = '<div class="load-error"><p>Couldn\'t load your list. Check your connection.</p>' +
        '<button class="btn" id="bl-retry">Retry</button></div>';
      document.getElementById("bl-retry").addEventListener("click", render);
    });
  }

  function init() { render(); }

  return {
    init: init,
    render: render,
    load: load,
    invalidate: invalidate,
    items: items,
    count: count,
    sizeLabel: sizeLabel,
    openAddSheet: function () { openEditSheet(); },
    TAGS: TAGS,
    SIZES: SIZES,
    CAP: CAP
  };
})();
