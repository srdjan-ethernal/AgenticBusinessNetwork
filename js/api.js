/* Knockero — live mode. When the page is served by the API (src/Agentic.Api),
   data comes from the server; anywhere else (GitHub Pages, the artifact) the page runs on demo data. */
(function (A) {
  const L = (A.Live = { on: false, devLogin: false, members: [], cards: {} });

  async function call(method, url, body, headers) {
    const opts = { method: method, credentials: 'same-origin', headers: Object.assign({}, headers || {}) };
    // A company admin managing a page sends every request "as" the company; the server only honours it
    // for the company's inbox, policy, profile and searches, and only for its admins.
    if (L.actingAs) opts.headers['X-Act-As'] = L.actingAs;
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const res = await fetch(url, opts);
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      const err = new Error((data && (data.error_description || data.message || data.error)) || 'The request failed (' + res.status + ').');
      err.status = res.status; err.data = data;
      throw err;
    }
    return data;
  }
  L.call = call;
  L.headers = function () { return L.actingAs ? { 'X-Act-As': L.actingAs } : {}; };

  // ---------- company pages: who you are, which pages you manage, acting as one ----------
  function stored() { try { return sessionStorage.getItem('abn.actingAs') || null; } catch (e) { return null; } }
  function store(id) { try { if (id) sessionStorage.setItem('abn.actingAs', id); else sessionStorage.removeItem('abn.actingAs'); } catch (e) { /* private mode */ } }
  L.companies = [];
  L.loadCompanies = async function () { try { L.companies = await call('GET', 'api/companies/mine'); } catch (e) { L.companies = []; } return L.companies; };
  L.actAs = async function (id) {
    L.actingAs = id || null;
    store(L.actingAs);
    await L.bootstrap();
  };

  L.detect = async function () {
    try {
      const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      const t = setTimeout(function () { if (ctrl) ctrl.abort(); }, 1500);
      const res = await fetch('api/health', { credentials: 'same-origin', signal: ctrl ? ctrl.signal : undefined });
      clearTimeout(t);
      if (!res.ok) return false;
      const h = await res.json();
      if (!h || h.mode !== 'live') return false;
      L.on = true; L.devLogin = !!h.devLogin; L.signupOpen = h.signup !== false; L.google = !!h.google; L.ai = !!h.ai; L.email = !!h.email; L.accessCodeRequired = !!h.accessCodeRequired; A.live = true;
      A.Engine.now = new Date();
      return true;
    } catch (e) { return false; }
  };

  L.apply = function (b) {
    A.me = b.me;
    A.people = b.people;
    A.orgs = b.orgs || {};
    A.intents = b.intents;
    // Live: only real data. The built-in demo content (posts, news, notifications, invitations,
    // suggestions) belongs to the static demo, not to a real network.
    A.posts = []; A.news = []; A.notifications = []; A.invitations = []; A.held = []; A.vipSuggest = [];
    A.pymk = L.memberIds(b);
    A.S.policy = b.policy;
    A.S.decisions = b.decisions || {};
    A.S.answered = b.answered || {};
    A.S.sent = b.sent || [];
    A.stats = b.stats || A.stats;
    A.account = b.account || null;
    A.S.signedIn = true;
  };
  /** Other real members (not you, not anonymous senders), people you aren't connected with first. */
  L.memberIds = function (b) {
    return Object.keys(b.people).filter(function (id) {
      const p = b.people[id];
      return id !== b.me && id.indexOf('anon-') !== 0 && !p.kind;
    }).sort(function (x, y) { return (b.people[x].degree === '1st') - (b.people[y].degree === '1st'); });
  };
  L.bootstrap = async function () {
    const b = await call('GET', 'api/bootstrap');
    L.apply(b);
    if (!L.actingAs) L.realMe = b.me;
    await L.loadCompanies();
    return b;
  };

  L.init = async function () {
    if (!(await L.detect())) return;
    A.S.signedIn = false;
    try {
      const s = await call('GET', 'api/session');
      if (s && s.member) {
        L.realMe = s.member;
        L.actingAs = stored();
        try { await L.bootstrap(); }
        catch (e) { if (!L.actingAs) throw e; L.actingAs = null; store(null); await L.bootstrap(); }
      }
    } catch (e) { A.S.signedIn = false; }
    if (L.devLogin) { try { L.members = await call('GET', 'api/members'); } catch (e) { L.members = []; } }
  };

  L.signIn = async function (memberId, accessCode) {
    await call('POST', 'api/session', { memberId: memberId, accessCode: accessCode || null });
    await L.bootstrap();
  };
  /** Real accounts: email + password. */
  L.login = async function (email, password) {
    await call('POST', 'api/auth/login', { email: email, password: password });
    await L.bootstrap();
  };
  L.signup = async function (body) {
    const r = await call('POST', 'api/auth/signup', body);
    await L.bootstrap();
    return r;
  };
  /** Sign-up after "Continue with Google": the identity waits on the server in a short-lived cookie. */
  L.external = function () { return call('GET', 'api/auth/external'); };
  L.signupExternal = async function (body) {
    const r = await call('POST', 'api/auth/signup/external', body);
    await L.bootstrap();
    return r;
  };
  L.updateProfile = async function (body) { L.apply(await call('PUT', 'api/profile', body)); };
  L.signOut = async function () {
    L.actingAs = null; store(null); L.companies = []; L.realMe = null;
    try { await call('DELETE', 'api/session'); } catch (e) { /* already signed out */ }
    A.S.signedIn = false;
  };

  let polT;
  L.savePolicy = function () {
    clearTimeout(polT);
    polT = setTimeout(async function () {
      try {
        const r = await call('PUT', 'api/policy', A.S.policy);
        A.S.policy.version = r.version;
        const v = document.getElementById('pol-ver');
        if (v) v.textContent = 'v' + r.version;
        const s = document.getElementById('pol-saved');
        if (s) s.textContent = 'Saved on the server';
      } catch (e) { A.toast(A.esc(e.message), 'warn'); }
    }, 500);
  };

  /** Inbox actions return a fresh bootstrap. */
  L.intent = async function (id, path, body) {
    const b = await call('POST', 'api/intents/' + encodeURIComponent(id) + '/' + path, body || {});
    L.apply(b);
    return b;
  };

  /** Public policy summary from the recipient's agent card (used for the sender's forecast). */
  L.card = async function (memberId) {
    if (L.cards[memberId]) return L.cards[memberId];
    const card = await call('GET', 'v1/agents/' + encodeURIComponent(A.addrOf(memberId)) + '/card');
    L.cards[memberId] = card;
    return card;
  };
  L.policyFromCard = function (card) {
    const s = (card && card.x_knockero && card.x_knockero.policy) || {};
    return Object.assign(JSON.parse(JSON.stringify(A.defaultPolicy)), {
      template: s.template || 'founder',
      categories: s.categories || A.defaultPolicy.categories,
      evidence: s.required_evidence || A.defaultPolicy.evidence,
      thresholds: s.thresholds || A.defaultPolicy.thresholds,
      openTo: s.topics || [],
      stages: s.stages || A.STAGES.slice(),
      check: s.check || { min: 0, max: 1e12 },
      geo: s.geo || [],
      vip: [], blocked: [], thesisHardFilter: false, requireVerified: false, focus: false,
    });
  };

  L.submit = function (body) { return call('POST', 'v1/intents', body); };
  L.answer = function (id, token, answers) {
    return call('POST', 'v1/intents/' + encodeURIComponent(id) + '/answers', { answers: answers }, token ? { Authorization: 'Bearer ' + token } : {});
  };
})(window.ABN);
