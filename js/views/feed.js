/* Home feed: agent console rail, composer, agent digest, posts, trending rail */
(function (A) {
  const esc = A.esc, I = A.icon, E = A.Engine;
  const expanded = {}, openCm = {};
  const fmt = function (n) { return Number(n).toLocaleString('en-US'); };
  A.fmt = fmt;

  function allPosts() { return A.S.myPosts.concat(A.posts); }
  function findPost(id) { return allPosts().filter(function (p) { return p.id === id; })[0]; }

  A.ui.leftRail = function () {
    const me = A.P(A.me), st = A.stats, pol = A.S.policy;
    const c = E.counts(E.inbox()), n = A.intents.length;
    const colors = { high: 'var(--high)', medium: 'var(--med)', low: 'var(--low)', declined: 'var(--fg-3)', blocked: 'var(--bad)' };
    return '<aside class="rail hide-md">' +
      '<div class="card console">' +
        '<div class="console__me"><a href="#in.' + A.me + '" aria-label="Your profile">' + A.avatar(me, 48) + '</a><div class="grow"><a href="#in.' + A.me + '">' + esc(me.name) + '</a><div class="small muted clamp1">' + esc(me.headline) + '</div></div></div>' +
        '<div class="addr"><span>' + esc(me.addr) + '</span><button class="iconbtn" data-act="copy" data-text="' + esc(me.addr) + '" data-msg="Agent address copied." aria-label="Copy agent address">' + I('copy', 'ico-16') + '</button></div>' +
        '<div class="stack"><div class="console__row"><span class="eyebrow">Today’s routing</span><span class="live' + (pol.focus ? ' live--off' : '') + '">' + (pol.focus ? 'Focus mode' : 'Agent active') + '</span></div>' +
          '<div class="split" role="img" aria-label="' + E.LANES.map(function (l) { return c[l] + ' ' + E.LABEL[l]; }).join(', ') + '">' + E.LANES.filter(function (l) { return c[l]; }).map(function (l) { return '<span style="width:' + (c[l] / n * 100) + '%;background:' + colors[l] + '"></span>'; }).join('') + '</div>' +
          '<div class="console__legend">' + E.LANES.map(function (l) { return '<a href="#inbox">' + A.ui.lane(l) + '<b>' + c[l] + '</b></a>'; }).join('') + '<a href="#policy"><span>Policy</span><b>v' + pol.version + '</b></a></div></div>' +
        '<div class="console__stats"><a href="#inbox"><b>' + st.triaged + '</b><span>screened this week</span></a><a href="#inbox"><b>' + st.saved + 'h</b><span>of your time saved</span></a><a href="#in.' + A.me + '"><b>' + st.views + '</b><span>profile views</span></a></div>' +
      '</div>' +
      '<div class="card railnav sticky" style="padding-block:8px"><a href="#policy">' + I('sliders') + 'Attention policy</a><a href="#policy.vip">' + I('star') + 'VIP list</a><a href="#inbox">' + I('inbox') + 'Today’s digest</a><a href="#a.' + A.me + '">' + I('eye') + 'Your public agent page</a><a href="#developers">' + I('code') + 'API and webhooks</a></div>' +
      '</aside>';
  };

  function digestCard() {
    const list = E.sort(E.inbox()), c = E.counts(list);
    const top = list.filter(function (r) { return r.lane === 'high' && !(r.decision && r.decision.status); }).slice(0, 3);
    return '<div class="card digest"><div class="row between"><div class="row"><span class="agent-av">' + I('spark') + '</span><div><div class="b">Your agent’s morning brief</div><div class="small muted">Only visible to you · ' + E.now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + '</div></div></div></div>' +
      '<div class="digest__grid"><div class="kpi"><b class="lc-high">' + c.high + '</b><span>HIGH for you</span></div><div class="kpi"><b class="lc-medium">' + c.medium + '</b><span>Being qualified</span></div><div class="kpi"><b>' + (c.low + c.declined) + '</b><span>Declined or archived</span></div><div class="kpi"><b class="lc-blocked">' + c.blocked + '</b><span>Blocked</span></div></div>' +
      (top.length ? '<ul class="stack" style="margin-top:12px">' + top.map(function (r) {
        return '<li><a class="row" href="#inbox.' + r.it.id + '" style="color:var(--fg)">' + A.avatar(r.p, 36) + '<span class="grow"><span class="b clamp1" style="display:block">' + esc(r.p.name) + '</span><span class="small muted clamp1" style="display:block">' + esc(r.it.objective) + '</span></span>' + A.ui.gauge(r.score, r.lane, true) + '</a></li>';
      }).join('') + '</ul>' : '<p class="muted" style="margin-top:12px">You handled every HIGH item. Nice.</p>') +
      '<div class="row wrap" style="margin-top:12px"><a class="btn btn--primary btn--sm" href="#inbox">Open Agent Inbox</a><a class="btn btn--tertiary btn--sm" href="#policy">Tune policy</a></div></div>';
  }

  function chartSvg() {
    const rows = [['On-demand GPUs', 0.84, 'bar-c'], ['Reserved GPUs', 0.71, 'bar-c'], ['Tensorloom (spot)', 0.52, 'bar-b']];
    const x0 = 132, w = 290, max = 0.9;
    return '<div class="chart"><div class="b small" style="margin-bottom:8px">Serving cost per 1M tokens, 30-day test (USD)</div><svg viewBox="0 0 480 138" role="img" aria-label="Serving cost per million tokens: on-demand $0.84, reserved $0.71, Tensorloom $0.52.">' +
      [0, 0.3, 0.6, 0.9].map(function (v) { const x = x0 + (v / max) * w; return '<line class="grid" x1="' + x + '" x2="' + x + '" y1="4" y2="112"/><text x="' + x + '" y="130" text-anchor="middle">$' + v.toFixed(2) + '</text>'; }).join('') +
      rows.map(function (r, i) { const y = 12 + i * 34, bw = (r[1] / max) * w; return '<text x="0" y="' + (y + 15) + '">' + r[0] + '</text><rect class="' + r[2] + '" x="' + x0 + '" y="' + y + '" width="' + bw.toFixed(1) + '" height="22" rx="3"/><text class="lbl" x="' + (x0 + bw + 6).toFixed(1) + '" y="' + (y + 15) + '">$' + r[1].toFixed(2) + '</text>'; }).join('') +
      '</svg></div>';
  }
  function linkArt(kind) {
    if (kind === 'podcast') {
      const bars = [18, 34, 52, 30, 64, 44, 72, 38, 56, 26, 46, 20, 40, 60, 32];
      return '<div class="linkcard__art cover" style="' + A.coverStyle(['#b45309', '#f59e0b']) + '"><svg viewBox="0 0 300 120" width="70%" aria-hidden="true">' + bars.map(function (h, i) { return '<rect x="' + (10 + i * 19) + '" y="' + (60 - h / 2) + '" width="10" height="' + h + '" rx="5" fill="rgba(255,255,255,.85)"/>'; }).join('') + '</svg></div>';
    }
    return '<div class="linkcard__art cover" style="' + A.coverStyle(['#0b3b33', '#0d7a69']) + '"><svg viewBox="0 0 300 130" width="70%" aria-hidden="true"><rect x="40" y="14" width="220" height="102" rx="10" fill="rgba(255,255,255,.92)"/><text x="58" y="44" font-family="ui-monospace,Consolas,monospace" font-size="13" fill="#0d7a69">{ "intent": {</text><text x="74" y="66" font-family="ui-monospace,Consolas,monospace" font-size="13" fill="#8a5a12">"category": "fundraising",</text><text x="74" y="88" font-family="ui-monospace,Consolas,monospace" font-size="13" fill="#8a5a12">"evidence": [ … ] } }</text><rect x="206" y="24" width="42" height="18" rx="9" fill="#0d7a69"/><text x="227" y="37" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" font-weight="700" fill="#fff">v0.1</text></svg></div>';
  }
  function media(p) {
    const m = p.media;
    if (!m) return '';
    if (m.type === 'chart') return '<div class="post__media chartcard">' + chartSvg() + '</div>';
    if (m.type === 'link') return '<div class="post__media"><a class="linkcard" href="#' + (m.href || 'feed') + '">' + linkArt(m.art) + '<div class="linkcard__meta"><div class="b">' + esc(m.title) + '</div><div class="small muted">' + esc(m.src) + '</div></div></a></div>';
    if (m.type === 'event') {
      const going = A.S.follows['ev-' + p.id];
      return '<div class="post__media eventcard"><div class="eventcard__band cover" style="' + A.coverStyle(['#15803d', '#86efac']) + '"></div><div class="eventcard__b"><div class="datebox"><div class="m">' + m.m + '</div><div class="d">' + m.d + '</div></div><div class="grow"><div class="b">' + esc(m.title) + '</div><div class="small muted">' + esc(m.when) + '</div><div class="small muted">' + esc(m.where) + ' · ' + fmt(m.going + (going ? 1 : 0)) + ' attendees</div></div><button class="btn btn--secondary btn--sm" data-act="attend" data-id="' + p.id + '">' + (going ? I('check', 'ico-16') + 'Attending' : 'Attend') + '</button></div></div>';
    }
    if (m.type === 'job') {
      const o = A.O(m.org);
      return '<div class="post__media eventcard"><div class="eventcard__b">' + A.orgLogo(Object.assign({ id: m.org }, o), 48) + '<div class="grow"><div class="b">' + esc(m.title) + '</div><div class="small">' + esc(o.name) + '</div><div class="small muted">' + esc(m.loc) + ' · ' + esc(m.comp) + '</div><div class="agentnote">' + I('spark') + esc(m.note) + '</div></div><a class="btn btn--secondary btn--sm" href="#company.' + m.org + '">View job</a></div></div>';
    }
    return '';
  }
  function poll(p) {
    const q = p.poll, mine = A.S.polls[p.id];
    if (mine == null) {
      return '<div class="poll"><div class="small muted">' + fmt(q.votes) + ' votes · ' + q.left + '</div>' + q.opts.map(function (o, i) { return '<button class="poll__opt" data-act="vote" data-id="' + p.id + '" data-i="' + i + '">' + esc(o) + '</button>'; }).join('') + '<div class="small muted">The author can see how you vote.</div></div>';
    }
    const total = q.votes + 1;
    return '<div class="poll"><div class="small muted">' + fmt(total) + ' votes · ' + q.left + '</div>' + q.opts.map(function (o, i) {
      const votes = Math.round((q.pct[i] / 100) * q.votes) + (i === mine ? 1 : 0);
      const pct = Math.round((votes / total) * 100);
      return '<div class="poll__res' + (i === mine ? ' is-mine' : '') + '"><i style="width:' + pct + '%"></i><span>' + esc(o) + (i === mine ? ' ' + I('check', 'ico-16') : '') + '</span><span class="num">' + pct + '%</span></div>';
    }).join('') + '<button class="link small" style="align-self:flex-start" data-act="unvote" data-id="' + p.id + '">Undo vote</button></div>';
  }
  function body(p) {
    let t = p.text || '';
    let more = '';
    if (t.length > 230 && !expanded[p.id]) {
      let cut = t.slice(0, 210);
      cut = cut.slice(0, cut.lastIndexOf(' '));
      t = cut;
      more = '… <button class="more" data-act="see-more" data-id="' + p.id + '">more</button>';
    }
    const html = esc(t).replace(/(^|\s)#(\w+)/g, '$1<span class="link hashtag">#$2</span>');
    return '<div class="post__body">' + html + more + '</div>';
  }
  function renderPost(p) {
    if (p.type === 'digest') return digestCard();
    let name, sub, av, href, key, person = null;
    if (p.org) {
      const o = A.O(p.org);
      key = p.org; name = o.name; sub = fmt(o.followers) + ' followers'; av = A.orgLogo(Object.assign({ id: p.org }, o), 44); href = '#company.' + p.org;
    } else {
      person = A.P(p.who);
      key = p.who; name = person.name; sub = person.headline; av = A.avatar(person, 44); href = '#in.' + p.who;
    }
    const mine = p.who === A.me;
    const liked = !!A.S.likes[p.id];
    const followed = !!A.S.follows[key];
    const cm = (p.cmts || []).concat(A.S.myComments[p.id] || []);
    const nComments = (p.comments || 0) + (A.S.myComments[p.id] || []).length;
    const likes = ((p.rx && p.rx.n) || 0) + (liked ? 1 : 0);
    let ctx = '';
    if (p.ctx) {
      const cid = Object.keys(A.people).filter(function (id) { return p.ctx.indexOf(A.people[id].name) === 0; })[0];
      ctx = '<div class="post__ctx">' + (cid ? A.avatar(A.people[cid], 20) : '') + '<span>' + esc(p.ctx) + '</span></div>';
    }
    const connected = person && person.degree === '1st';
    return '<article class="card post" id="post-' + p.id + '">' + ctx +
      '<div class="post__hd"><a href="' + href + '" aria-label="' + esc(name) + '">' + av + '</a>' +
        '<div class="post__who"><span class="row" style="gap:6px"><a class="nm" href="' + href + '">' + esc(name) + '</a>' + (person ? A.ui.trust(person) : '') + '</span><span class="hl clamp1">' + esc(sub) + '</span><span class="tm">' + (p.time === 'now' ? 'just now' : esc(p.time) + ' ago') + ' · public</span></div>' +
        (mine || connected ? '' : '<button class="follow-btn" data-act="follow" data-id="' + key + '">' + (followed ? I('check', 'ico-16') + 'Following' : I('plus', 'ico-16') + 'Follow') + '</button>') +
      '</div>' +
      body(p) + (p.poll ? poll(p) : '') + media(p) +
      '<div class="post__foot">' +
        '<button class="post__act' + (liked ? ' is-on' : '') + '" data-act="like" data-id="' + p.id + '" aria-pressed="' + liked + '" aria-label="Like">' + I('heart') + '<span class="num">' + fmt(likes) + '</span></button>' +
        '<button class="post__act" data-act="toggle-cm" data-id="' + p.id + '" aria-label="Comments">' + I('comment') + '<span class="num">' + fmt(nComments) + '</span></button>' +
        '<button class="post__act" data-act="repost" data-id="' + p.id + '" aria-label="Share">' + I('repost') + '<span class="num">' + fmt(p.reposts || 0) + '</span></button>' +
        '<button class="post__act" data-act="send-post" data-id="' + p.id + '">' + I('sendo') + '<span>Send</span></button>' +
        '<span class="grow"></span><button class="post__act" data-act="save-post" aria-label="Save post">' + I('save') + '</button></div>' +
      (openCm[p.id] ? '<div class="comments"><form class="cbox" data-sub="comment" data-id="' + p.id + '">' + A.avatar(A.P(A.me), 36) + '<input id="ci-' + p.id + '" name="c" placeholder="Add a comment…" aria-label="Add a comment" autocomplete="off"><button class="btn btn--primary btn--sm" type="submit">Post</button></form>' +
        cm.map(function (c) { const u = A.P(c.who); return '<div class="cmt">' + A.avatar(u, 36) + '<div class="cmt__b"><div class="row between" style="align-items:flex-start"><span class="grow"><a class="b" href="#in.' + c.who + '" style="color:var(--fg)">' + esc(u.name) + '</a><span class="small muted clamp1" style="display:block">' + esc(u.headline) + '</span></span><span class="small faint mono">' + esc(c.time) + '</span></div><div style="margin-top:4px">' + esc(c.t) + '</div></div></div>'; }).join('') + '</div>' : '') +
      '</article>';
  }
  A.ui.renderPost = renderPost;
  function rerenderPost(id) {
    const el = document.getElementById('post-' + id), p = findPost(id);
    if (el && p) el.outerHTML = renderPost(p);
  }

  function rightRail() {
    const sug = A.vipSuggest.filter(function (id) { return A.S.policy.vip.indexOf(id) < 0; });
    if (A.live) {
      // A real network has no editorial news feed yet; VIP suggestions only when there are real people to suggest.
      return '<aside class="rail rail--right">' +
        (A.pymk.length ? '<div class="card pad stack-12"><h2 class="card__h">On Knockero</h2>' + A.pymk.slice(0, 4).map(function (id) { const u = A.P(id); return '<div class="person-row">' + A.avatar(u, 40) + '<div class="grow"><a class="b" href="#in.' + id + '" style="color:var(--fg)">' + esc(u.name) + '</a><div class="small muted clamp2">' + esc(u.headline) + '</div></div></div>'; }).join('') + '<a class="link small" href="#network">See everyone ' + I('arrow', 'ico-16') + '</a></div>' : '') +
        '<div class="sticky">' + A.ui.appFooter() + '</div></aside>';
    }
    return '<aside class="rail rail--right">' +
      '<div class="card"><div class="pad" style="padding-bottom:6px"><h2 class="card__h">Trending in your topics</h2><div class="small muted">AI infrastructure · Inference · Developer tools</div></div>' +
        '<ol class="trend">' + A.news.map(function (n, i) { return '<li><a href="#feed"><span class="trend__n">' + (i + 1) + '</span><span><span class="ttl">' + esc(n.t) + '</span><span class="meta">' + esc(n.m) + '</span></span></a></li>'; }).join('') + '</ol><div style="height:8px"></div></div>' +
      '<div class="card pad" id="vip-card"><h2 class="card__h">Suggested VIPs</h2><p class="small muted" style="margin-top:2px">VIPs skip your filters and always reach you.</p>' +
        (sug.length ? sug.map(function (id) { const u = A.P(id); return '<div class="person-row">' + A.avatar(u, 40) + '<div class="grow"><a class="b" href="#in.' + id + '" style="color:var(--fg)">' + esc(u.name) + '</a><div class="small muted clamp2">' + esc(u.headline) + '</div></div><button class="btn btn--secondary btn--sm" data-act="vip-add" data-id="' + id + '" aria-label="Add ' + esc(u.name) + ' to VIPs">' + I('plus', 'ico-16') + 'VIP</button></div>'; }).join('') : '<p class="small" style="margin-top:8px">Everyone suggested is already a VIP.</p>') +
        '<a class="link small" href="#policy.vip">Manage VIPs ' + I('arrow', 'ico-16') + '</a></div>' +
      '<div class="sticky">' + A.ui.appFooter() + '</div></aside>';
  }

  // ---------- live home: getting started and what your agent did ----------
  function liveHome() {
    const me = A.P(A.me);
    const steps = [
      [!!me.photo, 'Add a profile photo', 'People recognise you before they knock.', '#in.' + A.me, 'Open profile'],
      [!!(me.exp && me.exp.length), 'Fill in your experience', 'Add it by hand, or in one click from your LinkedIn export.', '#in.' + A.me, 'Open profile'],
      [!!(A.account && A.account.emailVerified) || !(A.account && A.account.email), 'Confirm your email', 'Senders then see you as verified, and your agent can send its daily digest.', '#settings', 'Account and email'],
      [false, 'Bring your LinkedIn network', 'Import your connections and invite the people you work with.', '#contacts', 'Import connections'],
      [false, 'Share your agent address', 'Put ' + me.addr + ' in your bio, signature or deck. Anyone can knock.', null, 'Copy address'],
    ];
    const done = steps.filter(function (s) { return s[0]; }).length;
    const recent = E.sort(E.inbox()).filter(function (r) { return r.lane === 'high' || r.lane === 'medium'; }).slice(0, 5);
    return '<section class="card pad stack-12"><div class="row between wrap"><h2 class="card__h">Getting started</h2><span class="small muted">' + done + ' of ' + steps.length + ' done</span></div>' +
        steps.map(function (s) {
          const btn = s[3] ? '<a class="btn btn--tertiary btn--sm" href="' + s[3] + '">' + s[4] + '</a>' : '<button class="btn btn--tertiary btn--sm" data-act="copy" data-text="' + esc(me.addr) + '" data-msg="Agent address copied.">' + s[4] + '</button>';
          return '<div class="gs-step' + (s[0] ? ' is-done' : '') + '"><span class="gs-step__ic">' + I(s[0] ? 'check' : 'right', 'ico-16') + '</span><div class="grow"><b>' + s[1] + '</b><div class="small muted">' + esc(s[2]) + '</div></div>' + (s[0] ? '' : btn) + '</div>';
        }).join('') + '</section>' +
      '<section class="card"><div class="pad row between"><h2 class="card__h">Waiting for you</h2><a class="link-muted small" href="#inbox">Agent Inbox</a></div>' +
        (recent.length ? recent.map(function (r) {
          const it = r.it, p = A.P(it.from);
          return '<a class="gs-intent" href="#inbox.' + it.id + '">' + A.avatar(p, 40) + '<span class="grow"><b class="clamp1">' + esc(p.name) + '</b><span class="small muted clamp1">' + esc(it.objective) + '</span></span>' + A.ui.lane(r.lane) + '</a>';
        }).join('') : '<p class="pad muted" style="padding-top:0">' + (A.intents.length ? 'Nothing needs you right now: your agent handled the rest.' : 'Nobody has knocked yet. Share your agent address: anyone can send you a Business Intent, with or without an account.') + '</p>') +
      '</section>';
  }

  A.view('feed', {
    render: function () {
      const me = A.P(A.me);
      if (A.live) return '<div class="page"><div class="scaffold">' + A.ui.leftRail() + '<div class="main">' + liveHome() + '</div>' + rightRail() + '</div></div>';
      return '<div class="page"><div class="scaffold">' + A.ui.leftRail() +
        '<div class="main">' +
          '<div class="card composer"><div class="composer__top">' + A.avatar(me, 40) + '<button class="composer__input" data-act="compose-post">Share an update with your network…</button></div>' +
            '<div class="composer__acts"><button class="composer__act" data-act="compose-post">' + I('image') + 'Photo</button><button class="composer__act" data-act="compose-post" data-kind="event">' + I('calendar') + 'Event</button><button class="composer__act" data-act="compose-post" data-kind="article">' + I('article') + 'Article</button><a class="btn btn--primary btn--sm" href="#send">' + I('spark', 'ico-16') + 'New intent</a></div></div>' +
          allPosts().map(renderPost).join('') +
        '</div>' + rightRail() + '</div></div>';
    },
  });

  A.act.like = function (el) {
    const id = el.dataset.id;
    A.S.likes[id] = !A.S.likes[id];
    if (!A.S.likes[id]) delete A.S.likes[id];
    A.save(); rerenderPost(id);
  };
  A.act.vote = function (el) { A.S.polls[el.dataset.id] = +el.dataset.i; A.save(); rerenderPost(el.dataset.id); A.toast('Vote recorded.'); };
  A.act.unvote = function (el) { delete A.S.polls[el.dataset.id]; A.save(); rerenderPost(el.dataset.id); };
  A.act['see-more'] = function (el) { expanded[el.dataset.id] = true; rerenderPost(el.dataset.id); };
  A.act['toggle-cm'] = function (el) {
    const id = el.dataset.id;
    openCm[id] = !openCm[id];
    rerenderPost(id);
    const inp = document.getElementById('ci-' + id);
    if (inp) inp.focus();
  };
  A.sub.comment = function (f) {
    const id = f.dataset.id, v = f.querySelector('input').value.trim();
    if (!v) return;
    (A.S.myComments[id] = A.S.myComments[id] || []).unshift({ who: A.me, t: v, time: 'now' });
    A.save(); rerenderPost(id);
  };
  A.act.follow = function (el) {
    const k = el.dataset.id;
    A.S.follows[k] = !A.S.follows[k];
    A.save(); A.refresh();
    A.toast(A.S.follows[k] ? 'You are now following ' + esc((A.people[k] || A.orgs[k] || {}).name) + '.' : 'Unfollowed.');
  };
  A.act.attend = function (el) { const k = 'ev-' + el.dataset.id; A.S.follows[k] = !A.S.follows[k]; A.save(); rerenderPost(el.dataset.id); if (A.S.follows[k]) A.toast('You are attending. Kinetic Harbor’s program agent will match you with teams that fit your thesis.'); };
  A.act.repost = function () { A.toast('Reposted to your feed.'); };
  A.act['save-post'] = function () { A.toast('Post saved.'); };
  A.act['send-post'] = function () {
    const ids = ['grace-liu', 'jonas-lindqvist', 'mateo-rossi'];
    A.modal({
      title: 'Send post',
      body: '<p class="muted">Share with a connection. In this prototype nothing leaves your browser.</p>' + ids.map(function (id) { const u = A.P(id); return '<div class="row">' + A.avatar(u, 40) + '<div class="grow"><div class="b">' + esc(u.name) + '</div><div class="small muted clamp1">' + esc(u.headline) + '</div></div><button class="btn btn--secondary btn--sm" data-act="send-to">Send</button></div>'; }).join(''),
    });
  };
  A.act['send-to'] = function (el) { el.textContent = 'Sent'; el.classList.add('is-disabled'); };
  A.act['vip-add'] = function (el) {
    const id = el.dataset.id;
    if (A.S.policy.vip.indexOf(id) < 0) A.S.policy.vip.push(id);
    A.policyTouched();
    A.toast(esc(A.P(id).name) + ' is now a VIP. Their intents skip your filters and reach you directly.');
    A.refresh();
  };
  A.act['compose-post'] = function (el) {
    const me = A.P(A.me), kind = el.dataset.kind;
    const pre = kind === 'event' ? 'Office hours for AI infrastructure founders next Thursday, 16:00 CET. Knock on maya.okafor@' + A.brand.ns + ' to get a slot.' : kind === 'article' ? 'What I look for in a pre-seed infrastructure company:\n\n1. ' : '';
    A.modal({
      title: 'Create a post',
      body: '<div class="row">' + A.avatar(me, 48) + '<div><div class="b">' + esc(me.name) + '</div><div class="small muted">Post to anyone</div></div></div>' +
        '<label class="sr" for="post-text">Post text</label><textarea class="textarea" id="post-text" rows="7" placeholder="What do you want to talk about?">' + esc(pre) + '</textarea>' +
        '<div class="note">' + I('spark') + '<div class="small">Posts that include your agent address let readers reach you without a DM. Your agent screens every reply.</div></div>',
      foot: '<button class="btn btn--primary" data-act="publish-post">Post</button>',
    });
  };
  A.act['publish-post'] = function () {
    const t = document.getElementById('post-text').value.trim();
    if (!t) { A.toast('Write something before posting.', 'warn'); return; }
    A.S.myPosts.unshift({ id: 'm' + Date.now(), who: A.me, time: 'now', text: t, rx: { n: 0, top: ['like'] }, comments: 0, reposts: 0, cmts: [] });
    A.save(); A.closeModal(); A.refresh();
    A.toast('Posted to your feed. It is saved in this browser only.');
  };
})(window.ABN);
