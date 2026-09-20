/* Person color palette.
   Curated for liquid rendering and distinguishability, including for
   color-blind eyes. Spec: habit-tracker-color-spec.md.
   Colors are stored as ids in pod.json; this module maps ids to values,
   so the palette can be tuned later without migrating data. */

var Colors = (function () {
  // base: true color. top/bottom: liquid gradient stops.
  // text: color of text sitting on the liquid. flood: screen-flood opacity.
  // inkDark/inkLight: accessible colored-text shades for dark/light glass.
  var PALETTE = {
    blue:    { name: "Blue",    base: "#0A84FF", top: "#64D2FF", bottom: "#0040DD", text: "#FFFFFF", inkDark: "#88BAFD", inkLight: "#046DD5", flood: 0.82 },
    indigo:  { name: "Indigo",  base: "#5E5CE6", top: "#8E8CFF", bottom: "#3634A3", text: "#FFFFFF", inkDark: "#A7B0FF", inkLight: "#5E5CE6", flood: 0.82 },
    magenta: { name: "Magenta", base: "#DA3FD0", top: "#F08CFF", bottom: "#A0199E", text: "#FFFFFF", inkDark: "#FB83F0", inkLight: "#C220B9", flood: 0.82 },
    pink:    { name: "Pink",    base: "#FF375F", top: "#FF8FAB", bottom: "#D30F45", text: "#FFFFFF", inkDark: "#FD959C", inkLight: "#DC0146", flood: 0.82 },
    coral:   { name: "Coral",   base: "#FF6B4A", top: "#FFB199", bottom: "#E5391F", text: "#111114", inkDark: "#FF977F", inkLight: "#C93815", flood: 0.50 },
    orange:  { name: "Orange",  base: "#FF9F0A", top: "#FFD08A", bottom: "#F26B0C", text: "#111114", inkDark: "#F2A64D", inkLight: "#9B600B", flood: 0.50 },
    gold:    { name: "Gold",    base: "#FFD60A", top: "#FFF1A6", bottom: "#FFA70A", text: "#111114", inkDark: "#F7D85D", inkLight: "#816C0E", flood: 0.50 },
    teal:    { name: "Teal",    base: "#40C8E0", top: "#8CF0FF", bottom: "#0A95B5", text: "#111114", inkDark: "#67C8DA", inkLight: "#13798A", flood: 0.50 }
  };

  var ORDER = ["blue", "indigo", "magenta", "pink", "coral", "orange", "gold", "teal"];

  var DEFAULTS = { prithvi: "blue", sowmya: "orange" };

  // Pairs too close to tell apart (normal vision < 20, or deutan/protan < 12
  // in CAM02-UCS after Machado simulation at full severity).
  var BLOCK = {
    "blue|indigo": 1, "blue|magenta": 1, "indigo|magenta": 1,
    "pink|coral": 1, "coral|orange": 1, "orange|gold": 1
  };

  function get(id) {
    return PALETTE[id] || PALETTE.blue;
  }

  function isValid(id) {
    return !!PALETTE[id];
  }

  function blocked(a, b) {
    if (!a || !b || a === b) return false;
    return !!(BLOCK[a + "|" + b] || BLOCK[b + "|" + a]);
  }

  // Inline CSS vars for one liquid surface: --liq-top, --liq-base,
  // --liq-bottom, --liq-text.
  function liquidVars(id) {
    var c = get(id);
    return "--liq-top:" + c.top + ";--liq-base:" + c.base +
      ";--liq-bottom:" + c.bottom + ";--liq-text:" + c.text + ";";
  }

  return {
    get: get,
    isValid: isValid,
    blocked: blocked,
    liquidVars: liquidVars,
    ORDER: ORDER,
    DEFAULTS: DEFAULTS
  };
})();
