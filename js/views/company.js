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

  // ---------- the page: public, at knockero.com/company/{id} (#company.{id}[.tab]) ----------
  const pages = {};   // id -> page data from the server; null when the company doesn't exist
  const TABS = [['home', 'Home'], ['about', 'About'], ['posts', 'Posts'], ['people', 'People']];
  function parseArg(arg) {
    const parts = String(arg || '').split('.');
    return { id: parts[0], tab: parts[1] || 'home' };
  }
  function data(id) {
    if (pages[id] !== undefined) return pages[id];
    // Signed in: the bootstrap already knows the company, so the page draws at once and fills in after.
    const p = A.S.signedIn && A.people && A.people[id];
    if (p && p.kind === 'company') return Object.assign({ id: id, followers: null, employees: null, following: false, admin: isAdmin(id) }, p);
    return undefined;
  }
  function pageUrl(id) { return location.origin + '/company/' + encodeURIComponent(id); }
  function count(n, one, many) { return n == null ? '' : '<span>' + A.fmt(n) + ' ' + (n === 1 ? one : many) + '</span>'; }
  function personRow(u, extra) {
    return '<div class="person-row">' + A.avatar(u, 48) + '<div class="grow"><a class="b" href="#in.' + esc(u.id) + '" style="color:var(--fg)">' + esc(u.name) + '</a><div class="small muted clamp2">' + esc(u.headline) + '</div></div>' + (extra || '') + '</div>';
  }

  function head(d, tab) {
    const id = d.id, me = A.me === id && A.S.signedIn, signedIn = A.S.signedIn;
    const c = d.c || ['#0f766e', '#5eead4'];
    let btns;
    if (me) btns = '<button class="btn btn--secondary" data-act="edit-profile">' + I('edit', 'ico-20') + 'Edit page</button><a class="btn btn--primary" href="#inbox">' + I('inbox', 'ico-20') + 'Company inbox</a><a class="btn btn--secondary" href="#policy">Agent policy</a>';
    else if (signedIn) {
      btns = (d.following ? '<button class="btn btn--secondary" data-act="co-follow" data-id="' + esc(id) + '" data-v="0">' + I('check', 'ico-20') + 'Following</button>'
          : '<button class="btn btn--primary" data-act="co-follow" data-id="' + esc(id) + '" data-v="1">' + I('plus', 'ico-20') + 'Follow</button>') +
        '<a class="btn btn--secondary" href="#send.' + esc(id) + '">' + I('spark', 'ico-20') + 'Knock</a>' +
        (d.admin ? '<button class="btn btn--tertiary" data-act="co-switch" data-id="' + esc(id) + '">Manage this page</button>' : '') +
        (!L.actingAs && !d.worksHere && d.employees ? '<button class="btn btn--tertiary" data-act="co-works" data-id="' + esc(id) + '">I work here</button>' : '');
    } else {
      btns = '<button class="btn btn--primary" data-act="co-follow-anon" data-id="' + esc(id) + '">' + I('plus', 'ico-20') + 'Follow</button>' +
        '<a class="btn btn--secondary" href="#a.' + esc(id) + '">' + I('spark', 'ico-20') + 'Knock</a>';
    }
    const staff = d.employees ? d.employees.length : null;
    return '<div class="card co-head">' +
      '<div class="co-cover" style="background:linear-gradient(120deg,' + esc(c[0]) + ',' + esc(c[1]) + ')"></div>' +
      '<div class="co-head__b"><div class="co-logo">' + (me ? '<button class="phead__photo" data-act="pf-photo" aria-label="Change logo" title="Change logo">' + A.avatar(d, 96) + '<span class="phead__cam">' + I('image', 'ico-20') + '</span></button>' : A.avatar(d, 96)) + '</div>' +
        '<h1 class="phead__name">' + esc(d.name) + '</h1><div class="phead__hl">' + esc(d.headline) + '</div>' +
        '<div class="phead__meta">' + ((d.topics || []).length ? '<span>' + esc(d.topics.slice(0, 2).join(' · ')) + '</span>' : '') + (d.loc ? '<span>' + esc(d.loc) + '</span>' : '') +
          count(d.followers, 'follower', 'followers') + (staff == null ? '' : '<a href="#company.' + esc(id) + '.people">' + A.fmt(staff) + (staff === 1 ? ' employee' : ' employees') + '</a>') + A.ui.siteLink(d.website) + '</div>' +
        (staff ? '<div class="row small muted" style="margin-top:10px"><span class="av-stack">' + d.employees.slice(0, 4).map(function (u) { return A.avatar(u, 24, 'av--ring'); }).join('') + '</span>' + esc(d.employees.slice(0, 2).map(function (u) { return u.name.split(' ')[0]; }).join(', ')) + (staff > 2 ? ' and ' + (staff - 2) + ' more work here' : staff === 1 ? ' works here' : ' work here') + '</div>' : '') +
        '<div class="ptop__btns">' + btns + '<button class="btn btn--muted" data-act="copy" data-text="' + esc(pageUrl(id)) + '" data-msg="Page link copied. Anyone can open it, with or without an account.">' + I('link', 'ico-20') + 'Share</button></div></div>' +
      '<nav class="tabs" aria-label="Company page">' + TABS.concat(d.admin ? [['admin', 'Admin']] : []).map(function (t) {
        return '<a class="tab' + (t[0] === tab ? ' is-on' : '') + '" href="#company.' + esc(id) + (t[0] === 'home' ? '' : '.' + t[0]) + '"' + (t[0] === tab ? ' aria-current="page"' : '') + '>' + t[1] + '</a>';
      }).join('') + '</nav></div>';
  }

  function aboutCard(d, full) {
    const me = A.me === d.id && A.S.signedIn;
    const text = d.about ? '<p style="white-space:pre-line"' + (full ? '' : ' class="clamp3"') + '>' + esc(d.about) + '</p>'
      : '<p class="muted small">' + (me ? 'Describe the company in a few sentences: what you do, for whom, and where. Use “Edit page”.' : esc(d.headline)) + '</p>';
    const dl = full ? '<dl class="kv" style="margin-top:16px">' +
      (d.website ? '<dt>Website</dt><dd>' + A.ui.siteLink(d.website) + '</dd>' : '') +
      ((d.topics || []).length ? '<dt>Industry</dt><dd>' + esc(d.topics.join(', ')) + '</dd>' : '') +
      (d.loc ? '<dt>Location</dt><dd>' + esc(d.loc) + '</dd>' : '') +
      '<dt>Agent address</dt><dd class="mono">' + esc(d.addr || A.addrOf(d.id)) + '</dd>' +
      (d.followers != null ? '<dt>Followers</dt><dd>' + A.fmt(d.followers) + '</dd>' : '') +
      (d.employees ? '<dt>Employees on Knockero</dt><dd>' + d.employees.length + '</dd>' : '') + '</dl>' : '';
    return '<section class="card sec"><div class="sec__h"><h2>About</h2>' + (full ? '' : '<a class="link-muted small" href="#company.' + esc(d.id) + '.about">See all details</a>') + '</div>' + text + dl + '</section>';
  }
  function postsCard(d, limit) {
    const me = A.me === d.id && A.S.signedIn;
    return '<section class="card sec"><div class="sec__h"><h2>Posts</h2>' + (me ? '<button class="btn btn--secondary btn--sm" data-act="lp-compose">' + I('edit', 'ico-16') + 'Start a post</button>' : d.admin ? '<button class="btn btn--tertiary btn--sm" data-act="co-switch" data-id="' + esc(d.id) + '">Post as ' + esc(d.name) + '</button>' : '') + '</div>' +
      A.Posts.html('company:' + d.id, { limit: limit, empty: '<p class="muted small">' + (me ? 'No posts yet. News, offers and job openings posted here reach your followers and everyone who works at ' + esc(d.name) + '.' : esc(d.name) + ' hasn’t posted yet.') + '</p>' }) +
      (limit ? '<div style="margin-top:8px"><a class="link small" style="display:inline-flex;align-items:center;gap:4px" href="#company.' + esc(d.id) + '.posts">See all posts' + I('arrow', 'ico-16') + '</a></div>' : '') + '</section>';
  }
  function peopleCard(d, limit) {
    const list = d.employees;
    const rows = !list ? '<p class="muted small">Loading…</p>' : !list.length
      ? '<p class="muted small">Nobody has added ' + esc(d.name) + ' to their profile yet. People choose it under “Edit profile → Works at”, or with “I work here” on this page.</p>'
      : (limit ? list.slice(0, limit) : list).map(function (u) {
          return personRow(u, A.S.signedIn && d.admin && !limit ? '<button class="btn btn--tertiary btn--sm" data-act="co-staff-rm" data-co="' + esc(d.id) + '" data-id="' + esc(u.id) + '" data-name="' + esc(u.name) + '">Remove</button>' : '');
        }).join('');
    return '<section class="card sec"><div class="sec__h"><h2>People' + (list ? ' (' + list.length + ')' : '') + '</h2>' + (limit && list && list.length > limit ? '<a class="link-muted small" href="#company.' + esc(d.id) + '.people">See all</a>' : '') + '</div>' +
      (!limit && d.admin ? '<p class="small muted" style="margin-bottom:8px">People add the company to their own profile. As an admin you can take someone off the list.</p>' : '') + '<div class="stack">' + rows + '</div></section>';
  }
  function adminCard(d) {
    return '<section class="card sec"><div class="sec__h"><h2>Admins</h2><span class="small muted">Only admins see this tab</span></div><div id="co-admins"><p class="muted small">Loading…</p></div>' +
        '<form class="row" data-sub="co-admin-add" data-id="' + esc(d.id) + '" style="gap:8px;margin-top:12px"><label class="sr" for="co-admin-email">Email of a Knockero member</label><input class="input" id="co-admin-email" type="email" placeholder="Email of a Knockero member"><button class="btn btn--secondary" type="submit">Add admin</button></form><p class="small err" id="co-admin-err" role="alert" hidden></p></section>' +
      '<section class="card sec"><div class="sec__h"><h2>Followers' + (d.followers != null ? ' (' + A.fmt(d.followers) + ')' : '') + '</h2></div><div id="co-followers" class="stack"><p class="muted small">Loading…</p></div></section>';
  }

  function inner(id, tab) {
    const d = data(id);
    if (d === null) return '<div class="card pad-24 stack-12"><h1 class="t24">Company not found</h1><p class="muted">This company page doesn’t exist or was removed.</p>' + (A.S.signedIn ? '<a class="btn btn--secondary" href="#find" style="align-self:flex-start">Find businesses</a>' : '<a class="btn btn--secondary" href="#welcome" style="align-self:flex-start">About Knockero</a>') + '</div>';
    if (d === undefined) return '<div class="card pad muted">Loading the company page…</div>';
    if (tab === 'admin' && !d.admin) tab = 'home';
    const mine = A.me === d.id && A.S.signedIn;
    const main = tab === 'about' ? aboutCard(d, true)
      : tab === 'posts' ? postsCard(d, 0)
      : tab === 'people' ? peopleCard(d, 0)
      : tab === 'admin' ? adminCard(d)
      : aboutCard(d, false) + A.ui.offersSec(d, mine) + A.ui.needsSec(d, mine) + postsCard(d, 3) + peopleCard(d, 5);
    const addr = d.addr || A.addrOf(id);
    return '<div class="scaffold scaffold--mr"><div class="main">' + head(d, tab) + main + '</div>' +
      '<aside class="rail rail--right"><div class="card pad stack-12"><h2 class="card__h">Reach ' + esc(d.name) + '</h2><div class="addr"><span>' + esc(addr) + '</span><button class="iconbtn" data-act="copy" data-text="' + esc(addr) + '" data-msg="Agent address copied." aria-label="Copy agent address">' + I('copy', 'ico-16') + '</button></div><p class="small muted">The company’s agent screens every request and passes the right ones to the team. Senders don’t need an account.</p></div>' +
        '<div class="card pad stack-12"><h2 class="card__h">Page link</h2><div class="addr"><span>' + esc(pageUrl(id).replace(/^https?:\/\//, '')) + '</span><button class="iconbtn" data-act="copy" data-text="' + esc(pageUrl(id)) + '" data-msg="Page link copied." aria-label="Copy page link">' + I('copy', 'ico-16') + '</button></div><p class="small muted">Put it on your website and in your email signature. It opens without an account.</p></div>' +
        (A.S.signedIn ? '' : '<div class="card pad stack-12"><b>Join Knockero</b><p class="small muted">Follow ' + esc(d.name) + ', see its posts in your feed and find what you need.</p><a class="btn btn--primary btn--sm" href="#join" style="align-self:flex-start">Join now</a></div>') +
        '<div class="sticky">' + A.ui.appFooter() + '</div></aside></div>';
  }
  A.ui.companyPage = function (arg) {
    const a = parseArg(arg);
    return '<div class="page" id="co-page" data-id="' + esc(a.id) + '" data-tab="' + esc(a.tab) + '">' + inner(a.id, a.tab) + '</div>';
  };
  function repaint(id) {
    const el = document.getElementById('co-page');
    if (!el || el.dataset.id !== id) return;
    el.innerHTML = inner(id, el.dataset.tab);
    afterPaint(id, el.dataset.tab);
  }
  function afterPaint(id, tab) {
    const d = data(id);
    if (!d) return;
    if (tab === 'home' || tab === 'posts') A.Posts.load('company:' + id);
    if (tab === 'admin' && d.admin) {
      adminsCall('GET', 'api/companies/' + encodeURIComponent(id) + '/admins').then(function (list) { paintAdmins(id, list); }, function () { /* not an admin any more */ });
      adminsCall('GET', 'api/companies/' + encodeURIComponent(id) + '/followers').then(function (list) {
        const box = document.getElementById('co-followers');
        if (box) box.innerHTML = list.length ? list.map(function (u) { return personRow(u, '<span class="small muted">' + A.Posts.when(u.at) + '</span>'); }).join('') : '<p class="muted small">No followers yet. Share the page link to get the first ones.</p>';
      }, function () { /* not an admin any more */ });
    }
  }
  function reload(id) {
    return L.call('GET', 'api/companies/' + encodeURIComponent(id) + '/page').then(function (d) { pages[id] = d; repaint(id); },
      function (e) { if (e.status === 404) { pages[id] = null; repaint(id); } });
  }
  A.ui.companyMount = function (arg) {
    const a = parseArg(arg);
    afterPaint(a.id, a.tab);
    reload(a.id);
  };

  // ---------- follow ----------
  A.act['co-follow'] = function (el) {
    const id = el.dataset.id, on = el.dataset.v === '1';
    el.disabled = true;
    L.call(on ? 'POST' : 'DELETE', 'api/companies/' + encodeURIComponent(id) + '/follow').then(function (r) {
      const d = pages[id];
      if (d) { d.following = r.following; d.followers = r.followers; }
      A.Posts.forget('feed');
      repaint(id);
      A.toast(on ? 'You’re following ' + esc(d ? d.name : A.P(id).name) + '. Its posts show up in your feed.' : 'Unfollowed.', 'info');
    }, function (e) { el.disabled = false; A.toast(esc(e.message), 'warn'); });
  };
  A.act['co-follow-anon'] = function (el) {
    A.afterSignin = 'company.' + el.dataset.id;
    A.go('signin');
    A.toast('Sign in or join to follow this company.', 'info');
  };

  // ---------- people ----------
  A.act['co-staff-rm'] = function (el) {
    A.modal({
      title: 'Remove from People?',
      body: '<p>' + esc(el.dataset.name) + ' no longer shows as working here, and the company is taken off their profile. They aren’t notified.</p>',
      foot: '<button class="btn btn--tertiary" data-act="modal-close">Cancel</button><button class="btn btn--danger" data-act="co-staff-rm-yes" data-co="' + esc(el.dataset.co) + '" data-id="' + esc(el.dataset.id) + '">Remove</button>',
    });
  };
  A.act['co-staff-rm-yes'] = function (el) {
    const co = el.dataset.co;
    el.disabled = true;
    adminsCall('DELETE', 'api/companies/' + encodeURIComponent(co) + '/employees/' + encodeURIComponent(el.dataset.id)).then(function () {
      A.closeModal(); reload(co); A.toast('Removed from People.', 'info');
    }, function (e) { el.disabled = false; A.toast(esc(e.message), 'warn'); });
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
    // Managing admins, followers and staff is always done as yourself, never as the company.
    const res = await fetch(url, { method: method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(function () { return null; });
    if (!res.ok) throw new Error((data && data.error) || 'The request failed (' + res.status + ').');
    return data;
  }
  A.sub['co-admin-add'] = async function (f) {
    const id = f.dataset.id, input = document.getElementById('co-admin-email'), err = document.getElementById('co-admin-err');
    err.hidden = true;
    try { paintAdmins(id, await adminsCall('POST', 'api/companies/' + encodeURIComponent(id) + '/admins', { email: input.value.trim() })); input.value = ''; A.toast('Admin added.', 'info'); }
    catch (x) { err.textContent = x.message; err.hidden = false; }
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
