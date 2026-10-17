/* Live posts, connections and notifications: everything here comes from the server (js/api.js).
   The static demo keeps its own posts in feed.js. */
(function (A) {
  const esc = A.esc, I = A.icon;
  const fmt = function (n) { return Number(n || 0).toLocaleString('en-US'); };
  const P = (A.Posts = {});
  const lists = {};       // key -> { items, more, loaded, all }
  const comments = {};    // post id -> comment list (loaded on demand)
  const openCm = {}, expanded = {};
  let draftImage = null;  // resized JPEG blob for the composer

  function call(m, u, b) { return A.Live.call(m, u, b); }

  // The server stores UTC; SQLite gives it back without a zone, so treat a bare timestamp as UTC.
  function when(iso) {
    const s = String(iso || '');
    const t = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : s + 'Z').getTime();
    const a = A.Engine.ago((Date.now() - t) / 60000);
    return a === 'now' ? 'just now' : a + ' ago';
  }
  P.when = when;

  function av(a, size) {
    return A.avatar(a, size);
  }

  // Escaped text with clickable links and #hashtags; line breaks are kept by .post__body.
  function rich(text) {
    return esc(text)
      .replace(/https?:\/\/[^\s<]+/g, function (u) {
        const tail = (u.match(/[.,;:!?)]+$/) || [''])[0], url = tail ? u.slice(0, -tail.length) : u;
        return '<a class="link" href="' + url + '" target="_blank" rel="noopener noreferrer nofollow">' + url + '</a>' + tail;
      })
      .replace(/(^|\s)#(\w+)/g, '$1<span class="link hashtag">#$2</span>');
  }

  function body(p) {
    let t = p.text, more = '';
    if (t.length > 320 && !expanded[p.id]) {
      t = t.slice(0, 280); t = t.slice(0, Math.max(200, t.lastIndexOf(' ')));
      more = '… <button class="more" data-act="lp-more-text" data-id="' + p.id + '">more</button>';
    }
    return '<div class="post__body">' + rich(t) + more + '</div>';
  }

  function commentsHtml(p) {
    const list = comments[p.id];
    const me = A.P(A.me);
    return '<div class="comments"><form class="cbox" data-sub="lp-comment" data-id="' + p.id + '">' + A.avatar(me, 36) +
      '<input id="lci-' + p.id + '" name="c" maxlength="1250" placeholder="Add a comment…" aria-label="Add a comment" autocomplete="off"><button class="btn btn--primary btn--sm" type="submit">Post</button></form>' +
      (!list ? '<p class="small muted">Loading…</p>' : list.map(function (c) {
        const canDel = c.author.id === A.me || p.mine;
        return '<div class="cmt">' + av(c.author, 36) + '<div class="cmt__b"><div class="row between" style="align-items:flex-start"><span class="grow"><a class="b" href="#in.' + esc(c.author.id) + '" style="color:var(--fg)">' + esc(c.author.name) + '</a><span class="small muted clamp1" style="display:block">' + esc(c.author.headline) + '</span></span><span class="small faint">' + when(c.at) + '</span>' +
          (canDel ? '<button class="iconbtn" data-act="lp-cdel" data-id="' + c.id + '" data-post="' + p.id + '" aria-label="Delete comment" title="Delete comment">' + I('x', 'ico-16') + '</button>' : '') +
          '</div><div class="post__body" style="padding:4px 0 0">' + rich(c.text) + '</div></div></div>';
      }).join('')) + '</div>';
  }

  function card(p) {
    const a = p.author, signedIn = A.S.signedIn;
    // Company pages are public, so a company author links to its page; people's profiles are for members.
    const href = a.kind === 'company' ? '#company.' + esc(a.id) : '#in.' + esc(a.id);
    const act = function (name) { return signedIn ? name : 'lp-signin'; };
    return '<article class="card post" data-post="' + p.id + '">' +
      '<div class="post__hd"><a href="' + href + '" aria-label="' + esc(a.name) + '">' + av(a, 44) + '</a>' +
        '<div class="post__who"><a class="nm" href="' + href + '">' + esc(a.name) + '</a><span class="hl clamp1">' + esc(a.headline) + '</span>' + (signedIn ? '<a class="tm" href="#post.' + p.id + '" style="color:inherit">' + when(p.at) + '</a>' : '<span class="tm">' + when(p.at) + '</span>') + '</div>' +
        (p.mine ? '<button class="iconbtn" data-act="lp-del" data-id="' + p.id + '" aria-label="Delete post" title="Delete post">' + I('x', 'ico-20') + '</button>' : '') +
      '</div>' + body(p) +
      (p.image ? '<div class="post__media"><img class="post__img" src="' + esc(p.image) + '" alt="" loading="lazy" decoding="async"></div>' : '') +
      '<div class="post__foot">' +
        '<button class="post__act' + (p.liked ? ' is-on' : '') + '" data-act="' + act('lp-like') + '" data-id="' + p.id + '" aria-pressed="' + p.liked + '" aria-label="Like">' + I('heart') + '<span class="num">' + fmt(p.likes) + '</span></button>' +
        '<button class="post__act" data-act="' + act('lp-cm') + '" data-id="' + p.id + '" aria-expanded="' + !!openCm[p.id] + '" aria-label="Comments">' + I('comment') + '<span class="num">' + fmt(p.comments) + '</span></button>' +
        (signedIn ? '<span class="grow"></span><button class="post__act" data-act="copy" data-text="' + esc(location.origin + location.pathname + '#post.' + p.id) + '" data-msg="Link copied. Members of Knockero can open it.">' + I('link') + '<span>Copy link</span></button>' : '') +
      '</div>' + (openCm[p.id] && signedIn ? commentsHtml(p) : '') + '</article>';
  }
  A.act['lp-signin'] = function () {
    A.afterSignin = A.cur;
    A.go('signin');
    A.toast('Sign in or join Knockero to like and comment.', 'info');
  };
  P.card = card;

  function find(id) {
    id = +id;
    for (const k in lists) { const f = lists[k].items.filter(function (p) { return p.id === id; })[0]; if (f) return f; }
    return null;
  }
  function each(id, fn) { id = +id; Object.keys(lists).forEach(function (k) { lists[k].items.forEach(function (p) { if (p.id === id) fn(p); }); }); }
  function redraw(id) {
    const p = find(id);
    document.querySelectorAll('[data-post="' + (+id) + '"]').forEach(function (el) { if (el.tagName === 'ARTICLE' && p) el.outerHTML = card(p); });
  }

  // ---------- lists: the feed, someone's activity, one post ----------
  function url(key, before) {
    const base = key === 'feed' ? 'api/feed'
      : key.indexOf('author:') === 0 ? 'api/members/' + encodeURIComponent(key.slice(7)) + '/posts'
      : key.indexOf('company:') === 0 ? 'api/companies/' + encodeURIComponent(key.slice(8)) + '/posts'   // public
      : null;
    return base + (before ? '?before=' + before : '');
  }
  P.html = function (key, o) {
    o = o || {};
    if (o.empty) emptyText[key] = o.empty;
    const st = lists[key];
    let inner;
    if (!st || !st.loaded) inner = '<div class="card pad muted">Loading posts…</div>';
    else if (!st.items.length) inner = o.empty || '<div class="card pad muted">No posts yet.</div>';
    else {
      const shown = o.limit && !st.all ? st.items.slice(0, o.limit) : st.items;
      inner = shown.map(card).join('') +
        (o.limit && !st.all && st.items.length > o.limit ? '<button class="btn btn--tertiary btn--sm" data-act="lp-all" data-key="' + esc(key) + '">Show all posts ' + I('down', 'ico-16') + '</button>'
          : st.more ? '<button class="btn btn--tertiary btn--sm" data-act="lp-page" data-key="' + esc(key) + '">Show more posts</button>' : '');
    }
    return '<div class="stack" data-plist="' + esc(key) + '" data-limit="' + (o.limit || '') + '">' + inner + '</div>';
  };
  const emptyText = {};
  function paint(key) {
    document.querySelectorAll('[data-plist="' + key + '"]').forEach(function (el) {
      el.outerHTML = P.html(key, { limit: +el.dataset.limit || 0, empty: emptyText[key] });
    });
  }
  P.load = function (key, o) {
    if (o && o.empty) emptyText[key] = o.empty;
    return call('GET', url(key)).then(function (items) {
      const prev = lists[key];
      lists[key] = { items: items, more: items.length >= 20, loaded: true, all: prev ? prev.all : false };
      paint(key);
    }, function (e) {
      document.querySelectorAll('[data-plist="' + key + '"]').forEach(function (el) { el.innerHTML = '<div class="card pad muted">' + esc(e.message) + '</div>'; });
    });
  };
  P.empty = function (key, html) { emptyText[key] = html; };
  P.forget = function (key) { delete lists[key]; };
  P.reset = function () { Object.keys(lists).forEach(function (k) { delete lists[k]; }); Object.keys(comments).forEach(function (k) { delete comments[k]; }); };

  A.act['lp-page'] = function (el) {
    const key = el.dataset.key, st = lists[key];
    el.disabled = true;
    call('GET', url(key, st.items[st.items.length - 1].id)).then(function (items) {
      st.items = st.items.concat(items); st.more = items.length >= 20; paint(key);
    }, function (e) { el.disabled = false; A.toast(esc(e.message), 'warn'); });
  };
  A.act['lp-all'] = function (el) { lists[el.dataset.key].all = true; paint(el.dataset.key); };
  A.act['lp-more-text'] = function (el) { expanded[el.dataset.id] = true; redraw(el.dataset.id); };

  // ---------- likes, comments, deleting ----------
  A.act['lp-like'] = function (el) {
    const id = +el.dataset.id, p = find(id);
    if (!p) return;
    const was = p.liked;
    each(id, function (x) { x.liked = !was; x.likes += was ? -1 : 1; });
    redraw(id);
    call('POST', 'api/posts/' + id + '/like').then(function (r) {
      each(id, function (x) { x.liked = r.liked; x.likes = r.likes; }); redraw(id);
    }, function (e) { each(id, function (x) { x.liked = was; x.likes += was ? 1 : -1; }); redraw(id); A.toast(esc(e.message), 'warn'); });
  };
  function loadComments(id) {
    return call('GET', 'api/posts/' + id + '/comments').then(function (list) {
      comments[id] = list; each(id, function (x) { x.comments = list.length; }); redraw(id);
    }, function (e) { A.toast(esc(e.message), 'warn'); });
  }
  A.act['lp-cm'] = function (el) {
    const id = +el.dataset.id;
    openCm[id] = !openCm[id];
    redraw(id);
    if (openCm[id]) {
      const inp = document.getElementById('lci-' + id); if (inp) inp.focus();
      loadComments(id);
    }
  };
  A.sub['lp-comment'] = function (f) {
    const id = +f.dataset.id, inp = f.querySelector('input'), v = inp.value.trim();
    if (!v) return;
    inp.disabled = true;
    call('POST', 'api/posts/' + id + '/comments', { text: v }).then(function (list) {
      comments[id] = list; each(id, function (x) { x.comments = list.length; }); redraw(id);
      const again = document.getElementById('lci-' + id); if (again) again.focus();
    }, function (e) { inp.disabled = false; A.toast(esc(e.message), 'warn'); });
  };
  A.act['lp-cdel'] = function (el) {
    const id = +el.dataset.post;
    call('DELETE', 'api/comments/' + el.dataset.id).then(function () { loadComments(id); }, function (e) { A.toast(esc(e.message), 'warn'); });
  };
  A.act['lp-del'] = function (el) {
    const id = +el.dataset.id;
    A.modal({
      title: 'Delete post?',
      body: '<p>The post, its likes and its comments are removed for everyone. This can’t be undone.</p>',
      foot: '<button class="btn btn--tertiary" data-act="modal-close">Cancel</button><button class="btn btn--danger" data-act="lp-del-yes" data-id="' + id + '">Delete</button>',
    });
  };
  A.act['lp-del-yes'] = function (el) {
    const id = +el.dataset.id;
    el.disabled = true;
    call('DELETE', 'api/posts/' + id).then(function () {
      A.closeModal();
      Object.keys(lists).forEach(function (k) { lists[k].items = lists[k].items.filter(function (p) { return p.id !== id; }); paint(k); });
      if (A.cur === 'post.' + id) A.go('feed');
      A.toast('Post deleted.', 'info');
    }, function (e) { el.disabled = false; A.toast(esc(e.message), 'warn'); });
  };

  // ---------- composer ----------
  P.composer = function () {
    const me = A.P(A.me);
    return '<div class="card composer"><div class="composer__top">' + av(Object.assign({ id: A.me }, me), 40) + '<button class="composer__input" data-act="lp-compose">Start a post' + (me.kind === 'company' ? ' as ' + esc(me.name) : '') + '</button></div>' +
      '<div class="composer__acts"><button class="composer__act" data-act="lp-compose" data-photo="1">' + I('image') + 'Photo</button><button class="composer__act" data-act="lp-compose">' + I('article') + 'Write</button><a class="btn btn--primary btn--sm" href="#send">' + I('spark', 'ico-16') + 'New intent</a></div></div>';
  };
  A.act['lp-compose'] = function (el) {
    const me = A.P(A.me);
    draftImage = null;
    A.modal({
      title: 'Create a post',
      body: '<div class="row">' + av(Object.assign({ id: A.me }, me), 48) + '<div><div class="b">' + esc(me.name) + '</div><div class="small muted">Your connections and anyone who opens your profile</div></div></div>' +
        '<label class="sr" for="lp-text">Post text</label><textarea class="textarea" id="lp-text" rows="7" maxlength="3000" data-in="lp-count" placeholder="What do you want to talk about? Share news, an offer, something you’re looking for…"></textarea>' +
        '<div class="row between small muted"><span id="lp-count">0 / 3,000</span><label class="btn btn--tertiary btn--sm" for="lp-file">' + I('image', 'ico-16') + 'Add a photo</label></div>' +
        '<input type="file" id="lp-file" accept="image/jpeg,image/png,image/webp" data-ch="lp-file" hidden>' +
        '<div id="lp-preview"></div><p class="small err" id="lp-err" role="alert" hidden></p>',
      foot: '<button class="btn btn--tertiary" data-act="modal-close">Cancel</button><button class="btn btn--primary" data-act="lp-publish">Post</button>',
    });
    setTimeout(function () {
      if (el.dataset.photo) document.getElementById('lp-file').click();
      else { const t = document.getElementById('lp-text'); if (t) t.focus(); }
    }, 30);
  };
  A.inp['lp-count'] = function (el) { const c = document.getElementById('lp-count'); if (c) c.textContent = fmt(el.value.length) + ' / 3,000'; };
  A.chg['lp-file'] = function (el) {
    const file = el.files && el.files[0];
    const err = document.getElementById('lp-err');
    err.hidden = true;
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { err.textContent = 'Use a JPEG, PNG or WebP image.'; err.hidden = false; return; }
    const img = new Image(), src = URL.createObjectURL(file);
    img.onload = function () {
      // Re-encoding at most 1280 px wide also drops the photo’s metadata (location, camera).
      const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(src);
      canvas.toBlob(function (blob) {
        if (!blob || blob.size > 2 * 1024 * 1024) { err.textContent = 'That image is too large. Try a smaller one.'; err.hidden = false; return; }
        draftImage = blob;
        document.getElementById('lp-preview').innerHTML = '<div class="lp-prev"><img src="' + canvas.toDataURL('image/jpeg', 0.6) + '" alt="Selected photo"><button class="iconbtn" data-act="lp-unphoto" aria-label="Remove photo" title="Remove photo">' + I('x', 'ico-16') + '</button></div>';
      }, 'image/jpeg', 0.86);
    };
    img.onerror = function () { URL.revokeObjectURL(src); err.textContent = 'That file couldn’t be read as an image.'; err.hidden = false; };
    img.src = src;
  };
  A.act['lp-unphoto'] = function () { draftImage = null; document.getElementById('lp-preview').innerHTML = ''; document.getElementById('lp-file').value = ''; };
  A.act['lp-publish'] = async function (el) {
    const text = document.getElementById('lp-text').value.trim(), err = document.getElementById('lp-err');
    if (!text) { err.textContent = 'Write something first.'; err.hidden = false; return; }
    el.disabled = true;
    try {
      const r = await call('POST', 'api/posts', { text: text });
      if (draftImage) {
        const res = await fetch('api/posts/' + r.id + '/image', { method: 'POST', credentials: 'same-origin', headers: Object.assign({ 'Content-Type': 'application/octet-stream' }, A.Live.headers()), body: draftImage });
        if (!res.ok) A.toast('Posted, but the photo couldn’t be added.', 'warn');
      }
      draftImage = null;
      A.closeModal();
      const post = await call('GET', 'api/posts/' + r.id);
      ['feed', 'author:' + A.me, 'company:' + A.me].forEach(function (k) { if (lists[k]) { lists[k].items.unshift(post); paint(k); } });
      A.toast('Posted. Your connections see it in their feed.', 'info');
    } catch (e) { el.disabled = false; err.textContent = e.message; err.hidden = false; }
  };

  // ---------- one post (links from notifications and "Copy link") ----------
  A.view('post', {
    nav: 'feed',
    render: function (arg) {
      if (!A.live) return '<div class="page"><div class="card pad">Posts open in the live network.</div></div>';
      return '<div class="page"><div class="scaffold scaffold--mr"><div class="main"><a class="link small" href="#feed">' + I('left', 'ico-16') + 'Back to your feed</a>' +
        P.html('post:' + (+arg)) + '</div><aside class="rail rail--right"><div class="sticky">' + A.ui.appFooter() + '</div></aside></div></div>';
    },
    mount: function (arg) {
      const id = +arg, key = 'post:' + id;
      call('GET', 'api/posts/' + id).then(function (p) {
        lists[key] = { items: [p], more: false, loaded: true };
        openCm[id] = true;
        paint(key);
        loadComments(id);
      }, function () { lists[key] = { items: [], more: false, loaded: true }; emptyText[key] = '<div class="card pad muted">This post was deleted.</div>'; paint(key); });
    },
  });

  // ---------- connections ----------
  P.state = function (id) {
    const p = A.P(id);
    if (p.degree === '1st') return 'connected';
    if (((A.social && A.social.outgoing) || []).indexOf(id) >= 0) return 'pending';
    return 'none';
  };
  P.connectBtn = function (id, size) {
    const s = P.state(id), ic = size === 'sm' ? 'ico-16' : 'ico-20', cls = size === 'sm' ? ' btn--sm' : '';
    if (s === 'connected') return '<button class="btn btn--muted' + cls + '" data-act="lp-unconnect" data-id="' + esc(id) + '" title="Remove connection">' + I('check', ic) + 'Connected</button>';
    if (s === 'pending') return '<button class="btn btn--muted' + cls + '" disabled>' + I('clock', ic) + 'Pending</button>';
    return '<button class="btn btn--secondary' + cls + '" data-act="lp-connect" data-id="' + esc(id) + '">' + I('plus', ic) + 'Connect</button>';
  };
  A.act['lp-connect'] = function (el) {
    const id = el.dataset.id;
    el.disabled = true;
    call('POST', 'api/connections', { memberId: id }).then(function (r) {
      if (r.state === 'connected') { A.people[id].degree = '1st'; delete lists.feed; A.toast('You’re now connected with ' + esc(A.P(id).name) + '.', 'info'); }
      else { A.social.outgoing.push(id); A.toast('Invitation sent to ' + esc(A.P(id).name) + '.', 'info'); }
      A.refresh();
    }, function (e) { el.disabled = false; A.toast(esc(e.message), 'warn'); });
  };
  A.act['lp-unconnect'] = function (el) {
    const id = el.dataset.id, u = A.P(id);
    A.modal({
      title: 'Remove connection?',
      body: '<p>You and ' + esc(u.name) + ' stop seeing each other’s posts in your feeds. ' + esc(u.name.split(' ')[0]) + ' isn’t notified.</p>',
      foot: '<button class="btn btn--tertiary" data-act="modal-close">Cancel</button><button class="btn btn--danger" data-act="lp-unconnect-yes" data-id="' + esc(id) + '">Remove</button>',
    });
  };
  A.act['lp-unconnect-yes'] = function (el) {
    const id = el.dataset.id;
    call('DELETE', 'api/connections/' + encodeURIComponent(id)).then(function () {
      A.people[id].degree = ''; delete lists.feed; A.closeModal(); A.refresh();
    }, function (e) { A.toast(esc(e.message), 'warn'); });
  };

  // Network page: incoming invitations, loaded after the page renders.
  P.invitations = function () {
    const box = document.getElementById('net-invites');
    if (!box) return;
    call('GET', 'api/connections/requests').then(function (r) {
      A.social.requestsIn = r.incoming.length; A.updateBadges();
      if (!r.incoming.length) { box.hidden = true; return; }
      box.innerHTML = '<div class="pad" style="padding-bottom:12px"><h2 class="card__h">Invitations (' + r.incoming.length + ')</h2><div class="small muted">People who want to connect with you. Connections see each other’s posts.</div></div>' +
        r.incoming.map(function (x) {
          return '<div class="inv">' + av(x.from, 64) + '<div class="inv__b"><a class="b t16" href="#in.' + esc(x.from.id) + '" style="color:var(--fg)">' + esc(x.from.name) + '</a><div class="small">' + esc(x.from.headline) + '</div><div class="small muted">' + when(x.at) + '</div>' +
            (x.note ? '<div class="rawmsg small" style="margin-top:8px">' + esc(x.note) + '</div>' : '') + '</div>' +
            '<div class="row"><button class="btn btn--tertiary btn--sm" data-act="lp-respond" data-id="' + x.id + '" data-v="0">Ignore</button><button class="btn btn--secondary btn--sm" data-act="lp-respond" data-id="' + x.id + '" data-v="1" data-name="' + esc(x.from.name) + '">Accept</button></div></div>';
        }).join('');
      box.hidden = false;
    }, function () { box.hidden = true; });
  };
  A.act['lp-respond'] = function (el) {
    const accept = el.dataset.v === '1', name = el.dataset.name;
    el.disabled = true;
    call('POST', 'api/connections/requests/' + el.dataset.id, { accept: accept }).then(async function () {
      if (accept) { await A.Live.bootstrap(); delete lists.feed; }
      else A.social.requestsIn = Math.max(0, A.social.requestsIn - 1);
      A.refresh(); A.updateBadges();
      A.toast(accept ? 'You’re now connected with ' + esc(name) + '.' : 'Invitation ignored. They aren’t notified.', 'info');
    }, function (e) { el.disabled = false; A.toast(esc(e.message), 'warn'); });
  };

  // ---------- notifications (the Activity page) ----------
  let notes = null;
  function noteText(n) {
    const who = '<b>' + esc(n.actor.name) + '</b>', snip = n.post ? ': “' + esc(n.post) + '”' : '';
    return {
      connect: [who + ' wants to connect with you.', 'network'],
      accepted: [who + ' accepted your invitation. You now see each other’s posts.', 'in.' + n.actor.id],
      like: [who + ' liked your post' + snip, 'post.' + n.postId],
      comment: [who + ' commented on your post' + snip, 'post.' + n.postId],
      follow: [who + ' started following your page.', 'in.' + n.actor.id],
    }[n.kind] || [who, 'feed'];
  }
  function notesHtml(list) {
    if (list === null) return '<p class="pad muted" style="padding-top:0">Loading…</p>';
    if (!list.length) return '<p class="pad muted" style="padding-top:0">Nothing yet. When people invite you, or like and comment on your posts, you’ll see it here.</p>';
    return list.map(function (n) {
      const t = noteText(n);
      return '<a class="notif' + (n.unread ? ' is-unread' : '') + '" href="#' + esc(t[1]) + '" style="color:var(--fg)">' + av(n.actor, 48) + '<div class="grow">' + t[0] + '</div><span class="small muted">' + when(n.at) + '</span></a>';
    }).join('');
  }
  P.notificationsPage = function () {
    return '<div class="page"><div class="scaffold">' +
      '<aside class="rail hide-md"><div class="card pad stack-12"><div class="b">Your activity</div><p class="small muted">Invitations, likes and comments on your posts. Knocks from senders go to your Agent Inbox.</p><a class="link small" href="#inbox">Open Agent Inbox</a></div></aside>' +
      '<div class="main"><div class="card"><div class="pad row between"><h2 class="card__h">Notifications</h2></div><div id="notif-list">' + notesHtml(notes) + '</div>' +
      '</div></div><aside class="rail rail--right"><div class="sticky">' + A.ui.appFooter() + '</div></aside></div></div>';
  };
  P.notificationsMount = function () {
    call('GET', 'api/notifications').then(function (list) {
      notes = list;
      const box = document.getElementById('notif-list');
      if (box) box.innerHTML = notesHtml(list);
      // Shown once as unread, then marked read for next time.
      if (list.some(function (n) { return n.unread; })) call('POST', 'api/notifications/read').then(function () {
        notes = list.map(function (n) { return Object.assign({}, n, { unread: false }); });
        A.social.unread = 0; A.updateBadges();
      });
    }, function () { notes = []; });
  };
  P.notificationsReset = function () { notes = null; };

  // Keep the nav badges current while the tab is open.
  setInterval(function () {
    if (!A.live || !A.S.signedIn || !A.social || document.visibilityState !== 'visible') return;
    call('GET', 'api/social/summary').then(function (s) {
      A.social.requestsIn = s.requestsIn; A.social.unread = s.unread; A.updateBadges();
    }, function () { /* signed out or offline */ });
  }, 60000);
})(window.ABN);
