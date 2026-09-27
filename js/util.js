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

// Stage 2: Icon set. 24px line icons in currentColor, one per habit and
// Free time category, plus a few actions. icon(name) returns the SVG;
// habitIcon(habit) picks by id first, then by words in the name.
var ICON_PATHS = {
  water: '<path d="M12 3.5c-3.2 4.2-6 7.3-6 10.6a6 6 0 0 0 12 0c0-3.3-2.8-6.4-6-10.6z"/><path d="M9.2 14.6a2.9 2.9 0 0 0 2.6 2.7"/>',
  exercise: '<path d="M6.5 7.5v9M17.5 7.5v9M3.5 10v4M20.5 10v4M6.5 12h11"/>',
  steps: '<path d="M8.2 3.5c1.6 0 2.6 1.9 2.6 4.3s-1.1 4.2-2.6 4.2-2.7-1.8-2.7-4.2 1.1-4.3 2.7-4.3zM6 15h4.3v1.3a2.15 2.15 0 0 1-4.3 0zM15.8 7.5c1.6 0 2.7 1.9 2.7 4.3s-1.1 4.2-2.7 4.2-2.6-1.8-2.6-4.2 1-4.3 2.6-4.3zM13.7 19h4.3v.3a2.15 2.15 0 0 1-4.3 0z"/>',
  sugar: '<rect x="5" y="5" width="14" height="14" rx="3.5"/><path d="M4 20L20 4"/>',
  meals: '<circle cx="14" cy="12.5" r="6.5"/><circle cx="14" cy="12.5" r="3"/><path d="M4.5 4v5.5a2 2 0 0 0 2 2V20M6.5 4v4.5M8.5 4v5.5a2 2 0 0 1-2 2"/>',
  sleep: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
  read: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
  habit: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.3l2.4 2.4 4.6-4.9"/>',
  Work: '<rect x="3.5" y="7" width="17" height="12.5" rx="2.5"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12.5h17"/>',
  Home: '<path d="M4 11.2L12 4.5l8 6.7"/><path d="M6 9.6V19.5h12V9.6M10 19.5v-5h4v5"/>',
  Learn: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
  Body: '<path d="M3 12.5h4l2.2-5 3.6 10 2.2-5H21"/>',
  Family: '<circle cx="9" cy="8.5" r="3"/><circle cx="17" cy="9.5" r="2.5"/><path d="M3.5 19.5c.5-3.3 2.8-5 5.5-5s5 1.7 5.5 5M15 14.4c.6-.2 1.3-.3 2-.3 2.3 0 3.8 1.6 4 4.4"/>',
  Admin: '<rect x="5" y="4.5" width="14" height="16" rx="2.5"/><path d="M9 4.5v-1h6v1M9 12.5l2 2 4-4"/>',
  Any: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/>',
  none: '<circle cx="12" cy="12" r="7.5" stroke-dasharray="3 3"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="8.8" cy="8.8" r="1.1" fill="currentColor"/><circle cx="15.2" cy="15.2" r="1.1" fill="currentColor"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/><circle cx="15.2" cy="8.8" r="1.1" fill="currentColor"/><circle cx="8.8" cy="15.2" r="1.1" fill="currentColor"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  flame: '<path d="M12 3.5c.9 3.4 5 5.3 5 9.8a5 5 0 0 1-10 0c0-2.4 1.3-3.9 2.4-5 .3 1.6.9 2.5 2 3 .5-2.9-.4-5.3.6-7.8z"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5v1.5A2.5 2.5 0 0 0 7.5 10H8M16 6h3v1.5A2.5 2.5 0 0 1 16.5 10H16M12 13v3.5M8.5 20h7M10 16.5h4V20h-4z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'
};

function icon(name, cls) {
  return '<svg class="ic' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" aria-hidden="true" fill="none" ' +
    'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    (ICON_PATHS[name] || ICON_PATHS.habit) + "</svg>";
}

function habitIconName(h) {
  var id = (h && h.id) || "";
  if (ICON_PATHS[id] && /^[a-z]/.test(id)) return id;
  var n = ((h && h.name) || "").toLowerCase();
  if (/water|drink|hydrat/.test(n)) return "water";
  if (/exercise|workout|gym|lift|yoga|run/.test(n)) return "exercise";
  if (/step|walk/.test(n)) return "steps";
  if (/sugar|sweet|junk/.test(n)) return "sugar";
  if (/sleep|bed/.test(n)) return "sleep";
  if (/read|book/.test(n)) return "read";
  if (/meal|eat|food/.test(n)) return "meals";
  return "habit";
}

// Icon in a small rounded well: the one "identity" shape used everywhere.
function iconWell(name, cls) {
  return '<span class="ic-well' + (cls ? " " + cls : "") + '" aria-hidden="true">' + icon(name) + "</span>";
}
