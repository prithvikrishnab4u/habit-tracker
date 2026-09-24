/* Today screen (Calm glass).
   Sync strip + tile grid. Presentation only: the save pipeline
   (Data.saveEntry with undo/retry), the sheets, and the Web Share nudge
   keep their existing behavior. Vanilla JS, no build step. */

var Today = (function () {
  var dateOffset = 0; // 0 = today, down to -2 for late logging
  var MAX_BACK = 2;

  /* ----- date helpers ----- */
  function viewedDate() { return addDays(localDate(), dateOffset); }

  function setDay(offset) {
    dateOffset = Math.max(-MAX_BACK, Math.min(0, offset));
    render();
  }

  function dateLabel() {
    if (dateOffset === 0) return "Today";
    if (dateOffset === -1) return "Yesterday";
    var parts = viewedDate().split("-").map(Number);
    var d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.toLocaleDateString(undefined, { weekday: "long" });
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

  /* ----- sync helpers (shared with the Pod screen) ----- */
  function habitMet(habit, personId, entries) {
    if (habit.period !== "day" || !habit.syncEligible) return null; // not evaluated
    var v = entries ? entries[habit.id] : undefined;
    var target = habit.targets[personId];
    if (habit.syncRule === "if-logged" && (v === undefined || v === null)) return null; // excluded
    // Inverted checks (Sugar-free) default to true (clean) when no value stored
    if (v === undefined || v === null) v = habit.inverted ? 1 : 0;
    return (v || 0) >= target;
  }

  function dayFraction(dateStr, personId) {
    var entries = Data.getCached(dateStr, personId) || {};
    var habits = Store.get("habits").habits;
    var sum = 0, total = 0;
    habits.forEach(function (h) {
      var p = habitProgress(h, personId, entries);
      if (p !== null) { total++; sum += p; }
    });
    return total ? sum / total : 0;
  }

  // Partial progress toward a daily sync-eligible habit, 0..1.
  // Null when the habit is not evaluated for this person/day.
  function habitProgress(habit, personId, entries) {
    if (habit.period !== "day" || !habit.syncEligible) return null; // not evaluated
    var v = entries ? entries[habit.id] : undefined;
    var target = habit.targets[personId];
    if (habit.syncRule === "if-logged" && (v === undefined || v === null)) return null; // excluded
    if (!target) return null;
    // Inverted checks (Sugar-free) default to true (clean) when no value stored
    if (v === undefined || v === null) v = habit.inverted ? 1 : 0;
    return Math.min((v || 0) / target, 1);
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

  /* ----- small builders ----- */
  function avatarHTML(personId, px) {
    var name = Store.personName(personId) || "?";
    var color = Store.personColor(personId);
    return '<span class="avatar" style="width:' + px + "px;height:" + px + "px;background:" + color + ';font-size:' + Math.round(px * 0.45) + 'px" aria-hidden="true">' +
      esc(name.charAt(0).toUpperCase()) + "</span>";
  }

  // Partner chip in the tile corner: 18px avatar + their value.
  function chipHTML(personId, valueText) {
    return '<span class="t-chip">' + avatarHTML(personId, 18) +
      '<span class="t-chip-val num">' + esc(valueText) + "</span></span>";
  }

  // 4px flat progress bar at the bottom of every tile, in --person.
  function barHTML(frac) {
    return '<span class="t-bar" aria-hidden="true"><i class="js-bar" style="width:' + Math.round(Math.min(frac, 1) * 100) + '%"></i></span>';
  }
  function paintBar(tileEl, frac) {
    var b = tileEl.querySelector(".js-bar");
    if (b) b.style.width = Math.round(Math.min(frac, 1) * 100) + "%";
  }

  function fmtSteps(n) {
    if (n === undefined || n === null) return "--";
    if (n < 1000) return String(n);
    var k = Math.round((n / 1000) * 10) / 10;
    return k + "k";
  }

  // Full grouped format for the tile's main number ("4,200"), matching the
  // mockup. The partner chip keeps the compact fmtSteps ("6.5k").
  function fmtStepsFull(n) {
    if (n === undefined || n === null) return "--";
    return Number(n).toLocaleString("en-US");
  }

  // Accessible ink + tint for the viewer's person color, per theme.
  // The mockups paint labels, tabs, nudges and actions in the ink shade;
  // Store.applyColor only sets --person/--partner, so refine here at render.
  function hexA(hex, a) {
    var h = String(hex).replace("#", "");
    if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }

  function paintInkVars() {
    var me = Store.get("person");
    var c = Colors.get(Store.getColorId(me));
    var dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var root = document.documentElement;
    root.style.setProperty("--me-ink", dark ? c.inkDark : c.inkLight);
    root.style.setProperty("--me-tint", hexA(c.base, dark ? 0.22 : 0.14));
  }

  var ICONS = {
    gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/>' +
      '<circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/>' +
      '<path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" opacity="0.35"/><path d="M8 12.5l2.6 2.6L16 9.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    badge: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  /* ----- toast with an action button (Undo / Retry) ----- */
  var toastTimer = null;
  function clearToast() {
    var el = document.getElementById("toast");
    if (el) el.classList.add("hidden");
    clearTimeout(toastTimer);
    clearTimeout(showToast._t);
  }
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
      // Scrim, X and Done can all race to close; unlock exactly once.
      if (closed) return;
      closed = true;
      unlockScroll();
      scrim.classList.remove("show");
      sheet.classList.remove("show");
      setTimeout(function () {
        scrim.remove();
        sheet.remove();
        // Play deferred sync moment now that the sheet is closed.
        if (pendingSync) {
          var ps = pendingSync;
          pendingSync = null;
          maybeSyncMoment(ps.dateStr, ps.me, ps.partner);
        }
      }, 240);
    }
    scrim.addEventListener("click", close);
    var xBtn = sheet.querySelector(".sheet-x");
    if (xBtn) xBtn.addEventListener("click", close);
    return { el: sheet, close: close };
  }

  /* ----- save pipeline: optimistic UI + pending dot + undo/retry ----- */
  function commit(dateStr, personId, habitId, newVal, prevVal, apply, tileEl) {
    apply();
    var dot = document.createElement("span");
    dot.className = "pending-dot";
    tileEl.appendChild(dot);
    Data.saveEntry(dateStr, personId, habitId, newVal, prevVal, {
      pending: function (on) { dot.style.display = on ? "block" : "none"; },
      ok: function () {
        dot.remove();
        afterWrite(dateStr, personId);
        var u = Data.peekUndo();
        toastAction("Saved.", "Undo", function () {
          Data.undoLast().then(function () { render(); });
        });
      },
      fail: function () {
        // The cache was already re-synced from the file by saveEntry;
        // just repaint. No rollback: it could sit below the file.
        dot.remove();
        render();
        toastAction("Couldn't save.", "Retry", function () {
          var cur = Data.value(dateStr, personId, habitId);
          commit(dateStr, personId, habitId, newVal, cur, apply, tileEl);
        });
      }
    });
  }

  // Wraps commit() for tile taps: paints the tile optimistically.
  function logTile(habit, newVal, tileEl, paint, dateStr) {
    var me = Store.get("person");
    var d = dateStr || viewedDate();
    var prevVal = Data.value(d, me, habit.id);
    commit(d, me, habit.id, newVal, prevVal,
      function () { paint(newVal); },
      tileEl);
  }

  // After a successful write: repaint the sync strip for the viewed date
  // and check the sync moment.
  function afterWrite(dateStr, personId) {
    var partner = Store.partnerId();
    var vd = viewedDate();
    paintStrip(vd, personId, partner);
    maybeSyncMoment(vd, personId, partner);
  }

  /* ----- sync strip: the single "both of us" element ----- */
  // Status copy, word for word from the brief. Names are raw here; the HTML
  // builder escapes, the painter uses textContent.
  function statusFor(dateStr, me, partner) {
    if (!partner) return { top: "Meet in the middle", line: "Just you for now.", showNudge: false };
    var meDone = dayFraction(dateStr, me) >= 1;
    var pDone = dayFraction(dateStr, partner) >= 1;
    var pName = Store.personName(partner);
    if (meDone && pDone) return { top: "In sync", line: "Both done. That is a sync day.", showNudge: false };
    if (pDone) return { top: "Meet in the middle", line: pName + " is done. Your move.", showNudge: false };
    if (meDone) return { top: "Meet in the middle", line: "You are done. " + pName + " is not yet.", showNudge: true };
    return { top: "Meet in the middle", line: "Meet in the middle.", showNudge: true };
  }

  // 36px avatar inside a conic-gradient progress ring in the person's color.
  function ringAvatarHTML(personId, frac, who) {
    var pct = Math.round(frac * 100);
    var name = Store.personName(personId) || "?";
    return '<span class="strip-person" data-who="' + who + '">' +
      '<span class="strip-ring js-ring" style="--c:' + Store.personColor(personId) + ";--p:" + pct + '" aria-hidden="true">' +
      '<span class="strip-initial">' + esc(name.charAt(0).toUpperCase()) + "</span></span>" +
      '<span class="strip-pct num js-pct" aria-label="' + esc(name) + ": " + pct + '%">' + pct + "%</span></span>";
  }

  // v2 Phase A strip, Calm glass: rings, percentages, center-meeting bar,
  // status line with the Nudge on the right. Not tappable.
  function syncStripHTML(dateStr, me, partner) {
    var myFrac = dayFraction(dateStr, me);
    var pFrac = partner ? dayFraction(dateStr, partner) : 0;
    var synced = partner ? Pod.inSync(dateStr, me, partner) : false;
    var st = statusFor(dateStr, me, partner);
    return '<section class="sync-strip' + (synced ? " synced" : "") + '" id="sync-strip"' +
      ' style="--you:' + Store.personColor(me) + ";--them:" + (partner ? Store.personColor(partner) : "transparent") + '"' +
      ' aria-label="Together today">' +
      '<div class="strip-row">' +
      ringAvatarHTML(me, myFrac, "me") +
      '<span class="strip-bar" role="img" aria-label="Progress toward the middle">' +
      '<span class="strip-fill strip-fill-me" style="width:' + (myFrac * 50) + '%"></span>' +
      '<span class="strip-fill strip-fill-partner" style="width:' + (pFrac * 50) + '%"></span>' +
      '<span class="strip-mid"></span></span>' +
      (partner ? ringAvatarHTML(partner, pFrac, "partner") : "") +
      "</div>" +
      '<div class="strip-foot">' +
      '<span class="strip-status' + (synced ? " is-sync" : "") + '">' + esc(st.line) + "</span>" +
      '<button class="nudge' + (st.showNudge ? "" : " hidden") + '" id="nudge-btn-strip">Nudge</button>' +
      "</div></section>";
  }

  function paintRing(strip, who, frac) {
    var wrap = strip.querySelector('.strip-person[data-who="' + who + '"]');
    if (!wrap) return;
    var pct = Math.round(frac * 100);
    wrap.querySelector(".js-ring").style.setProperty("--p", pct);
    var pctEl = wrap.querySelector(".js-pct");
    pctEl.textContent = pct + "%";
    var label = pctEl.getAttribute("aria-label") || "";
    pctEl.setAttribute("aria-label", label.replace(/\d+%$/, pct + "%"));
  }

  // Repaint the sync strip in place so ring and bar transitions play.
  function paintStrip(dateStr, me, partner) {
    var strip = document.getElementById("sync-strip");
    if (!strip) return;
    var myFrac = dayFraction(dateStr, me);
    var pFrac = partner ? dayFraction(dateStr, partner) : 0;
    var synced = partner ? Pod.inSync(dateStr, me, partner) : false;
    var st = statusFor(dateStr, me, partner);
    strip.classList.toggle("synced", synced);
    paintRing(strip, "me", myFrac);
    if (partner) paintRing(strip, "partner", pFrac);
    strip.querySelector(".strip-fill-me").style.width = (myFrac * 50) + "%";
    strip.querySelector(".strip-fill-partner").style.width = (pFrac * 50) + "%";
    var statusEl = strip.querySelector(".strip-status");
    statusEl.textContent = st.line;
    statusEl.classList.toggle("is-sync", synced);
    var nudgeEl = strip.querySelector("#nudge-btn-strip");
    if (nudgeEl) nudgeEl.classList.toggle("hidden", !st.showNudge);
  }

  /* ----- Nudge (Web Share; removed from the Sync screen per the brief) ----- */
  function nudge() {
    var partner = Store.personName(Store.partnerId());
    var text = "Your move on our habits. Today counts.";
    if (navigator.share) {
      navigator.share({ title: "Habit Tracker", text: text }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () {
        showToast("Copied. Send it to " + partner + ".");
      }).catch(function () {
        showToast(text);
      });
    } else {
      showToast(text);
    }
  }

  /* ----- the sync moment (on Today, not on Sync) ----- */
  function syncFlagKey(dateStr) { return "ht.syncShown." + dateStr; }

  function maybeSyncMoment(dateStr, me, partner) {
    if (dateStr !== localDate() || !partner) return;
    if (!Pod.inSync(dateStr, me, partner)) return;
    if (localStorage.getItem(syncFlagKey(dateStr))) return;
    // Defer if a sheet is open (e.g. steps sheet after Goal tap).
    if (document.querySelector(".sheet.show")) {
      pendingSync = { dateStr: dateStr, me: me, partner: partner };
      return;
    }
    try { localStorage.setItem(syncFlagKey(dateStr), "1"); } catch (e) {}
    playSyncMoment(me, partner);
  }

  // Calm glass: the drop-down pill is the whole sync moment.
  function playSyncMoment(me, partner) {
    var strip = document.getElementById("sync-strip");
    if (strip) strip.classList.add("synced");

    var drop = document.createElement("div");
    drop.className = "sync-drop";
    drop.setAttribute("role", "status");
    drop.innerHTML = '<span class="sd-avatars">' + avatarHTML(me, 26) + avatarHTML(partner, 26) + "</span>" +
      "<span>You're in sync today</span>";
    document.body.appendChild(drop);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () { drop.classList.add("go"); });
    });
    setTimeout(function () {
      drop.classList.remove("go");
      setTimeout(function () { drop.remove(); }, 600);
    }, 3200);
  }

  /* ----- tiles ----- */
  // Every tile: label (+ partner chip) on top, value, one caption, and a
  // 4px progress bar in --person along the bottom edge.
  function tileTopHTML(name, partner, pText) {
    return '<span class="t-top"><span class="t-label">' + esc(name) + "</span>" +
      (partner ? chipHTML(partner, pText) : "") + "</span>";
  }

  function waterLabel(habit, val, me, partner) {
    var target = habit.targets[me];
    var s = "Water: " + val + " of " + target + " glasses.";
    if (partner) {
      var pVal = Data.value(viewedDate(), partner, habit.id);
      s += " " + Store.personName(partner) + ": " +
        ((pVal === undefined || pVal === null) ? "not yet" : pVal + " of " + habit.targets[partner]) + ".";
    }
    return s + " Tap to log one glass. Long press to set an exact amount.";
  }

  function waterTile(habit, dateStr, me, partner) {
    var target = habit.targets[me];
    var val = Data.value(dateStr, me, habit.id) || 0;
    var pVal = partner ? Data.value(dateStr, partner, habit.id) : undefined;
    var pText = (pVal === undefined || pVal === null) ? "not yet" : pVal + "/" + habit.targets[partner];
    return '<button class="tile tile-water" data-habit="water" aria-label="' + esc(waterLabel(habit, val, me, partner)) + '">' +
      tileTopHTML("Water", partner, pText) +
      '<span class="t-main"><span class="t-num num js-wval">' + val + "</span>" +
      '<span class="t-cap">of ' + target + (target === 1 ? " glass" : " glasses") + "</span></span>" +
      barHTML(target ? val / target : 0) +
      "</button>";
  }

  function paintWater(tileEl, habit, val) {
    var me = Store.get("person");
    var target = habit.targets[me];
    tileEl.querySelector(".js-wval").textContent = val;
    paintBar(tileEl, target ? val / target : 0);
    tileEl.setAttribute("aria-label", waterLabel(habit, val, me, Store.partnerId()));
  }

  function weekCount(habit, dateStr, personId) {
    var monday = mondayOf(dateStr);
    var n = 0;
    for (var i = 0; i < 7; i++) {
      if (Data.value(addDays(monday, i), personId, habit.id)) n++;
    }
    return n;
  }

  function exerciseLabel(habit, n, me, partner) {
    var target = habit.targets[me];
    var s = "Exercise: " + n + " of " + target + " this week.";
    if (partner) s += " " + Store.personName(partner) + ": " + weekCount(habit, viewedDate(), partner) + " of " + habit.targets[partner] + ".";
    return s + " Tap to toggle today. Long press to edit the week.";
  }

  function exerciseTile(habit, dateStr, me, partner) {
    var target = habit.targets[me];
    var n = weekCount(habit, dateStr, me);
    var pn = partner ? weekCount(habit, dateStr, partner) : 0;
    var dots = "";
    for (var i = 0; i < target; i++) dots += '<i class="x-dot' + (i < n ? " on" : "") + '"></i>';
    return '<button class="tile tile-ex" data-habit="exercise" aria-label="' + esc(exerciseLabel(habit, n, me, partner)) + '">' +
      tileTopHTML("Exercise", partner, pn + "/" + habit.targets[partner]) +
      '<span class="t-main"><span class="t-numrow"><span class="t-num num js-xval">' + n + "</span>" +
      '<span class="x-dots" aria-hidden="true">' + dots + "</span></span>" +
      '<span class="t-cap">of ' + target + " this week</span></span>" +
      barHTML(target ? n / target : 0) +
      "</button>";
  }

  function paintExercise(tileEl, habit, n) {
    var target = habit.targets[Store.get("person")];
    tileEl.querySelector(".js-xval").textContent = n;
    tileEl.querySelectorAll(".x-dot").forEach(function (d, i) { d.classList.toggle("on", i < n); });
    paintBar(tileEl, target ? n / target : 0);
    tileEl.setAttribute("aria-label", exerciseLabel(habit, n, Store.get("person"), Store.partnerId()));
  }

  function stepsLabel(habit, val, me, partner) {
    var s = "Steps: " + fmtStepsFull(val) + " of " + Number(habit.targets[me]).toLocaleString() + " goal.";
    if (partner) {
      var pVal = Data.value(viewedDate(), partner, habit.id);
      s += " " + Store.personName(partner) + ": " + ((pVal === undefined || pVal === null) ? "not yet" : fmtStepsFull(pVal)) + ".";
    }
    return s + " Tap to log steps.";
  }

  function stepsTile(habit, dateStr, me, partner) {
    var target = habit.targets[me];
    var val = Data.value(dateStr, me, habit.id);
    var pVal = partner ? Data.value(dateStr, partner, habit.id) : undefined;
    var pText = (pVal === undefined || pVal === null) ? "not yet" : fmtSteps(pVal);
    var progress = (val === undefined || val === null || !target) ? 0 : val / target;
    return '<button class="tile tile-steps" data-habit="steps" aria-label="' + esc(stepsLabel(habit, val, me, partner)) + '">' +
      tileTopHTML("Steps", partner, pText) +
      '<span class="t-main"><span class="t-num num js-sval">' + fmtStepsFull(val) + "</span>" +
      '<span class="t-cap">of ' + Number(target).toLocaleString("en-US") + " steps</span></span>" +
      barHTML(progress) +
      "</button>";
  }

  function paintSteps(tileEl, habit, val) {
    var me = Store.get("person");
    var target = habit.targets[me];
    tileEl.querySelector(".js-sval").textContent = fmtStepsFull(val);
    paintBar(tileEl, (val === undefined || val === null || !target) ? 0 : val / target);
    tileEl.setAttribute("aria-label", stepsLabel(habit, val, me, Store.partnerId()));
  }

  function checkState(habit, val) {
    var inverted = !!habit.inverted;
    // Inverted checks (Sugar-free) default to clean (true) when no value stored
    var done = (val === undefined || val === null) ? inverted : !!val;
    var label, cap;
    if (inverted) {
      label = habit.name + (done ? ": clean. Tap if you had sugar." : ": had sugar. Tap to mark clean.");
      cap = done ? "clean" : "had sugar";
    } else {
      label = habit.name + (done ? ": done. Tap to undo." : ": not done. Tap to mark done.");
      cap = done ? "done" : "tap to check";
    }
    return { done: done, label: label, cap: cap };
  }

  function genericTile(habit, dateStr, me, partner) {
    var target = habit.targets[me] || 1;
    var val = Data.value(dateStr, me, habit.id);
    var isCheck = habit.type === "check";
    var pVal = partner ? Data.value(dateStr, partner, habit.id) : undefined;
    var pTarget = partner ? (habit.targets[partner] || 1) : 1;
    var pText;
    var pInverted = !!habit.inverted;
    if (pVal === undefined || pVal === null) {
      // Inverted checks default to clean (true) when no value stored
      if (isCheck && pInverted) pText = "clean";
      else pText = "0/" + pTarget;
    }
    else if (isCheck) {
      if (pInverted) pText = pVal ? "clean" : "had sugar";
      else pText = pVal ? "done" : "not yet";
    }
    else pText = pVal + "/" + pTarget;

    if (isCheck) {
      var cs = checkState(habit, val);
      return '<button class="tile tile-check' + (habit.inverted ? " tile-inverted" : "") + '" data-habit="' + esc(habit.id) + '" aria-label="' + esc(cs.label) + '">' +
        tileTopHTML(habit.name, partner, pText) +
        '<span class="t-main"><span class="check-circle js-gcheck' + (cs.done ? " on" : "") + '" aria-hidden="true">' + ICONS.badge + "</span>" +
        '<span class="t-cap js-gcap">' + cs.cap + "</span></span>" +
        barHTML(cs.done ? 1 : 0) +
        "</button>";
    }

    val = val || 0;
    var unit = habit.unit || "times";
    var clabel = habit.name + ": " + val + " of " + target + ". Tap to add one.";
    return '<button class="tile tile-generic" data-habit="' + esc(habit.id) + '" aria-label="' + esc(clabel) + '">' +
      tileTopHTML(habit.name, partner, pText) +
      '<span class="t-main"><span class="t-num num js-gval">' + val + "</span>" +
      '<span class="t-cap">of ' + target + " " + esc(unit) + "</span></span>" +
      barHTML(val / target) +
      "</button>";
  }

  function paintGeneric(tileEl, habit, val) {
    var me = Store.get("person");
    var target = habit.targets[me] || 1;
    if (habit.type === "check") {
      var cs = checkState(habit, val);
      var circle = tileEl.querySelector(".js-gcheck");
      if (circle) circle.classList.toggle("on", cs.done);
      var cap = tileEl.querySelector(".js-gcap");
      if (cap) cap.textContent = cs.cap;
      paintBar(tileEl, cs.done ? 1 : 0);
      tileEl.setAttribute("aria-label", cs.label);
      return;
    }
    val = val || 0;
    tileEl.querySelector(".js-gval").textContent = val;
    paintBar(tileEl, val / target);
    tileEl.setAttribute("aria-label", habit.name + ": " + val + " of " + target + ". Tap to add one.");
  }

  /* ----- Meals (v2 Phase B): log what/when/tags, day signal line ----- */
  var MEAL_TAGS = ["veg", "protein", "grain", "fruit", "fried", "sweet", "drink"];
  var MEAL_TAG_LABELS = { veg: "Veg", protein: "Protein", grain: "Grain", fruit: "Fruit", fried: "Fried", sweet: "Sweet", drink: "Drink" };

  // Get meals array for a person/date from cached entries
  function getMeals(dateStr, personId) {
    var entries = Data.getCached(dateStr, personId) || {};
    return entries.meals || [];
  }

  // Compute the day signal from meals. Returns { line, dot, lateDinner }.
  // Dot: green (veg/fruit in >=2 AND fried/sweet <=1), amber (one missed), grey (<2 meals).
  function mealSignal(meals) {
    var n = meals.length;
    if (n < 2) return { line: n === 0 ? "No meals logged" : "1 meal logged", dot: "grey", lateDinner: false };
    var vegFruit = 0, friedSweet = 0;
    var friedCount = 0, sweetCount = 0;
    meals.forEach(function (m) {
      var tags = m.tags || [];
      var hasVegFruit = tags.indexOf("veg") >= 0 || tags.indexOf("fruit") >= 0;
      if (hasVegFruit) vegFruit++;
      if (tags.indexOf("fried") >= 0) { friedSweet++; friedCount++; }
      if (tags.indexOf("sweet") >= 0) { friedSweet++; sweetCount++; }
    });
    var green = (vegFruit >= 2) && (friedSweet <= 1);
    var dot = green ? "green" : "amber";
    var parts = [n + " meals", "veg in " + vegFruit];
    if (friedCount > 0 || sweetCount > 0) {
      var indulgences = [];
      if (friedCount > 0) indulgences.push(friedCount + " fried");
      if (sweetCount > 0) indulgences.push(sweetCount + " sweet");
      parts.push(indulgences.join(", "));
    }
    // Late dinner: last meal after 9pm
    var lateDinner = false;
    if (meals.length > 0) {
      var last = meals[meals.length - 1];
      if (last.t) {
        var parts_t = last.t.split(":");
        var hour = parseInt(parts_t[0], 10);
        if (hour >= 21) lateDinner = true;
      }
    }
    return { line: parts.join(" · "), dot: dot, lateDinner: lateDinner };
  }

  // Get last 8 unique meal names across all cached dates for the person
  function getRecentMeals(personId) {
    var seen = {}, recents = [];
    // Check last 30 days
    var today = localDate();
    for (var i = 0; i < 30 && recents.length < 8; i++) {
      var d = addDays(today, -i);
      var meals = getMeals(d, personId);
      meals.forEach(function (m) {
        if (m.what && !seen[m.what] && recents.length < 8) {
          seen[m.what] = true;
          recents.push({ what: m.what, tags: m.tags || [] });
        }
      });
    }
    return recents;
  }

  function mealsTile(dateStr, me, partner) {
    var meals = getMeals(dateStr, me);
    var sig = mealSignal(meals);
    var dotClass = "meal-dot-" + sig.dot;
    var line = sig.line + (sig.lateDinner ? " · late dinner" : "");
    return '<button class="tile tile-meals" data-habit="meals" aria-label="Meals. ' + esc(line) + '. Tap to log a meal.">' +
      '<span class="t-top"><span class="t-label">Meals</span>' +
      '<span class="meal-dot ' + dotClass + '" aria-hidden="true"></span></span>' +
      '<span class="t-main"><span class="t-cap meal-signal">' + esc(line) + "</span></span>" +
      "</button>";
  }

  // v2 Phase B: Meal logging sheet
  function openMealSheet(dateStr, me) {
    var now = new Date();
    var timeStr = ("0" + now.getHours()).slice(-2) + ":" + ("0" + now.getMinutes()).slice(-2);
    var recents = getRecentMeals(me);
    var selectedTags = [];
    var selectedWhat = "";
    var selectedTime = timeStr;

    var chipsHTML = recents.map(function (r) {
      return '<button class="meal-chip" data-what="' + esc(r.what) + '" data-tags="' + esc(r.tags.join(",")) + '">' + esc(r.what) + "</button>";
    }).join("");

    var tagsHTML = MEAL_TAGS.map(function (t) {
      return '<button class="meal-tag" data-tag="' + t + '" aria-pressed="false">' + MEAL_TAG_LABELS[t] + "</button>";
    }).join("");

    var body = '<div class="meal-form">' +
      '<label class="meal-label">When</label>' +
      '<button class="meal-time" id="meal-time-btn">' + timeStr + ' <span aria-hidden="true">▾</span></button>' +
      '<label class="meal-label">What</label>' +
      '<input class="meal-what" id="meal-what-input" type="text" placeholder="What did you eat?" autocomplete="off">' +
      (chipsHTML ? '<div class="meal-chips">' + chipsHTML + "</div>" : "") +
      '<label class="meal-label">What was in it</label>' +
      '<div class="meal-tags">' + tagsHTML + "</div>" +
      '<button class="btn meal-save" id="meal-save-btn">Log meal</button>' +
      "</div>";

    var sheet = openSheet("Log a meal", null, body);

    // Time button: simple prompt for now (wheel picker is future work)
    var timeBtn = document.getElementById("meal-time-btn");
    var whatInput = document.getElementById("meal-what-input");
    if (timeBtn) timeBtn.addEventListener("click", function () {
      var t = prompt("Time (HH:MM):", selectedTime);
      if (t && /^\d{1,2}:\d{2}$/.test(t)) {
        selectedTime = t;
        timeBtn.innerHTML = esc(t) + ' <span aria-hidden="true">▾</span>';
      }
    });

    // Recent chips fill the form
    document.querySelectorAll(".meal-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        selectedWhat = chip.getAttribute("data-what");
        whatInput.value = selectedWhat;
        var tags = (chip.getAttribute("data-tags") || "").split(",").filter(Boolean);
        selectedTags = tags;
        document.querySelectorAll(".meal-tag").forEach(function (tagBtn) {
          var on = tags.indexOf(tagBtn.getAttribute("data-tag")) >= 0;
          tagBtn.setAttribute("aria-pressed", on ? "true" : "false");
          tagBtn.classList.toggle("on", on);
        });
      });
    });

    // Tag multi-select
    document.querySelectorAll(".meal-tag").forEach(function (tagBtn) {
      tagBtn.addEventListener("click", function () {
        var tag = tagBtn.getAttribute("data-tag");
        var idx = selectedTags.indexOf(tag);
        if (idx >= 0) selectedTags.splice(idx, 1);
        else selectedTags.push(tag);
        var on = selectedTags.indexOf(tag) >= 0;
        tagBtn.setAttribute("aria-pressed", on ? "true" : "false");
        tagBtn.classList.toggle("on", on);
      });
    });

    // Save
    var saveBtn = document.getElementById("meal-save-btn");
    if (saveBtn) saveBtn.addEventListener("click", function () {
      var what = whatInput.value.trim() || selectedWhat;
      if (!what) {
        showToast("Add what you ate.");
        return;
      }
      var meals = getMeals(dateStr, me).slice();
      var prevMeals = getMeals(dateStr, me).slice();
      meals.push({ t: selectedTime, what: what, tags: selectedTags.slice() });
      // Sort by time
      meals.sort(function (a, b) { return (a.t || "").localeCompare(b.t || ""); });
      Data.saveEntry(dateStr, me, "meals", meals, prevMeals, {
        pending: function (on) {},
        done: function () {
          sheet.close();
          // Repaint the meals tile
          var tile = document.querySelector('.tile[data-habit="meals"]');
          if (tile) {
            var sig = mealSignal(meals);
            var line = sig.line + (sig.lateDinner ? " · late dinner" : "");
            tile.querySelector(".meal-signal").textContent = line;
            tile.querySelector(".meal-dot").className = "meal-dot meal-dot-" + sig.dot;
            tile.setAttribute("aria-label", "Meals. " + line + ". Tap to log a meal.");
          }
          showToast("Meal logged.");
        }
      });
    });
  }

  function tilesHTML(habits, dateStr, me, partner) {
    var order = ["water", "exercise", "steps"];
    var visible = habits.filter(function (h) { return !h.archived; });
    var sorted = visible.slice().sort(function (a, b) {
      var ai = order.indexOf(a.id), bi = order.indexOf(b.id);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
    var tiles = sorted.map(function (h) {
      if (h.id === "water") return waterTile(h, dateStr, me, partner);
      if (h.id === "exercise") return exerciseTile(h, dateStr, me, partner);
      if (h.id === "steps") return stepsTile(h, dateStr, me, partner);
      return genericTile(h, dateStr, me, partner);
    }).join("");
    // v2 Phase B: Meals tile appended after habit tiles
    tiles += mealsTile(dateStr, me, partner);
    return tiles;
  }

  /* ----- exact water sheet (existing behavior, new tile hookup) ----- */
  function openExactWater(habit, target, current) {
    var step = habit.step || 1;
    var presets = habit.presets || [2, 4, 6, 8];
    var cur = current || 0;
    var tileEl = document.querySelector('.tile[data-habit="water"]');
    var s = openSheet("Water glasses", null,
      '<div class="numrow"><span class="num js-water-num">' + cur + "</span>" +
      '<span class="numcap">' + (cur === 1 ? "glass" : "glasses") + "</span></div>" +
      '<div class="stepper">' +
      '<button class="js-minus" aria-label="Drink one less">&minus;</button>' +
      '<button class="js-plus" aria-label="Drink one more">+</button></div>' +
      '<div class="chiprow" role="group" aria-label="Common amounts">' +
      presets.map(function (p) { return '<button class="qchip" data-v="' + p + '">' + p + "</button>"; }).join("") +
      "</div>" +
      '<button class="btn js-done">Done</button>');
    var body = s.el;
    var num = body.querySelector(".js-water-num");
    var cap = body.querySelector(".numcap");
    var shown = cur;
    function paint() {
      num.textContent = shown;
      cap.textContent = shown === 1 ? "glass" : "glasses";
    }
    body.querySelector(".js-minus").onclick = function () { if (shown > 0) { shown -= step; paint(); } };
    body.querySelector(".js-plus").onclick = function () { shown += step; paint(); };
    body.querySelectorAll(".qchip").forEach(function (c) {
      c.onclick = function () { shown = Number(c.dataset.v); paint(); };
    });
    body.querySelector(".js-done").onclick = function () {
      if (shown !== cur && tileEl) {
        logTile(habit, shown, tileEl, function (v) { paintWater(tileEl, habit, v); });
      }
      s.close();
    };
  }

  /* ----- exercise history sheet (long-press): seven days, edit window kept ----- */
  function openExerciseHistory(habit, target) {
    var me = Store.get("person");
    var dateStr = viewedDate();
    var monday = mondayOf(dateStr);
    var tileEl = document.querySelector('.tile[data-habit="exercise"]');
    var minDay = addDays(localDate(), -MAX_BACK);
    var rows = "";
    for (var i = 0; i < 7; i++) {
      (function (i) {
        var d = addDays(monday, i);
        var done = !!Data.value(d, me, habit.id);
        var locked = d > localDate() || d < minDay;
        rows += '<div class="weekrow">' +
          '<span class="weekday">' + new Date(d + "T12:00:00").toLocaleDateString([], { weekday: "long" }) + "</span>" +
          '<button class="wtog' + (done ? " on" : "") + '"' +
          (locked ? " disabled" : "") +
          ' data-day="' + d + '" aria-label="' + (done ? "Mark not done" : "Mark done") + '">' +
          (done ? ICONS.check : "+") + "</button></div>";
      })(i);
    }
    var s = openSheet("Exercise this week", null, '<div class="weeklist">' + rows + "</div>");
    s.el.querySelectorAll(".wtog").forEach(function (btn) {
      btn.onclick = function () {
        var d = btn.dataset.day;
        var was = !!Data.value(d, me, habit.id);
        var val = was ? 0 : 1;
        var nPrev = weekCount(habit, viewedDate(), me);
        var n = nPrev + (val ? 1 : -1);
        if (tileEl) {
          logTile(habit, val, tileEl, function (v) {
            if (d === viewedDate()) paintExercise(tileEl, habit, v ? n : nPrev);
          }, d);
        }
        btn.classList.toggle("on", !!val);
        btn.setAttribute("aria-label", val ? "Mark not done" : "Mark done");
        btn.innerHTML = val ? ICONS.check : "+";
      };
    });
    void target;
  }

  /* ----- steps sheet ----- */
  function openStepsSheet(habit, target, current) {
    var cur = current || 0;
    var tileEl = document.querySelector('.tile[data-habit="steps"]');
    var shown = cur;
    var s = openSheet("Steps", null,
      '<div class="numrow"><span class="num js-steps-num">' + cur.toLocaleString() + "</span>" +
      '<span class="numcap">steps</span></div>' +
      '<div class="chiprow" role="group" aria-label="Quick add">' +
      '<button class="qchip" data-add="1000">+1k</button>' +
      '<button class="qchip" data-add="2500">+2.5k</button>' +
      '<button class="qchip" data-add="-1000">&minus;1k</button>' +
      '<button class="qchip" data-set="' + target + '">Goal</button>' +
      "</div>" +
      '<button class="linkbtn js-exact-toggle">Enter exact number.</button>' +
      '<div class="exactrow hidden">' +
      '<input class="exactinput" type="number" inputmode="numeric" min="0" placeholder="e.g. 7500" aria-label="Exact step count">' +
      '<button class="btn js-exact-set">Set</button></div>' +
      '<button class="btn js-done">Done</button>');
    var body = s.el;
    var num = body.querySelector(".js-steps-num");
    function paint() { num.textContent = shown.toLocaleString(); }
    function write(v) {
      if (v < 0 || v === shown || !tileEl) return;
      shown = v;
      paint();
      logTile(habit, shown, tileEl, function (nv) { paintSteps(tileEl, habit, nv); });
    }
    body.querySelectorAll(".qchip").forEach(function (c) {
      c.onclick = function () {
        if (c.dataset.add) write(shown + Number(c.dataset.add));
        else write(Number(c.dataset.set));
      };
    });
    body.querySelector(".js-exact-toggle").onclick = function () {
      body.querySelector(".exactrow").classList.toggle("hidden");
    };
    body.querySelector(".js-exact-set").onclick = function () {
      var v = Number(body.querySelector(".exactinput").value);
      if (!Number.isFinite(v) || v < 0) return;
      write(Math.round(v));
    };
    body.querySelector(".js-done").onclick = function () { s.close(); };
  }

  /* ----- tile interactions ----- */

  // A long-press opens a sheet while the finger is still down. Releasing the
  // finger may then fire a click on whatever the sheet put under it, which
  // could toggle a control by accident. Swallow only a click that lands within
  // 400ms of that release. iOS often sends no click at all after a 500ms hold,
  // so a guard that waited longer would eat the user's first real tap.
  function swallowReleaseClick() {
    var windowTimer = null;
    var safety = null;
    function disarm() {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointerup", onRelease, true);
      document.removeEventListener("pointercancel", disarm, true);
      clearTimeout(windowTimer);
      clearTimeout(safety);
    }
    function onClick(e) {
      disarm();
      e.stopPropagation();
      e.preventDefault();
    }
    function onRelease() {
      document.removeEventListener("pointerup", onRelease, true);
      windowTimer = setTimeout(disarm, 400);
    }
    document.addEventListener("click", onClick, true);
    document.addEventListener("pointerup", onRelease, true);
    document.addEventListener("pointercancel", disarm, true);
    // Never stay armed if the release is somehow missed.
    safety = setTimeout(disarm, 5000);
  }

  // Last time anything scrolled (window or an inner scroller). A tap that
  // lands while momentum scrolling is just the finger stopping the scroll,
  // not a +1.
  var lastScrollAt = 0;
  window.addEventListener("scroll", function () { lastScrollAt = Date.now(); }, { passive: true, capture: true });

  function bindTile(el, habit) {
    var press = { timer: null, long: false, moved: false, x: 0, y: 0, id: null, at: 0 };

    function armLongPress(fn) {
      press.long = false;
      clearTimeout(press.timer);
      press.timer = setTimeout(function () {
        press.long = true;
        swallowReleaseClick();
        fn();
        el.classList.remove("pressing");
      }, 500);
    }
    function clearPress() {
      clearTimeout(press.timer);
      el.classList.remove("pressing");
    }

    el.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      press.moved = false;
      press.long = false;
      press.at = Date.now();
      // Touching down mid-scroll only stops the momentum; no press feedback.
      if (press.at - lastScrollAt < 150) press.moved = true;
      else el.classList.add("pressing");
      press.x = e.clientX; press.y = e.clientY; press.id = e.pointerId;
      if (press.moved) return;
      if (habit.id === "water") {
        armLongPress(function () {
          var me = Store.get("person");
          openExactWater(habit, habit.targets[me], Data.value(viewedDate(), me, habit.id) || 0);
        });
      } else if (habit.id === "exercise") {
        armLongPress(function () {
          openExerciseHistory(habit, habit.targets[Store.get("person")]);
        });
      } else if (habit.id !== "steps") {
        // Generic habit long-press: set exact value
        armLongPress(function () {
          var me = Store.get("person");
          openExactGeneric(habit, habit.targets[me] || 1, Data.value(viewedDate(), me, habit.id) || 0);
        });
      }
    });
    el.addEventListener("pointermove", function (e) {
      if (press.id !== e.pointerId || press.moved) return;
      // Past 10px it's a drag or scroll: cancel both the tap and the long-press.
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) {
        press.moved = true;
        clearPress();
      }
    });
    el.addEventListener("pointerup", function (e) {
      clearPress();
      if (press.long || press.moved || press.id !== e.pointerId) return;
      press.id = null;
      // Something scrolled during (or just before) this press: not a tap.
      if (Date.now() - lastScrollAt < 150 || lastScrollAt >= press.at) return;
      activateTile(el, habit, e);
    });
    // The browser took the gesture over (usually a scroll): treat as cancel.
    el.addEventListener("pointercancel", function () {
      press.moved = true;
      press.id = null;
      clearPress();
    });
    el.addEventListener("pointerleave", function () { el.classList.remove("pressing"); });
    el.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      activateTile(el, habit, e);
    });
    el.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  }

  function activateTile(el, habit, e) {
    var me = Store.get("person");
    var d = viewedDate();
    if (habit.id === "water") {
      var prev = Data.value(d, me, habit.id) || 0;
      var val = prev + (habit.step || 1);
      logTile(habit, val, el, function (v) { paintWater(el, habit, v); });
      return;
    }
    if (habit.id === "exercise") {
      var was = !!Data.value(d, me, habit.id);
      var xval = was ? 0 : 1;
      var nPrev = weekCount(habit, d, me);
      var n = nPrev + (xval ? 1 : -1);
      logTile(habit, xval, el, function (v) { paintExercise(el, habit, v ? n : nPrev); });
      return;
    }
    if (habit.id === "steps") {
      openStepsSheet(habit, habit.targets[me], Data.value(d, me, habit.id) || 0);
      return;
    }
    // Generic habit: check type toggles, count type adds +1
    if (habit.type === "check") {
      var graw = Data.value(d, me, habit.id);
      // Inverted checks (Sugar-free) default to true (clean) when no value stored
      var gwas = (graw === undefined || graw === null) ? (!!habit.inverted) : !!graw;
      var gval = gwas ? 0 : 1;
      logTile(habit, gval, el, function (v) { paintGeneric(el, habit, v); });
    } else {
      var gprev = Data.value(d, me, habit.id) || 0;
      var gnext = gprev + 1;
      logTile(habit, gnext, el, function (v) { paintGeneric(el, habit, v); });
    }
  }

  function openExactGeneric(habit, target, current) {
    var cur = current || 0;
    var tileEl = document.querySelector('.tile[data-habit="' + habit.id + '"]');
    var unit = habit.unit || "times";
    var s = openSheet(esc(habit.name), null,
      '<div class="numrow"><span class="num js-g-num">' + cur + "</span>" +
      '<span class="numcap">' + esc(unit) + "</span></div>" +
      '<div class="stepper">' +
      '<button class="js-minus" aria-label="One less">&minus;</button>' +
      '<button class="js-plus" aria-label="One more">+</button></div>' +
      '<button class="btn js-done">Done</button>');
    var body = s.el;
    var num = body.querySelector(".js-g-num");
    var shown = cur;
    function paint() { num.textContent = shown; }
    body.querySelector(".js-minus").onclick = function () { if (shown > 0) { shown -= 1; paint(); } };
    body.querySelector(".js-plus").onclick = function () { shown += 1; paint(); };
    body.querySelector(".js-done").onclick = function () {
      if (shown !== cur && tileEl) {
        logTile(habit, shown, tileEl, function (v) { paintGeneric(tileEl, habit, v); });
      }
      s.close();
    };
  }

  /* ----- header ----- */
  // 34px title with the gear on the right; the date line under it doubles
  // as the compact day navigator (‹ date ›).
  function headerHTML(dateStr) {
    var past = dateStr !== localDate();
    var title = past ? dateLabel() : "Today";
    return '<header class="today-head">' +
      '<div class="today-titlerow">' +
      '<h1 class="screen-title">' + esc(title) + "</h1>" +
      '<button class="gear-btn" id="today-gear" aria-label="Habits and settings">' + ICONS.gear + "</button>" +
      "</div>" +
      '<div class="date-nav">' +
      '<button class="dnav" data-nav="-1" aria-label="Previous day"' + (dateOffset <= -MAX_BACK ? " disabled" : "") + ">&#8249;</button>" +
      '<span class="screen-sub top-date">' + esc(fullDateLabel()) + "</span>" +
      '<button class="dnav" data-nav="1" aria-label="Next day"' + (dateOffset >= 0 ? " disabled" : "") + ">&#8250;</button>" +
      "</div>" +
      (past ? '<button class="back-pill" id="back-today">Back to today</button>' : "") +
      "</header>";
  }

  /* ----- render ----- */

  // Placeholder blocks while check-ins load. Nothing is painted from the
  // cache until the fetch below resolves: painting early shows 0/"not
  // yet", and a tap would then overwrite the real totals.
  function skeletonHTML() {
    return '<div class="skel-wrap" aria-label="Loading today">' +
      '<div class="skel skel-head"></div>' +
      '<div class="skel skel-card"></div>' +
      '<div class="skel-grid">' +
      '<div class="skel skel-tile"></div>' +
      '<div class="skel skel-tile"></div>' +
      '<div class="skel skel-tile"></div>' +
      '<div class="skel skel-tile"></div>' +
      "</div></div>";
  }

  var renderToken = 0;
  var pendingSync = null; // Deferred sync moment args when a sheet is open

  function render() {
    var root = document.getElementById("today-root");
    var me = Store.get("person");
    var habitsDoc = Store.get("habits");
    if (!root || !me || !habitsDoc) return;
    var dateStr = viewedDate();
    var partner = Store.partnerId();
    var token = ++renderToken;

    root.innerHTML = skeletonHTML();

    var fetches = [Data.fetchCheckin(dateStr, me)];
    if (partner) fetches.push(Data.fetchCheckin(dateStr, partner));
    var monday = mondayOf(dateStr);
    for (var i = 0; i < 7; i++) {
      var d = addDays(monday, i);
      fetches.push(Data.fetchCheckin(d, me));
      if (partner) fetches.push(Data.fetchCheckin(d, partner));
    }

    Promise.all(fetches).then(function () {
      if (token !== renderToken) return; // stale render (fast day switching)
      paint(dateStr, me, partner, habitsDoc.habits);
    }, function (err) {
      if (token !== renderToken) return; // stale render (fast day switching)
      var status = err && err.status;
      if (status === 401 || status === 403) {
        // Bad/revoked token: reload so the boot path restarts onboarding.
        window.location.reload();
        return;
      }
      // Network or server failure: paint from cache when we have check-ins
      // (the offline banner covers the offline case); otherwise show Retry
      // instead of painting empty values.
      if (Data.getCached(dateStr, me) !== null) {
        paint(dateStr, me, partner, habitsDoc.habits);
      } else {
        root.innerHTML = '<div class="load-error"><p>Couldn\'t load today\'s check-ins. Check your connection.</p>' +
          '<button class="btn" id="today-retry">Retry</button></div>';
        document.getElementById("today-retry").addEventListener("click", render);
      }
    });
  }

  function paint(dateStr, me, partner, habitList) {
    var root = document.getElementById("today-root");
    if (!root) return;
    paintInkVars();

    root.innerHTML =
      headerHTML(dateStr) +
      syncStripHTML(dateStr, me, partner) +
      '<div class="tile-grid">' + tilesHTML(habitList, dateStr, me, partner) + "</div>" +
      '<button class="add-habit js-add-habit" aria-label="Add a habit">' +
      ICONS.plus + "<span>Add Habit</span></button>";

    root.querySelectorAll(".dnav").forEach(function (b) {
      b.addEventListener("click", function () { setDay(dateOffset + Number(b.dataset.nav)); });
    });
    var backBtn = document.getElementById("back-today");
    if (backBtn) backBtn.addEventListener("click", function () { setDay(0); });

    var gear = document.getElementById("today-gear");
    if (gear) gear.addEventListener("click", function () {
      if (window.App && typeof App.openSettings === "function") App.openSettings();
    });

    root.querySelectorAll(".tile").forEach(function (el) {
      var habit = habitList.filter(function (h) { return h.id === el.dataset.habit; })[0];
      if (habit) bindTile(el, habit);
    });

    // v2 Phase B: Meals tile opens the meal logging sheet
    var mealsTileEl = root.querySelector('.tile[data-habit="meals"]');
    if (mealsTileEl) mealsTileEl.addEventListener("click", function () {
      openMealSheet(dateStr, me);
    });

    var nudgeStripBtn = document.getElementById("nudge-btn-strip");
    if (nudgeStripBtn) nudgeStripBtn.addEventListener("click", nudge);

    var addBtn = root.querySelector(".js-add-habit");
    if (addBtn) addBtn.addEventListener("click", function () {
      if (window.Manage && typeof Manage.addSheet === "function") Manage.addSheet();
    });

    // Foreground case: the day became synced elsewhere and the moment has
    // not shown on this device yet. The per-day flag keeps it to once.
    maybeSyncMoment(dateStr, me, partner);
  }


  /* ----- init ----- */
  function init() {
    render();
  }

  // Swipe left/right on the main area to change days (mobile friendliness).
  // Listeners stay passive so vertical scrolling never waits on JS; the
  // decision is made once, on touchend. iOS convention: swipe right (finger
  // moves left to right) goes back a day, swipe left goes forward toward
  // today (setDay clamps at today).
  (function attachSwipe() {
    var root = document.getElementById("today-root");
    if (!root) return;
    var startX = null, startY = null, tracking = false;
    root.addEventListener("touchstart", function (e) {
      if (!e.touches || e.touches.length !== 1) { tracking = false; return; }
      startX = e.touches[0].clientX; startY = e.touches[0].clientY; tracking = true;
    }, { passive: true });
    root.addEventListener("touchend", function (e) {
      if (!tracking) return;
      tracking = false;
      var t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      var dx = t.clientX - startX;
      var dy = t.clientY - startY;
      // Clearly horizontal only: long enough and at least twice as wide as tall.
      if (Math.abs(dx) <= 60 || Math.abs(dx) <= 2 * Math.abs(dy)) return;
      if (dx > 0) setDay(dateOffset - 1); else setDay(dateOffset + 1);
    }, { passive: true });
    root.addEventListener("touchcancel", function () { tracking = false; }, { passive: true });
  })();

  return {
    init: init,
    render: render,
    habitMet: habitMet,
    dayFraction: dayFraction,
    ringSVG: ringSVG,
    paintInkVars: paintInkVars,
    clearToast: clearToast
  };
})();
