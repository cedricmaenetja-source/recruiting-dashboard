(function (window, $) {
  var LOGIN_PAGE = "../login.html";
  var VERIFY_PAGE = "../mfa.html";
  var SETUP_PAGE = "../mfa-setup.html";
  var TOKEN = null;

  async function api(path, body) {
    var headers = body ? { "Content-Type": "application/json" } : {};
    if (TOKEN) headers["Authorization"] = "Bearer " + TOKEN;
    var r = await fetch(path, {
      method: body ? "POST" : "GET",
      credentials: "same-origin",
      headers: headers,
      body: body ? JSON.stringify(body) : undefined
    });
    var data = {};
    try { data = await r.json(); } catch (e) {}
    return { ok: r.ok, code: r.status, data: data };
  }

  function codeError(res) {
    if (res.data.reason === "locked") return "Too many attempts. Wait 15 minutes, then try again.";
    if (res.data.reason === "invalid") return "That code didn't match. Try the newest code in your app.";
    return res.data.error || "Something went wrong. Try again.";
  }

  function digitsOnly($input) {
    $input.on("input", function () { this.value = this.value.replace(/\D/g, "").slice(0, 6); });
  }

  var MFA = {
    /** Call once per page, right after initAuth(), before any other MFA call. */
    setToken: function (t) { TOKEN = t; },

    /** Only allow same-site redirects from ?next= */
    nextUrl: function (fallback) {
      var n = new URLSearchParams(location.search).get("next") || fallback || "/";
      return n.charAt(0) === "/" && n.charAt(1) !== "/" ? n : "/";
    },

    /** "none" | "enroll" | "challenge" | "ok" */
    status: async function () {
      var r = await api("/api/mfa/status");
      return r.data.status || "none";
    },

    /** Redirects for anything other than "ok". Returns true if it redirected. */
    route: function (s, next) {
      var q = "?next=" + encodeURIComponent(next || location.pathname + location.search);
      if (s === "none")      { location.replace(LOGIN_PAGE + q); return true; }
      if (s === "enroll")    { location.replace(SETUP_PAGE + q); return true; }
      if (s === "challenge") { location.replace(VERIFY_PAGE + q); return true; }
      return false;
    },

    /** Top of every protected page. Never resolves while redirecting. */
    requireAuth: async function () {
      if (MFA.route(await MFA.status())) return new Promise(function () {});
    },

    /** Call after login succeeds instead of redirecting straight in. */
    afterLogin: async function (defaultNext) {
      var next = MFA.nextUrl(defaultNext);
      if (!MFA.route(await MFA.status(), next)) location.href = next;
    },

    /** Gets a short-lived link to the compressed data, downloads it and unzips it. */
    loadDashboardData: async function () {
      var r = await api("/api/dashboard-data");
      if (r.code === 401) { MFA.route(r.data.status); return new Promise(function () {}); }
      if (!r.ok) throw new Error(r.data.error || "Could not load dashboard data.");

      var file = await fetch(r.data.url);
      if (!file.ok) throw new Error("Could not download dashboard data.");
      var text = await new Response(file.body.pipeThrough(new DecompressionStream("gzip"))).text();
      return JSON.parse(text);
    },

    initVerify: function (o) {
      var $code = $(o.code), $btn = $(o.button), $err = $(o.error);
      digitsOnly($code);
      async function submit() {
        if ($code.val().length !== 6) return;
        $btn.prop("disabled", true).text("Verifying…"); $err.text("");
        var r = await api("/api/mfa/verify", { code: $code.val() });
        if (r.ok) return location.replace(MFA.nextUrl());
        if (r.code === 409) return MFA.route(r.data.status) || location.replace(MFA.nextUrl());
        $err.text(codeError(r));
        $btn.prop("disabled", false).text("Verify");
        $code.val("").trigger("focus");
      }
      $btn.on("click", submit);
      $code.on("keydown", function (e) { if (e.key === "Enter") submit(); }).trigger("focus");
    },

    initEnroll: async function (o) {
      var $code = $(o.code), $btn = $(o.button), $err = $(o.error);
      digitsOnly($code);
      var start = await api("/api/mfa/enroll-start", {});
      if (!start.ok) {
        if (start.code === 409) return MFA.route(start.data.status) || location.replace(MFA.nextUrl());
        return $err.text(start.data.error || "Could not start setup.");
      }
      $(o.qr).attr("src", start.data.qr).show();
      $(o.secret).text(start.data.secret);

      $btn.on("click", async function () {
        if ($code.val().length !== 6) return;
        $btn.prop("disabled", true).text("Verifying…"); $err.text("");
        var r = await api("/api/mfa/enroll-verify", { code: $code.val() });
        if (r.ok) return location.replace(MFA.nextUrl());
        $err.text(codeError(r));
        $btn.prop("disabled", false).text("Turn on two-factor");
      });
    }
  };

  window.MFA = MFA;
})(window, jQuery);