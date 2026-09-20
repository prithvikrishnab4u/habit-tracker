/* Boot. Onboarding first, then the app shell.
   Tab switching here; screen content lands in later phases. */

(function () {
  var screens = {
    today: "screen-today",
    pod: "screen-pod",
    habits: "screen-habits"
  };

  function showTab(name) {
    for (var key in screens) {
      document.getElementById(screens[key]).classList.toggle("hidden", key !== name);
    }
    document.querySelectorAll(".tab").forEach(function (t) {
      t.classList.toggle("active", t.getAttribute("data-tab") === name);
    });
    if (name === "today") Today.render();
    if (name === "pod") Pod.render();
    if (name === "habits") Manage.render();
    window.scrollTo(0, 0);
  }

  window.App = { showTab: showTab };

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

  function boot() {
    Store.applyColor();
    Today.init();
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
