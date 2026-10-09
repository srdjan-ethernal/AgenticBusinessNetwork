/* Company pages (live mode): create a page, manage it as the company (its inbox, policy and profile),
   admins, and the people who work there. A company is a member of kind "company" with its own agent. */
(function (A) {
  const esc = A.esc, I = A.icon;
  const L = A.Live;

  function realName() { const p = L.realMe && A.people[L.realMe]; return p ? p.name : 'yourself'; }
  function isAdmin(id) { return L.actingAs === id || (L.companies || []).some(function (c) { return c.id === id; }); }

  // ---------- banner and menu ----------
  A.ui.actingBanner = function () {
    if (!A.live || !L.actingAs) return '';
    const c = A.P(L.actingAs);
    return '<div class="acting-banner" role="status"><div class="page row wrap" style="gap:10px;padding-block:8px">' + A.avatar(c, 24) +
      '<span class="grow small">You’re managing <b>' + esc(c.name) + '</b>: its inbox, policy and page.</span>' +
      '<button class="btn btn--secondary btn--sm" data-act="co-back">Switch back to ' + esc(realName()) + '</button></div></div>';
  };
  A.ui.companyMenu = function () {
    if (!A.live) return '';
    const list = (L.companies || []).filter(function (c) { return c.id !== L.actingAs; });
    return '<div class="menu__sec"><div class="menu__h">Company pages</div>' +
      (L.actingAs ? '<button class="menu__a" data-act="co-back">' + I('left') + 'Back to ' + esc(realName()) + '</button>' : '') +
      list.map(function (c) { return '<button class="menu__a" data-act="co-switch" data-id="' + esc(c.id) + '">' + A.avatar({ name: c.name, photo: c.photo }, 20) + '<span class="grow">' + esc(c.name) + '</span>' + (c.waiting ? '<span class="nbadge" style="position:static">' + c.waiting + '</span>' : '') + '</button>'; }).join('') +
      (L.actingAs ? '' : '<button class="menu__a" data-act="co-create">' + I('plus') + 'Create a company page</button>') + '</div>';
  };

  async function switchTo(id, go) {
    try {
      await L.actAs(id);
      A.save();
      A.go(go || (id ? 'company.' + id : 'feed'));
      A.toast(id ? 'You’re now managing <b>' + esc(A.P(id).name) + '</b>.' : 'Back to your own account.', 'info');
    } catch (e) { A.toast(esc(e.message), 'warn'); }
  }
  A.act['co-switch'] = function (el) { switchTo(el.dataset.id); };
  A.act['co-back'] = function () { switchTo(null); };

  // ---------- create ----------
  A.act['co-create'] = function () {
    A.modal({
      title: 'Create a company page', wide: true,
      body: '<div class="stack-16"><p class="small muted">The page gets its own agent and address, so customers, suppliers and partners can knock on the company. You manage it and can add other admins.</p>' +
        '<div class="grid2"><div class="field"><label class="label" for="co-name">Company name</label><input class="input" id="co-name" maxlength="80" placeholder="e.g. Linen &amp; Co"></div>' +
        '<div class="field"><label class="label" for="co-web">Website <span class="muted">(optional)</span></label><input class="input" id="co-web" maxlength="200" placeholder="example.com" inputmode="url"></div></div>' +
        '<div class="field"><label class="label" for="co-tag">What the company does</label><input class="input" id="co-tag" maxlength="160" placeholder="e.g. Hotel and home textiles, made to order"></div>' +
        '<div class="field"><label class="label" for="co-loc">Location <span class="muted">(optional)</span></label><input class="input" id="co-loc" maxlength="80" placeholder="e.g. Novi Sad, Serbia"></div>' +
        '<div class="stack"><span class="label">Industries</span><div class="pills wrap" id="co-ind">' + A.ui.topicPills([]) + '</div></div>' +
        '<label class="check" for="co-works"><input type="checkbox" id="co-works" checked> I work here (shown on my profile)</label>' +
        '<p class="small err" id="co-err" role="alert" hidden></p></div>',
      foot: '<button class="btn btn--tertiary" data-act="modal-close">Cancel</button><button class="btn btn--primary" data-act="co-create-save">Create page</button>',
    });
  };
  A.act['co-create-save'] = async function (el) {
    const v = function (id) { return document.getElementById(id).value.trim(); };
    const err = document.getElementById('co-err');
    el.disabled = true;
    try {
      const r = await L.call('POST', 'api/companies', { name: v('co-name'), tagline: v('co-tag'), website: v('co-web'), location: v('co-loc'), industries: A.ui.pickedTopics('co-ind'), worksHere: document.getElementById('co-works').checked });
      A.closeModal();
      await switchTo(r.id);
      if (r.warning) A.toast(esc(r.warning), 'warn');
    } catch (e) { el.disabled = false; err.textContent = e.message; err.hidden = false; }
  };

  // ---------- the page ----------
  A.ui.companyPage = function (id) {
    if (!A.orgs[id] || !A.people[id]) {
      return '<div class="page"><div class="card pad-24 stack-12"><h1 class="t24">Company not found</h1><p class="muted">This company page doesn’t exist or was removed.</p><a class="btn btn--secondary" href="#find" style="align-self:flex-start">Find businesses</a></div></div>';
    }
    const c = A.P(id), me = A.me === id, admin = isAdmin(id);
    const people = Object.keys(A.people).filter(function (pid) { return A.people[pid].org === id && !A.people[pid].kind; });
    const myOrg = L.realMe && A.people[L.realMe] ? A.people[L.realMe].org : null;
    const addr = A.addrOf(id);
    let btns;
    if (me) btns = '<button class="btn btn--secondary" data-act="edit-profile">' + I('edit', 'ico-20') + 'Edit page</button><a class="btn btn--primary" href="#inbox">' + I('inbox', 'ico-20') + 'Company inbox</a><a class="btn btn--secondary" href="#policy">Agent policy</a>';
    else {
      btns = '<a class="btn btn--primary" href="#send.' + esc(id) + '">' + I('spark', 'ico-20') + 'Knock</a>' +
        (admin ? '<button class="btn btn--secondary" data-act="co-switch" data-id="' + esc(id) + '">Manage this page</button>' : '') +
        (!L.actingAs && myOrg !== id ? '<button class="btn btn--tertiary" data-act="co-works" data-id="' + esc(id) + '">I work here</button>' : '');
    }
    const head = '<div class="card phead"><div class="phead__main">' +
      '<div class="phead__av">' + (me ? '<button class="phead__photo" data-act="pf-photo" aria-label="Change logo" title="Change logo">' + A.avatar(c, 104) + '<span class="phead__cam">' + I('image', 'ico-20') + '</span></button>' : A.avatar(c, 104)) + '</div>' +
      '<div class="phead__id"><h1 class="phead__name">' + esc(c.name) + '</h1><div class="phead__hl">' + esc(c.headline) + '</div>' +
        ((c.topics || []).length ? '<div class="phead__tags">' + c.topics.slice(0, 4).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
        '<div class="phead__meta"><span class="tag">Company</span>' + (c.loc ? '<span>' + esc(c.loc) + '</span>' : '') + A.ui.siteLink(c.website) + '<span>' + people.length + (people.length === 1 ? ' person works here' : ' people work here') + '</span></div>' +
        '<div class="ptop__btns">' + btns + '</div></div></div>' +
      '<aside class="phead__agent"><div class="row between"><span class="eyebrow">Company agent</span><span class="live">Active</span></div><div class="phead__addr">' + esc(addr) + '</div><div class="small muted">Requests to the company reach its agent and the people who manage this page.</div><div class="row wrap small" style="gap:12px"><button class="link" data-act="copy" data-text="' + esc(addr) + '" data-msg="Agent address copied.">Copy address</button></div></aside></div>';
    const about = c.about ? '<section class="card sec"><div class="sec__h"><h2>About</h2></div><p style="white-space:pre-line">' + esc(c.about) + '</p></section>'
      : (me ? '<section class="card sec"><div class="sec__h"><h2>About</h2></div><p class="muted small">Describe the company in a few sentences: what you do, for whom, and where. Use “Edit page”.</p></section>' : '');
    const team = '<section class="card sec"><div class="sec__h"><h2>People</h2></div>' + (people.length
      ? '<div class="stack">' + people.map(function (pid) { const u = A.P(pid); return '<a class="person-row" href="#in.' + esc(pid) + '" style="color:var(--fg)">' + A.avatar(u, 40) + '<div class="grow"><b>' + esc(u.name) + '</b><div class="small muted clamp1">' + esc(u.headline) + '</div></div></a>'; }).join('') + '</div>'
      : '<p class="muted small">Nobody has added this company to their profile yet. People can choose it under “Edit profile → Works at”.</p>') + '</section>';
    const admins = admin ? '<section class="card sec" id="co-admins-sec"><div class="sec__h"><h2>Admins</h2><span class="small muted">Only admins see this</span></div><div id="co-admins"><p class="muted small">Loading…</p></div>' +
      '<form id="co-admin-form" class="row" style="gap:8px;margin-top:12px"><label class="sr" for="co-admin-email">Email of a Knockero member</label><input class="input" id="co-admin-email" type="email" placeholder="Email of a Knockero member"><button class="btn btn--secondary" type="submit">Add admin</button></form><p class="small err" id="co-admin-err" role="alert" hidden></p></section>' : '';
    return '<div class="page"><div class="scaffold scaffold--mr"><div class="main">' + head + about + A.ui.offersSec(c, me) + A.ui.needsSec(c, me) + team + admins + '</div>' +
      '<aside class="rail rail--right"><div class="card pad stack-12"><h2 class="card__h">Agent address</h2><div class="addr"><span>' + esc(addr) + '</span><button class="iconbtn" data-act="copy" data-text="' + esc(addr) + '" data-msg="Agent address copied." aria-label="Copy agent address">' + I('copy', 'ico-16') + '</button></div><p class="small muted">Put it on your website, invoices and catalog. Senders don’t need an account.</p></div>' +
      '<div class="sticky">' + A.ui.appFooter() + '</div></aside></div></div>';
  };

  // ---------- admins ----------
  function paintAdmins(id, list) {
    const box = document.getElementById('co-admins');
    if (!box) return;
    box.innerHTML = '<div class="stack">' + list.map(function (a) {
      return '<div class="row" style="gap:10px">' + A.avatar(A.P(a.id), 32) + '<div class="grow"><b>' + esc(a.name) + (a.you ? ' <span class="small muted">(you)</span>' : '') + '</b><div class="small muted">' + esc(a.email || '') + '</div></div>' +
        (list.length > 1 ? '<button class="btn btn--tertiary btn--sm" data-act="co-admin-rm" data-co="' + esc(id) + '" data-id="' + esc(a.id) + '">' + (a.you ? 'Leave' : 'Remove') + '</button>' : '') + '</div>';
    }).join('') + '</div>';
  }
  async function adminsCall(method, url, body) {
    // Managing admins is always done as yourself, never as the company.
    const res = await fetch(url, { method: method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(function () { return null; });
    if (!res.ok) throw new Error((data && data.error) || 'The request failed (' + res.status + ').');
    return data;
  }
  A.ui.companyMount = function (id) {
    if (!isAdmin(id) || !document.getElementById('co-admins')) return;
    adminsCall('GET', 'api/companies/' + encodeURIComponent(id) + '/admins').then(function (list) { paintAdmins(id, list); }, function () { /* not an admin any more */ });
    document.getElementById('co-admin-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      const input = document.getElementById('co-admin-email'), err = document.getElementById('co-admin-err');
      err.hidden = true;
      try { paintAdmins(id, await adminsCall('POST', 'api/companies/' + encodeURIComponent(id) + '/admins', { email: input.value.trim() })); input.value = ''; A.toast('Admin added.', 'info'); }
      catch (x) { err.textContent = x.message; err.hidden = false; }
    });
  };
  A.act['co-admin-rm'] = async function (el) {
    const id = el.dataset.co, who = el.dataset.id, leaving = who === L.realMe;
    try {
      const list = await adminsCall('DELETE', 'api/companies/' + encodeURIComponent(id) + '/admins/' + encodeURIComponent(who));
      if (leaving) { await switchTo(null); return; }
      paintAdmins(id, list);
      A.toast('Admin removed.', 'info');
    } catch (e) { A.toast(esc(e.message), 'warn'); }
  };

  // ---------- "I work here" ----------
  A.act['co-works'] = async function (el) {
    try { await L.updateProfile({ worksAt: el.dataset.id }); A._keep = true; A.render(); A.toast('Added to your profile.', 'info'); }
    catch (e) { A.toast(esc(e.message), 'warn'); }
  };
})(window.ABN);
