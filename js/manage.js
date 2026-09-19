/* Manage screen (Phase 4).
   Habit list, add-habit sheet, sign out. No delete in v1. */

var Manage = (function () {
  var root = null;
  var UNITS = ["glasses", "steps", "workouts", "minutes", "times"];

  function habitItem(h) {
    var me = Store.get("person");
    var target = h.targets[me];
    var period = h.period === "week" ? "Weekly" : "Daily";
    var sync = h.syncEligible ? " &middot; counts toward sync" : "";
    return '<div class="habit-item glass">' +
      "<div><p class=\"hname\">" + esc(h.name) + "</p>" +
      '<p class="hmeta">' + period + " &middot; " + esc(h.unit || "") + sync + "</p></div>" +
      '<span class="htarget num">' + esc(String(target)) + "</span></div>";
  }

  function addSheet() {
    var me = Store.get("person");
    var partner = Store.partnerId();
    var name = "";
    var type = "count";
    var period = "day";
    var unit = "times";
    var target = 1;

    var unitChips = UNITS.map(function (u) {
      return '<button class="chip" data-unit="' + u + '" aria-pressed="' + (u === unit) + '">' + u + "</button>";
    }).join("");

    // Reuse the sheet builder from Today via a local copy (Today does not
    // export it, so build the sheet here).
    var scrim = document.createElement("div");
    scrim.className = "scrim";
    var sheet = document.createElement("div");
    sheet.className = "sheet glass";
    sheet.setAttribute("role", "dialog");
    sheet.innerHTML =
      "<h2>New habit</h2>" +
      '<p class="sheet-sub">It appears on both phones as soon as it saves.</p>' +
      '<div class="token-card" style="padding:0;margin-bottom:20px;background:none;border:0;box-shadow:none;">' +
      '<label for="ah-name">Name</label>' +
      '<input id="ah-name" placeholder="Read" autocomplete="off" maxlength="40">' +
      '<label>Type</label>' +
      '<div class="seg" role="group" aria-label="Type">' +
      '<button data-v="count" aria-pressed="true">Count</button>' +
      '<button data-v="check" aria-pressed="false">Check</button>' +
      "</div>" +
      '<label>Repeats</label>' +
      '<div class="seg" role="group" aria-label="Repeats">' +
      '<button data-p="day" aria-pressed="true">Daily</button>' +
      '<button data-p="week" aria-pressed="false">Weekly</button>' +
      "</div>" +
      '<label>Unit</label>' +
      '<div class="chips" style="justify-content:flex-start" id="ah-units">' + unitChips + "</div>" +
      '<label>Your target</label>' +
      '<div class="stepper" style="margin-bottom:12px">' +
      '<button id="ah-dec" aria-label="Lower target">-</button>' +
      '<span class="step-val num" id="ah-val">1</span>' +
      '<button id="ah-inc" aria-label="Raise target">+</button>' +
      "</div>" +
      '<label>' + esc(Store.personName(partner)) + "'s target</label>" +
      '<div class="stepper" style="margin-bottom:20px">' +
      '<button id="ah-pdec" aria-label="Lower partner target">-</button>' +
      '<span class="step-val num" id="ah-pval">1</span>' +
      '<button id="ah-pinc" aria-label="Raise partner target">+</button>' +
      "</div>" +
      "</div>" +
      '<div class="sheet-row"><button class="btn" id="ah-save">Add habit</button></div>' +
      '<p class="onb-error" id="ah-error"></p>';

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
      setTimeout(function () { scrim.remove(); sheet.remove(); }, 240);
    }
    scrim.addEventListener("click", close);

    var partnerTarget = 1;
    function segWire(sel, attr, set) {
      sheet.querySelectorAll(sel).forEach(function (b) {
        b.addEventListener("click", function () {
          sheet.querySelectorAll(sel).forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
          b.setAttribute("aria-pressed", "true");
          set(b.getAttribute(attr));
        });
      });
    }
    segWire(".seg [data-v]", "data-v", function (v) { type = v; });
    segWire(".seg [data-p]", "data-p", function (v) { period = v; });
    sheet.querySelectorAll("#ah-units .chip").forEach(function (c) {
      c.addEventListener("click", function () {
        sheet.querySelectorAll("#ah-units .chip").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
        c.setAttribute("aria-pressed", "true");
        unit = c.getAttribute("data-unit");
      });
    });
    sheet.querySelector("#ah-dec").addEventListener("click", function () {
      target = Math.max(1, target - 1);
      sheet.querySelector("#ah-val").textContent = target;
    });
    sheet.querySelector("#ah-inc").addEventListener("click", function () {
      target = Math.min(999999, target + 1);
      sheet.querySelector("#ah-val").textContent = target;
    });
    sheet.querySelector("#ah-pdec").addEventListener("click", function () {
      partnerTarget = Math.max(1, partnerTarget - 1);
      sheet.querySelector("#ah-pval").textContent = partnerTarget;
    });
    sheet.querySelector("#ah-pinc").addEventListener("click", function () {
      partnerTarget = Math.min(999999, partnerTarget + 1);
      sheet.querySelector("#ah-pval").textContent = partnerTarget;
    });

    sheet.querySelector("#ah-save").addEventListener("click", function () {
      name = sheet.querySelector("#ah-name").value.trim();
      var err = sheet.querySelector("#ah-error");
      if (!name) { err.textContent = "Give the habit a name."; return; }
      var id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "habit";
      var existing = Store.get("habits").habits.map(function (h) { return h.id; });
      var n = 2;
      var base = id;
      while (existing.indexOf(id) >= 0) { id = base + "-" + (n++); }

      var targets = {};
      targets[me] = target;
      targets[partner] = partnerTarget;
      var habit = {
        id: id,
        name: name,
        type: type,
        unit: type === "check" ? "times" : unit,
        period: period,
        targets: targets,
        syncEligible: false
      };
      var btn = sheet.querySelector("#ah-save");
      btn.disabled = true;
      btn.textContent = "Adding...";
      Api.putJSON("habits.json", null, "Add habit " + id, function (fresh) {
        fresh = fresh || { weekStart: "monday", habits: [] };
        fresh.habits = (fresh.habits || []).concat([habit]);
        return fresh;
      }).then(function () {
        close();
        return Store.load();
      }).then(function () {
        render();
        showToast("Habit added.");
      }).catch(function () {
        btn.disabled = false;
        btn.textContent = "Add habit";
        err.textContent = "Couldn't save. Try again.";
      });
    });
    setTimeout(function () { sheet.querySelector("#ah-name").focus(); }, 350);
  }

  function signOut() {
    if (!confirm("Sign out of Habit Tracker on this device? Your token and profile will be cleared.")) return;
    Store.signOut();
    document.getElementById("tabbar").classList.add("hidden");
    var scr = document.getElementById("screen-habits");
    scr.classList.add("hidden");
    var onb = document.getElementById("screen-onboarding");
    onb.classList.remove("hidden");
    Onboarding.start(onb, function () {
      onb.classList.add("hidden");
      document.getElementById("tabbar").classList.remove("hidden");
      if (window.App) window.App.showTab("today");
    });
  }

  function render() {
    root = document.getElementById("manage-root");
    if (!root || !Store.get("habits")) return;
    var habits = Store.get("habits").habits;
    root.innerHTML =
      '<div class="manage-header"><h1>Habits</h1>' +
      '<button class="add-btn" id="add-habit" aria-label="Add habit">+</button></div>' +
      habits.map(habitItem).join("") +
      '<div class="signout-wrap"><button class="btn btn-danger" id="signout-btn">Sign out of this device</button></div>';

    document.getElementById("add-habit").addEventListener("click", addSheet);
    document.getElementById("signout-btn").addEventListener("click", signOut);
  }

  return { render: render };
})();
