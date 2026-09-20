/* App state. One device, one person. The person id and token live in
   localStorage on the device (one fine-grained PAT per device).
   Person colors live in pod.json per member (as palette ids); the palette
   itself is in js/colors.js. Repo coordinates are never committed. */

var Store = (function () {
  var LS = {
    person: "ht.person",
    token: "ht.token",
    owner: "ht.owner",
    repo: "ht.repo"
  };

  // One-time cleanup: colors used to live in localStorage; they now come
  // from pod.json.
  try { localStorage.removeItem("ht.color"); } catch (e) {}

  var state = {
    person: localStorage.getItem(LS.person),
    token: localStorage.getItem(LS.token),
    owner: localStorage.getItem(LS.owner) || "prithvikrishnab4u",
    repo: localStorage.getItem(LS.repo) || "habit-tracker-data",
    pod: null,
    habits: null,
    online: navigator.onLine !== false
  };

  function isSetup() {
    return !!(state.person && state.token);
  }

  function setPerson(id) {
    state.person = id;
    localStorage.setItem(LS.person, id);
  }

  // Palette id for a member. Falls back to the per-person default when
  // pod.json is not loaded yet or the member has no color stored.
  function getColorId(personId) {
    var id = personId || state.person;
    if (state.pod && state.pod.members) {
      var m = state.pod.members.filter(function (x) { return x.id === id; })[0];
      if (m && Colors.isValid(m.color)) return m.color;
    }
    return Colors.DEFAULTS[id] || "blue";
  }

  function applyColor(colorId) {
    var id = colorId || getColorId();
    var hex = Colors.get(id).base;
    document.documentElement.style.setProperty("--person", hex);
    var orb = document.querySelector(".orb-you");
    if (orb) orb.style.background = hex;
    var pid = partnerId();
    if (pid) {
      var phex = Colors.get(getColorId(pid)).base;
      document.documentElement.style.setProperty("--partner", phex);
      var porb = document.querySelector(".orb-partner");
      if (porb) porb.style.background = phex;
    }
  }

  function setToken(t) {
    state.token = t;
    localStorage.setItem(LS.token, t);
  }

  function setRepo(owner, repo) {
    state.owner = owner;
    state.repo = repo;
    localStorage.setItem(LS.owner, owner);
    localStorage.setItem(LS.repo, repo);
  }

  function partnerId() {
    if (!state.pod || !state.person) return null;
    var other = state.pod.members.filter(function (m) { return m.id !== state.person; });
    return other.length ? other[0].id : null;
  }

  function personName(id) {
    if (!state.pod) return id;
    var m = state.pod.members.filter(function (p) { return p.id === id; })[0];
    return m ? m.name : id;
  }

  function personColor(id) {
    return Colors.get(getColorId(id)).base;
  }

  // Load pod.json + habits.json from the data repo into memory.
  function load() {
    Api.setConfig({ owner: state.owner, repo: state.repo, token: state.token });
    return Api.getJSON("pod.json").then(function (podRes) {
      return Api.getJSON("habits.json").then(function (habitsRes) {
        state.pod = podRes.data;
        state.habits = habitsRes.data;
        return state;
      });
    });
  }

  function signOut() {
    localStorage.removeItem(LS.person);
    localStorage.removeItem(LS.token);
    state.person = null;
    state.token = null;
    state.pod = null;
    state.habits = null;
  }

  function get(k) { return state[k]; }

  return {
    isSetup: isSetup,
    setPerson: setPerson,
    getColorId: getColorId,
    applyColor: applyColor,
    setToken: setToken,
    setRepo: setRepo,
    partnerId: partnerId,
    personName: personName,
    personColor: personColor,
    load: load,
    signOut: signOut,
    get: get
  };
})();
