/* Shared helpers. No dependencies. */

function localDate(d) {
  d = d || new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function addDays(dateStr, n) {
  var parts = dateStr.split("-").map(Number);
  var d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setDate(d.getDate() + n);
  return localDate(d);
}

function isIOS() {
  if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) return true;
  // iPadOS 13+ reports a Mac user agent; touch points give it away.
  return /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
}

function showToast(msg, ms) {
  var el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(function () { el.classList.add("hidden"); }, ms || 2600);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

// Background scroll lock for bottom sheets. iOS Safari ignores
// overflow:hidden on body, so pin the body with position:fixed at the
// current offset and put the scroll back on unlock. Ref-counted so a sheet
// opened over another sheet (or a double close) can't unlock early.
var _scrollLock = { count: 0, y: 0 };

function lockScroll() {
  if (_scrollLock.count++ > 0) return;
  _scrollLock.y = window.scrollY || window.pageYOffset || 0;
  var s = document.body.style;
  s.position = "fixed";
  s.top = -_scrollLock.y + "px";
  s.left = "0";
  s.right = "0";
  s.width = "100%";
}

function unlockScroll() {
  // A closing sheet drops the keyboard. Blur now, while the field is still in
  // the DOM, so focusout fires and app.js clears body.kb-open.
  var a = document.activeElement;
  if (a && a.closest && a.closest(".sheet") && a.blur) a.blur();
  if (_scrollLock.count === 0) return;
  if (--_scrollLock.count > 0) return;
  var s = document.body.style;
  s.position = "";
  s.top = "";
  s.left = "";
  s.right = "";
  s.width = "";
  window.scrollTo(0, _scrollLock.y);
}

// Dragging the dimmed backdrop behind a sheet should do nothing. Non-passive
// only on the scrim itself, so page scrolling elsewhere stays on the fast path.
function blockScrimScroll(scrim) {
  scrim.addEventListener("touchmove", function (e) { e.preventDefault(); }, { passive: false });
}
