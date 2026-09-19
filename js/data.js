/* Check-in data layer.
   - Phone-local dates only. Never toISOString().
   - Per-person day files: checkins/YYYY-MM-DD/{person}.json
   - In-memory cache so the two phones' files are each read once per view.
   - saveEntry applies an optimistic change, writes with SHA-guarded retry,
     and keeps one undo step. */

var Data = (function () {
  var cache = {};   // "date/person" -> { entries } (entries may be {})
  var undoStack = [];

  function key(dateStr, personId) { return dateStr + "/" + personId; }

  function path(dateStr, personId) {
    return "checkins/" + dateStr + "/" + personId + ".json";
  }

  function getCached(dateStr, personId) {
    var c = cache[key(dateStr, personId)];
    return c ? c.entries : null;
  }

  function fetchCheckin(dateStr, personId) {
    var k = key(dateStr, personId);
    if (cache[k]) return Promise.resolve(cache[k].entries);
    return Api.getJSON(path(dateStr, personId)).then(function (res) {
      var entries = (res.data && res.data.entries) || {};
      cache[k] = { entries: entries };
      return entries;
    }).catch(function () {
      cache[k] = { entries: {} };
      return {};
    });
  }

  function value(dateStr, personId, habitId) {
    var e = getCached(dateStr, personId);
    return e ? e[habitId] : undefined;
  }

  // Save one habit value. onOk/onFail are UI callbacks.
  // Returns nothing; the row already updated optimistically.
  function saveEntry(dateStr, personId, habitId, newVal, prevVal, ui) {
    var k = key(dateStr, personId);
    var entries = Object.assign({}, getCached(dateStr, personId) || {});
    if (newVal === undefined || newVal === null) delete entries[habitId];
    else entries[habitId] = newVal;
    cache[k] = { entries: entries };

    undoStack.push({ date: dateStr, person: personId, habitId: habitId, prev: prevVal });
    if (undoStack.length > 20) undoStack.shift();

    if (ui && ui.pending) ui.pending(true);

    var doc = { date: dateStr, person: personId, entries: entries };
    Api.putJSON(path(dateStr, personId), doc, "Check-in " + dateStr + " " + personId,
      function (fresh) {
        var merged = Object.assign({}, (fresh && fresh.entries) || {});
        if (newVal === undefined || newVal === null) delete merged[habitId];
        else merged[habitId] = newVal;
        return { date: dateStr, person: personId, entries: merged };
      }
    ).then(function () {
      if (ui && ui.pending) ui.pending(false);
      if (ui && ui.ok) ui.ok();
    }).catch(function () {
      // Roll back the optimistic change.
      var rolled = Object.assign({}, cache[k].entries);
      if (prevVal === undefined || prevVal === null) delete rolled[habitId];
      else rolled[habitId] = prevVal;
      cache[k] = { entries: rolled };
      undoStack.pop();
      if (ui && ui.pending) ui.pending(false);
      if (ui && ui.fail) ui.fail();
    });
  }

  function undoLast() {
    var last = undoStack.pop();
    if (!last) return null;
    var k = key(last.date, last.person);
    var entries = Object.assign({}, getCached(last.date, last.person) || {});
    if (last.prev === undefined || last.prev === null) delete entries[last.habitId];
    else entries[last.habitId] = last.prev;
    cache[k] = { entries: entries };
    var doc = { date: last.date, person: last.person, entries: entries };
    return Api.putJSON(path(last.date, last.person), doc, "Undo check-in " + last.date)
      .then(function () { return last; });
  }

  function peekUndo() { return undoStack[undoStack.length - 1] || null; }

  function invalidate(dateStr, personId) { delete cache[key(dateStr, personId)]; }

  return {
    fetchCheckin: fetchCheckin,
    getCached: getCached,
    value: value,
    saveEntry: saveEntry,
    undoLast: undoLast,
    peekUndo: peekUndo,
    invalidate: invalidate
  };
})();
