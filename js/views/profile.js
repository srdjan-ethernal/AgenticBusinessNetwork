/* Member profile and company page */
(function (A) {
  const esc = A.esc, I = A.icon, E = A.Engine, B = A.brand;
  const fmt = function (n) { return Number(n || 0).toLocaleString('en-US'); };
  A.addrOf = function (id) { const p = A.P(id); return p.addr || id.replace(/-/g, '.') + '@' + B.ns; };
  function first(p) { return (p.name || '').split(' ')[0]; }

  function openTo(id, p) {
    const pol = E.policyFor(id);
    if (p.openText) return p.openText;
    const t = A.templates[pol.template];
    return t.name + (pol.openTo.length ? ' · ' + pol.openTo.join(', ') : '');
  }
  function agentSection(id, p, isMe) {
    const pol = E.policyFor(id), f = isMe ? 'your' : first(p) + '’s';
    const open = Object.keys(A.CATS).filter(function (k) { return pol.categories[k] === 'open'; });
    const ask = Object.keys(A.CATS).filter(function (k) { return pol.categories[k] === 'ask'; });
    const closed = Object.keys(A.CATS).filter(function (k) { return pol.categories[k] === 'closed'; });
    const tag = function (k, cls) { return '<span class="tag' + (cls ? ' ' + cls : '') + '">' + esc(A.CATS[k].label) + '</span>'; };
    const ev = open.slice(0, 3).map(function (k) { const e = pol.evidence[k] || []; return '<li><b>' + esc(A.CATS[k].label) + ':</b> ' + (e.length ? e.map(function (t) { return A.Engine.lc(A.EVID[t].label); }).join(', ') : 'nothing extra') + '</li>'; }).join('');
    return '<section class="card sec"><div class="sec__h"><h2>Agent</h2><span class="tag tag--accent">' + esc(A.templates[pol.template].name) + '</span></div>' +
      '<div class="stack-16"><div class="grid3"><div class="stack-4"><div class="eyebrow">Open</div><div class="pills">' + (open.map(function (k) { return tag(k, 'tag--accent'); }).join('') || '<span class="small muted">None</span>') + '</div></div>' +
      '<div class="stack-4"><div class="eyebrow">Ask first</div><div class="pills">' + (ask.map(function (k) { return tag(k); }).join('') || '<span class="small muted">None</span>') + '</div></div>' +
      '<div class="stack-4"><div class="eyebrow">Closed</div><div class="pills">' + (closed.map(function (k) { return tag(k); }).join('') || '<span class="small muted">None</span>') + '</div></div></div>' +
      '<div class="stack-4"><div class="eyebrow">Evidence ' + f + ' agent asks for</div><ul class="stack-4">' + ev + '</ul></div>' +
      '<div class="stack-4"><div class="eyebrow">Response times</div><div>HIGH: same day · MEDIUM: daily digest · Every decline includes a reason</div></div>' +
      (isMe ? '<div class="row wrap"><a class="btn btn--secondary btn--sm" href="#policy">Edit policy</a><a class="btn btn--tertiary btn--sm" href="#a.' + id + '">View as a sender</a></div>' : '<div><a class="btn btn--primary btn--sm" href="#send.' + id + '">' + I('spark', 'ico-16') + 'Send Business Intent</a></div>') +
      '</div></section>';
  }
  function activity(id) {
    const posts = A.S.myPosts.concat(A.posts).filter(function (p) { return p.who === id; });
    const u = A.P(id);
    return '<section class="card"><div class="sec" style="padding-bottom:12px"><div class="sec__h" style="margin-bottom:4px"><h2>Activity</h2></div><div class="small link">' + fmt(u.followers) + ' followers</div></div>' +
      (posts.length ? posts.slice(0, 2).map(function (p) {
        return '<div style="padding:12px 24px;border-top:1px solid var(--line)"><div class="small muted">' + esc(u.name) + ' posted this · ' + esc(p.time) + '</div><div class="clamp2" style="margin-top:4px">' + esc(p.text) + '</div><div class="row small muted" style="margin-top:6px"><span class="rxs"><span class="rx-icons">' + ((p.rx && p.rx.top) || ['like']).slice(0, 2).map(A.rx).join('') + '</span>' + fmt(p.rx ? p.rx.n : 0) + '</span> · ' + fmt(p.comments) + ' comments</div></div>';
      }).join('') : '<div style="padding:12px 24px;border-top:1px solid var(--line)" class="muted">' + esc(first(u)) + ' hasn’t posted recently.</div>') +
      '<div class="card__foot"><a href="#feed">Show all posts ' + I('arrow', 'ico-16') + '</a></div></section>';
  }
  function experience(p) {
    const exp = p.exp || (p.org ? [{ title: p.headline.split(' at ')[0].split(' · ')[0], org: p.org, type: 'Full-time', period: '2023 – Present', loc: p.loc }] : []);
    if (!exp.length) return '';
    return '<section class="card sec"><div class="sec__h"><h2>Experience</h2></div>' + exp.map(function (e) {
      const o = A.O(e.org);
      return '<div class="exp"><a href="#company.' + e.org + '">' + A.orgLogo(Object.assign({ id: e.org }, o), 48) + '</a><div class="exp__t grow"><b>' + esc(e.title) + '</b><div>' + esc(o.name) + (e.type ? ' · ' + esc(e.type) : '') + '</div><div class="small muted">' + esc(e.period || '') + '</div><div class="small muted">' + esc(e.loc || '') + '</div>' + (e.desc ? '<p style="margin-top:8px">' + esc(e.desc) + '</p>' : '') + '</div></div>';
    }).join('') + '</section>';
  }
  function education(p) {
    if (!p.edu) return '';
    return '<section class="card sec"><div class="sec__h"><h2>Education</h2></div>' + p.edu.map(function (e) {
      return '<div class="exp">' + A.orgLogo({ name: e.school, c: ['#475569', '#94a3b8'], mark: e.school[0] }, 48) + '<div class="exp__t grow"><b>' + esc(e.school) + '</b><div>' + esc(e.deg) + '</div><div class="small muted">' + esc(e.period) + '</div></div></div>';
    }).join('') + '</section>';
  }
  function skills(p) {
    if (!p.skills) return '';
    return '<section class="card sec"><div class="sec__h"><h2>Skills</h2></div>' + p.skills.map(function (s) {
      return '<div class="skill"><b>' + esc(s[0]) + '</b><div class="row small muted">' + I('users', 'ico-16') + 'Endorsed by ' + esc(s[1]) + '</div></div>';
    }).join('') + '</section>';
  }
  function reputation(p) {
    const rep = p.rep == null ? 50 : p.rep;
    return '<section class="card sec"><div class="sec__h"><h2>Reputation</h2><span class="small muted">Measured on outcomes, not vanity</span></div>' +
      '<div class="repgrid"><div class="kpi"><b>' + rep + '</b><span>Network score</span></div><div class="kpi"><b>' + Math.round(rep * 0.62) + '%</b><span>Intents accepted</span></div><div class="kpi"><b>' + Math.min(99, rep + 4) + '%</b><span>Questions answered</span></div><div class="kpi"><b>' + (p.abuse || 0) + '</b><span>Abuse reports (30 days)</span></div></div>' +
      '<div style="margin-top:12px">' + A.ui.verifiedLine(p) + '</div></section>';
  }
  function alsoViewed(exclude) {
    const ids = ['hannah-schulz', 'grace-liu', 'daniel-kovac', 'sofia-marin', 'marko-ilic', 'samir-kapoor'].filter(function (x) { return x !== exclude; }).slice(0, 5);
    return '<div class="card pad"><h2 class="card__h">People also viewed</h2>' + ids.map(function (id) {
      const u = A.P(id);
      return '<div class="person-row" style="border-bottom:1px solid var(--line);padding-bottom:12px">' + A.avatar(u, 48) + '<div class="grow"><a class="b" href="#in.' + id + '" style="color:var(--fg)">' + esc(u.name) + '</a> <span class="degree small">• ' + esc(u.degree || '3rd') + '</span><div class="small muted clamp2">' + esc(u.headline) + '</div><a class="btn btn--muted btn--sm" style="margin-top:6px" href="#send.' + id + '">' + I('spark', 'ico-16') + 'Send intent</a></div></div>';
    }).join('') + '</div>';
  }

  A.view('in', {
    nav: 'profile',
    render: function (arg) {
      const id = A.people[arg] ? arg : A.me;
      const p = A.P(id), isMe = id === A.me, o = p.org ? A.O(p.org) : null;
      const addr = A.addrOf(id);
      const conn = A.S.conn[id], fol = A.S.follows[id];
      const mutualIds = ['grace-liu', 'jonas-lindqvist', 'hannah-schulz'].filter(function (x) { return x !== id; }).slice(0, 2);
      const btns = isMe
        ? '<a class="btn btn--primary" href="#policy">Edit agent policy</a><button class="btn btn--secondary" data-act="copy" data-text="' + esc(addr) + '" data-msg="Agent address copied.">Share agent address</button><a class="btn btn--muted" href="#a.' + id + '">View as sender</a>'
        : (p.kind === 'agent' ? '<button class="btn btn--danger" data-act="soon" data-msg="This agent is already blocked by your policy.">' + I('block', 'ico-20') + 'Blocked by your agent</button>'
          : '<a class="btn btn--primary" href="#send.' + id + '">' + I('spark', 'ico-20') + 'Send Business Intent</a><button class="btn btn--secondary" data-act="connect" data-id="' + id + '"' + (conn || p.degree === '1st' ? ' disabled' : '') + '>' + (p.degree === '1st' ? I('check', 'ico-20') + 'Connected' : conn ? I('clock', 'ico-20') + 'Pending' : I('plus', 'ico-20') + 'Connect') + '</button><button class="btn btn--muted" data-act="follow" data-id="' + id + '">' + (fol ? 'Following' : 'Follow') + '</button>');
      return '<div class="page"><div class="scaffold scaffold--mr"><div class="main">' +
        '<div class="card card--clip"><div class="ptop__cover cover" style="' + A.coverStyle(p.cover || p.c) + '"></div><div class="ptop__body">' +
          '<div class="ptop__av">' + A.avatar(p, 152) + (p.kind === 'agent' ? '' : '<span class="agent-dot" style="width:34px;height:34px;right:10px;bottom:10px" title="Agent active">' + I('spark') + '</span>') + '</div>' +
          '<div class="ptop__grid"><div>' +
            '<h1 class="ptop__name">' + esc(p.name) + ((p.verified || []).length ? A.verifiedBadge(p.verified.map(function (v) { return A.CLAIMS[v]; }).join(', ')) : '') + (p.degree ? '<span class="degree">· ' + p.degree + '</span>' : '') + '</h1>' +
            '<div class="ptop__hl">' + esc(p.headline) + '</div>' +
            '<div class="small muted" style="margin-top:8px">' + esc(p.loc || '') + ' · <button class="link" data-act="contact" data-id="' + id + '">Contact info</button></div>' +
            '<div class="small" style="margin-top:6px"><a class="link" href="#network">' + esc(p.connections || (p.mutuals ? p.mutuals * 23 + '' : '120')) + ' connections</a>' + (p.followers ? ' · <span class="muted">' + fmt(p.followers) + ' followers</span>' : '') + '</div>' +
            (!isMe && p.mutuals ? '<div class="row small muted" style="margin-top:8px"><span class="av-stack">' + mutualIds.map(function (m) { return A.avatar(A.P(m), 24, 'av--ring'); }).join('') + '</span>' + esc(mutualIds.map(function (m) { return first(A.P(m)); }).join(', ')) + ' and ' + Math.max(1, p.mutuals - 2) + ' other mutual connections</div>' : '') +
            '<div class="ptop__btns">' + btns + '</div></div>' +
            '<div class="ptop__orgs">' + (o ? '<a href="#company.' + p.org + '">' + A.orgLogo(Object.assign({ id: p.org }, o), 32) + '<span>' + esc(o.name) + '</span></a>' : '') + (p.school ? '<span class="row">' + A.orgLogo({ name: p.school, c: ['#475569', '#94a3b8'], mark: p.school[0] }, 32) + '<span>' + esc(p.school) + '</span></span>' : '') + '</div></div>' +
          (p.kind === 'agent' ? '<div class="opento note--bad" style="background:var(--bad-bg)">' + I('warn') + '<div><b>Unverified agent</b><span class="small">No person or company is linked to this agent. It has ' + (p.abuse || 0) + ' abuse reports in the last 30 days.</span></div></div>'
            : '<div class="opento">' + I('spark') + '<div class="grow"><b class="mono" style="font-size:14px">' + esc(addr) + '</b><span class="small" style="display:block">Open to: ' + esc(openTo(id, p)) + '</span><div class="row wrap small" style="margin-top:6px"><span class="live">Agent active</span>' + (isMe ? '<a class="link" href="#policy">Edit policy</a>' : '<a class="link" href="#a.' + id + '">How to reach ' + esc(first(p)) + '</a>') + '<button class="link" data-act="copy" data-text="' + esc(addr) + '" data-msg="Agent address copied.">Copy address</button></div></div></div>') +
        '</div></div>' +
        (isMe ? '<section class="card sec"><div class="sec__h"><div><h2>Analytics</h2><div class="row small muted">' + I('eye', 'ico-16') + 'Private to you</div></div></div><div class="statgrid">' +
          '<a class="stat" href="#notifications">' + I('users') + '<div><b>' + A.stats.views + ' profile views</b><span class="small muted">See who viewed your profile.</span></div></a>' +
          '<a class="stat" href="#inbox">' + I('inbox') + '<div><b>' + A.stats.triaged + ' intents screened</b><span class="small muted">This week, by your agent.</span></div></a>' +
          '<a class="stat" href="#inbox">' + I('clock') + '<div><b>' + A.stats.saved + ' hours saved</b><span class="small muted">Compared with reading everything.</span></div></a></div></section>' : '') +
        '<section class="card sec"><div class="sec__h"><h2>About</h2></div><p style="white-space:pre-line">' + esc(p.about || (p.name + ' is ' + p.headline.charAt(0).toLowerCase() + p.headline.slice(1) + '.')) + '</p></section>' +
        (p.kind === 'agent' ? '' : agentSection(id, p, isMe)) +
        activity(id) + experience(p) + education(p) + skills(p) + reputation(p) +
        '</div><aside class="rail rail--right">' +
          '<div class="card pad stack-12"><h2 class="card__h">Agent address</h2><div class="addr"><span>' + esc(addr) + '</span><button class="iconbtn" data-act="copy" data-text="' + esc(addr) + '" data-msg="Agent address copied." aria-label="Copy agent address">' + I('copy', 'ico-16') + '</button></div><p class="small muted">Works in bios, signatures and decks. Senders don’t need an account.</p></div>' +
          alsoViewed(id) + '<div class="sticky">' + A.ui.appFooter() + '</div></aside></div></div>';
    },
  });

  A.act.connect = function (el) {
    const id = el.dataset.id;
    A.S.conn[id] = true; A.save(); A.refresh();
    A.toast('Your agent sent a connection intent to ' + esc(A.P(id).name) + '’s agent.');
  };
  A.act.contact = function (el) {
    const id = el.dataset.id, p = A.P(id), addr = A.addrOf(id);
    A.modal({
      title: esc(p.name),
      body: '<div class="stack-12"><div class="row-top">' + I('spark') + '<div class="grow"><div class="b">Agent address</div><div class="mono">' + esc(addr) + '</div></div><button class="btn btn--tertiary btn--sm" data-act="copy" data-text="' + esc(addr) + '" data-msg="Agent address copied.">Copy</button></div>' +
        '<div class="row-top">' + I('mail') + '<div class="grow"><div class="b">Email</div><div class="small muted">Not shared. ' + esc(first(p)) + '’s policy routes all first contact through the agent.</div></div></div>' +
        (p.org ? '<div class="row-top">' + I('building') + '<div class="grow"><div class="b">Company</div><a href="#company.' + p.org + '">' + esc(A.O(p.org).name) + '</a></div></div>' : '') + '</div>',
    });
  };

  A.view('company', {
    render: function (arg) {
      const id = A.orgs[arg] ? arg : 'tidewell';
      const o = A.O(id), mine = id === 'tidewell';
      const people = Object.keys(A.people).filter(function (pid) { return A.people[pid].org === id; });
      const contact = people.filter(function (pid) { return pid !== A.me; })[0];
      const fol = A.S.follows[id];
      const posts = A.S.myPosts.concat(A.posts).filter(function (p) { return p.org === id || (p.who && A.P(p.who).org === id); });
      return '<div class="page"><div class="scaffold scaffold--mr"><div class="main">' +
        '<div class="card card--clip"><div class="ptop__cover cover" style="' + A.coverStyle(o.cover || o.c) + '"></div><div class="ptop__body">' +
          '<div class="ptop__av" style="margin-top:-56px"><span style="display:inline-block;border-radius:6px;box-shadow:0 0 0 4px var(--card)">' + A.orgLogo(Object.assign({ id: id }, o), 104) + '</span></div>' +
          '<h1 class="ptop__name" style="margin-top:12px">' + esc(o.name) + (o.verified ? A.verifiedBadge('Verified organization') : '') + '</h1><div class="ptop__hl">' + esc(o.tagline) + '</div>' +
          '<div class="small muted" style="margin-top:4px">' + esc(o.industry || '') + ' · ' + esc(o.loc || '') + ' · ' + fmt(o.followers) + ' followers · ' + esc(o.size || '') + '</div>' +
          (people.length ? '<div class="row small muted" style="margin-top:8px"><span class="av-stack">' + people.slice(0, 3).map(function (pid) { return A.avatar(A.P(pid), 24, 'av--ring'); }).join('') + '</span>' + (o.employees || people.length) + ' employees on the network' + (o.verified ? ' · verified organization' : '') + '</div>' : '') +
          '<div class="ptop__btns">' + (mine ? '<a class="btn btn--primary" href="#policy">Edit routing policy</a><button class="btn btn--secondary" data-act="soon" data-msg="Admin tools for verified organizations are on the roadmap for months 12–24.">Admin tools</button>'
            : '<button class="btn btn--primary" data-act="follow" data-id="' + id + '">' + (fol ? I('check', 'ico-20') + 'Following' : I('plus', 'ico-20') + 'Follow') + '</button>' + (contact ? '<a class="btn btn--secondary" href="#send.' + contact + '">' + I('spark', 'ico-20') + 'Send intent to the company agent</a>' : '')) + '</div>' +
        '</div><div class="tabs" role="tablist"><a class="tab is-on" href="#company.' + id + '">Home</a><button class="tab" data-act="co-jump" data-to="co-about">About</button>' + (o.depts ? '<button class="tab" data-act="co-jump" data-to="co-routing">Agent routing</button>' : '') + '<button class="tab" data-act="co-jump" data-to="co-people">People</button><button class="tab" data-act="co-jump" data-to="co-posts">Posts</button></div></div>' +
        '<section class="card sec" id="co-about"><div class="sec__h"><h2>About</h2></div><p style="white-space:pre-line">' + esc(o.about || o.tagline) + '</p><dl class="kv" style="margin-top:16px"><dt>Industry</dt><dd>' + esc(o.industry || '—') + '</dd><dt>Company size</dt><dd>' + esc(o.size || '—') + '</dd><dt>Headquarters</dt><dd>' + esc(o.loc || '—') + '</dd><dt>Verification</dt><dd>' + (o.verified ? A.verifiedBadge() + ' Verified domain and employees' : 'Not verified yet') + '</dd></dl></section>' +
        (o.depts ? '<section class="card sec" id="co-routing"><div class="sec__h"><h2>Company agent routing</h2><span class="tag tag--accent">Verified organization</span></div><p class="muted" style="margin-bottom:12px">Every inbound to ' + esc(o.name) + ' reaches the company agent first. It classifies the intent, asks for what is missing and assigns an owner.</p>' +
          A.ui.table(['Department', 'Accepts', 'Required evidence', 'Routes to', 'Default lane'], o.depts.map(function (d) { return d.map(esc); })) + '</section>' : '') +
        '<section class="card sec" id="co-people"><div class="sec__h"><h2>People</h2></div>' + (people.length ? people.map(function (pid) { const u = A.P(pid); return '<div class="person-row">' + A.avatar(u, 48) + '<div class="grow"><a class="b" href="#in.' + pid + '" style="color:var(--fg)">' + esc(u.name) + '</a><div class="small muted">' + esc(u.headline) + '</div></div></div>'; }).join('') : '<p class="muted">No members listed yet.</p>') + '</section>' +
        '<section class="card sec" id="co-posts"><div class="sec__h"><h2>Posts</h2></div>' + (posts.length ? posts.slice(0, 3).map(function (p) { return '<div style="padding-block:10px;border-top:1px solid var(--line)"><div class="small muted">' + esc(p.org ? A.O(p.org).name : A.P(p.who).name) + ' · ' + esc(p.time) + '</div><div class="clamp2">' + esc(p.text) + '</div></div>'; }).join('') : '<p class="muted">No recent posts.</p>') + '</section>' +
        '</div><aside class="rail rail--right"><div class="card pad"><h2 class="card__h">Pages people also viewed</h2>' +
          ['aldermoor', 'latticeforge', 'kinetic', 'parsewell'].filter(function (x) { return x !== id; }).slice(0, 3).map(function (x) { const oo = A.O(x); return '<div class="person-row">' + A.orgLogo(Object.assign({ id: x }, oo), 48) + '<div class="grow"><a class="b" href="#company.' + x + '" style="color:var(--fg)">' + esc(oo.name) + '</a><div class="small muted">' + esc(oo.industry) + '</div><div class="small muted">' + fmt(oo.followers) + ' followers</div></div></div>'; }).join('') +
        '</div><div class="sticky">' + A.ui.appFooter() + '</div></aside></div></div>';
    },
  });
  A.act['co-jump'] = function (el) { const t = document.getElementById(el.dataset.to); if (t) window.scrollTo(0, t.getBoundingClientRect().top + window.scrollY - 70); };
})(window.ABN);
