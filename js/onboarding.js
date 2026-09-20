/* Onboarding: welcome, install, who, hello+color picker, handshake, pour, done.
   Renders into #screen-onboarding. Calls onDone() when setup completes.
   Copy is verbatim from the build brief. Person and token are stored only
   after the handshake succeeds. Colors are palette ids saved to pod.json. */

var Onboarding = (function () {
  var root = null;
  var onDone = null;
  var retoken = false;
  var person = null;    // local until the handshake succeeds
  var colorId = null;   // local until the handshake succeeds
  var viaInstall = false;
  var installTimer = null;

  var NAMES = { prithvi: "Prithvi", sowmya: "Sowmya" };

  function displayName(id) {
    var pod = Store.get("pod");
    if (pod && pod.members) {
      var m = pod.members.filter(function (x) { return x.id === id; })[0];
      if (m && m.name) return m.name;
    }
    return NAMES[id] || id;
  }

  function otherId(id) {
    return id === "prithvi" ? "sowmya" : "prithvi";
  }

  function initial(id) {
    return displayName(id).charAt(0).toUpperCase();
  }

  /* ---------- shared chrome: thin progress bar + round back button ---------- */

  // idx: 0..6 across welcome, install, who, hello, token, pour, done.
  function chrome(idx, backFn) {
    var pct = Math.round((idx / 6) * 100);
    var back = backFn
      ? '<button class="onb-back glass" id="ob-back" aria-label="Back">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'
      : '<span class="onb-back-sp"></span>';
    return '<div class="onb-top">' + back +
      '<div class="onb-progress" aria-hidden="true"><i style="width:' + pct + '%"></i></div>' +
      '<span class="onb-back-sp"></span></div>';
  }

  function wireBack(backFn) {
    var b = document.getElementById("ob-back");
    if (b && backFn) b.addEventListener("click", backFn);
  }

  /* ---------- step 0: welcome ---------- */

  function showWelcome() {
    root.innerHTML =
      '<div class="onb">' + chrome(0, null) +
      '<div class="orbit" aria-hidden="true"><i class="o1"></i><i class="o2"></i></div>' +
      "<h1>Two of you.<br><span class=\"grad\">One streak.</span></h1>" +
      '<p class="lede">A habit tracker built for exactly two people. Nobody else. No feeds. Just you two, keeping each other honest.</p>' +
      '<button class="btn" id="ob-next">Let\'s sync</button>' +
      "</div>";
    document.getElementById("ob-next").addEventListener("click", function () {
      // Only iOS/iPadOS needs the install gate: there, Safari and the
      // installed app do not share storage. Everywhere else the gate would
      // block people who never install.
      viaInstall = isIOS() && !isStandalone();
      if (viaInstall) showInstall();
      else showWho();
    });
  }

  /* ---------- step 1: install (iOS/iPadOS Safari only) ---------- */

  function stopInstallWatch() {
    if (installTimer) { clearInterval(installTimer); installTimer = null; }
    window.removeEventListener("appinstalled", installAdvanced);
    window.removeEventListener("pageshow", installAdvanced);
    document.removeEventListener("visibilitychange", installVisible);
  }

  function installAdvanced() {
    if (!isStandalone()) return;
    stopInstallWatch();
    showWho();
  }

  function installVisible() {
    if (!document.hidden) installAdvanced();
  }

  function showInstall() {
    stopInstallWatch();
    root.innerHTML =
      '<div class="onb">' + chrome(1, function () { stopInstallWatch(); showWelcome(); }) +
      "<h1>First, make it a real app.</h1>" +
      '<div class="phone-mini" aria-hidden="true">' +
        '<div class="pm-phone"><div class="pm-icon">H</div></div>' +
        '<div class="pm-share"><svg viewBox="0 0 24 24"><path d="M12 3v12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M7.5 7.5L12 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></div>' +
        '<div class="pm-arrow"><svg viewBox="0 0 24 24"><path d="M12 19V5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M6 11l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></div>' +
      "</div>" +
      '<ol class="install-steps">' +
        "<li>Tap the <b>Share</b> button</li>" +
        "<li>Choose <b>Add to Home Screen</b></li>" +
        "<li>Open <b>Habits</b> from your home screen</li>" +
      "</ol>" +
      '<p class="waiting"><span class="pulse-dots" aria-hidden="true"><i></i><i></i><i></i></span>See you on the home screen</p>' +
      "</div>";
    wireBack(function () { stopInstallWatch(); showWelcome(); });

    // Advance only on real standalone detection. No continue button, no
    // self-reported "I did it". Opening the home-screen app is a fresh page
    // load, which resumes at "Who's holding this phone?" on its own.
    window.addEventListener("appinstalled", installAdvanced);
    window.addEventListener("pageshow", installAdvanced);
    document.addEventListener("visibilitychange", installVisible);
    installTimer = setInterval(installAdvanced, 1500);
  }

  /* ---------- step 2a: who ---------- */

  function showWho() {
    stopInstallWatch();
    root.innerHTML =
      '<div class="onb">' + chrome(2, function () { viaInstall ? showInstall() : showWelcome(); }) +
      "<h1>Who's holding this phone?</h1>" +
      '<div class="person-pick" role="group" aria-label="Choose person">' +
      '<button class="person-btn" data-person="prithvi">' +
      '<span class="avatar" style="background:' + Colors.get("blue").base + '">P</span><span>Prithvi</span></button>' +
      '<button class="person-btn" data-person="sowmya">' +
      '<span class="avatar" style="background:' + Colors.get("orange").base + '">S</span><span>Sowmya</span></button>' +
      "</div>" +
      '<p class="lede">Tap yourself. This phone remembers you after this.</p>' +
      "</div>";
    wireBack(function () { viaInstall ? showInstall() : showWelcome(); });
    root.querySelectorAll(".person-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        person = b.getAttribute("data-person");
        colorId = Colors.DEFAULTS[person] || "blue";
        showHello(null);
      });
    });
  }

  /* ---------- step 2b: hello + color picker ---------- */

  // note: null, or { kind: "taken"|"blocked", partnerColor: id }
  function showHello(note) {
    var name = displayName(person);
    var partner = otherId(person);
    var partnerName = displayName(partner);
    // Before the token is validated pod.json can't be read, so assume the
    // partner still has their default color. The handshake re-checks this
    // against fresh data and bounces back here if it changed.
    var partnerColor = (note && note.partnerColor) || Colors.DEFAULTS[partner];

    var body = "Pick your color. You'll spot each other by color everywhere in here.";

    var html =
      '<div class="flood" id="ob-flood" aria-hidden="true"></div>' +
      '<div class="onb flooded">' + chrome(3, showWho) +
      "<h1>Hey, " + esc(name) + ".</h1>" +
      '<p class="lede">' + esc(body) + "</p>";
    if (note) {
      var noteText = note.kind === "taken"
        ? partnerName + " picked " + Colors.get(partnerColor).name + " while you were setting up. Pick another."
        : Colors.get(colorId).name + " is too close to " + partnerName + "'s " +
          Colors.get(partnerColor).name + " for color-blind eyes. Pick another.";
      html += '<p class="onb-note">' + esc(noteText) + "</p>";
    } else {
      html += '<p class="onb-note">' + esc(partnerName + " is " + Colors.get(partnerColor).name + ".") + "</p>";
    }
    html += '<div class="liq-grid" role="group" aria-label="Choose your color">';

    Colors.ORDER.forEach(function (id) {
      var c = Colors.get(id);
      var state = "open";
      var label = c.name;
      if (partnerColor && id === partnerColor) { state = "taken"; label = c.name + ", " + partnerName + "'s color"; }
      else if (partnerColor && Colors.blocked(id, partnerColor)) { state = "blocked"; label = c.name + ", too close to " + partnerName + "'s color"; }
      html +=
        '<button class="liq' + (state === "open" ? "" : " dim") + '" data-id="' + id + '" data-state="' + state + '"' +
        ' aria-pressed="' + (id === colorId ? "true" : "false") + '" aria-label="' + esc(label) + '">' +
        '<span class="liq-sphere" style="' + Colors.liquidVars(id) + '">' +
        '<span class="liq-fill"><svg class="liq-wave" viewBox="0 0 120 10" preserveAspectRatio="none" aria-hidden="true">' +
        '<path d="M0 5 Q 15 1 30 5 T 60 5 T 90 5 T 120 5 T 150 5 V10 H0 Z"/></svg></span>' +
        '<span class="liq-gloss"></span>' +
        '<span class="liq-check"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4 10-11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' +
        "</span>" +
        '<span class="liq-name">' + esc(state === "taken" ? partnerName : c.name) + "</span>" +
        "</button>";
    });

    html += "</div>" + '<button class="btn" id="ob-next">That\'s me</button>' + "</div>";
    root.innerHTML = html;
    wireBack(showWho);
    paintFlood(true);

    root.querySelectorAll(".liq").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-id");
        var st = b.getAttribute("data-state");
        if (st === "taken") {
          showToast(Colors.get(id).name + " is " + partnerName + "'s color.");
          return;
        }
        if (st === "blocked") {
          showToast(Colors.get(id).name + " is too close to " + partnerName + "'s " +
            Colors.get(partnerColor).name + " for color-blind eyes.");
          return;
        }
        colorId = id;
        root.querySelectorAll(".liq").forEach(function (x) {
          x.setAttribute("aria-pressed", x.getAttribute("data-id") === id ? "true" : "false");
        });
        paintFlood(false);
      });
    });
    document.getElementById("ob-next").addEventListener("click", showToken);
  }

  function paintFlood(first) {
    var f = document.getElementById("ob-flood");
    if (!f || !colorId) return;
    var c = Colors.get(colorId);
    f.style.backgroundColor = c.base;
    f.style.opacity = String(c.flood);
    // The 0.50 flood opacity was chosen for white text: dark ink on the
    // orange flood is ~2.8:1, white is ~6.6:1. The palette's dark "text"
    // value is only for glyphs sitting directly on liquid.
    if (root) root.style.setProperty("--flood-ink", "#fff");
    if (first) {
      f.classList.remove("enter");
      void f.offsetWidth;
      f.classList.add("enter");
    }
  }

  /* ---------- step 3: handshake (token) ---------- */

  function showToken() {
    var title = retoken ? "New key for this device" : "One secret handshake.";
    var meInit = initial(person);
    var poInit = initial(otherId(person));
    var meColor = Colors.get(colorId || Store.getColorId(person)).base;
    var poColor = Colors.get(Store.getColorId(otherId(person))).base;

    root.innerHTML =
      '<div class="onb">' + (retoken ? "" : chrome(4, function () { showHello(null); })) +
      "<h1>" + esc(title) + "</h1>" +
      '<p class="lede">Paste your key from GitHub. It stays on this phone and connects you to your shared habits.</p>' +
      '<div class="hs-avatars" id="ob-hs" aria-hidden="true">' +
      '<span class="hs-a" id="hs-me" style="background:' + meColor + '">' + esc(meInit) + "</span>" +
      '<span class="hs-a" id="hs-po" style="background:' + poColor + '">' + esc(poInit) + "</span>" +
      "</div>" +
      '<p class="hs-status" id="ob-status"></p>' +
      '<div class="token-card glass">' +
      '<label for="ob-token">Token</label>' +
      '<input id="ob-token" type="password" placeholder="Paste token here" autocomplete="off" autocapitalize="off" spellcheck="false">' +
      "</div>" +
      '<button class="btn" id="ob-main">Paste key</button>' +
      '<p class="onb-error" id="ob-error"></p>' +
      '<p class="footnote">Create it in GitHub Settings, Developer settings, Personal access tokens, Fine-grained. It needs Contents read and write on the data repo only.</p>' +
      "</div>";
    if (!retoken) wireBack(function () { showHello(null); });

    var main = document.getElementById("ob-main");
    var input = document.getElementById("ob-token");
    var error = document.getElementById("ob-error");
    var status = document.getElementById("ob-status");
    var mode = "paste"; // paste -> connect -> checking -> shake
    var podData = null;
    var token = "";

    function setMain(label, disabled) {
      main.textContent = label;
      main.disabled = !!disabled;
    }

    input.addEventListener("input", function () {
      if (mode === "paste" && input.value.trim()) { mode = "connect"; setMain("Connect", false); }
      if (mode === "connect" && !input.value.trim()) { mode = "paste"; setMain("Paste key", false); }
    });

    main.addEventListener("click", function () {
      error.textContent = "";
      if (mode === "paste") {
        if (!navigator.clipboard || !navigator.clipboard.readText) {
          error.textContent = "Clipboard read is not available. Long-press the field to paste, then tap Connect.";
          mode = "connect";
          setMain("Connect", false);
          return;
        }
        navigator.clipboard.readText().then(function (text) {
          input.value = (text || "").trim();
          if (!input.value) {
            error.textContent = "The clipboard is empty. Copy your key in GitHub first.";
            return;
          }
          validate(input.value);
        }).catch(function () {
          error.textContent = "Could not read the clipboard. Long-press the field to paste, then tap Connect.";
          mode = "connect";
          setMain("Connect", false);
        });
        return;
      }
      if (mode === "connect") {
        token = input.value.trim();
        if (!token) {
          error.textContent = "Paste your token first.";
          return;
        }
        validate(token);
        return;
      }
      if (mode === "shake") shake();
    });

    function validate(t) {
      mode = "checking";
      setMain("Checking the key…", true);
      status.textContent = "";
      Api.setConfig({ owner: Store.get("owner"), repo: Store.get("repo"), token: t });
      Api.getJSON("pod.json").then(function (res) {
        if (!res.data || !res.data.members) throw new Error("bad data");
        podData = res.data;
        token = t;
        document.getElementById("ob-hs").classList.add("together");
        status.textContent = "Connected. Your habits are live.";
        mode = "shake";
        setMain("Shake on it", false);
      }).catch(function () {
        mode = input.value.trim() ? "connect" : "paste";
        setMain(mode === "connect" ? "Connect" : "Paste key", false);
        error.textContent = "That key didn't work. Check it and try again.";
      });
    }

    function shake() {
      setMain("Saving…", true);
      if (!retoken) Store.setPerson(person);
      Store.setToken(token);
      if (retoken) {
        Store.load().then(finish, function () {
          setMain("Shake on it", false);
          error.textContent = "Couldn't load your data. Check your connection and try again.";
        });
        return;
      }
      saveColor(podData);
    }

    // Save the picked color to pod.json through a mutator, re-checking the
    // partner's color on fresh data in case they changed it meanwhile.
    function saveColor(pod) {
      var picked = colorId;
      var pc = partnerColorOf(pod, person);
      if (picked === pc) return conflictBack(picked, pc, "taken");
      if (pc && Colors.blocked(picked, pc)) return conflictBack(picked, pc, "blocked");

      Api.putJSON("pod.json", null, "Set color", function (fresh) {
        var members = (fresh && fresh.members) || [];
        var me = null, po = null;
        members.forEach(function (m) {
          if (m.id === person) me = m; else po = m;
        });
        if (!me) throw new Error("member missing");
        var fpc = po && po.color;
        if (picked === fpc) throw new Error("color taken");
        if (fpc && Colors.blocked(picked, fpc)) throw new Error("color blocked");
        me.color = picked;
        return fresh;
      }).then(function () {
        return Store.load();
      }).then(function () {
        showPour();
      }).catch(function (err) {
        var kind = err && err.message === "color taken" ? "taken"
          : err && err.message === "color blocked" ? "blocked" : null;
        if (kind) {
          Store.load().then(function () {
            conflictBack(picked, partnerColorOf(Store.get("pod"), person) || pc, kind);
          }, function () {
            setMain("Shake on it", false);
            error.textContent = "Couldn't reach GitHub. Try again.";
          });
        } else {
          setMain("Shake on it", false);
          error.textContent = "Couldn't save your color. Check your connection and try again.";
        }
      });
    }

    function conflictBack(picked, partnerColor, kind) {
      // Keep the invalid pick out; default to the first open color.
      colorId = firstOpenColor(partnerColor);
      showHello({ kind: kind, partnerColor: partnerColor });
    }

    function finish() {
      root.classList.add("hidden");
      if (onDone) onDone();
    }
  }

  function partnerColorOf(pod, meId) {
    if (!pod || !pod.members) return null;
    var po = pod.members.filter(function (m) { return m.id !== meId; })[0];
    return po && Colors.isValid(po.color) ? po.color : null;
  }

  function firstOpenColor(partnerColor) {
    for (var i = 0; i < Colors.ORDER.length; i++) {
      var id = Colors.ORDER[i];
      if (partnerColor && (id === partnerColor || Colors.blocked(id, partnerColor))) continue;
      return id;
    }
    return "blue";
  }

  /* ---------- step 4: first pour ---------- */

  function showPour() {
    root.innerHTML =
      '<div class="onb">' +
      '<p class="onb-kicker">Last thing.</p>' +
      "<h1>Pour your first glass.</h1>" +
      '<button class="tumbler" id="ob-pour" aria-label="Tap the glass. It is your first check-in." style="' + Colors.liquidVars(colorId) + '">' +
      '<span class="tumbler-fill"><svg class="liq-wave" viewBox="0 0 120 10" preserveAspectRatio="none" aria-hidden="true">' +
      '<path d="M0 5 Q 15 1 30 5 T 60 5 T 90 5 T 120 5 T 150 5 V10 H0 Z"/></svg></span>' +
      '<span class="tumbler-glass"></span>' +
      "</button>" +
      '<p class="lede">Tap the glass. It\'s your first check-in.</p>' +
      "</div>" +
      '<div class="pour-flood" id="ob-pourflood" aria-hidden="true" style="' + Colors.liquidVars(colorId) + '"><i></i><i></i><i></i><i></i><i></i><i></i></div>';

    var poured = false;
    document.getElementById("ob-pour").addEventListener("click", function () {
      if (poured) return;
      poured = true;
      var btn = document.getElementById("ob-pour");
      btn.classList.add("poured");
      btn.disabled = true;
      setTimeout(function () {
        document.getElementById("ob-pourflood").classList.add("go");
      }, 500);

      var dateStr = localDate();
      var write = new Promise(function (resolve) {
        Data.fetchCheckin(dateStr, person).then(function (entries) {
          var cur = (entries && entries.water) || 0;
          if (cur >= 1) { resolve({ count: cur }); return; }
          Data.saveEntry(dateStr, person, "water", 1, undefined, {
            ok: function () { resolve({ count: 1 }); },
            fail: function () { resolve({ failed: true }); }
          });
        }).catch(function () { resolve({ failed: true }); });
      });
      var anim = new Promise(function (resolve) { setTimeout(resolve, 2100); });
      Promise.all([write, anim]).then(function (results) {
        var r = results[0];
        if (r.failed) {
          showToast("Couldn't save. Check your connection and tap again.");
          poured = false;
          btn.classList.remove("poured");
          btn.disabled = false;
          document.getElementById("ob-pourflood").classList.remove("go");
          return;
        }
        showDone(r.count);
      });
    });
  }

  /* ---------- step 5: done ---------- */

  function showDone(count) {
    var habitsDoc = Store.get("habits");
    var target = 8;
    if (habitsDoc && habitsDoc.habits) {
      var w = habitsDoc.habits.filter(function (h) { return h.id === "water"; })[0];
      if (w && w.targets && w.targets[person]) target = w.targets[person];
    }
    var remaining = Math.max(0, target - count);
    var down = count === 1 ? "One glass" : count + " glasses";
    var partner = otherId(person);
    var meColor = Colors.get(colorId).base;
    var poColor = Colors.get(Store.getColorId(partner)).base;

    root.innerHTML =
      '<div class="onb">' +
      '<p class="onb-kicker">and just like that,</p>' +
      "<h1>You're in.</h1>" +
      '<div class="done-avatars" aria-hidden="true">' +
      '<span class="done-a" style="background:' + meColor + '">' + esc(initial(person)) + "</span>" +
      '<span class="done-a" style="background:' + poColor + '">' + esc(initial(partner)) + "</span>" +
      "</div>" +
      '<p class="lede">' + esc(down) + " down, " + remaining + " to go. " + esc(displayName(partner)) + " is already here.</p>" +
      '<button class="btn" id="ob-enter">Open Today</button>' +
      "</div>";

    document.getElementById("ob-enter").addEventListener("click", function () {
      Store.applyColor();
      root.classList.add("hidden");
      if (onDone) onDone();
    });
  }

  /* ---------- entry ---------- */

  function start(el, done, options) {
    root = el;
    onDone = done;
    retoken = !!(options && options.retoken);
    root.classList.remove("hidden");
    person = Store.get("person");
    if (retoken && person) {
      colorId = Store.getColorId(person);
      showToken();
    } else {
      retoken = false;
      person = null;
      colorId = null;
      viaInstall = false;
      showWelcome();
    }
  }

  return { start: start };
})();
