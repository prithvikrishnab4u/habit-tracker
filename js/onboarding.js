/* Onboarding: welcome, install, person, color, token.
   Renders into #screen-onboarding. Calls onDone() when setup completes. */

var Onboarding = (function () {
  var root = null;
  var onDone = null;
  var person = null;
  var color = null;

  var SWATCHES = [
    "#0A84FF", "#FF9F0A", "#30D158", "#A259FF",
    "#FF453A", "#64D2FF", "#FFD60A", "#FF6482"
  ];

  function stepsBar(n, total) {
    var s = '<div class="steps" aria-hidden="true">';
    for (var i = 0; i < total; i++) s += '<i class="' + (i < n ? "done" : "") + '"></i>';
    return s + "</div>";
  }

  function mark() {
    return '<div class="onb-mark glass"><svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<circle cx="8.5" cy="12" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
      '<circle cx="15.5" cy="12" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></div>';
  }

  function showWelcome() {
    root.innerHTML =
      '<div class="onb">' + mark() +
      "<h1>Habit Tracker</h1>" +
      '<p class="lede">One glance for both of you. Log your part in one tap, see the pod stay in sync.</p>' +
      '<button class="btn" id="ob-next">Get started</button>' +
      '<p class="footnote">Private by design. Your data lives in your own GitHub repo, not on our servers.</p>' +
      "</div>";
    document.getElementById("ob-next").addEventListener("click", function () {
      if (isStandalone()) showPerson();
      else showInstall();
    });
  }

  function showInstall() {
    var ios = isIOS();
    var how = ios
      ? "<p>Tap <b>Share</b>, then <b>Add to Home Screen</b>.</p><p>This keeps your login on the home-screen app, separate from Safari.</p>"
      : "<p>Open the browser menu, then tap <b>Install app</b> or <b>Add to Home screen</b>.</p>";
    root.innerHTML =
      '<div class="onb">' + mark() + stepsBar(1, 4) +
      "<h1>Install first</h1>" +
      '<p class="lede">Add Habit Tracker to your home screen so it opens like a real app.</p>' +
      '<div class="install-card glass"><h2>' + (ios ? "iPhone" : "Android") + "</h2>" + how + "</div>" +
      '<button class="btn" id="ob-check">I added it, continue</button>' +
      '<p class="footnote" id="ob-hint"></p>' +
      "</div>";

    function advance() {
      window.removeEventListener("appinstalled", advance);
      showPerson();
    }
    window.addEventListener("appinstalled", advance);

    document.getElementById("ob-check").addEventListener("click", function () {
      if (isStandalone()) {
        advance();
      } else {
        document.getElementById("ob-hint").textContent =
          "Not installed yet. Follow the steps above, then tap continue.";
      }
    });
  }

  function showPerson() {
    root.innerHTML =
      '<div class="onb">' + stepsBar(2, 4) +
      "<h1>Who is this?</h1>" +
      '<p class="lede">This device remembers you, so logging stays one tap.</p>' +
      '<div class="person-pick" role="group" aria-label="Choose person">' +
      '<button class="person-btn" data-person="prithvi" aria-pressed="false">' +
      '<span class="avatar" style="background:#0A84FF">P</span><span>Prithvi</span></button>' +
      '<button class="person-btn" data-person="sowmya" aria-pressed="false">' +
      '<span class="avatar" style="background:#FF9F0A">S</span><span>Sowmya</span></button>' +
      "</div>" +
      '<button class="btn" id="ob-next" disabled>Continue</button>' +
      "</div>";

    var next = document.getElementById("ob-next");
    var btns = root.querySelectorAll(".person-btn");
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        btns.forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
        b.setAttribute("aria-pressed", "true");
        person = b.getAttribute("data-person");
        next.disabled = false;
      });
    });
    next.addEventListener("click", function () {
      Store.setPerson(person);
      color = Store.DEFAULT_COLORS[person] || SWATCHES[0];
      showColor();
    });
  }

  function showColor() {
    var name = person === "prithvi" ? "Prithvi" : "Sowmya";
    var html = '<div class="onb">' + stepsBar(3, 4) +
      "<h1>Pick your color</h1>" +
      '<p class="lede">' + name + ", this tints your rings, your orbs, and your side of the pod.</p>" +
      '<div class="swatches" role="group" aria-label="Choose color">';
    SWATCHES.forEach(function (hex) {
      var pressed = hex.toLowerCase() === String(color).toLowerCase() ? "true" : "false";
      html += '<button class="swatch" data-color="' + hex + '" aria-pressed="' + pressed +
        '" aria-label="Color ' + hex + '" style="background:' + hex + '"></button>';
    });
    html += "</div>" + '<button class="btn" id="ob-next">Continue</button></div>';
    root.innerHTML = html;

    root.querySelectorAll(".swatch").forEach(function (s) {
      s.addEventListener("click", function () {
        root.querySelectorAll(".swatch").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
        s.setAttribute("aria-pressed", "true");
        color = s.getAttribute("data-color");
        Store.setColor(color);
      });
    });
    Store.setColor(color);
    document.getElementById("ob-next").addEventListener("click", showToken);
  }

  function showToken() {
    root.innerHTML =
      '<div class="onb">' + stepsBar(4, 4) +
      "<h1>Connect your data</h1>" +
      '<p class="lede">Paste the GitHub token for this device. It never leaves your phone.</p>' +
      '<div class="token-card glass">' +
      '<label for="ob-owner">Repo owner</label>' +
      '<input id="ob-owner" value="' + esc(Store.get("owner")) + '" readonly>' +
      '<label for="ob-repo">Data repo</label>' +
      '<input id="ob-repo" value="' + esc(Store.get("repo")) + '" readonly>' +
      '<label for="ob-token">Token</label>' +
      '<input id="ob-token" type="password" placeholder="Paste token here" autocomplete="off" autocapitalize="off" spellcheck="false">' +
      "</div>" +
      '<button class="btn" id="ob-paste">Paste</button>' +
      '<button class="btn btn-ghost" id="ob-save">Save and connect</button>' +
      '<p class="onb-error" id="ob-error"></p>' +
      '<p class="footnote">Create it in GitHub Settings, Developer settings, Personal access tokens, Fine-grained. It needs Contents read and write on the data repo only.</p>' +
      "</div>";

    var tokenInput = document.getElementById("ob-token");
    var error = document.getElementById("ob-error");

    document.getElementById("ob-paste").addEventListener("click", function () {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        error.textContent = "Clipboard read is not available. Long-press the field to paste.";
        return;
      }
      navigator.clipboard.readText().then(function (text) {
        tokenInput.value = (text || "").trim();
      }).catch(function () {
        error.textContent = "Could not read the clipboard. Long-press the field to paste.";
      });
    });

    document.getElementById("ob-save").addEventListener("click", function () {
      var token = tokenInput.value.trim();
      if (!token) {
        error.textContent = "Paste your token first.";
        return;
      }
      error.textContent = "";
      var btn = document.getElementById("ob-save");
      btn.disabled = true;
      btn.textContent = "Connecting...";
      Api.setConfig({ owner: Store.get("owner"), repo: Store.get("repo"), token: token });
      Api.getJSON("pod.json").then(function (res) {
        if (!res.data || !res.data.members) throw new Error("bad data");
        Store.setToken(token);
        Store.setColor(color);
        showPayoff(res.data);
      }).catch(function () {
        btn.disabled = false;
        btn.textContent = "Save and connect";
        error.textContent = "That token did not work. Check it and try again.";
      });
    });
  }

  function showPayoff(pod) {
    var names = pod.members.map(function (m) { return m.name; }).join(" and ");
    root.innerHTML =
      '<div class="onb">' + mark() +
      "<h1>You are in.</h1>" +
      '<p class="lede">' + esc(names) + ", one pod, one glance. Today is ready when you are.</p>" +
      '<button class="btn" id="ob-enter">Open today</button>' +
      "</div>";
    document.getElementById("ob-enter").addEventListener("click", function () {
      root.classList.add("hidden");
      if (onDone) onDone();
    });
  }

  function start(el, done) {
    root = el;
    onDone = done;
    person = Store.get("person");
    color = Store.get("color");
    showWelcome();
  }

  return { start: start };
})();
