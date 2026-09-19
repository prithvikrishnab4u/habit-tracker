/* GitHub Contents API client.
   Reads and writes JSON in the data repo. No build step, no dependencies.
   - Reads use cache: 'no-store' so check-ins are never stale.
   - Writes encode through TextEncoder before base64 (btoa is Latin-1 only).
   - Writes are SHA-guarded: on 409/422 the file is re-read, the change
     re-applied by the caller, and the write retried (up to 3 attempts). */

var Api = (function () {
  var BASE = "https://api.github.com";
  var cfg = {
    owner: "prithvikrishnab4u",
    repo: "habit-tracker-data",
    branch: "main",
    token: ""
  };

  function setConfig(c) {
    for (var k in c) cfg[k] = c[k];
  }

  function getConfig() {
    return { owner: cfg.owner, repo: cfg.repo, branch: cfg.branch, hasToken: !!cfg.token };
  }

  function headers() {
    return {
      "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + cfg.token,
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }

  function contentsUrl(path) {
    return BASE + "/repos/" + cfg.owner + "/" + cfg.repo +
      "/contents/" + path.split("/").map(encodeURIComponent).join("/");
  }

  function b64encode(obj) {
    var bytes = new TextEncoder().encode(JSON.stringify(obj));
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function b64decode(b64) {
    var bin = atob(b64.replace(/\s/g, ""));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  // Returns { data, sha }. data is null when the file does not exist yet.
  function getJSON(path) {
    var url = contentsUrl(path) + "?ref=" + encodeURIComponent(cfg.branch);
    return fetch(url, { headers: headers(), cache: "no-store" }).then(function (res) {
      if (res.status === 404) return { data: null, sha: null };
      if (!res.ok) {
        var readErr = new Error("read failed: " + res.status);
        readErr.status = res.status;
        throw readErr;
      }
      return res.json().then(function (body) {
        return { data: JSON.parse(b64decode(body.content)), sha: body.sha };
      });
    });
  }

  // putJSON(path, obj, message, mutate?)
  // mutate(prevData) lets the caller re-apply its change onto fresh data
  // when a conflict forces a retry. Retries up to 3 times.
  function putJSON(path, obj, message, mutate) {
    var url = contentsUrl(path);
    var attempt = 0;
    var current = obj;

    function attemptWrite() {
      attempt++;
      return getJSON(path).then(function (fresh) {
        // Always rebuild from fresh data when a mutator exists. The first
        // attempt used to write `obj` verbatim, which wiped the file when the
        // caller passed null and relied on the mutator.
        if (typeof mutate === "function") {
          current = mutate(fresh.data) || current;
        }
        // Never write an empty document. A mutator that returns nothing (or
        // a caller that passed null with no mutator) must fail loudly instead
        // of wiping the file.
        if (current === null || current === undefined) {
          throw new Error("refusing to write empty document");
        }
        var payload = {
          message: message,
          content: b64encode(current),
          branch: cfg.branch
        };
        if (fresh.sha) payload.sha = fresh.sha;
        var reqHeaders = headers();
        reqHeaders["Content-Type"] = "application/json";
        return fetch(url, {
          method: "PUT",
          headers: reqHeaders,
          body: JSON.stringify(payload)
        }).then(function (res) {
          if (res.ok) return res.json();
          if ((res.status === 409 || res.status === 422) && attempt < 3) {
            return attemptWrite();
          }
          var writeErr = new Error("write failed: " + res.status);
          writeErr.status = res.status;
          throw writeErr;
        });
      });
    }

    return attemptWrite();
  }

  return {
    setConfig: setConfig,
    getConfig: getConfig,
    getJSON: getJSON,
    putJSON: putJSON
  };
})();
