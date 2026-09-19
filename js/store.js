/* App state. One device, one person. Profile and color live in
   localStorage; the token lives in localStorage on the device (one
   fine-grained PAT per device). Repo coordinates are never committed. */

var Store = (function () {
  var LS = {
    person: "ht.person",
    color: "ht.color",
    token: "ht.token",
    owner: "ht.owner",
    repo: "ht.repo"
  };

  var DEFAULT_COLORS = { prithvi: "#0A84FF", sowmya: "#FF9F0A" };

  var state = {
    person: localStorage.getItem(LS.person),
    color: localStorage.getItem(LS.color),
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
    if (!state.color && DEFAULT_COLORS[id]) setColor(DEFAULT_COLORS[id]);
  }

  function setColor(hex) {
    state.color = hex;
    localStorage.setItem(LS.color, hex);
    applyColor();
  }

  function applyColor() {
    if (state.color) {
      document.documentElement.style.setProperty("--person", state.color);
    }
    var orb = document.querySelector(".orb-you");
    if (orb && state.color) orb.style.background = state.color;
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
    if (id === state.person) return state.color || DEFAULT_COLORS[id] || "#0A84FF";
    return DEFAULT_COLORS[id] || "#FF9F0A";
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
    localStorage.removeItem(LS.color);
    localStorage.removeItem(LS.token);
    state.person = null;
    state.color = null;
    state.token = null;
    state.pod = null;
    state.habits = null;
  }

  function get(k) { return state[k]; }

  return {
    isSetup: isSetup,
    setPerson: setPerson,
    setColor: setColor,
    applyColor: applyColor,
    setToken: setToken,
    setRepo: setRepo,
    partnerId: partnerId,
    personName: personName,
    personColor: personColor,
    load: load,
    signOut: signOut,
    get: get,
    DEFAULT_COLORS: DEFAULT_COLORS
  };
})();
