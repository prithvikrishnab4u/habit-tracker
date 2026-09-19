/* Today screen (Phase 2).
   Habit rows, not person columns. Your control gets ~75% of each row;
   your partner is a compact read-only status on the right. */

var Today = (function () {
  var root = null;
  var dateOffset = 0; // 0 = today, down to -2 for late logging
  var MAX_BACK = 2;

  var TINTS = { water: "#0A84FF", exercise: "#BF5AF2", steps: "#30D158" };

  function viewedDate() { return addDays(localDate(), dateOffset); }

  function dateLabel() {
    if (dateOffset === 0) return "Today";
    if (dateOffset === -1) return "Yesterday";
    var parts = viewedDate().split("-").map(Number);
    var d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }

  function fullDateLabel() {
    var parts = viewedDate().split("-").map(Number);
    var d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  }

  function mondayOf(dateStr) {
    var parts = dateStr.split("-").map(Number);
    var d = new Date(parts[0], parts[1] - 1, parts[2]);
    var dow = (d.getDay() + 6) % 7; // Monday = 0
    d.setDate(d.getDate() - dow);
    return localDate(d);
  }

  function habitById(id) {
    return Store.get("habits").habits.filter(function (h) { return h.id === id; })[0];
  }

  /* ----- sync helpers (shared with the Pod screen in Phase 3) ----- */
  function habitMet(habit, personId, entries) {
    if (habit.period !== "day" || !habit.syncEligible) return null; // not evaluated
    var v = entries ? entries[habit.id] : undefined;
    var target = habit.targets[personId];
    if (habit.syncRule === "if-logged" && (v === undefined || v === null)) return null; // excluded
    return (v || 0) >= target;
  }

  function dayFraction(dateStr, personId) {
    var entries = Data.getCached(dateStr, personId) || {};
    var habits = Store.get("habits").habits;
    var met = 0, total = 0;
    habits.forEach(function (h) {
      var r = habitMet(h, personId, entries);
      if (r !== null) { total++; if (r) met++; }
    });
    return total ? met / total : 0;
  }

  function ringSVG(frac, color, size) {
    size = size || 44;
    var r = (size - 6) / 2;
    var c = 2 * Math.PI * r;
    var off = c * (1 - frac);
    return '<svg viewBox="0 0 ' + size + " " + size + '" width="' + size + '" height="' + size + '" aria-hidden="true">' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="rgba(127,127,140,0.25)" stroke-width="4"/>' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="4"' +
      ' stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"' +
      ' transform="rotate(-90 ' + size / 2 + " " + size / 2 + ')"/></svg>';
  }

  /* ----- toast with an action button (Undo / Retry) ----- */
  var toastTimer = null;
  function toastAction(msg, label, fn) {
    var el = document.getElementById("toast");
    el.innerHTML = "";
    el.appendChild(document.createTextNode(msg));
    var b = document.createElement("button");
    b.className = "toast-action";
    b.textContent = label;
    b.addEventListener("click", function () {
      el.classList.add("hidden");
      clearTimeout(toastTimer);
      fn();
    });
    el.appendChild(b);
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.add("hidden"); }, 6000);
  }

  /* ----- bottom sheet ----- */
  function openSheet(title, sub, bodyHTML) {
    var scrim = document.createElement("div");
    scrim.className = "scrim";
    var sheet = document.createElement("div");
    sheet.className = "sheet glass";
    sheet.setAttribute("role", "dialog");
    sheet.innerHTML = "<h2>" + esc(title) + "</h2>" +
      (sub ? '<p class="sheet-sub">' + esc(sub) + "</p>" : "") + bodyHTML;
    document.body.appendChild(scrim);
    document.body.appendChild(sheet);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        scrim.classList.add("show");
        sheet.classList.add("show");
      });
    });
    function close() {
      scrim.classList.remove("show");
      sheet.classList.remove("show");
      setTimeout(function () {
        scrim.remove();
        sheet.remove();
      }, 240);
    }
    scrim.addEventListener("click", close);
    return { el: sheet, close: close };
  }

  /* ----- save pipeline: optimistic UI + pending dot + undo/retry ----- */
  function commit(dateStr, personId, habitId, newVal, prevVal, apply, revert, rowEl) {
    apply();
    var dot = document.createElement("span");
    dot.className = "pending-dot";
    rowEl.appendChild(dot);
    Data.saveEntry(dateStr, personId, habitId, newVal, prevVal, {
      pending: function (on) { dot.style.display = on ? "block" : "none"; },
      ok: function () {
        dot.remove();
        var u = Data.peekUndo();
        toastAction("Saved.", "Undo", function () {
          Data.undoLast().then(function () { render(); });
        });
      },
      fail: function () {
        dot.remove();
        revert();
        toastAction("Couldn't save.", "Retry", function () {
          commit(dateStr, personId, habitId, newVal, prevVal, apply, revert, rowEl);
        });
      }
    });
  }

  /* ----- row renderers ----- */
  function partnerCell(personId, html) {
    var name = Store.personName(personId);
    var color = Store.personColor(personId);
    return '<div class="row-partner"><span class="pname">' + esc(name) + "</span>" + html +
      '<span class="pdot" style="background:' + color + '"></span></div>';
  }

  function waterRow(habit, dateStr, me, partner) {
    var target = habit.targets[me];
    var val = Data.value(dateStr, me, habit.id) || 0;
    var pVal = Data.value(dateStr, partner, habit.id);
    var pct = Math.min(val / target, 1) * 100;
    var pText = (pVal === undefined || pVal === null)
      ? '<span class="pval" style="color:var(--ink-30)">--</span>'
      : '<span class="pval num">' + pVal + "/" + habit.targets[partner] + "</span>";

    return '<div class="habit-row" data-habit="water" style="--tint:' + TINTS.water + '">' +
      '<div class="row-main">' +
      '<p class="habit-name">Water</p>' +
      '<p class="habit-sub">Target ' + target + " glasses</p>" +
      '<button class="liquid-wrap" aria-label="Log a glass of water. Long press to set an exact amount.">' +
      '<span class="liquid-fill" style="height:' + pct + '%"></span>' +
      '<span class="big-num num"><span class="js-wval">' + val + "</span><small>/" + target + "</small></span>" +
      "</button>" +
      '<p class="tap-hint">Tap +1 &middot; long-press to set</p>' +
      "</div>" + partnerCell(partner, pText) + "</div>";
  }

  function stepsRow(habit, dateStr, me, partner) {
    var target = habit.targets[me];
    var val = Data.value(dateStr, me, habit.id);
    var pVal = Data.value(dateStr, partner, habit.id);
    var shown = (val === undefined || val === null) ? "--" : Number(val).toLocaleString();
    var pText = (pVal === undefined || pVal === null)
      ? '<span class="pval" style="color:var(--ink-30)">--</span>'
      : '<span class="pval num">' + Number(pVal).toLocaleString() + "</span>";

    return '<div class="habit-row" data-habit="steps" style="--tint:' + TINTS.steps + '">' +
      '<div class="row-main">' +
      '<p class="habit-name">Steps</p>' +
      '<p class="habit-sub">Target ' + Number(target).toLocaleString() + "</p>" +
      '<div class="big-num num js-sval" role="button" tabindex="0" aria-label="Log steps">' + shown + "</div>" +
      '<p class="tap-hint">Tap to enter</p>' +
      "</div>" + partnerCell(partner, pText) + "</div>";
  }

  function exerciseRow(habit, dateStr, me, partner) {
    var monday = mondayOf(dateStr);
    var days = [];
    for (var i = 0; i < 7; i++) days.push(addDays(monday, i));
    var labels = ["M", "T", "W", "T", "F", "S", "S"];
    var todayStr = localDate();
    var minDate = addDays(todayStr, -MAX_BACK);

    function weekCount(personId) {
      var n = 0;
      days.forEach(function (d) {
        if (Data.value(d, personId, habit.id)) n++;
      });
      return n;
    }

    var dots = days.map(function (d, i) {
      var done = !!Data.value(d, me, habit.id);
      var editable = d >= minDate && d <= todayStr;
      var cls = "day-dot" + (done ? " done" : "") + (d === todayStr ? " today" : "") + (editable ? "" : " locked");
      return '<button class="' + cls + '" data-date="' + d + '"' + (editable ? "" : " disabled") +
        ' aria-label="' + labels[i] + (done ? ", done" : "") + '">' + labels[i] +
        '<span class="dot"></span></button>';
    }).join("");

    var n = weekCount(me);
    var pn = weekCount(partner);
    var pText = '<span class="pval num">' + pn + "/4</span>";

    return '<div class="habit-row" data-habit="exercise" style="--tint:' + TINTS.exercise + '">' +
      '<div class="row-main">' +
      '<p class="habit-name">Exercise</p>' +
      '<p class="habit-sub"><span class="num js-xval">' + n + "</span>/4 this week &middot; target 3</p>" +
      '<div class="week-dots">' + dots + "</div>" +
      "</div>" + partnerCell(partner, pText) + "</div>";
  }

  /* ----- sheets ----- */
  function waterSheet(habit, dateStr, me, rowEl) {
    var target = habit.targets[me];
    var startVal = Data.value(dateStr, me, habit.id) || 0;
    var val = startVal;
    var s = openSheet("Water", "Set your glasses for " + dateLabel().toLowerCase() + ".",
      '<div class="stepper">' +
      '<button id="ws-dec" aria-label="One less">-</button>' +
      '<span class="step-val num" id="ws-val">' + val + "</span>" +
      '<button id="ws-inc" aria-label="One more">+</button>' +
      "</div>" +
      '<div class="sheet-row"><button class="btn" id="ws-save">Save</button></div>');

    function draw() { s.el.querySelector("#ws-val").textContent = val; }
    s.el.querySelector("#ws-dec").addEventListener("click", function () { val = Math.max(0, val - 1); draw(); });
    s.el.querySelector("#ws-inc").addEventListener("click", function () { val = Math.min(99, val + 1); draw(); });
    s.el.querySelector("#ws-save").addEventListener("click", function () {
      s.close();
      if (val === startVal) return;
      var prev = startVal;
      commit(dateStr, me, habit.id, val, prev,
        function () { paintWater(rowEl, habit, val); },
        function () { paintWater(rowEl, habit, prev); },
        rowEl);
    });
  }

  function paintWater(rowEl, habit, val) {
    var target = habit.targets[Store.get("person")];
    rowEl.querySelector(".js-wval").textContent = val;
    rowEl.querySelector(".liquid-fill").style.height = Math.min(val / target, 1) * 100 + "%";
  }

  function stepsSheet(habit, dateStr, me, rowEl) {
    var target = habit.targets[me];
    var startVal = Data.value(dateStr, me, habit.id);
    var s = openSheet("Steps", "Target " + Number(target).toLocaleString() + " for " + dateLabel().toLowerCase() + ".",
      '<input type="number" id="ss-input" inputmode="numeric" min="0" max="999999" value="' +
      (startVal === undefined || startVal === null ? "" : startVal) + '" placeholder="0" aria-label="Step count">' +
      '<div class="chips">' +
      '<button class="chip" data-add="1000">+1,000</button>' +
      '<button class="chip" data-add="2500">+2,500</button>' +
      '<button class="chip" data-set="target">Hit target</button>' +
      "</div>" +
      '<div class="sheet-row"><button class="btn" id="ss-save">Save</button></div>');

    var input = s.el.querySelector("#ss-input");
    s.el.querySelectorAll(".chip").forEach(function (c) {
      c.addEventListener("click", function () {
        var cur = parseInt(input.value, 10) || 0;
        if (c.getAttribute("data-set") === "target") input.value = target;
        else input.value = cur + parseInt(c.getAttribute("data-add"), 10);
        input.focus();
      });
    });
    s.el.querySelector("#ss-save").addEventListener("click", function () {
      var raw = input.value.trim();
      s.close();
      var val = raw === "" ? null : Math.max(0, parseInt(raw, 10) || 0);
      var prev = (startVal === undefined) ? null : startVal;
      var next = (val === null) ? null : val;
      var prevCmp = (prev === null) ? null : prev;
      if (next === prevCmp) return;
      commit(dateStr, me, habit.id, next === null ? undefined : next, prev === null ? undefined : prev,
        function () { paintSteps(rowEl, next); },
        function () { paintSteps(rowEl, prev); },
        rowEl);
    });
    setTimeout(function () { input.focus(); }, 350);
  }

  function paintSteps(rowEl, val) {
    rowEl.querySelector(".js-sval").textContent =
      (val === null || val === undefined) ? "--" : Number(val).toLocaleString();
  }

  /* ----- render ----- */
  function headerHTML() {
    return '<div class="today-header" id="today-header">' +
      '<div class="title-row"><h1>' + esc(dateLabel()) + "</h1>" +
      '<div class="date-nav">' +
      '<button id="dn-back" aria-label="Previous day"' + (dateOffset <= -MAX_BACK ? " disabled" : "") + ">&#8249;</button>" +
      '<button id="dn-fwd" aria-label="Next day"' + (dateOffset >= 0 ? " disabled" : "") + ">&#8250;</button>" +
      "</div></div>" +
      '<p class="dateline">' + esc(fullDateLabel()) + "</p></div>";
  }

  function summaryHTML(dateStr, me, partner) {
    var myFrac = dayFraction(dateStr, me);
    var pFrac = dayFraction(dateStr, partner);
    return '<button class="summary-strip glass" id="summary-strip" aria-label="Open the pod view">' +
      '<span class="rings">' + ringSVG(myFrac, Store.personColor(me)) + ringSVG(pFrac, Store.personColor(partner)) + "</span>" +
      '<span><span class="who">You and ' + esc(Store.personName(partner)) + "</span><br>" +
      '<span class="sub">Tap for the pod view</span></span></button>';
  }

  function render() {
    root = document.getElementById("today-root");
    if (!root || !Store.get("habits")) return;
    var dateStr = viewedDate();
    var me = Store.get("person");
    var partner = Store.partnerId();
    var habits = Store.get("habits").habits;

    root.classList.toggle("controls-off", !navigator.onLine);
    root.innerHTML = headerHTML() + '<div id="today-body"></div>';
    var body = document.getElementById("today-body");

    document.getElementById("dn-back").addEventListener("click", function () {
      if (dateOffset > -MAX_BACK) { dateOffset--; render(); }
    });
    document.getElementById("dn-fwd").addEventListener("click", function () {
      if (dateOffset < 0) { dateOffset++; render(); }
    });

    // My check-in for the viewed date, partner's for the viewed date,
    // plus the full week for exercise dots (both people).
    var monday = mondayOf(dateStr);
    var fetches = [
      Data.fetchCheckin(dateStr, me),
      partner ? Data.fetchCheckin(dateStr, partner) : Promise.resolve({})
    ];
    for (var i = 0; i < 7; i++) {
      fetches.push(Data.fetchCheckin(addDays(monday, i), me));
      if (partner) fetches.push(Data.fetchCheckin(addDays(monday, i), partner));
    }

    Promise.all(fetches).then(function () {
      var html = summaryHTML(dateStr, me, partner);
      habits.forEach(function (h) {
        if (h.id === "water") html += waterRow(h, dateStr, me, partner);
        else if (h.id === "steps") html += stepsRow(h, dateStr, me, partner);
        else if (h.id === "exercise") html += exerciseRow(h, dateStr, me, partner);
        else html += genericRow(h, dateStr, me, partner);
      });
      body.innerHTML = html;
      wire(dateStr, me, partner);
    });
  }

  function genericRow(habit, dateStr, me, partner) {
    var on = !!Data.value(dateStr, me, habit.id);
    var pOn = !!Data.value(dateStr, partner, habit.id);
    return '<div class="habit-row" data-habit="' + esc(habit.id) + '" style="--tint:' + (TINTS[habit.id] || "#A259FF") + '">' +
      '<div class="row-main">' +
      '<p class="habit-name">' + esc(habit.name) + "</p>" +
      '<p class="habit-sub">' + (on ? "Done" : "Not yet") + "</p>" +
      "</div>" +
      partnerCell(partner, '<span class="pval">' + (pOn ? "Done" : "--") + "</span>") + "</div>";
  }

  function wire(dateStr, me, partner) {
    document.getElementById("summary-strip").addEventListener("click", function () {
      if (window.App) window.App.showTab("pod");
    });

    // Water: tap = +1, long-press = quick set.
    var wRow = root.querySelector('[data-habit="water"]');
    if (wRow) {
      var habit = habitById("water");
      var tapArea = wRow.querySelector(".liquid-wrap");
      var pressTimer = null;
      var longPressed = false;
      tapArea.addEventListener("pointerdown", function () {
        longPressed = false;
        pressTimer = setTimeout(function () {
          longPressed = true;
          waterSheet(habit, dateStr, me, wRow);
        }, 550);
      });
      ["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) {
        tapArea.addEventListener(ev, function () { clearTimeout(pressTimer); });
      });
      tapArea.addEventListener("click", function () {
        if (longPressed) return;
        var prev = Data.value(dateStr, me, habit.id) || 0;
        var next = prev + 1;
        commit(dateStr, me, habit.id, next, prev,
          function () { paintWater(wRow, habit, next); },
          function () { paintWater(wRow, habit, prev); },
          wRow);
      });
    }

    // Steps: tap opens the sheet.
    var sRow = root.querySelector('[data-habit="steps"]');
    if (sRow) {
      var sHabit = habitById("steps");
      var open = function () { stepsSheet(sHabit, dateStr, me, sRow); };
      sRow.querySelector(".js-sval").addEventListener("click", open);
      sRow.querySelector(".js-sval").addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
      });
    }

    // Exercise: dots toggle their date (within the 2-day window).
    var xRow = root.querySelector('[data-habit="exercise"]');
    if (xRow) {
      var xHabit = habitById("exercise");
      xRow.querySelectorAll(".day-dot:not(.locked)").forEach(function (dotBtn) {
        dotBtn.addEventListener("click", function () {
          var d = dotBtn.getAttribute("data-date");
          var prev = Data.value(d, me, xHabit.id);
          var next = prev ? undefined : true;
          var wasDone = dotBtn.classList.contains("done");
          commit(d, me, xHabit.id, next, prev,
            function () {
              dotBtn.classList.toggle("done", !wasDone);
              var nEl = xRow.querySelector(".js-xval");
              nEl.textContent = parseInt(nEl.textContent, 10) + (wasDone ? -1 : 1);
            },
            function () {
              dotBtn.classList.toggle("done", wasDone);
              var nEl = xRow.querySelector(".js-xval");
              nEl.textContent = parseInt(nEl.textContent, 10) + (wasDone ? 1 : -1);
            },
            xRow);
        });
      });
    }

    // Generic check habits: whole row toggles.
    root.querySelectorAll(".habit-row").forEach(function (row) {
      var id = row.getAttribute("data-habit");
      if (id === "water" || id === "steps" || id === "exercise") return;
      var habit = habitById(id);
      row.style.cursor = "pointer";
      row.addEventListener("click", function () {
        var prev = Data.value(dateStr, me, id);
        var next = prev ? undefined : true;
        commit(dateStr, me, id, next, prev, render, render, row);
      });
    });
  }

  function refreshOffline() {
    if (root) root.classList.toggle("controls-off", !navigator.onLine);
  }

  function onScroll() {
    var scr = document.getElementById("screen-today");
    if (!scr || scr.classList.contains("hidden")) return;
    var h = document.getElementById("today-header");
    if (h) h.classList.toggle("compact", window.scrollY > 48);
  }

  function init() {
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("online", refreshOffline);
    window.addEventListener("offline", refreshOffline);
  }

  return {
    init: init,
    render: render,
    refreshOffline: refreshOffline,
    habitMet: habitMet,
    dayFraction: dayFraction,
    ringSVG: ringSVG
  };
})();
