/* Pod screen (Phase 3).
   Days-in-sync hero, 30-day split grid, per-habit streaks,
   and the v1 sync banner. */

var Pod = (function () {
  var root = null;
  var DAYS = 30;
  var SYNC_GREEN = "#30D158";

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

  // Per-habit streak: consecutive days where neither member missed the habit.
  function habitStreak(habit, me, partner) {
    var today = localDate();
    function dayOk(d) {
      var a = Today.habitMet(habit, me, Data.getCached(d, me) || {});
      var b = Today.habitMet(habit, partner, Data.getCached(d, partner) || {});
      return a !== false && b !== false;
    }
    var start = dayOk(today) ? 0 : -1;
    var n = 0;
    for (var back = start; back > -DAYS * 2; back--) {
      if (dayOk(addDays(today, back))) n++;
      else break;
    }
    return n;
  }

  function cellStyle(dateStr, me, partner) {
    var sync = inSync(dateStr, me, partner);
    if (sync) {
      return "background: linear-gradient(135deg, " + SYNC_GREEN + " 0%, #1F9D44 100%);";
    }
    var myFrac = Today.dayFraction(dateStr, me);
    var pFrac = Today.dayFraction(dateStr, partner);
    function dim(hex, frac) {
      var a = 0.18 + 0.62 * frac;
      return hex + Math.round(a * 255).toString(16).padStart(2, "0");
    }
    return "background: linear-gradient(135deg, " +
      dim(Store.personColor(me), myFrac) + " 0%, " +
      dim(Store.personColor(me), myFrac) + " 50%, " +
      dim(Store.personColor(partner), pFrac) + " 50%, " +
      dim(Store.personColor(partner), pFrac) + " 100%);";
  }

  function showSyncBanner() {
    var b = document.getElementById("sync-banner");
    if (!b) {
      b = document.createElement("div");
      b.id = "sync-banner";
      b.setAttribute("role", "status");
      document.body.appendChild(b);
    }
    b.textContent = "In sync today. Nice.";
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { b.classList.add("show"); });
    });
    setTimeout(function () { b.classList.remove("show"); }, 3000);
  }

  function render() {
    root = document.getElementById("pod-root");
    if (!root || !Store.get("habits")) return;
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
      var todaySync = inSync(today, me, partner);

      var cells = "";
      for (var b = DAYS - 1; b >= 0; b--) {
        var d = addDays(today, -b);
        var dayNum = parseInt(d.split("-")[2], 10);
        var label = b === 0 ? "Today" : b === 1 ? "Yesterday" : d;
        cells += '<div class="sync-cell" style="' + cellStyle(d, me, partner) + '"' +
          ' role="img" aria-label="' + label + (inSync(d, me, partner) ? ", in sync" : "") + '">' +
          '<span class="cell-day">' + dayNum + "</span></div>";
      }

      var habits = evaluatedHabits();
      var streakRows = habits.map(function (h) {
        return '<div class="streak-row"><span>' + esc(h.name) + "</span>" +
          '<span class="sval num">' + habitStreak(h, me, partner) + " days</span></div>";
      }).join("");

      root.innerHTML =
        '<div class="pod-header"><h1>Pod</h1></div>' +
        '<div class="sync-hero glass">' +
        '<div class="hero-num num">' + streak + "</div>" +
        '<div class="hero-label">Days in sync</div>' +
        '<p class="hero-sub">' + (streak > 0
          ? "Current run. Best in 30 days: " + best + "."
          : "No run going. Today is a fresh start.") + "</p>" +
        "</div>" +
        '<div class="sync-grid glass" role="group" aria-label="Last 30 days">' + cells + "</div>" +
        '<div class="streaks glass"><h2>Streaks</h2>' +
        '<p class="sec-label">Per habit, both of you</p>' + streakRows + "</div>";

      if (todaySync) showSyncBanner();
    }).catch(function () {
      root.innerHTML = '<div class="load-error"><p>Couldn\'t load the pod view. Check your connection.</p>' +
        '<button class="btn" id="pod-retry">Retry</button></div>';
      document.getElementById("pod-retry").addEventListener("click", render);
    });
  }

  return { render: render, inSync: inSync };
})();
