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
  }

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
      Store.load().then(showShell).catch(function () {
        // Data failed to load (bad token, offline). Let the user re-onboard
        // rather than staring at a dead shell.
        document.getElementById("tabbar").classList.add("hidden");
        Onboarding.start(document.getElementById("screen-onboarding"), showShell);
      });
    } else {
      Onboarding.start(document.getElementById("screen-onboarding"), showShell);
    }

    // Refetch when the app comes back to the foreground (spec: no cached
    // habit data in v1).
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && Store.isSetup() && navigator.onLine) {
        Store.load().catch(function () {});
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
