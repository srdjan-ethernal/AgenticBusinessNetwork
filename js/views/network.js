/* My Network and Notifications */
(function (A) {
  const esc = A.esc, I = A.icon, E = A.Engine;
  let nFilter = 'all';
  const heldOpen = {};

  function manageRail() {
    const items = [['users', 'Connections', '612', 'network'], ['people', 'Following & followers', '1,204', 'network'], ['star', 'VIP list', String(A.S.policy.vip.length), 'policy.vip'], ['block', 'Blocked senders', '2', 'inbox'], ['users', 'Groups', '5', 'network'], ['calendar', 'Events', '2', 'feed'], ['building', 'Pages', '14', 'company.tidewell'], ['article', 'Newsletters', '3', 'feed']];
    return '<aside class="rail hide-md"><div class="card"><div class="pad" style="padding-bottom:4px"><h2 class="card__h">Your network</h2></div><div class="railnav" style="padding-bottom:8px">' +
      items.map(function (x) { return '<a href="#' + x[3] + '">' + I(x[0]) + '<span>' + x[1] + '</span><span class="muted" style="margin-left:auto;font-weight:400">' + x[2] + '</span></a>'; }).join('') + '</div></div>' +
      '<div class="card pad stack-12 sticky"><div class="b">Connection requests go through your agent too</div><p class="small muted">It holds unverified or templated requests and tells you why the rest are worth a look.</p><a class="link small" href="#policy.categories">Adjust in your policy</a></div></aside>';
  }

  function invitation(x, held) {
    const u = A.P(x.who), st = A.S.inv[x.who];
    const acts = st === 'accepted' ? '<span class="status">' + I('check', 'ico-16') + 'Connected</span>' : st === 'ignored' ? '<span class="small muted">Ignored</span>'
      : held && !heldOpen[x.who] ? '<button class="btn btn--tertiary btn--sm" data-act="inv-keep" data-id="' + x.who + '">Keep held</button><button class="btn btn--secondary btn--sm" data-act="inv-review" data-id="' + x.who + '">Review</button>'
      : '<button class="btn btn--tertiary btn--sm" data-act="inv" data-v="ignored" data-id="' + x.who + '">Ignore</button><button class="btn btn--secondary btn--sm" data-act="inv" data-v="accepted" data-id="' + x.who + '">Accept</button>';
    return '<div class="inv">' + A.avatar(u, 72) + '<div class="inv__b"><a class="b t16" href="#in.' + x.who + '" style="color:var(--fg)">' + esc(u.name) + '</a><div class="small">' + esc(u.headline) + '</div>' +
      '<div class="agentnote">' + I(held ? 'warn' : 'spark') + '<span>' + (held ? 'Held by your agent: ' : 'Your agent: ') + esc(x.note) + '</span></div>' +
      (x.msg && (!held || heldOpen[x.who]) ? '<div class="rawmsg small" style="margin-top:8px">' + esc(x.msg) + '</div>' : '') +
      (held && heldOpen[x.who] ? '<div class="rawmsg small" style="margin-top:8px">Hey! I help founders and investors 10x their pipeline. Let’s connect and explore synergies!</div>' : '') + '</div>' +
      '<div class="row">' + acts + '</div></div>';
  }

  A.view('network', {
    render: function () {
      const pending = A.invitations.filter(function (x) { return !A.S.inv[x.who]; }).length;
      return '<div class="page"><div class="scaffold scaffold--lm">' + manageRail() + '<div class="main">' +
        '<section class="card pad row wrap ct-promo"><span class="ct-promo__ic">' + I('users') + '</span><div class="grow stack-4"><b>Bring your LinkedIn network</b><span class="small muted">Import your connections from LinkedIn’s data export and invite them. Your agent then knows who you already work with.</span></div><a class="btn btn--primary btn--sm" href="#contacts">Import connections</a></section>' +
        '<section class="card"><div class="pad row between" style="padding-bottom:12px"><div><h2 class="card__h">Invitations (' + pending + ')</h2><div class="small muted">Screened by your agent. Each one says why it’s worth a look.</div></div><a class="link-muted small" href="#policy.categories">Manage</a></div>' +
          A.invitations.map(function (x) { return invitation(x, false); }).join('') + '</section>' +
        '<section class="card"><div class="pad" style="padding-bottom:12px"><h2 class="card__h">Held by your agent (' + A.held.length + ')</h2><div class="small muted">Not shown as invitations until you review them.</div></div>' + A.held.map(function (x) { return invitation(x, true); }).join('') + '</section>' +
        '<section class="card"><div class="pad row between"><h2 class="card__h">Suggested connections in AI infrastructure</h2><a class="link-muted small" href="#send">See all</a></div><div class="pymk">' +
          A.pymk.map(function (id) {
            const u = A.P(id), c = A.S.conn[id];
            return '<div class="pymk__c"><div class="pymk__b">' + A.avatar(u, 64) + '<a class="nm" href="#in.' + id + '">' + esc(u.name) + '</a><span class="hl clamp2">' + esc(u.headline) + '</span><span class="small muted row" style="justify-content:center">' + I('users', 'ico-16') + (u.mutuals || 3) + ' mutual connections</span>' +
              '<button class="btn ' + (c ? 'btn--muted' : 'btn--secondary') + ' btn--sm" data-act="connect" data-id="' + id + '"' + (c ? ' disabled' : '') + '>' + (c ? I('clock', 'ico-16') + 'Pending' : I('plus', 'ico-16') + 'Connect') + '</button></div></div>';
          }).join('') + '</div></section>' +
        '</div></div></div>';
    },
  });
  A.act.inv = function (el) {
    const id = el.dataset.id, v = el.dataset.v;
    A.S.inv[id] = v; A.save(); A.refresh(); A.updateBadges();
    A.toast(v === 'accepted' ? 'You are now connected with ' + esc(A.P(id).name) + '.' : 'Invitation ignored. ' + esc(A.P(id).name) + ' is not notified.', v === 'accepted' ? '' : 'info');
  };
  A.act['inv-review'] = function (el) { heldOpen[el.dataset.id] = true; A.refresh(); };
  A.act['inv-keep'] = function (el) { A.S.inv[el.dataset.id] = 'ignored'; A.save(); A.refresh(); A.toast('Kept held. Your agent sent a polite “not now”.', 'info'); };

  // ---------- notifications ----------
  function notifIcon(n) {
    if (n.who) return A.avatar(A.P(n.who), 48);
    const tone = { bad: ['var(--bad-bg)', 'var(--bad)'], high: ['var(--high-bg)', 'var(--high)'], accent: ['var(--accent-soft)', 'var(--accent)'] }[n.tone || 'accent'];
    return '<span class="notif__icon" style="background:' + tone[0] + ';color:' + tone[1] + '">' + I(n.ic) + '</span>';
  }
  A.view('notifications', {
    render: function () {
      const kinds = { agent: function (n) { return !n.who; }, high: function (n) { return /HIGH|VIP/.test(n.text); }, mentions: function (n) { return /mentioned|reacted/.test(n.text); } };
      const list = A.notifications.filter(function (n) { return nFilter === 'all' || kinds[nFilter](n); });
      const c = E.counts(E.inbox());
      const pill = function (k, l) { return '<button class="pill' + (nFilter === k ? ' is-on' : '') + '" data-act="n-filter" data-k="' + k + '">' + l + '</button>'; };
      return '<div class="page"><div class="scaffold">' +
        '<aside class="rail hide-md"><div class="card pad stack-12"><div class="b">Manage your notifications</div><a class="link small" href="#policy.autonomy">View settings</a></div></aside>' +
        '<div class="main"><div class="card"><div class="pad row between wrap"><div class="pills">' + pill('all', 'All') + pill('agent', 'Agent actions') + pill('high', 'HIGH and VIP') + pill('mentions', 'Mentions') + '</div><button class="btn btn--tertiary btn--sm" data-act="n-readall">Mark all as read</button></div>' +
          (list.length ? list.map(function (n) {
            const unread = n.unread && !A.S.readN[n.id];
            return '<div class="notif' + (unread ? ' is-unread' : '') + '">' + notifIcon(n) + '<div class="grow"><button class="notif__t" data-act="n-open" data-id="' + n.id + '" style="text-align:left">' + n.text + '</button></div><div class="stack-4" style="align-items:flex-end"><span class="small muted">' + E.ago(n.ago) + '</span>' + (unread ? '<span class="sr">Unread</span><span style="width:8px;height:8px;border-radius:50%;background:var(--accent);display:block" aria-hidden="true"></span>' : '') + '</div></div>';
          }).join('') : '<p class="pad muted">Nothing here yet.</p>') + '</div></div>' +
        '<aside class="rail rail--right"><div class="card pad stack-12"><h2 class="card__h">Your agent this week</h2><div class="digest__grid" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-top:0"><div class="kpi"><b>' + A.stats.triaged + '</b><span>Screened</span></div><div class="kpi"><b>' + A.stats.reached + '</b><span>Reached you</span></div><div class="kpi"><b class="lc-high">' + c.high + '</b><span>HIGH now</span></div><div class="kpi"><b>' + A.stats.saved + ' h</b><span>Saved</span></div></div><a class="btn btn--secondary btn--sm" href="#inbox" style="align-self:flex-start">Open Agent Inbox</a></div><div class="sticky">' + A.ui.appFooter() + '</div></aside>' +
        '</div></div>';
    },
  });
  A.act['n-filter'] = function (el) { nFilter = el.dataset.k; A.refresh(); };
  A.act['n-readall'] = function () { A.notifications.forEach(function (n) { A.S.readN[n.id] = 1; }); A.save(); A.refresh(); A.toast('All notifications marked as read.', 'info'); };
  A.act['n-open'] = function (el) {
    const n = A.notifications.filter(function (x) { return x.id === el.dataset.id; })[0];
    A.S.readN[n.id] = 1; A.save();
    if (n.link) A.go(n.link); else { A.refresh(); A.updateBadges(); }
  };
})(window.ABN);
