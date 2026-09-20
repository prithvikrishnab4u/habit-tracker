/* Manage screen (Phase 6: Habits).
   iOS-Settings-style grouped list. Add-habit sheet and sign-out
   behavior unchanged. No delete in v1. */

var Manage = (function () {
  var root = null;
  var UNITS = ["glasses", "steps", "workouts", "minutes", "times"];
  var TINTS = { water: "#0A84FF", exercise: "#BF5AF2", steps: "#30D158" };

  function tintFor(h) {
    return TINTS[h.id] || "#A259FF";
  }

  // "8 glasses a day", "1 time a week".
  function detailFor(h) {
    var me = Store.get("person");
    var target = h.targets[me];
    var unit = h.unit || "times";
    if (target === 1 && /s$/.test(unit)) unit = unit.slice(0, -1);
    var per = h.period === "week" ? "a week" : "a day";
    return Number(target).toLocaleString("en-US") + " " + unit + " " + per;
  }

  function habitRow(h) {
    var tint = tintFor(h);
    return '<button class="habit-row" data-habit="' + h.id + '" style="--tint:' + tint + '">' +
      '<span class="habit-icon" style="background:linear-gradient(135deg,' + tint + " 0%,color-mix(in srgb," + tint + ' 62%,#000) 100%)" aria-hidden="true"></span>' +
      '<span class="habit-text"><span class="habit-name">' + esc(h.name) + "</span>" +
      '<span class="habit-detail">' + esc(detailFor(h)) + "</span></span>" +
      '<span class="habit-chev" aria-hidden="true">\u203A</span></button>';
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
      '<span class="grab" aria-hidden="true"></span>' +
      '<div class="sheet-headrow"><span class="sheet-title">New habit</span>' +
      '<button class="sheet-x" id="ah-x" aria-label="Close"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>' +
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
      '<button id="ah-dec" aria-label="Lower target">\u2212</button>' +
      '<span class="step-val num" id="ah-val">1</span>' +
      '<button id="ah-inc" aria-label="Raise target">+</button>' +
      "</div>" +
      '<label>' + esc(Store.personName(partner)) + "'s target</label>" +
      '<div class="stepper" style="margin-bottom:20px">' +
      '<button id="ah-pdec" aria-label="Lower partner target">\u2212</button>' +
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
    sheet.querySelector("#ah-x").addEventListener("click", close);

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
        if (window.Today) Today.render();
        showToast("Habit added.");
      }).catch(function () {
        btn.disabled = false;
        btn.textContent = "Add habit";
        err.textContent = "Couldn't save. Try again.";
      });
    });
    setTimeout(function () { sheet.querySelector("#ah-name").focus(); }, 350);
  }


  function editSheet(habit) {
    var me = Store.get("person");
    var partner = Store.partnerId();
    var name = habit.name;
    var type = habit.type || "count";
    var period = habit.period || "day";
    var unit = habit.unit || "times";
    var target = habit.targets[me] || 1;
    var partnerTarget = partner ? (habit.targets[partner] || 1) : 1;
    var customUnit = UNITS.indexOf(unit) < 0 ? unit : "";

    var unitChips = UNITS.map(function (u) {
      return '<button class="chip" data-unit="' + u + '" aria-pressed="' + (u === unit) + '">' + u + "</button>";
    }).join("");
    unitChips += '<button class="chip" data-unit="__custom" aria-pressed="' + (customUnit ? "true" : "false") + '">Custom</button>';

    var scrim = document.createElement("div");
    scrim.className = "scrim";
    var sheet = document.createElement("div");
    sheet.className = "sheet glass";
    sheet.setAttribute("role", "dialog");
    sheet.innerHTML =
      '<span class="grab" aria-hidden="true"></span>' +
      '<div class="sheet-headrow"><span class="sheet-title">Edit habit</span>' +
      '<button class="sheet-x" id="ah-x" aria-label="Close"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>' +
      '<p class="sheet-sub">Changes appear on both phones as soon as they save.</p>' +
      '<div class="token-card" style="padding:0;margin-bottom:20px;background:none;border:0;box-shadow:none;">' +
      '<label for="ah-name">Name</label>' +
      '<input id="ah-name" value="' + esc(name) + '" autocomplete="off" maxlength="40">' +
      '<label>Type</label>' +
      '<div class="seg" role="group" aria-label="Type">' +
      '<button data-v="count" aria-pressed="' + (type === "count") + '">Count</button>' +
      '<button data-v="check" aria-pressed="' + (type === "check") + '">Check</button>' +
      "</div>" +
      '<label>Repeats</label>' +
      '<div class="seg" role="group" aria-label="Repeats">' +
      '<button data-p="day" aria-pressed="' + (period === "day") + '">Daily</button>' +
      '<button data-p="week" aria-pressed="' + (period === "week") + '">Weekly</button>' +
      "</div>" +
      '<label>Unit</label>' +
      '<div class="chips" style="justify-content:flex-start" id="ah-units">' + unitChips + "</div>" +
      '<input id="ah-custom-unit" placeholder="e.g. pages" value="' + esc(customUnit) + '" style="display:' + (customUnit ? "block" : "none") + ';margin-top:8px;" maxlength="20">' +
      '<label>Your target</label>' +
      '<div class="stepper" style="margin-bottom:12px">' +
      '<button id="ah-dec" aria-label="Lower target">\u2212</button>' +
      '<span class="step-val num" id="ah-val">' + target + "</span>" +
      '<button id="ah-inc" aria-label="Raise target">+</button>' +
      "</div>" +
      '<label>' + esc(Store.personName(partner)) + "'s target</label>" +
      '<div class="stepper" style="margin-bottom:20px">' +
      '<button id="ah-pdec" aria-label="Lower partner target">\u2212</button>' +
      '<span class="step-val num" id="ah-pval">' + partnerTarget + "</span>" +
      '<button id="ah-pinc" aria-label="Raise partner target">+</button>' +
      "</div>" +
      "</div>" +
      '<div class="sheet-row"><button class="btn" id="ah-save">Save</button>' +
      '<button class="btn btn-ghost" id="ah-archive" style="color:var(--error,#FF453A)">Archive</button></div>' +
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
    sheet.querySelector("#ah-x").addEventListener("click", close);

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
    var customInput = sheet.querySelector("#ah-custom-unit");
    sheet.querySelectorAll("#ah-units .chip").forEach(function (c) {
      c.addEventListener("click", function () {
        sheet.querySelectorAll("#ah-units .chip").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
        c.setAttribute("aria-pressed", "true");
        var v = c.getAttribute("data-unit");
        if (v === "__custom") {
          customInput.style.display = "block";
          customInput.focus();
        } else {
          customInput.style.display = "none";
          unit = v;
        }
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
      var customVal = customInput.value.trim();
      if (customInput.style.display !== "none" && customVal) unit = customVal;
      var targets = {};
      targets[me] = target;
      if (partner) targets[partner] = partnerTarget;
      var btn = sheet.querySelector("#ah-save");
      btn.disabled = true;
      btn.textContent = "Saving...";
      Api.putJSON("habits.json", null, "Edit habit " + habit.id, function (fresh) {
        fresh = fresh || { weekStart: "monday", habits: [] };
        fresh.habits = (fresh.habits || []).map(function (h) {
          if (h.id !== habit.id) return h;
          h.name = name;
          h.type = type;
          h.unit = type === "check" ? "times" : unit;
          h.period = period;
          h.targets = targets;
          return h;
        });
        return fresh;
      }).then(function () {
        close();
        return Store.load();
      }).then(function () {
        render();
        if (window.Today) Today.render();
        showToast("Habit saved.");
      }).catch(function () {
        btn.disabled = false;
        btn.textContent = "Save";
        err.textContent = "Couldn't save. Try again.";
      });
    });

    sheet.querySelector("#ah-archive").addEventListener("click", function () {
      if (!confirm('Archive "' + habit.name + '"? It will hide from Today but keep its history.')) return;
      var btn = sheet.querySelector("#ah-archive");
      btn.disabled = true;
      Api.putJSON("habits.json", null, "Archive habit " + habit.id, function (fresh) {
        fresh = fresh || { habits: [] };
        fresh.habits = (fresh.habits || []).map(function (h) {
          if (h.id === habit.id) h.archived = true;
          return h;
        });
        return fresh;
      }).then(function () {
        close();
        return Store.load();
      }).then(function () {
        render();
        if (window.Today) Today.render();
        showToast("Habit archived.");
      }).catch(function () {
        btn.disabled = false;
        sheet.querySelector("#ah-error").textContent = "Couldn't archive. Try again.";
      });
    });
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
    if (window.Today && typeof Today.paintInkVars === "function") Today.paintInkVars();
    var habits = Store.get("habits").habits;
    root.innerHTML =
      '<div class="sync-head"><h1>Habits</h1>' +
      '<p class="sync-sub">' + habits.length + " habits, shared</p></div>" +
      '<div class="habit-card glass">' +
      habits.map(habitRow).join("") +
      '<button class="habit-row habit-add" id="add-habit">' +
      '<span class="habit-icon habit-add-icon" aria-hidden="true">+</span>' +
      '<span class="habit-text"><span class="habit-name">Add Habit</span></span>' +
      '<span class="habit-chev" aria-hidden="true">\u203A</span></button>' +
      "</div>" +
      '<div class="signout-card glass">' +
      '<button class="signout-btn" id="signout-btn">Sign Out of This Device</button>' +
      "</div>";

    document.getElementById("add-habit").addEventListener("click", addSheet);
    document.getElementById("signout-btn").addEventListener("click", signOut);
    root.querySelectorAll(".habit-row[data-habit]").forEach(function (row) {
      row.addEventListener("click", function () {
        var hid = row.getAttribute("data-habit");
        var habit = Store.get("habits").habits.filter(function (h) { return h.id === hid; })[0];
        if (habit) editSheet(habit);
      });
    });
  }

  return { render: render, addSheet: addSheet };
})();
