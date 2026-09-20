/* Today screen (Phase 2 rebuild).
   Together card + tile grid. Presentation only: the save pipeline
   (Data.saveEntry with undo/retry), the sheets, and the Web Share nudge
   keep their existing behavior. Vanilla JS, no build step. */

var Today = (function () {
  var dateOffset = 0; // 0 = today, down to -2 for late logging
  var MAX_BACK = 2;
  var firstRender = true;

  var TINTS = { water: "#0A84FF", exercise: "#BF5AF2", steps: "#30D158" };
  var EXTRA_TINTS = ["#5AC8FA", "#5E5CE6", "#FF375F"]; /* teal, indigo, pink, in order */

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

  function greeting() {
    var h = new Date().getHours();
    var word = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
    return "Good " + word + ", " + Store.personName(Store.get("person"));
  }

  /* ----- sync helpers (shared with the Pod screen) ----- */
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

  /* ----- entrance (first paint only) ----- */
  function enterCls(i) { return firstRender ? " press-in" : ""; }
  function enterDelay(i) { return firstRender ? ' style="--enter-d:' + (i * 60) + 'ms"' : ""; }

  /* ----- small builders ----- */
  function avatarHTML(personId, px) {
    var name = Store.personName(personId) || "?";
    var color = Store.personColor(personId);
    return '<span class="avatar" style="width:' + px + "px;height:" + px + "px;background:" + color + ';font-size:' + Math.round(px * 0.45) + 'px" aria-hidden="true">' +
      esc(name.charAt(0).toUpperCase()) + "</span>";
  }

  // Seamless looping wave: 240-unit path shown at 200% width,
  // translated -50% per loop.
  function waveSVG(fill, extra) {
    return '<svg class="wave ' + (extra || "") + '" viewBox="0 0 240 10" preserveAspectRatio="none" aria-hidden="true">' +
      '<path d="M0 5 Q15 1 30 5 T60 5 T90 5 T120 5 T150 5 T180 5 T210 5 T240 5 V10 H0 Z" fill="' + fill + '"/></svg>';
  }

  function chipHTML(personId, valueText, small) {
    return '<span class="t-chip' + (small ? " t-chip-sm" : "") + '">' + avatarHTML(personId, small ? 18 : 22) +
      '<span class="t-chip-val num">' + esc(valueText) + "</span></span>";
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

  function glowFor(personId) {
    return Colors.get(Store.getColorId(personId)).base + "8C"; // 55% alpha
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
    water: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c3 4.2 6 7.6 6 11a6 6 0 1 1-12 0c0-3.4 3-6.8 6-11z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    exercise: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    steps: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l2.5 7 4-15 2.5 8H21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
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

  // After a successful write: repaint the Together card for the viewed date
  // and check the sync moment.
  function afterWrite(dateStr, personId) {
    var partner = Store.partnerId();
    var vd = viewedDate();
    paintTogether(vd, personId, partner);
    maybeSyncMoment(vd, personId, partner);
  }

  /* ----- Together card ----- */
  function sphereHTML(personId, frac, waveCls, label, who) {
    var pct = Math.round(frac * 100);
    return '<div class="sphere-wrap" data-who="' + who + '">' +
      '<div class="sphere" style="' + Colors.liquidVars(Store.getColorId(personId)) + "--glow:" + glowFor(personId) + '">' +
      '<span class="sphere-liquid' + (pct === 0 ? " empty" : "") + '" style="height:' + pct + '%">' + waveSVG("var(--liq-top)", waveCls) + "</span>" +
      '<span class="sphere-gloss"></span>' +
      '<span class="sphere-pct num' + (frac > 0.5 ? " on-liquid" : "") + '">' + pct + "%</span>" +
      "</div>" +
      '<span class="sphere-name">' + esc(label) + "</span></div>";
  }

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

  function togetherHTML(dateStr, me, partner) {
    var myFrac = dayFraction(dateStr, me);
    var pFrac = partner ? dayFraction(dateStr, partner) : 0;
    var synced = partner ? Pod.inSync(dateStr, me, partner) : false;
    var st = statusFor(dateStr, me, partner);
    var youColor = Store.personColor(me);
    var pColor = partner ? Store.personColor(partner) : "transparent";
    var tubeYouBg = synced ? "linear-gradient(90deg," + youColor + ",#BF5AF2)" : youColor;
    var tubePaBg = synced ? "linear-gradient(90deg,#BF5AF2," + pColor + ")" : pColor;
    return '<section class="together-card glass' + (synced ? " synced" : "") + '" id="tg-card"' +
      enterCls(2) + enterDelay(2) + ' aria-label="Together">' +
      '<div class="tg-head"><span class="tg-label">TOGETHER</span>' +
      '<span class="tg-status' + (synced ? " is-sync" : "") + '">' + esc(st.top) + "</span></div>" +
      '<div class="tg-mid">' +
      sphereHTML(me, myFrac, "w6", "You", "me") +
      '<div class="tube" role="img" aria-label="Progress toward the middle">' +
      '<span class="tube-fill tube-you" style="width:' + (myFrac * 50) + "%;background:" + tubeYouBg + '"></span>' +
      '<span class="tube-fill tube-partner" style="width:' + (pFrac * 50) + "%;background:" + tubePaBg + '"></span>' +
      '<span class="tube-sync" style="--you:' + youColor + ";--partner:" + pColor + '"></span>' +
      "</div>" +
      (partner ? sphereHTML(partner, pFrac, "w7", Store.personName(partner), "partner") : "") +
      "</div>" +
      '<div class="tg-foot"><span class="tg-line">' + esc(st.line) + "</span>" +
      '<button class="nudge glass' + (st.showNudge ? "" : " hidden") + '" id="nudge-btn">Nudge</button>' +
      "</div></section>";
  }

  function paintSphere(card, who, frac) {
    var wrap = card.querySelector('.sphere-wrap[data-who="' + who + '"]');
    if (!wrap) return;
    var pct = Math.round(frac * 100);
    var liq = wrap.querySelector(".sphere-liquid");
    liq.style.height = pct + "%";
    liq.classList.toggle("empty", pct <= 0);
    var num = wrap.querySelector(".sphere-pct");
    num.textContent = pct + "%";
    num.classList.toggle("on-liquid", frac > 0.5);
  }

  // Repaint the Together card in place so liquid and tube transitions play.
  function paintTogether(dateStr, me, partner) {
    var card = document.getElementById("tg-card");
    if (!card) return;
    var myFrac = dayFraction(dateStr, me);
    var pFrac = partner ? dayFraction(dateStr, partner) : 0;
    var synced = partner ? Pod.inSync(dateStr, me, partner) : false;
    var st = statusFor(dateStr, me, partner);
    card.classList.toggle("synced", synced);
    var stEl = card.querySelector(".tg-status");
    stEl.textContent = st.top;
    stEl.classList.toggle("is-sync", synced);
    paintSphere(card, "me", myFrac);
    paintSphere(card, "partner", pFrac);
    card.querySelector(".tube-you").style.width = (myFrac * 50) + "%";
    card.querySelector(".tube-partner").style.width = (pFrac * 50) + "%";
    var youColor = Store.personColor(me);
    var pColor = partner ? Store.personColor(partner) : "transparent";
    card.querySelector(".tube-you").style.background = synced ? "linear-gradient(90deg," + youColor + ",#BF5AF2)" : youColor;
    card.querySelector(".tube-partner").style.background = synced ? "linear-gradient(90deg,#BF5AF2," + pColor + ")" : pColor;
    card.querySelector(".tg-line").textContent = st.line;
    var nb = card.querySelector("#nudge-btn");
    if (nb) nb.classList.toggle("hidden", !st.showNudge);
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

  function playSyncMoment(me, partner) {
    var card = document.getElementById("tg-card");
    if (card) card.classList.add("synced");

    var bloom = document.createElement("div");
    bloom.className = "sync-bloom";
    bloom.setAttribute("aria-hidden", "true");
    document.body.appendChild(bloom);

    var drop = document.createElement("div");
    drop.className = "sync-drop glass";
    drop.setAttribute("role", "status");
    drop.innerHTML = '<span class="sd-avatars">' + avatarHTML(me, 26) + avatarHTML(partner, 26) + "</span>" +
      "<span>You're in sync today</span>";
    document.body.appendChild(drop);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        bloom.classList.add("go");
        drop.classList.add("go");
      });
    });
    setTimeout(function () {
      drop.classList.remove("go");
      setTimeout(function () {
        drop.remove();
        bloom.remove();
      }, 600);
    }, 3200);
  }

  /* ----- tiles ----- */
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
    var pct = Math.min(val / target, 1);
    var done = val >= target;
    return '<button class="tile tile-water' + (done ? " has-badge" : "") + '" data-habit="water" style="--tint:' + TINTS.water + ';" aria-label="' + esc(waterLabel(habit, val, me, partner)) + '">' +
      '<span class="t-liquid" aria-hidden="true"><span class="t-liquid-fill js-wfill" style="height:' + (6 + 54 * pct) + '%">' +
      waveSVG("var(--water-top)", "wfill") +
      '<i class="bub b1"></i><i class="bub b2"></i><i class="bub b3"></i><i class="bub b4"></i>' +
      "</span></span>" +
      '<span class="t-topgroup"><span class="t-label deep-water">' + ICONS.water + "Water</span>" +
      '<span class="w-num num"><span class="js-wval">' + val + "</span><small> / " + target + "</small></span>" +
      '<span class="t-cap t-cap-pour">tap to pour</span></span>' +
      (partner ? '<span class="t-chip-abs">' + chipHTML(partner, pText) + "</span>" : "") +
      '<span class="t-check js-wcheck' + (done ? "" : " hidden") + '" aria-hidden="true">' + ICONS.badge + "</span>" +
      "</button>";
  }

  function paintWater(tileEl, habit, val) {
    var me = Store.get("person");
    var target = habit.targets[me];
    tileEl.querySelector(".js-wval").textContent = val;
    tileEl.querySelector(".js-wfill").style.height = (6 + 54 * Math.min(val / target, 1)) + "%";
    var badge = tileEl.querySelector(".js-wcheck");
    var done = val >= target;
    tileEl.classList.toggle("has-badge", done);
    if (done && badge.classList.contains("hidden")) {
      badge.classList.remove("hidden", "pop");
      void badge.offsetWidth;
      badge.classList.add("pop");
    } else if (!done) {
      badge.classList.add("hidden");
      badge.classList.remove("pop");
    }
    tileEl.setAttribute("aria-label", waterLabel(habit, val, me, Store.partnerId()));
  }

  function floatOne(tileEl, e) {
    var r = tileEl.getBoundingClientRect();
    var x = e && e.clientX ? (e.clientX - r.left) : r.width / 2;
    var s = document.createElement("span");
    s.className = "floatup num";
    s.textContent = "+1";
    s.style.left = Math.max(8, Math.min(r.width - 40, x - 12)) + "px";
    s.style.top = "46%";
    tileEl.appendChild(s);
    s.addEventListener("animationend", function () { s.remove(); });
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
    var vials = "";
    for (var i = 0; i < target; i++) vials += '<span class="vial"><i></i></span>';
    return '<button class="tile tile-ex" data-habit="exercise" style="--tint:' + TINTS.exercise + ';" aria-label="' + esc(exerciseLabel(habit, n, me, partner)) + '">' +
      '<span class="t-top"><span class="t-label deep-exercise">' + ICONS.exercise + "Exercise</span>" +
      (partner ? chipHTML(partner, pn + "/" + habit.targets[partner], true) : "") + "</span>" +
      '<span class="x-num num"><span class="js-xval">' + n + "</span><small> / " + target + "</small></span>" +
      '<span class="t-cap">this week</span>' +
      '<span class="vials js-vials" aria-hidden="true">' + vials + "</span>" +
      "</button>";
  }

  function paintVials(tileEl, n, target) {
    var filled = Math.min(n, target);
    tileEl.querySelectorAll(".vial").forEach(function (v, i) {
      // rAF so the CSS transition plays from empty on first paint too.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { v.classList.toggle("on", i < filled); });
      });
    });
  }

  function paintExercise(tileEl, habit, n) {
    tileEl.querySelector(".js-xval").textContent = n;
    paintVials(tileEl, n, habit.targets[Store.get("person")]);
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

  function trailSVG(progress) {
    var off = (100 * (1 - Math.min(progress, 1))).toFixed(1);
    return '<svg class="trail" viewBox="0 0 140 38" aria-hidden="true">' +
      '<path d="M6 30 C 40 30, 40 8, 70 8 S 100 30, 134 30" pathLength="100" fill="none" ' +
      'stroke="rgba(127,127,140,0.25)" stroke-width="6" stroke-linecap="round"/>' +
      '<path d="M6 30 C 40 30, 40 8, 70 8 S 100 30, 134 30" pathLength="100" fill="none" ' +
      'style="stroke:var(--steps-ink)" stroke-width="6" stroke-linecap="round" ' +
      'stroke-dasharray="100" stroke-dashoffset="' + off + '" class="js-trail"/></svg>';
  }

  function stepsTile(habit, dateStr, me, partner) {
    var target = habit.targets[me];
    var val = Data.value(dateStr, me, habit.id);
    var pVal = partner ? Data.value(dateStr, partner, habit.id) : undefined;
    var pText = (pVal === undefined || pVal === null) ? "not yet" : fmtSteps(pVal);
    var progress = (val === undefined || val === null) ? 0 : Math.min(val / target, 1);
    var done = val !== undefined && val !== null && val >= target;
    return '<button class="tile tile-steps" data-habit="steps" style="--tint:' + TINTS.steps + '" aria-label="' + esc(stepsLabel(habit, val, me, partner)) + '">' +
      '<span class="t-top"><span class="t-label deep-steps">' + ICONS.steps + "Steps</span></span>" +
      (partner ? '<span class="t-chip-abs">' + chipHTML(partner, pText) + "</span>" : "") +
      '<span class="s-bottom"><span class="s-numrow"><span class="s-num num js-sval">' + fmtStepsFull(val) + "</span>" +
      '<span class="s-done js-sdone' + (done ? "" : " hidden") + '" aria-hidden="true">' + ICONS.badge + "</span></span>" +
      trailSVG(progress) + "</span>" +
      "</button>";
  }

  function paintSteps(tileEl, habit, val) {
    var me = Store.get("person");
    var target = habit.targets[me];
    tileEl.querySelector(".js-sval").textContent = fmtStepsFull(val);
    var progress = (val === undefined || val === null) ? 0 : Math.min(val / target, 1);
    tileEl.querySelector(".js-trail").style.strokeDashoffset = (100 * (1 - progress)).toFixed(1);
    var done = val !== undefined && val !== null && val >= target;
    var badge = tileEl.querySelector(".js-sdone");
    if (done && badge.classList.contains("hidden")) {
      badge.classList.remove("hidden", "pop");
      void badge.offsetWidth;
      badge.classList.add("pop");
    } else if (!done) {
      badge.classList.add("hidden");
      badge.classList.remove("pop");
    }
    tileEl.setAttribute("aria-label", stepsLabel(habit, val, me, Store.partnerId()));
  }

  function genericTile(habit, dateStr, me, partner, tint) {
    var target = habit.targets[me] || 1;
    var val = Data.value(dateStr, me, habit.id);
    var isCheck = habit.type === "check";
    tint = tint || TINTS[habit.id] || "#A259FF";
    var pVal = partner ? Data.value(dateStr, partner, habit.id) : undefined;
    var pTarget = partner ? (habit.targets[partner] || 1) : 1;
    var pText;
    if (pVal === undefined || pVal === null) pText = "0/" + pTarget;
    else if (isCheck) pText = pVal ? "done" : "0/1";
    else pText = pVal + "/" + pTarget;

    if (isCheck) {
      var done = !!val;
      var label = esc(habit.name) + (done ? ": done. Tap to undo." : ": not done. Tap to mark done.");
      return '<button class="tile tile-check" data-habit="' + esc(habit.id) + '" style="--tint:' + tint + ';--gtint:' + tint + '" aria-label="' + label + '">' +
        '<span class="t-top"><span class="t-label">' + esc(habit.name) + "</span></span>" +
        (partner ? '<span class="t-chip-abs">' + chipHTML(partner, pText) + "</span>" : "") +
        '<span class="check-circle js-gcheck' + (done ? " on" : "") + '" aria-hidden="true">' + ICONS.check + "</span>" +
        '<span class="t-cap">' + (done ? "done" : "tap to check") + "</span>" +
        "</button>";
    }

    var done, displayVal, pct;
    val = val || 0;
    done = val >= target;
    displayVal = val;
    pct = Math.min(val / target, 1);
    var unit = habit.unit || "times";
    var clabel = esc(habit.name) + ": " + displayVal + " of " + target + ". Tap to add one.";
    return '<button class="tile tile-generic" data-habit="' + esc(habit.id) + '" style="--tint:' + tint + ';--gtint:' + tint + '" aria-label="' + clabel + '">' +
      '<span class="t-top"><span class="t-label">' + esc(habit.name) + "</span>" +
      (partner ? chipHTML(partner, pText, true) : "") + "</span>" +
      '<span class="g-num num"><span class="js-gval">' + displayVal + "</span><small> / " + target + "</small></span>" +
      '<span class="t-cap">' + esc(unit) + "</span>" +
      '<span class="g-bar" aria-hidden="true"><i class="js-gfill" style="width:' + Math.round(pct * 100) + '%"></i></span>' +
      "</button>";
  }

  function paintGeneric(tileEl, habit, val) {
    var me = Store.get("person");
    var target = habit.targets[me] || 1;
    var isCheck = habit.type === "check";
    if (isCheck) {
      var done = !!val;
      var circle = tileEl.querySelector(".js-gcheck");
      if (circle) circle.classList.toggle("on", done);
      var cap = tileEl.querySelector(".t-cap");
      if (cap) cap.textContent = done ? "done" : "tap to check";
      tileEl.setAttribute("aria-label", esc(habit.name) + (done ? ": done. Tap to undo." : ": not done. Tap to mark done."));
      return;
    }
    val = val || 0;
    var done = val >= target;
    var displayVal = val;
    var pct = Math.min(val / target, 1);
    tileEl.querySelector(".js-gval").textContent = displayVal;
    tileEl.querySelector(".js-gfill").style.width = Math.round(pct * 100) + "%";
    tileEl.setAttribute("aria-label", esc(habit.name) + ": " + displayVal + " of " + target + ". Tap to add one.");
  }

  function tilesHTML(habits, dateStr, me, partner) {
    var order = ["water", "exercise", "steps"];
    var visible = habits.filter(function (h) { return !h.archived; });
    var sorted = visible.slice().sort(function (a, b) {
      var ai = order.indexOf(a.id), bi = order.indexOf(b.id);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
    var extraIdx = 0;
    return sorted.map(function (h) {
      if (h.id === "water") return waterTile(h, dateStr, me, partner);
      if (h.id === "exercise") return exerciseTile(h, dateStr, me, partner);
      if (h.id === "steps") return stepsTile(h, dateStr, me, partner);
      var tint = EXTRA_TINTS[extraIdx % EXTRA_TINTS.length];
      extraIdx++;
      return genericTile(h, dateStr, me, partner, tint);
    }).join("");
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
  // finger then fires a click on whatever the sheet put under it, which could
  // toggle a control by accident. Swallow that one synthetic click.
  function swallowReleaseClick() {
    function onClick(e) {
      document.removeEventListener("click", onClick, true);
      clearTimeout(safety);
      e.stopPropagation();
      e.preventDefault();
    }
    var safety = setTimeout(function () {
      document.removeEventListener("click", onClick, true);
    }, 10000);
    document.addEventListener("click", onClick, true);
  }

  function bindTile(el, habit) {
    var press = { timer: null, long: false, x: 0, y: 0, id: null };

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
      el.classList.add("pressing");
      press.x = e.clientX; press.y = e.clientY; press.id = e.pointerId;
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
      if (press.id !== e.pointerId) return;
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) clearTimeout(press.timer);
    });
    el.addEventListener("pointerup", function (e) {
      clearPress();
      if (press.long || press.id !== e.pointerId) return;
      activateTile(el, habit, e);
    });
    el.addEventListener("pointercancel", clearPress);
    el.addEventListener("pointerleave", function () { el.classList.remove("pressing"); });
    el.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      activateTile(el, habit, e);
    });
    el.addEventListener("contextmenu", function (e) { e.preventDefault(); });

    if (habit.id === "exercise") {
      paintVials(el, weekCount(habit, viewedDate(), Store.get("person")), habit.targets[Store.get("person")]);
    }
  }

  function activateTile(el, habit, e) {
    var me = Store.get("person");
    var d = viewedDate();
    if (habit.id === "water") {
      var prev = Data.value(d, me, habit.id) || 0;
      var val = prev + (habit.step || 1);
      logTile(habit, val, el, function (v) {
        paintWater(el, habit, v);
        if (v === val) floatOne(el, e);
      });
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
      var gwas = !!Data.value(d, me, habit.id);
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
  function headerHTML(dateStr, me, partner) {
    var past = dateStr !== localDate();
    var title = past ? dateLabel() : "Today";
    return '<div class="top-row">' +
      '<div class="date-nav">' +
      '<button class="dnav" data-nav="-1" aria-label="Previous day"' + (dateOffset <= -MAX_BACK ? " disabled" : "") + ">&#8249;</button>" +
      '<span class="top-date">' + esc(fullDateLabel()) + "</span>" +
      '<button class="dnav" data-nav="1" aria-label="Next day"' + (dateOffset >= 0 ? " disabled" : "") + ">&#8250;</button>" +
      "</div>" +
      (partner
        ? '<div class="pair-capsule" aria-label="You and ' + esc(Store.personName(partner)) + '">' +
          '<span class="pair-pair">' + avatarHTML(me, 30) + avatarHTML(partner, 30) + "</span></div>"
        : '<div class="pair-capsule" aria-label="Just you">' + avatarHTML(me, 30) + "</div>") +
      "</div>" +
      '<div class="title-block"' + enterCls(1) + enterDelay(1) + ">" +
      '<h1 class="screen-title">' + esc(title) + "</h1>" +
      '<div class="greeting">' + esc(greeting()) + "</div>" +
      (past ? '<button class="back-pill glass" id="back-today">Back to today</button>' : "") +
      "</div>";
  }

  function habitsHeadHTML(partner) {
    return '<div class="habits-head"' + enterCls(3) + enterDelay(3) + ">" +
      '<h2 class="habits-title">Habits</h2>' +
      (partner ? '<div class="habits-corner">' + esc(Store.personName(partner)) + " in the corner</div>" : "") +
      "</div>";
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
      '<div class="skel skel-tile skel-tall"></div>' +
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
      headerHTML(dateStr, me, partner) +
      togetherHTML(dateStr, me, partner) +
      habitsHeadHTML(partner) +
      '<div class="tile-grid"' + enterCls(4) + enterDelay(4) + ">" + tilesHTML(habitList, dateStr, me, partner) + "</div>" +
      '<button class="add-habit js-add-habit"' + enterCls(5) + enterDelay(5) + ' aria-label="Add a habit">' +
      ICONS.plus + "<span>Add Habit</span></button>";

    root.querySelectorAll(".dnav").forEach(function (b) {
      b.addEventListener("click", function () { setDay(dateOffset + Number(b.dataset.nav)); });
    });
    var backBtn = document.getElementById("back-today");
    if (backBtn) backBtn.addEventListener("click", function () { setDay(0); });

    root.querySelectorAll(".tile").forEach(function (el) {
      var habit = habitList.filter(function (h) { return h.id === el.dataset.habit; })[0];
      if (habit) bindTile(el, habit);
    });

    var nudgeBtn = document.getElementById("nudge-btn");
    if (nudgeBtn) nudgeBtn.addEventListener("click", nudge);

    var addBtn = root.querySelector(".js-add-habit");
    if (addBtn) addBtn.addEventListener("click", function () {
      if (window.Manage && typeof Manage.addSheet === "function") Manage.addSheet();
    });

    if (firstRender) {
      root.querySelectorAll(".press-in").forEach(function (el) {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { el.classList.add("in"); });
        });
      });
      firstRender = false;
    }

    // Foreground case: the day became synced elsewhere and the moment has
    // not shown on this device yet. The per-day flag keeps it to once.
    maybeSyncMoment(dateStr, me, partner);
  }

  /* ----- init ----- */
  function init() {
    render();
  }

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
