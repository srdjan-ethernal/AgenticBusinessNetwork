/* Agentic Business Network — state, router, shell, shared UI */
(function (A) {
  const esc = A.esc;
  const B = A.brand;
  A.act = {}; A.inp = {}; A.chg = {}; A.sub = {}; A.ui = {};

  // ---------- state (per-viewer demo state in localStorage) ----------
  const LS = 'abn-demo-v1';
  function fresh() {
    return {
      signedIn: false, policy: JSON.parse(JSON.stringify(A.defaultPolicy)), decisions: {}, answered: {}, likes: {}, polls: {},
      conn: {}, follows: {}, readN: {}, sent: [], myPosts: [], myComments: {}, inv: {}, theme: '',
    };
  }
  A.S = fresh();
  A.load = function () {
    try {
      const raw = localStorage.getItem(LS);
      if (!raw) return;
      const s = JSON.parse(raw);
      A.S = Object.assign(fresh(), s);
      A.S.policy = Object.assign(JSON.parse(JSON.stringify(A.defaultPolicy)), s.policy || {});
    } catch (e) { /* storage unavailable: run with defaults */ }
  };
  let saveT;
  A.save = function () {
    clearTimeout(saveT);
    saveT = setTimeout(function () { try { localStorage.setItem(LS, JSON.stringify(A.S)); } catch (e) { /* ignore */ } }, 120);
  };
  A.resetDemo = function () {
    A.S = fresh();
    try { localStorage.removeItem(LS); } catch (e) { /* ignore */ }
  };
  let editT;
  A.policyTouched = function () {
    if (!A._editing) { A.S.policy.version = (A.S.policy.version || 14) + 1; A._editing = true; }
    clearTimeout(editT);
    editT = setTimeout(function () { A._editing = false; }, 1500);
    A.save();
    A.updateBadges();
  };
  A.applyTemplate = function (key) {
    const t = A.templates[key];
    if (!t) return;
    const p = A.S.policy;
    p.categories = Object.assign({}, t.policy.categories);
    p.evidence = JSON.parse(JSON.stringify(t.policy.evidence));
    p.thresholds = Object.assign({}, t.policy.thresholds);
    p.thesisHardFilter = t.policy.thesisHardFilter;
    p.template = key;
    A.policyTouched();
  };
  A.applyTheme = function () {
    const t = A.S.theme, r = document.documentElement;
    if (t === 'light' || t === 'dark') { r.setAttribute('data-theme', t); A._themeSet = true; }
    else if (A._themeSet) { r.removeAttribute('data-theme'); A._themeSet = false; }
  };
  A.P = function (id) { return A.people[id] || { name: 'Unknown member', headline: '', c: null }; };
  A.O = function (id) { return A.orgs[id] || { name: id || '', c: null }; };

  // ---------- router ----------
  const R = {};
  A.view = function (name, def) { R[name] = def; };
  const PUBLIC = { welcome: 1, signin: 1, join: 1, a: 1, pricing: 1, developers: 1, about: 1 };
  function parse(h) {
    h = String(h || '').replace(/^#/, '');
    const i = h.indexOf('.');
    return i < 0 ? { name: h, arg: '' } : { name: h.slice(0, i), arg: h.slice(i + 1) };
  }
  A.go = function (h) {
    h = String(h || '').replace(/^#/, '');
    A.render(h);
    try { if (location.hash.slice(1) !== h) location.hash = h; } catch (e) { /* sandboxed: in-memory routing only */ }
  };
  A.render = function (h) {
    if (h == null) { try { h = location.hash.slice(1); } catch (e) { h = ''; } }
    A.cur = h;
    let r = parse(h);
    if (!r.name) r = { name: A.S.signedIn ? 'feed' : 'welcome', arg: '' };
    if (!R[r.name]) r = { name: 'notfound', arg: h };
    if (!A.S.signedIn && !PUBLIC[r.name] && r.name !== 'notfound') { A.afterSignin = h; r = { name: 'signin', arg: '' }; }
    if (A.S.signedIn && (r.name === 'signin' || r.name === 'join')) r = { name: 'feed', arg: '' };
    const v = R[r.name];
    A.route = r;
    A.closeModal();
    const shell = v.shell || (A.S.signedIn ? 'app' : 'public');
    let html = '';
    if (shell === 'app') html += A.appNav(v.nav || r.name);
    else if (shell === 'public') html += A.publicNav(r.name);
    html += '<main id="main" class="' + (v.lo && shell !== 'app' ? 'lo' : '') + '">' + v.render(r.arg) + '</main>';
    if (shell === 'app') html += A.mobileNav(v.nav || r.name);
    document.getElementById('app').innerHTML = html;
    document.body.classList.toggle('has-mnav', shell === 'app');
    document.body.classList.toggle('is-lo', !!(v.lo && shell !== 'app'));
    if (v.mount) v.mount(r.arg);
    if (!A._keep) window.scrollTo(0, 0);
    A._keep = false;
  };
  A.refresh = function () {
    const y = window.scrollY;
    A._keep = true;
    A.render(A.cur);
    window.scrollTo(0, y);
  };
  window.addEventListener('hashchange', function () {
    let h = '';
    try { h = location.hash.slice(1); } catch (e) { return; }
    if (h !== A.cur) A.render(h);
  });

  // ---------- shell ----------
  function navCounts() {
    const list = A.Engine.inbox();
    const high = list.filter(function (r) { return r.lane === 'high' && !(r.decision && r.decision.status); }).length;
    const notif = A.notifications.filter(function (n) { return n.unread && !A.S.readN[n.id]; }).length;
    const inv = A.invitations.filter(function (x) { return !A.S.inv[x.who]; }).length;
    return { feed: 0, network: inv, inbox: high, policy: 0, notifications: notif };
  }
  const NAV = [['feed', 'home', 'Home'], ['network', 'network', 'Network'], ['inbox', 'inbox', 'Inbox'], ['policy', 'policy', 'Policy'], ['notifications', 'bell', 'Activity']];
  function badge(n, key) { return '<span class="nbadge" data-badge="' + key + '"' + (n ? '' : ' hidden') + '>' + n + '</span>'; }

  A.appNav = function (active) {
    const me = A.P(A.me);
    const c = navCounts();
    const items = NAV.map(function (x) {
      const on = active === x[0];
      return '<a class="gnav__item gnav__item--hide-sm' + (on ? ' is-active' : '') + '" href="#' + x[0] + '" aria-label="' + x[2] + '"' + (on ? ' aria-current="page"' : '') + '>' + A.icon(x[1]) + '<span class="gnav__label">' + x[2] + '</span>' + badge(c[x[0]], x[0]) + '</a>';
    }).join('');
    const th = A.S.theme || '';
    const link = function (h, ic, l) { return '<a class="menu__a" href="#' + h + '">' + A.icon(ic) + l + '</a>'; };
    return '<header class="gnav"><div class="gnav__in">' +
      '<a class="gnav__logo" href="#feed" aria-label="' + esc(B.name) + ' home">' + A.logo(32) + '<span class="wm-text">' + esc(B.short) + '</span></a>' +
      '<nav class="gnav__items" aria-label="Primary">' + items + '</nav>' +
      '<div class="gsearch" id="gsearch">' + A.icon('search') + '<input id="q" type="search" placeholder="Search people, companies, intents" autocomplete="off" aria-label="Search people, companies and intents" data-in="gsearch"><div class="gsearch__res" id="gsearch-res" hidden></div></div>' +
      '<a class="gnav__upgrade gnav__item--hide-sm" href="#pricing">' + A.icon('spark') + 'Upgrade</a>' +
      '<div class="menu-wrap"><button class="gnav__me" data-act="menu" data-menu="me" aria-haspopup="true" aria-expanded="false" aria-label="Your account">' + A.avatar(me, 30) + '<span class="gnav__label">' + esc(me.name.split(' ')[0]) + '</span>' + A.icon('down') + '</button>' +
      '<div class="menu" id="menu-me" hidden>' +
        '<div class="menu__sec"><div class="row-top">' + A.avatar(me, 48) + '<div class="grow"><div class="b">' + esc(me.name) + '</div><div class="small muted">' + esc(me.headline) + '</div></div></div><a class="btn btn--secondary btn--sm btn--block" style="margin-top:10px" href="#in.' + A.me + '">View profile</a></div>' +
        '<div class="menu__sec"><div class="menu__h">Your agent</div>' + link('a.' + A.me, 'eye', 'Public agent page') + link('policy', 'sliders', 'Attention policy') + link('developers', 'code', 'API keys and webhooks') + '</div>' +
        '<div class="menu__sec"><div class="menu__h">Explore</div>' + link('company.tidewell', 'building', 'Tidewell Ventures') + link('pricing', 'star', 'Plans') + link('about.trust', 'shieldo', 'Trust center') + link('about.brief', 'trend', 'Investor brief') + '</div>' +
        '<div class="menu__sec"><div class="menu__h">Theme</div>' + [['', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(function (o) { return '<button class="menu__a' + (th === o[0] ? ' is-on' : '') + '" data-act="theme" data-v="' + o[0] + '">' + A.icon(th === o[0] ? 'check' : o[0] === 'dark' ? 'moon' : 'sun') + o[1] + '</button>'; }).join('') + '</div>' +
        '<div class="menu__sec"><button class="menu__a" data-act="reset-demo">' + A.icon('repost') + 'Reset demo data</button><button class="menu__a" data-act="signout">' + A.icon('left') + 'Sign out</button></div>' +
      '</div></div>' +
      '</div></header>';
  };
  A.mobileNav = function (active) {
    const c = navCounts();
    return '<nav class="mnav" aria-label="Primary">' + NAV.map(function (x) {
      return '<a href="#' + x[0] + '" class="' + (active === x[0] ? 'is-active' : '') + '">' + A.icon(x[1]) + badge(c[x[0]] || 0, x[0]) + x[2] + '</a>';
    }).join('') + '</nav>';
  };
  A.updateBadges = function () {
    const c = navCounts();
    document.querySelectorAll('[data-badge]').forEach(function (el) {
      const n = c[el.dataset.badge] || 0;
      el.textContent = n;
      el.hidden = !n;
    });
  };
  A.publicNav = function (active) {
    const l = function (h, t) { return '<a class="lo-link' + (active === h.split('.')[0] && h.indexOf('.') < 0 ? ' is-active' : '') + '" href="#' + h + '">' + t + '</a>'; };
    return '<header class="lo-hd"><a class="wordmark" href="#welcome" aria-label="' + esc(B.name) + ' home">' + A.logo(32) + '<span class="wm-text">' + esc(B.name) + '</span></a>' +
      '<nav class="lo-hd__nav" aria-label="Main">' + l('welcome', 'Product') + l('developers', 'Protocol') + l('pricing', 'Pricing') + l('about', 'About') + l('about.brief', 'Investors') + '</nav>' +
      '<div class="lo-hd__cta"><a class="btn btn--tertiary" href="#signin">Sign in</a><a class="btn btn--primary" href="#join">Join</a></div></header>';
  };

  // ---------- global events ----------
  function closeMenus() {
    document.querySelectorAll('.menu').forEach(function (m) { m.hidden = true; });
    document.querySelectorAll('[data-act="menu"]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
  }
  A.closeMenus = closeMenus;
  function hideSearch() { const b = document.getElementById('gsearch-res'); if (b) b.hidden = true; }
  document.addEventListener('click', function (e) {
    const t = e.target;
    const act = t.closest('[data-act]');
    if (act && !act.disabled && A.act[act.dataset.act]) { e.preventDefault(); A.act[act.dataset.act](act, e); return; }
    const a = t.closest('a[href^="#"]');
    if (a) {
      const href = a.getAttribute('href');
      e.preventDefault();
      if (href.length > 1) A.go(href.slice(1));
      return;
    }
    if (!t.closest('.menu-wrap')) closeMenus();
    if (!t.closest('#gsearch')) hideSearch();
  });
  document.addEventListener('input', function (e) { const el = e.target.closest('[data-in]'); if (el && A.inp[el.dataset.in]) A.inp[el.dataset.in](el, e); });
  document.addEventListener('change', function (e) { const el = e.target.closest('[data-ch]'); if (el && A.chg[el.dataset.ch]) A.chg[el.dataset.ch](el, e); });
  document.addEventListener('submit', function (e) { const f = e.target; e.preventDefault(); if (f.dataset.sub && A.sub[f.dataset.sub]) A.sub[f.dataset.sub](f, e); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeMenus(); hideSearch(); A.closeModal(); }
    if (e.key === 'Enter' && e.target.id === 'q') {
      const first = document.querySelector('#gsearch-res a');
      if (first) { e.preventDefault(); A.go(first.getAttribute('href').slice(1)); }
    }
  });

  A.act.menu = function (el) {
    const m = document.getElementById('menu-' + el.dataset.menu);
    if (!m) return;
    const open = m.hidden;
    closeMenus();
    m.hidden = !open;
    el.setAttribute('aria-expanded', String(open));
  };
  A.act.theme = function (el) { A.S.theme = el.dataset.v; A.save(); A.applyTheme(); A.refresh(); };
  A.act.signout = function () { A.S.signedIn = false; A.save(); A.go('welcome'); A.toast('You signed out of the demo.', 'info'); };
  A.act['reset-demo'] = function () { A.resetDemo(); A.S.signedIn = true; A.save(); A.applyTheme(); A.go('feed'); A.toast('Demo data reset. Inbox, policy and posts are back to their starting state.'); };
  A.act.go = function (el) { A.go(el.dataset.to); };
  A.act.copy = function (el) { A.copy(el.dataset.text, el.dataset.msg); };
  A.act.soon = function (el) { A.toast(esc(el.dataset.msg || 'This part is not in the prototype yet.'), 'info'); };

  A.inp.gsearch = function (el) {
    const q = el.value.trim().toLowerCase();
    const box = document.getElementById('gsearch-res');
    if (!q) { box.hidden = true; return; }
    const ppl = Object.keys(A.people).filter(function (id) { const p = A.people[id]; return (p.name + ' ' + p.headline).toLowerCase().indexOf(q) >= 0; }).slice(0, 5);
    const orgs = Object.keys(A.orgs).filter(function (id) { const o = A.orgs[id]; return (o.name + ' ' + o.tagline).toLowerCase().indexOf(q) >= 0; }).slice(0, 3);
    const ints = A.intents.filter(function (it) { return (it.objective + ' ' + A.P(it.from).name).toLowerCase().indexOf(q) >= 0; }).slice(0, 3);
    let h = '';
    if (ppl.length) h += '<div class="gsearch__h">People</div>' + ppl.map(function (id) { const p = A.people[id]; return '<a class="gsearch__item" href="#in.' + id + '">' + A.avatar(p, 32) + '<span class="grow"><span class="b clamp1" style="display:block">' + esc(p.name) + '</span><span class="small muted clamp1" style="display:block">' + esc(p.headline) + '</span></span></a>'; }).join('');
    if (orgs.length) h += '<div class="gsearch__h">Companies</div>' + orgs.map(function (id) { const o = A.orgs[id]; return '<a class="gsearch__item" href="#company.' + id + '">' + A.orgLogo(Object.assign({ id: id }, o), 32) + '<span class="grow"><span class="b clamp1" style="display:block">' + esc(o.name) + '</span><span class="small muted clamp1" style="display:block">' + esc(o.tagline) + '</span></span></a>'; }).join('');
    if (ints.length && A.S.signedIn) h += '<div class="gsearch__h">Intents in your inbox</div>' + ints.map(function (it) { return '<a class="gsearch__item" href="#inbox.' + it.id + '">' + A.icon('inbox', 'ico-20') + '<span class="grow small clamp2">' + esc(it.objective) + '</span></a>'; }).join('');
    box.innerHTML = h || '<div class="gsearch__h">No results for “' + esc(el.value) + '”</div>';
    box.hidden = false;
  };

  // ---------- toast, modal, copy ----------
  A.toast = function (msg, kind) {
    let root = document.getElementById('toasts');
    if (!root) {
      root = document.createElement('div');
      root.id = 'toasts'; root.className = 'toasts';
      root.setAttribute('role', 'status'); root.setAttribute('aria-live', 'polite');
      document.body.appendChild(root);
    }
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' toast--' + kind : '');
    el.innerHTML = A.icon(kind === 'info' ? 'info' : kind === 'warn' ? 'warn' : 'shieldo') + '<div class="toast__t">' + msg + '</div><button class="iconbtn" aria-label="Dismiss">' + A.icon('x', 'ico-16') + '</button>';
    el.querySelector('button').addEventListener('click', function () { el.remove(); });
    root.appendChild(el);
    while (root.children.length > 3) root.firstChild.remove();
    setTimeout(function () { el.remove(); }, 5600);
  };
  A.modal = function (o) {
    A.closeModal();
    const s = document.createElement('div');
    s.className = 'scrim'; s.id = 'scrim';
    s.innerHTML = '<div class="modal' + (o.wide ? ' modal--wide' : '') + '" role="dialog" aria-modal="true" aria-labelledby="modal-t"><div class="modal__hd"><h2 id="modal-t">' + o.title + '</h2><button class="iconbtn" data-act="modal-close" aria-label="Close">' + A.icon('x') + '</button></div><div class="modal__bd">' + o.body + '</div>' + (o.foot ? '<div class="modal__ft">' + o.foot + '</div>' : '') + '</div>';
    s.addEventListener('click', function (e) { if (e.target === s) A.closeModal(); });
    document.body.appendChild(s);
    A._lastFocus = document.activeElement;
    const f = s.querySelector('textarea, input, select, .modal__bd button, .modal__ft .btn--primary');
    if (f) f.focus();
    if (o.mount) o.mount(s);
    return s;
  };
  A.closeModal = function () {
    const s = document.getElementById('scrim');
    if (!s) return;
    s.remove();
    if (A._lastFocus && A._lastFocus.focus) { try { A._lastFocus.focus(); } catch (e) { /* ignore */ } }
  };
  A.act['modal-close'] = function () { A.closeModal(); };
  A.copy = function (text, okMsg) {
    const done = function () { A.toast(okMsg || 'Copied to clipboard.'); };
    const fallback = function () {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      if (ok) done(); else A.toast('Select and copy it: <span class="kbd">' + esc(text) + '</span>', 'info');
    };
    try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
  };

  // ---------- shared UI ----------
  A.ui.lane = function (lane) { return '<span class="lane lane--' + lane + '">' + A.Engine.LABEL[lane] + '</span>'; };
  A.ui.gauge = function (score, lane, sm) {
    const size = sm ? 44 : 64, r = sm ? 18 : 27, sw = sm ? 5 : 6, c = 2 * Math.PI * r;
    return '<div class="gauge' + (sm ? ' gauge--sm' : '') + ' lc-' + lane + '" role="img" aria-label="Priority score ' + score + ' of 100"><svg viewBox="0 0 ' + size + ' ' + size + '"><circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" style="stroke:var(--line)" stroke-width="' + sw + '"/><circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="currentColor" stroke-width="' + sw + '" stroke-linecap="round" stroke-dasharray="' + (c * score / 100).toFixed(1) + ' ' + c.toFixed(1) + '"/></svg><b>' + score + '</b></div>';
  };
  A.ui.bars = function (r) {
    const rows = r.parts.map(function (x) {
      return '<div class="barrow"><div><div>' + x.label + '</div><div class="w">weight ' + x.w + '% · ' + Math.round(x.v * 100) + '/100</div></div><div class="bar"><i style="width:' + Math.round(x.v * 100) + '%"></i></div><div class="pts">+' + (x.w * x.v).toFixed(1) + '</div></div>';
    }).join('');
    const pens = r.pens.map(function (p) {
      return '<div class="barrow barrow--pen"><div>' + esc(p[0]) + '</div><div class="bar"><i style="width:' + Math.min(100, p[1] * 2) + '%;background:var(--bad)"></i></div><div class="pts">−' + p[1] + '</div></div>';
    }).join('');
    return '<div class="bars">' + rows + pens + '<div class="barrow barrow--total"><div>Priority score</div><div class="muted small">HIGH ≥ ' + r.th.high + ' · MEDIUM ≥ ' + r.th.medium + '</div><div class="pts">' + r.score + '</div></div></div>';
  };
  const RIC = { pos: 'check', neg: 'x', warn: 'warn', info: 'info' };
  A.ui.reasons = function (r) {
    return '<ul class="reasons">' + r.reasons.map(function (x) { return '<li class="reason reason--' + x[0] + '">' + A.icon(RIC[x[0]]) + '<span>' + esc(x[1]) + '</span></li>'; }).join('') + '</ul>';
  };
  A.ui.injText = function (text, inj) {
    const t = esc(text), m = esc(inj);
    const i = t.indexOf(m);
    return i < 0 ? t : t.slice(0, i) + '<mark>' + m + '</mark>' + t.slice(i + m.length);
  };
  A.ui.triage = function (r, o) {
    o = o || {};
    const it = r.it;
    const cat = (A.CATS[it.category] || A.CATS.other).label;
    const meta = [cat, it.amount ? A.money(it.amount) : '', it.stage || '', (it.tags || []).slice(0, 2).join(', ')].filter(Boolean).join(' · ');
    return '<div class="triage">' +
      '<div class="triage__head">' + A.ui.gauge(r.score, r.lane) + '<div class="grow stack-4"><div class="row wrap">' + A.ui.lane(r.lane) + '<span class="muted small">' + esc(meta) + '</span></div><div class="b t16">' + esc(r.action) + '</div><div class="muted small">' + esc(r.why) + '</div></div></div>' +
      (r.inj ? '<div class="stack-4"><div class="small b lc-blocked">Quarantined text. Your agent treats it as data, never as instructions.</div><div class="quarantine">' + A.ui.injText(it.text, r.inj) + '</div></div>' : '') +
      '<div class="dt__sec"><h3>Why this lane</h3>' + A.ui.reasons(r) + '</div>' +
      (r.lane === 'medium' && r.questions.length ? '<div class="dt__sec"><h3>' + A.icon('spark', 'ico-20') + 'The agent asks the sender</h3><ol class="stack-4" style="list-style:decimal;padding-left:20px">' + r.questions.map(function (q) { return '<li>' + esc(q.q) + '</li>'; }).join('') + '</ol></div>' : '') +
      (o.bars === false ? '' : '<details class="dt__sec"' + (o.open ? ' open' : '') + '><summary class="link" style="cursor:pointer">Score breakdown</summary>' + A.ui.bars(r) + '</details>') +
      '</div>';
  };
  A.ui.table = function (heads, rows, o) {
    o = o || {};
    const num = o.num || [];
    return '<div class="tblwrap"><table class="tbl' + (o.cls ? ' ' + o.cls : '') + '"><thead><tr>' + heads.map(function (h, i) { return '<th' + (num.indexOf(i) >= 0 ? ' class="num"' : '') + '>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { const cells = r.cells || r; return '<tr' + (r.hl ? ' class="hl"' : '') + '>' + cells.map(function (c, i) { return '<td' + (num.indexOf(i) >= 0 ? ' class="num"' : '') + '>' + c + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div>';
  };
  A.ui.pname = function (id) { return '<a href="#in.' + id + '" class="b" style="color:var(--fg)">' + esc(A.P(id).name) + '</a>'; };
  A.ui.appFooter = function () {
    const links = [['about', 'About'], ['about.trust', 'Trust & privacy'], ['developers', 'Protocol'], ['pricing', 'Plans'], ['about.brief', 'Investors']];
    return '<footer class="appfoot"><div class="brand">' + A.logo(18) + '<b>' + esc(B.name) + '</b></div>' + links.map(function (l) { return '<a href="#' + l[0] + '">' + esc(l[1]) + '</a>'; }).join('') +
      '<div class="brand"><span class="demo-flag">Prototype · fictional data · ' + B.year + '</span></div></footer>';
  };
  A.ui.trust = function (p) {
    return '<span class="trust" title="Reputation score">' + A.icon('shieldo') + (p && p.rep != null ? p.rep : '—') + '</span>';
  };
  A.ui.verifiedLine = function (p) {
    if (!p.verified || !p.verified.length) return '<span class="small lc-blocked b">Not verified</span>';
    return '<span class="small muted">' + A.verifiedBadge() + ' ' + p.verified.map(function (v) { return A.CLAIMS[v] || v; }).join(' · ') + '</span>';
  };
  A.STATUS = {
    replied: 'Accepted · reply sent', scheduled: 'Meeting proposed', asked: 'Questions sent', held: 'Held for digest', declined: 'Declined with reason',
    archived: 'Archived', escalated: 'Escalated', reported: 'Reported', intro: 'Intros drafted',
  };

  A.view('notfound', {
    render: function (arg) {
      return '<div class="page"><div class="card pad-24 stack-12" style="max-width:560px;margin-inline:auto;text-align:center"><h1 class="t24">This page doesn’t exist</h1><p class="muted">The link “' + esc(arg) + '” didn’t match anything in the prototype.</p><div><a class="btn btn--primary" href="#">Go to your feed</a></div></div></div>';
    },
  });
})(window.ABN);
