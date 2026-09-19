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
