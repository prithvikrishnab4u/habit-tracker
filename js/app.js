/* Boot. Onboarding first, then the app shell.
   Tab switching here; screen content lands in later phases. */

(function () {
  var screens = {
    today: "screen-today",
    pod: "screen-pod",
    backlog: "screen-backlog",
    habits: "screen-habits"
  };

  // Per-tab scroll memory. Switching tabs puts you back where you were;
  // re-tapping the active tab scrolls to the top (iOS convention).
  var currentTab = null;
  var tabScroll = {};
  var restoreToken = 0;

  // Screens render async (network), so the page may not be tall enough yet
  // to reach the saved offset. Retry for about a second, and give up as soon
  // as the user touches the screen or switches tabs again.
  function restoreScroll(y) {
    var token = ++restoreToken;
    var tries = 0;
    function attempt() {
      if (token !== restoreToken) return;
      window.scrollTo(0, y);
      var maxY = document.documentElement.scrollHeight - window.innerHeight;
      if (y <= 0 || maxY >= y || ++tries > 60) return;
      requestAnimationFrame(attempt);
    }
    attempt();
  }
  // Any touch or wheel cancels a pending restore so it never fights the user.
  function cancelRestore() { restoreToken++; }
  document.addEventListener("touchstart", cancelRestore, { passive: true });
  document.addEventListener("wheel", cancelRestore, { passive: true });

  function showTab(name) {
    var retap = name === currentTab;
    if (currentTab && !retap) tabScroll[currentTab] = window.scrollY || window.pageYOffset || 0;
    currentTab = name;
    for (var key in screens) {
      document.getElementById(screens[key]).classList.toggle("hidden", key !== name);
    }
    document.querySelectorAll(".tab").forEach(function (t) {
      t.classList.toggle("active", t.getAttribute("data-tab") === name);
    });
    // Habits & settings is a pushed screen (gear on Today), not a tab: it
    // hides the tab bar and offers its own back button.
    document.body.classList.toggle("on-settings", name === "habits");
    if (window.Today && Today.clearToast) Today.clearToast();
    if (name === "today") Today.render();
    if (name === "pod") Pod.render();
    if (name === "backlog") Backlog.render();
    if (name === "habits") Manage.render();
    if (retap) {
      tabScroll[name] = 0;
      cancelRestore();
      window.scrollTo(0, 0);
    } else {
      restoreScroll(tabScroll[name] || 0);
    }
  }

  // Back from the settings screen returns to the tab it was opened from.
  var lastTab = "today";
  function openSettings() {
    if (currentTab && currentTab !== "habits") lastTab = currentTab;
    showTab("habits");
  }
  function closeSettings() { showTab(lastTab); }

  window.App = { showTab: showTab, openSettings: openSettings, closeSettings: closeSettings };

  function showShell() {
    document.getElementById("screen-onboarding").classList.add("hidden");
    document.getElementById("tabbar").classList.remove("hidden");
    showTab("today");
  }

  function setOfflineBanner() {
    var banner = document.getElementById("offline-banner");
    var offline = !navigator.onLine;
    banner.classList.toggle("hidden", !offline);
  }

  /* ----- iOS touch behavior ----- */

  // An empty touchstart listener makes iOS Safari apply :active styles to
  // every element, not just links. Passive, so scrolling is unaffected.
  document.addEventListener("touchstart", function () {}, { passive: true });

  // Block pinch-zoom (iOS ignores maximum-scale in the viewport meta).
  document.addEventListener("gesturestart", function (e) { e.preventDefault(); }, { passive: false });

  // Double-tap-zoom guard. CSS touch-action: manipulation already covers
  // modern iOS; this is the fallback. preventDefault on touchend also cancels
  // the synthesized click, so it skips anything that acts on click (buttons,
  // role=button, the scrim) and tiles (pointer events; +1 must stay rapid),
  // plus form fields that need the tap to focus or place the caret.
  var lastTouchEnd = { t: 0, x: 0, y: 0 };
  var NO_GUARD = "button, a, input, textarea, select, label, [contenteditable], [role=button], .tile, .scrim";
  document.addEventListener("touchend", function (e) {
    var t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    var now = Date.now();
    var prev = lastTouchEnd;
    lastTouchEnd = { t: now, x: t.clientX, y: t.clientY };
    if (e.touches && e.touches.length) return;
    if (now - prev.t > 300) return;
    if (Math.abs(t.clientX - prev.x) > 30 || Math.abs(t.clientY - prev.y) > 30) return;
    var target = e.target && e.target.closest ? e.target : e.target && e.target.parentElement;
    if (!target || target.closest(NO_GUARD)) return;
    e.preventDefault();
  }, { passive: false });

  // Hide the fixed tab bar while the keyboard is up, so it doesn't ride up
  // over a sheet's inputs. Only text-entry fields raise the keyboard.
  function isTextField(el) {
    if (!el || !el.tagName) return false;
    var tag = el.tagName.toLowerCase();
    if (tag === "textarea" || el.isContentEditable) return true;
    if (tag !== "input") return false;
    return !/^(button|checkbox|radio|range|color|file|submit|reset|image|hidden)$/i.test(el.type || "text");
  }
  document.addEventListener("focusin", function (e) {
    if (isTextField(e.target)) document.body.classList.add("kb-open");
  });
  document.addEventListener("focusout", function (e) {
    // Moving focus straight to another field keeps the keyboard up.
    if (isTextField(e.relatedTarget)) return;
    document.body.classList.remove("kb-open");
  });

  function boot() {
    Store.applyColor();
    Today.init();
    Backlog.init();
    setOfflineBanner();
    window.addEventListener("online", function () {
      document.getElementById("offline-banner").classList.add("hidden");
      showToast("Back online.");
    });
    window.addEventListener("offline", function () {
      document.getElementById("offline-banner").classList.remove("hidden");
    });

    document.querySelectorAll(".tab").forEach(function (t) {
      t.addEventListener("click", function () {
        showTab(t.getAttribute("data-tab"));
      });
    });

    if (Store.isSetup()) {
      tryLoad();
    } else {
      Onboarding.start(document.getElementById("screen-onboarding"), showShell);
    }

    // Refetch when the app comes back to the foreground (spec: no cached
    // habit data in v1).
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && Store.isSetup() && navigator.onLine) {
        // Drop cached check-ins so the partner's latest entries come through.
        Data.invalidateAll();
        Store.load().then(function () {
          if (!document.getElementById("screen-today").classList.contains("hidden")) Today.render();
          if (!document.getElementById("screen-pod").classList.contains("hidden")) Pod.render();
          if (!document.getElementById("screen-backlog").classList.contains("hidden")) Backlog.render();
        }).catch(function () {});
      }
    });
  }

  // Boot load: only a bad/revoked token (401/403) sends the user back to
  // onboarding. Network or server failures show a retry screen instead of
  // wiping back to setup.
  function tryLoad() {
    Store.load().then(showShell).catch(function (err) {
      var status = err && err.status;
      if (status === 401 || status === 403) {
        document.getElementById("tabbar").classList.add("hidden");
        Onboarding.start(document.getElementById("screen-onboarding"), showShell);
      } else {
        showLoadError();
      }
    });
  }

  function showLoadError() {
    var scr = document.getElementById("screen-onboarding");
    document.getElementById("tabbar").classList.add("hidden");
    scr.classList.remove("hidden");
    scr.innerHTML =
      '<div class="onb">' +
      '<div class="onb-bg" aria-hidden="true"><i class="ob1"></i><i class="ob2"></i><i class="ob3"></i></div>' +
      '<div class="onb-screen onb-center">' +
      "<h1>Couldn't connect</h1>" +
      '<p class="lede">Habit Tracker could not reach GitHub. Check your connection and try again. Your setup is saved on this device.</p>' +
      '<button class="btn" id="le-retry">Retry</button>' +
      '<button class="btn btn-ghost" id="le-token">Use a different token</button>' +
      "</div></div>";
    document.getElementById("le-retry").addEventListener("click", function () {
      scr.innerHTML = "";
      tryLoad();
    });
    document.getElementById("le-token").addEventListener("click", function () {
      scr.innerHTML = "";
      // Re-token path: jumps straight to the handshake step with its own
      // title. Person and color are kept.
      Onboarding.start(scr, showShell, { retoken: true });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
