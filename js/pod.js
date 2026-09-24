/* Together screen (was Sync, Phase 4).
   Days-in-sync hero, calendar month, per-habit streak cards.
   The Nudge and the "In sync today" moment live on Today, not here. */

var Pod = (function () {
  var root = null;
  var DAYS = 31; // read window: must cover the whole current month (31st needs day 1)

  function evaluatedHabits() {
    return Store.get("habits").habits.filter(function (h) {
      return h.period === "day" && h.syncEligible;
    });
  }

  // A day is in sync when both members pass every evaluated daily habit.
  // A null (excluded) habit never blocks sync.
  function inSync(dateStr, me, partner) {
    var entriesMe = Data.getCached(dateStr, me) || {};
    var entriesP = Data.getCached(dateStr, partner) || {};
    var habits = evaluatedHabits();
    if (!habits.length) return false;
    return habits.every(function (h) {
      var a = Today.habitMet(h, me, entriesMe);
      var b = Today.habitMet(h, partner, entriesP);
      return a !== false && b !== false;
    });
  }

  function currentStreak(me, partner) {
    var today = localDate();
    var start = inSync(today, me, partner) ? 0 : -1;
    var n = 0;
    for (var back = start; back > -DAYS * 2; back--) {
      if (inSync(addDays(today, back), me, partner)) n++;
      else break;
    }
    return n;
  }

  function bestStreak(me, partner) {
    var today = localDate();
    var best = 0, run = 0;
    for (var back = 0; back < DAYS; back++) {
      if (inSync(addDays(today, -back), me, partner)) { run++; best = Math.max(best, run); }
      else run = 0;
    }
    return best;
  }

  // Synced days in the current month so far (days 1 through today).
  function monthSynced(me, partner) {
    var t = new Date();
    var y = t.getFullYear(), m = t.getMonth();
    var n = 0;
    for (var d = 1; d <= t.getDate(); d++) {
      if (inSync(monthDayStr(y, m, d), me, partner)) n++;
    }
    return n;
  }

  function monthDayStr(y, m, day) {
    return y + "-" + String(m + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
  }

  function mondayOf(dateStr) {
    var parts = dateStr.split("-").map(Number);
    var d = new Date(parts[0], parts[1] - 1, parts[2]);
    var dow = (d.getDay() + 6) % 7; // Monday = 0
    d.setDate(d.getDate() - dow);
    return localDate(d);
  }

  // Per-habit streak: consecutive days (daily habits) or weeks (weekly
  // habits) where neither member missed the habit.
  function personStreak(habit, personId) {
    var today = localDate();
    if (habit.period === "week") {
      var weeks = 0;
      var monday = mondayOf(today);
      for (var w = 0; w < 12; w++) {
        if (weekMet(habit, addDays(monday, -w * 7), personId)) weeks++;
        else break;
      }
      return { n: weeks, unit: "w" };
    }
    function dayOk(d) {
      return Today.habitMet(habit, personId, Data.getCached(d, personId) || {}) !== false;
    }
    var n = 0;
    for (var back = dayOk(today) ? 0 : -1; back > -DAYS * 2; back--) {
      if (dayOk(addDays(today, back))) n++;
      else break;
    }
    return { n: n, unit: "d" };
  }

  function weekMet(habit, mondayStr, personId) {
    var n = 0;
    for (var i = 0; i < 7; i++) {
      if (Data.value(addDays(mondayStr, i), personId, habit.id)) n++;
    }
    return n >= habit.targets[personId];
  }

  function avatarHTML(personId, px) {
    var name = Store.personName(personId) || "?";
    var color = Store.personColor(personId);
    return '<span class="avatar" style="width:' + px + "px;height:" + px + "px;background:" + color +
      ";font-size:" + Math.round(px * 0.45) + 'px" aria-hidden="true">' +
      esc(name.charAt(0).toUpperCase()) + "</span>";
  }

  function calCell(day, state, opts) {
    var cls = "cal-cell cal-" + state;
    var label = opts.label || String(day);
    var dot = opts.dot ? '<span class="cal-dot cal-dot-' + opts.dot + '" aria-hidden="true"></span>' : "";
    return '<div class="' + cls + (opts.today ? " cal-today" : "") + '"' +
      ' role="img" aria-label="' + esc(label) + '">' +
      '<span class="cal-day num">' + day + "</span>" + dot + "</div>";
  }

  function render() {
    root = document.getElementById("pod-root");
    if (!root || !Store.get("habits")) return;
    if (window.Today && typeof Today.paintInkVars === "function") Today.paintInkVars();
    var me = Store.get("person");
    var partner = Store.partnerId();
    var today = localDate();

    var fetches = [];
    for (var back = 0; back < DAYS; back++) {
      var d = addDays(today, -back);
      fetches.push(Data.fetchCheckin(d, me));
      if (partner) fetches.push(Data.fetchCheckin(d, partner));
    }

    Promise.all(fetches).then(function () {
      var streak = currentStreak(me, partner);
      var best = bestStreak(me, partner);
      var monthName = new Date().toLocaleString("en-US", { month: "long" });
      var t = new Date();
      var syncedDays = monthSynced(me, partner);
      var elapsed = t.getDate();

      var streakChip = streak > 0
        ? streak + "-day streak"
        : "No streak yet";

      // ----- calendar month -----
      var y = t.getFullYear(), m = t.getMonth();
      var daysInMonth = new Date(y, m + 1, 0).getDate();
      var leadBlanks = (new Date(y, m, 1).getDay() + 6) % 7; // Monday first
      var cells = "";
      for (var i = 0; i < leadBlanks; i++) cells += '<div class="cal-cell cal-blank"></div>';
      for (var day = 1; day <= daysInMonth; day++) {
        var ds = monthDayStr(y, m, day);
        var isToday = day === t.getDate();
        var aria = monthName + " " + day + (isToday ? ", today" : "");
        if (day > t.getDate()) {
          cells += calCell(day, "future", { today: isToday, label: aria });
          continue;
        }
        var sync = inSync(ds, me, partner);
        if (sync) {
          cells += calCell(day, "both", { today: isToday, label: aria + ", in sync" });
          continue;
        }
        var myFrac = Today.dayFraction(ds, me);
        var pFrac = Today.dayFraction(ds, partner);
        if (myFrac >= 1) {
          cells += calCell(day, "me", { today: isToday, label: aria + ", you only", dot: "me" });
        } else if (pFrac >= 1) {
          cells += calCell(day, "partner", {
            today: isToday, label: aria + ", " + Store.personName(partner) + " only", dot: "partner"
          });
        } else {
          cells += calCell(day, "none", { today: isToday, label: aria });
        }
      }
      var total = leadBlanks + daysInMonth;
      for (var trail = 0; trail < (7 - (total % 7)) % 7; trail++) {
        cells += '<div class="cal-cell cal-blank"></div>';
      }

      // ----- streak cards -----
      var habits = Store.get("habits").habits;
      var rows = habits.map(function (h) {
        var a = personStreak(h, me);
        var b = personStreak(h, partner);
        var mx = Math.max(a.n, b.n, 1);
        function row(pid, s, colorVar) {
          return '<div class="sr-person">' +
            avatarHTML(pid, 22) +
            '<span class="sr-bar" aria-hidden="true"><span style="width:' + Math.round(s.n / mx * 100) + "%;background:var(" + colorVar + ')"></span></span>' +
            '<span class="sr-val num">' + s.n + s.unit + "</span>" +
            "</div>";
        }
        return '<div class="streak-row" data-habit="' + esc(h.id) + '">' +
          '<p class="sr-name">' + esc(h.name) + "</p>" +
          row(me, a, "--person") + row(partner, b, "--partner") +
          "</div>";
      }).join("");

      root.innerHTML =
        '<div class="sync-head"><h1>Together</h1>' +
        '<p class="sync-sub">' + esc(monthName) + "</p></div>" +
        '<div class="sync-hero glass">' +
        '<div class="sync-hero-main">' +
        '<div><p class="hero-label">Days in sync</p>' +
        '<p class="hero-num num">' + syncedDays + "</p>" +
        '<p class="hero-sub">of ' + elapsed + " days this month</p></div>" +
        '<div class="sync-hero-chips">' +
        '<span class="hero-chip">' + esc(streakChip) + "</span>" +
        '<span class="hero-chip">Best this month ' + best + "</span>" +
        "</div>" +
        "</div>" +
        "</div>" +
        '<div class="cal-card glass" role="group" aria-label="' + esc(monthName) + ' calendar">' +
        '<div class="cal-top"><span class="cal-title">Every day</span></div>' +
        '<div class="cal-grid">' +
        ["M", "T", "W", "T", "F", "S", "S"].map(function (l) { return '<span class="dow" aria-hidden="true">' + l + "</span>"; }).join("") +
        cells + "</div>" +
        '<div class="cal-legend">' +
        '<span class="leg"><i class="leg-dot leg-both" aria-hidden="true"></i>Both</span>' +
        '<span class="leg"><i class="leg-dot leg-me" aria-hidden="true"></i>You</span>' +
        '<span class="leg"><i class="leg-dot leg-partner" aria-hidden="true"></i>' + esc(Store.personName(partner)) + "</span>" +
        "</div>" +
        "</div>" +
        '<div class="streaks-sec"><h2>Streaks</h2>' +
        '<div class="streak-list glass">' + rows + "</div></div>";
    }).catch(function () {
      root.innerHTML = '<div class="load-error"><p>Couldn\'t load the Together view. Check your connection.</p>' +
        '<button class="btn" id="pod-retry">Retry</button></div>';
      document.getElementById("pod-retry").addEventListener("click", render);
    });
  }

  return { render: render, inSync: inSync };
})();
