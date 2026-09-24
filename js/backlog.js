/* v2 Phase C: Backlog.
   - One flat personal list per person: backlog/{person}.json
     { items: [ { id, what, size, tag, added } ] }
     size in minutes: 15 | 30 | 60 | 120. tag optional.
   - Backlog tab: list (oldest first), add (+), cap of 20, tag cycling,
     delete with undo.
   - "Got a gap?" picker helpers for the Today card (size fit + tag
     filter + shuffle). Starting a block with a timer is Phase D. */

var Backlog = (function () {
  var SIZES = [15, 30, 60, 120];
  var DEFAULT_SIZE = 30;
  var CAP = 20;
  var TAGS = ["Work", "Home", "Learn", "Body", "Family", "Admin"];
  var FILTER_TAGS = ["All", "Body", "Learn", "Home"];

  var cache = null;      // { items: [...] } for the current person
  var cachePerson = null;
  var undoStack = [];
  var queues = {};

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

  /* ----- data ----- */

  function load() {
    var me = Store.get("person");
    if (!me) return Promise.resolve([]);
    if (cache && cachePerson === me) return Promise.resolve(cache.items);
    return Api.getJSON(path(me)).then(function (res) {
      var items = (res.data && res.data.items) || [];
      cache = { items: items };
      cachePerson = me;
      return items;
    });
  }

  function items() {
    return cache ? cache.items.slice() : [];
  }

  function count() {
    return cache ? cache.items.length : 0;
  }

  // items: array to persist. SHA-guarded write with retry, like Data.
  function persist(items, message) {
    var me = Store.get("person");
    var doc = { items: items };
    cache = { items: items };
    cachePerson = me;
    return enqueue(path(me), function () {
      return Api.putJSON(path(me), doc, message || "Backlog update",
        function (fresh) {
          // SHA conflict: re-apply my items over the fresh file by id.
          var freshItems = (fresh && fresh.items) || [];
          var out = items.slice();
          var seen = {};
          out.forEach(function (it) { seen[it.id] = 1; });
          freshItems.forEach(function (it) { if (!seen[it.id]) out.push(it); });
          return { items: out };
        });
    });
  }

  function nextId() {
    return "b" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  }

  function addItem(what, size) {
    var list = items();
    if (list.length >= CAP) return Promise.reject(new Error("full"));
    var item = {
      id: nextId(),
      what: what,
      size: SIZES.indexOf(size) >= 0 ? size : DEFAULT_SIZE,
      tag: null,
      added: localDate()
    };
    list.push(item);
    undoStack.push({ op: "add", id: item.id });
    if (undoStack.length > 20) undoStack.shift();
    return persist(list, "Backlog add").then(function () { return item; });
  }

  function removeItem(id) {
    var list = items();
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) { idx = i; break; }
    if (idx < 0) return Promise.resolve(false);
    var removed = list[idx];
    list.splice(idx, 1);
    undoStack.push({ op: "remove", item: removed, idx: idx });
    if (undoStack.length > 20) undoStack.shift();
    return persist(list, "Backlog remove").then(function () { return true; });
  }

  function setTag(id, tag) {
    var list = items();
    var it = null;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) { it = list[i]; break; }
    if (!it) return Promise.resolve(false);
    var prev = it.tag || null;
    if (prev === tag) return Promise.resolve(false);
    it.tag = tag;
    undoStack.push({ op: "tag", id: id, prev: prev });
    if (undoStack.length > 20) undoStack.shift();
    return persist(list, "Backlog tag").then(function () { return true; });
  }

  function cycleTag(id) {
    var list = items();
    var it = null;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) { it = list[i]; break; }
    if (!it) return;
    var cur = it.tag || null;
    var idx = TAGS.indexOf(cur);
    var next = idx < 0 ? TAGS[0] : (idx + 1 >= TAGS.length ? null : TAGS[idx + 1]);
    setTag(id, next).then(function (changed) { if (changed) render(); });
  }

  function undoLast() {
    var last = undoStack.pop();
    if (!last) return Promise.resolve(false);
    var list = items();
    if (last.op === "add") {
      var idx = -1;
      for (var i = 0; i < list.length; i++) if (list[i].id === last.id) { idx = i; break; }
      if (idx >= 0) list.splice(idx, 1);
    } else if (last.op === "remove") {
      list.splice(Math.min(last.idx, list.length), 0, last.item);
    } else if (last.op === "tag") {
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === last.id) { list[i].tag = last.prev; break; }
      }
    }
    return persist(list, "Backlog undo").then(function () { render(); return true; });
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
      undoLast();
    });
    el.appendChild(b);
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
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

  /* ----- add sheet ----- */

  function openAddSheet() {
    var list = items();
    if (list.length >= CAP) { openFullSheet(); return; }

    var sizeBtns = SIZES.map(function (s) {
      return '<button class="bl-size' + (s === DEFAULT_SIZE ? " on" : "") + '" data-size="' + s + '">' +
        sizeLabel(s) + "</button>";
    }).join("");

    var sheet = openSheet("Add to backlog", "Two taps: text, then size.",
      '<div class="bl-add">' +
      '<input id="bl-what" class="bl-input" type="text" maxlength="80" placeholder="What would you do with a free hour?" autocomplete="off">' +
      '<div class="bl-sizes">' + sizeBtns + "</div>" +
      '<button class="btn bl-save" id="bl-save">Add</button>' +
      "</div>");

    var chosen = DEFAULT_SIZE;
    sheet.el.querySelectorAll(".bl-size").forEach(function (b) {
      b.addEventListener("click", function () {
        sheet.el.querySelectorAll(".bl-size").forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        chosen = Number(b.dataset.size);
      });
    });
    var input = sheet.el.querySelector("#bl-what");
    function save() {
      var what = input.value.trim();
      if (!what) { input.focus(); return; }
      addItem(what, chosen).then(function () {
        sheet.close();
        render();
        toastUndo("Added to backlog.");
      }, function () {
        showToast("Couldn't save. Check your connection.");
      });
    }
    sheet.el.querySelector("#bl-save").addEventListener("click", save);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") save(); });
    setTimeout(function () { input.focus(); }, 350);
  }

  // Cap of 20: when full, adding asks you to drop one first.
  function openFullSheet() {
    var rows = items().map(function (it) {
      return '<div class="bl-fullrow"><span class="bl-fullwhat">' + esc(it.what) + "</span>" +
        '<button class="bl-drop" data-id="' + esc(it.id) + '">Drop</button></div>';
    }).join("");
    var sheet = openSheet("Backlog is full",
      "20 of 20. Drop one to make room, then add yours.",
      '<div class="bl-full">' + rows + "</div>");
    sheet.el.querySelectorAll(".bl-drop").forEach(function (b) {
      b.addEventListener("click", function () {
        removeItem(b.dataset.id).then(function () {
          sheet.close();
          render();
          openAddSheet();
        });
      });
    });
  }

  /* ----- "Got a gap?" picker (own card, moved from Today) ----- */

  var gapState = { gap: 0, tag: "All", picked: null };

  function gapCardHTML() {
    var sizes = SIZES.map(function (s) {
      return '<button class="gap-size" data-gap="' + s + '">' + sizeLabel(s) + "</button>";
    }).join("");
    var tags = FILTER_TAGS.map(function (t) {
      return '<button class="gap-tag' + (t === "All" ? " on" : "") + '" data-tag="' + t + '">' + t + "</button>";
    }).join("");
    return '<section class="gap-card glass" aria-label="Got a gap?">' +
      '<div class="gap-head"><span class="gap-title">Got a gap?</span></div>' +
      '<div class="gap-sizes">' + sizes + "</div>" +
      '<div class="gap-tags">' + tags + "</div>" +
      '<div class="gap-results" id="gap-results"><p class="gap-hint">Pick a size to see what fits.</p></div>' +
      "</section>";
  }

  function gapResultsHTML(list) {
    if (!count()) {
      return '<p class="gap-hint">Nothing queued yet. Add a few things below.</p>';
    }
    if (!list.length) {
      return '<p class="gap-hint">Nothing fits. Try a bigger gap or another tag.</p>';
    }
    var rows = list.map(function (it) {
      return '<button class="gap-pick' + (gapState.picked === it.id ? " sel" : "") + '" data-id="' + esc(it.id) + '">' +
        '<span class="gap-pickwhat">' + esc(it.what) + "</span>" +
        '<span class="bl-sizechip">' + sizeLabel(it.size) + "</span></button>";
    }).join("");
    return rows + '<button class="gap-shuffle" id="gap-shuffle">Shuffle</button>';
  }

  function paintGapResults(list) {
    var box = document.getElementById("gap-results");
    if (!box) return;
    box.innerHTML = gapResultsHTML(list || []);
    box.querySelectorAll(".gap-pick").forEach(function (b) {
      b.addEventListener("click", function () {
        gapState.picked = b.dataset.id;
        box.querySelectorAll(".gap-pick").forEach(function (x) {
          x.classList.toggle("sel", x.dataset.id === gapState.picked);
        });
      });
    });
    var sh = document.getElementById("gap-shuffle");
    if (sh) sh.addEventListener("click", function () {
      gapState.picked = null;
      paintGapResults(shuffleThree(gapState.gap, gapState.tag));
    });
  }

  function showGapPicks() {
    if (!gapState.gap) return;
    gapState.picked = null;
    load().then(function () {
      paintGapResults(pickThree(gapState.gap, gapState.tag));
    }, function () {
      var box = document.getElementById("gap-results");
      if (box) box.innerHTML = '<p class="gap-hint">Couldn\'t load the backlog. Check your connection.</p>';
    });
  }

  function bindGapCard() {
    var card = document.querySelector(".gap-card");
    if (!card) return;
    card.querySelectorAll(".gap-size").forEach(function (b) {
      b.addEventListener("click", function () {
        card.querySelectorAll(".gap-size").forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        gapState.gap = Number(b.dataset.gap);
        showGapPicks();
      });
    });
    card.querySelectorAll(".gap-tag").forEach(function (b) {
      b.addEventListener("click", function () {
        card.querySelectorAll(".gap-tag").forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        gapState.tag = b.dataset.tag;
        showGapPicks();
      });
    });
  }

  /* ----- screen ----- */

  function rowHTML(it) {
    return '<div class="bl-row" data-id="' + esc(it.id) + '">' +
      '<div class="bl-main"><span class="bl-what">' + esc(it.what) + "</span>" +
      '<span class="bl-meta"><span class="bl-sizechip">' + sizeLabel(it.size) + "</span>" +
      '<button class="bl-tag' + (it.tag ? "" : " none") + '" data-id="' + esc(it.id) + '">' +
      esc(it.tag || "+ tag") + "</button></span></div>" +
      '<button class="bl-del" data-id="' + esc(it.id) + '" aria-label="Remove">' +
      '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>' +
      "</div>";
  }

  function render() {
    var root = document.getElementById("backlog-root");
    if (!root || !Store.get("person")) return;
    var token = (render._t = (render._t || 0) + 1);
    root.innerHTML = '<div class="bl-loading">Loading backlog...</div>';
    load().then(function (list) {
      if (token !== render._t) return;
      var sub = list.length + (list.length === 1 ? " idea saved" : " ideas saved");
      var head = '<div class="bl-head">' +
        '<div><h1 class="screen-title">Free time</h1>' +
        '<p class="screen-sub">' + sub + "</p></div>" +
        '<button class="bl-addbtn" id="bl-add" aria-label="Add to backlog">' +
        '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>';
      var body;
      if (!list.length) {
        body = '<div class="bl-empty glass"><p>Nothing queued.</p>' +
          '<p class="bl-emptysub">When time appears, pick from here instead of deciding on the spot.</p></div>';
      } else {
        body = '<div class="bl-list glass">' + list.map(rowHTML).join("") + "</div>";
      }
      root.innerHTML = head + gapCardHTML() + body;

      document.getElementById("bl-add").addEventListener("click", openAddSheet);
      bindGapCard();
      showGapPicks();
      root.querySelectorAll(".bl-tag").forEach(function (b) {
        b.addEventListener("click", function (e) {
          e.stopPropagation();
          cycleTag(b.dataset.id);
        });
      });
      root.querySelectorAll(".bl-del").forEach(function (b) {
        b.addEventListener("click", function () {
          removeItem(b.dataset.id).then(function (ok) {
            if (ok) { render(); toastUndo("Removed from backlog."); }
          });
        });
      });
    }, function () {
      if (token !== render._t) return;
      root.innerHTML = '<div class="load-error"><p>Couldn\'t load the backlog. Check your connection.</p>' +
        '<button class="btn" id="bl-retry">Retry</button></div>';
      document.getElementById("bl-retry").addEventListener("click", render);
    });
  }

  /* ----- match helpers used by the gap picker above ----- */

  // Matches: item fits inside the gap, optional tag filter, oldest first.
  function matches(gapMin, tagFilter) {
    var list = items().filter(function (it) {
      if (it.size > gapMin) return false;
      if (tagFilter && tagFilter !== "All" && it.tag !== tagFilter) return false;
      return true;
    });
    list.sort(function (a, b) {
      if (a.added !== b.added) return a.added < b.added ? -1 : 1;
      return 0;
    });
    return list;
  }

  // Up to three matches, oldest first.
  function pickThree(gapMin, tagFilter) {
    return matches(gapMin, tagFilter).slice(0, 3);
  }

  // Shuffle: three random matches from the full match set.
  function shuffleThree(gapMin, tagFilter) {
    var pool = matches(gapMin, tagFilter).slice();
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    return pool.slice(0, 3);
  }

  function init() { render(); }

  return {
    init: init,
    render: render,
    load: load,
    items: items,
    count: count,
    sizeLabel: sizeLabel,
    openAddSheet: openAddSheet,
    pickThree: pickThree,
    shuffleThree: shuffleThree,
    FILTER_TAGS: FILTER_TAGS,
    SIZES: SIZES,
    CAP: CAP
  };
})();
