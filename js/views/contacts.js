/* Invite your LinkedIn connections: import the LinkedIn data export, invite by email or by personal link.
   Live: contacts are stored on the server, private to you. Demo: parsed in the browser, kept in memory only. */
(function (A) {
  const esc = A.esc, I = A.icon;
  let data = null;          // { contacts, summary, emailDelivers, dailyLimit, remainingToday }
  let filter = 'all', query = '', shown = 100, loading = false;
  const picked = {};
  const NOTE = 'I’m moving my inbound business requests to an agent-screened inbox, and I’d like you to be able to reach me there.';

  // ---------- CSV (same rules as the server) ----------
  function csvRows(text) {
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; continue; }
      if (ch === '"' && f === '') q = true;
      else if (ch === ',') { row.push(f); f = ''; }
      else if (ch === '\n') { row.push(f); f = ''; rows.push(row); row = []; }
      else if (ch !== '\r') f += ch;
    }
    if (f || row.length) { row.push(f); rows.push(row); }
    return rows;
  }
  function parseLinkedIn(text) {
    const rows = csvRows(text.replace(/^﻿/, ''));
    const h = rows.findIndex(function (r) { const l = r.map(function (c) { return c.trim().toLowerCase(); }); return l.indexOf('first name') >= 0 && l.indexOf('last name') >= 0; });
    if (h < 0) throw new Error('This doesn’t look like LinkedIn’s Connections.csv (no “First Name, Last Name” header).');
    const head = rows[h].map(function (c) { return c.trim().toLowerCase(); });
    const col = function (n) { return head.indexOf(n); };
    const get = function (r, i) { return i >= 0 && r[i] && r[i].trim() ? r[i].trim() : null; };
    const out = [];
    rows.slice(h + 1).forEach(function (r, n) {
      const first = get(r, col('first name')) || '', last = get(r, col('last name')) || '';
      if (!first && !last) return;
      const email = get(r, col('email address'));
      out.push({ id: n + 1, first: first, last: last, email: email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email.toLowerCase() : null, company: get(r, col('company')), position: get(r, col('position')), url: get(r, col('url')), connectedOn: get(r, col('connected on')), status: 'new' });
    });
    if (!out.length) throw new Error('No connections found in that file.');
    return out;
  }
  function demoSummary(list) {
    return {
      total: list.length, withEmail: list.filter(function (c) { return c.email; }).length,
      invited: list.filter(function (c) { return c.status === 'invited'; }).length, joined: 0, onNetwork: 0, optedOut: 0,
      invitable: list.filter(function (c) { return c.email && c.status === 'new'; }).length,
    };
  }

  // ---------- data ----------
  async function load() {
    if (!A.live) { if (!data) data = { contacts: [], summary: demoSummary([]), emailDelivers: false, dailyLimit: 200, remainingToday: 200, demo: true }; return; }
    loading = true;
    try { data = await A.Live.call('GET', 'api/contacts'); }
    catch (e) { A.toast(esc(e.message), 'warn'); }
    loading = false;
  }
  function paint() { const el = document.getElementById('ct-body'); if (el) el.innerHTML = body(); }

  async function upload(file) {
    if (!file) return;
    const isZip = /\.zip$/i.test(file.name);
    if (!isZip && !/\.csv$/i.test(file.name)) { A.toast('Choose the LinkedIn export (.zip) or Connections.csv.', 'warn'); return; }
    if (file.size > 25 * 1024 * 1024) { A.toast('That file is larger than 25 MB.', 'warn'); return; }
    const zone = document.getElementById('ct-drop');
    if (zone) zone.classList.add('is-busy');
    try {
      if (A.live) {
        const res = await fetch('api/contacts/import', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
        const r = await res.json().catch(function () { return {}; });
        if (!res.ok) throw new Error(r.error || 'The import failed (' + res.status + ').');
        await load();
        A.toast('Imported ' + r.rows.toLocaleString() + ' connections' + (r.added && r.updated ? ' (' + r.added + ' new)' : '') + '. ' + r.withEmail.toLocaleString() + ' have an email address' + (r.onNetwork ? ', ' + r.onNetwork + ' already on the network' : '') + '.', 'info');
      } else {
        if (isZip) throw new Error('In the demo, unzip the export and choose Connections.csv. The live server takes the .zip directly.');
        const list = parseLinkedIn(await file.text());
        data = { contacts: list, summary: demoSummary(list), emailDelivers: false, dailyLimit: 200, remainingToday: 200, demo: true };
        A.toast('Read ' + list.length.toLocaleString() + ' connections in your browser. Nothing was uploaded.', 'info');
      }
      filter = 'all'; shown = 100; Object.keys(picked).forEach(function (k) { delete picked[k]; });
      paint();
    } catch (e) { A.toast(esc(e.message), 'warn'); }
    finally { if (zone) zone.classList.remove('is-busy'); }
  }

  // ---------- rendering ----------
  const STATUS = {
    new: ['Not invited', ''], invited: ['Invited', 'accent'], joined: ['Joined', 'high'], member: ['Already here', 'high'], opted_out: ['No invitations', 'muted'],
  };
  const FILTERS = [['all', 'All'], ['invitable', 'Ready to invite'], ['noemail', 'No email · share a link'], ['invited', 'Invited'], ['here', 'Joined or here']];
  function matches(c) {
    if (filter === 'invitable' && !(c.email && (c.status === 'new' || c.canRemind))) return false;
    if (filter === 'noemail' && (c.email || c.status === 'joined' || c.status === 'member')) return false;
    if (filter === 'invited' && c.status !== 'invited') return false;
    if (filter === 'here' && c.status !== 'joined' && c.status !== 'member') return false;
    if (query) {
      const hay = (c.first + ' ' + c.last + ' ' + (c.company || '') + ' ' + (c.position || '') + ' ' + (c.email || '')).toLowerCase();
      if (hay.indexOf(query) < 0) return false;
    }
    return true;
  }
  function canPick(c) { return c.email && (c.status === 'new' || c.canRemind); }

  function howTo() {
    return '<section class="card pad stack-16">' +
      '<div><h2 class="card__h">1. Download your connections from LinkedIn</h2><ol class="ct-steps small">' +
        '<li>On LinkedIn open <b>Me → Settings &amp; Privacy → Data privacy → Get a copy of your data</b>.</li>' +
        '<li>Choose <b>Want something in particular?</b>, tick <b>Connections</b>, and select <b>Request archive</b>.</li>' +
        '<li>LinkedIn emails you a download link, usually within 10 minutes.</li></ol></div>' +
      '<div class="stack"><h2 class="card__h">2. Upload it here</h2>' +
        '<label class="ct-drop" id="ct-drop" for="ct-file">' + I('archive', 'ico-20') + '<span><b>Choose the .zip or Connections.csv</b><span class="small muted">' + (A.live ? 'or drop it here' : 'or drop Connections.csv here · read in your browser, nothing is uploaded') + '</span></span></label>' +
        '<input type="file" id="ct-file" accept=".zip,.csv,text/csv,application/zip" class="sr"></div>' +
      '<div class="note">' + I('lock') + '<div class="small">LinkedIn includes an email address only for connections who allow it, often a minority. You get a personal invite link for everyone else, ready to send as a LinkedIn message. Your imported contacts are private to you, used only for the invitations you choose, and you can delete them at any time.</div></div>' +
      '</section>';
  }

  function stats(s) {
    const cell = function (n, l) { return '<div class="ct-stat"><b>' + n.toLocaleString() + '</b><span>' + l + '</span></div>'; };
    return '<div class="ct-stats">' + cell(s.total, 'imported') + cell(s.withEmail, 'with email') + cell(s.invited, 'invited') + cell(s.joined, 'joined') + cell(s.onNetwork, 'already here') + '</div>';
  }

  function row(c) {
    const st = STATUS[c.status] || STATUS.new;
    const sub = [c.position, c.company].filter(Boolean).join(' · ');
    let acts = '';
    if (c.status === 'joined' || c.status === 'member') acts = c.memberId ? '<a class="btn btn--tertiary btn--sm" href="#in.' + esc(c.memberId) + '">View profile</a>' : '';
    else if (c.status === 'opted_out') acts = '';
    else {
      acts = (!c.email || c.status === 'invited' ? '<button class="btn btn--tertiary btn--sm" data-act="ct-link" data-id="' + c.id + '">' + I('copy', 'ico-16') + 'Copy invite message</button>' : '') +
        (c.url ? '<a class="btn btn--tertiary btn--sm" href="' + esc(c.url) + '" target="_blank" rel="noopener noreferrer">' + I('ext', 'ico-16') + 'LinkedIn</a>' : '');
    }
    return '<div class="ct-row">' +
      '<span class="ct-pick">' + (canPick(c) ? '<input type="checkbox" data-ch="ct-pick" data-id="' + c.id + '" aria-label="Select ' + esc(c.first + ' ' + c.last) + '"' + (picked[c.id] ? ' checked' : '') + '>' : '') + '</span>' +
      A.avatar({ name: (c.first + ' ' + c.last).trim() || '?' }, 40) +
      '<div class="grow stack-4" style="min-width:0"><div class="row wrap" style="gap:8px"><b class="clamp1">' + esc(c.first + ' ' + c.last) + '</b><span class="ct-st ct-st--' + st[1] + '">' + st[0] + (c.status === 'invited' && c.invitedAt ? ' · ' + new Date(c.invitedAt).toLocaleDateString() : '') + '</span></div>' +
        (sub ? '<div class="small muted clamp1">' + esc(sub) + '</div>' : '') +
        '<div class="small ' + (c.email ? '' : 'muted') + ' clamp1">' + (c.email ? esc(c.email) : 'No email in the export') + '</div></div>' +
      '<div class="ct-acts">' + acts + '</div></div>';
  }

  function body() {
    if (loading && !data) return '<section class="card pad"><p class="muted">Loading your contacts…</p></section>';
    if (!data || !data.contacts.length) return howTo();
    const s = data.summary, list = data.contacts.filter(matches), nPicked = Object.keys(picked).length;
    const warn = data.demo ? '<div class="note">' + I('info') + '<div class="small">Demo: your file stays in this browser tab and invitations are only simulated. On the live server they are sent by email.</div></div>'
      : !data.emailDelivers ? '<div class="note note--warn">' + I('warn') + '<div class="small">Email isn’t set up on this server, so invitations can’t go out by email (in development they are written to the server log). Personal invite links work.</div></div>' : '';
    return '<section class="card pad stack-16">' + stats(s) + warn +
        '<div class="row wrap" style="gap:8px">' +
          '<button class="btn btn--primary" data-act="ct-invite" data-all="1"' + (s.invitable && data.remainingToday ? '' : ' disabled') + '>' + I('mail', 'ico-20') + 'Invite all ' + s.invitable.toLocaleString() + ' with email</button>' +
          (nPicked ? '<button class="btn btn--secondary" data-act="ct-invite">Invite selected (' + nPicked + ')</button>' : '') +
          '<label class="btn btn--tertiary" for="ct-file">' + I('repost', 'ico-20') + 'Import a newer export</label><input type="file" id="ct-file" accept=".zip,.csv,text/csv,application/zip" class="sr">' +
          '<button class="btn btn--tertiary" data-act="ct-delete" style="margin-left:auto">' + I('x', 'ico-20') + 'Delete imported contacts</button>' +
        '</div>' +
        (data.remainingToday < s.invitable ? '<p class="small muted">Up to ' + data.dailyLimit + ' invitations a day, so they don’t land in spam. ' + data.remainingToday + ' left today; send the rest tomorrow.</p>' : '') +
      '</section>' +
      '<section class="card">' +
        '<div class="pad stack-12" style="padding-bottom:12px"><div class="pills" role="tablist" aria-label="Filter contacts">' + FILTERS.map(function (f) { return '<button class="pill' + (filter === f[0] ? ' is-on' : '') + '" role="tab" aria-selected="' + (filter === f[0]) + '" data-act="ct-filter" data-k="' + f[0] + '">' + f[1] + '</button>'; }).join('') + '</div>' +
        '<label class="sr" for="ct-q">Search contacts</label><input class="input" id="ct-q" type="search" placeholder="Search by name, company or email" value="' + esc(query) + '" data-in="ct-q"></div>' +
        '<div id="ct-list">' + list.slice(0, shown).map(row).join('') + (list.length ? '' : '<p class="pad muted">No contacts match.</p>') + '</div>' +
        (list.length > shown ? '<div class="pad"><button class="btn btn--tertiary btn--block" data-act="ct-more">Show more (' + (list.length - shown).toLocaleString() + ')</button></div>' : '') +
      '</section>';
  }

  A.view('contacts', {
    nav: 'network',
    render: function () {
      return '<div class="page"><div class="stack-16" style="max-width:860px;margin-inline:auto">' +
        '<div class="stack-4"><h1 class="ct-h1">Invite your LinkedIn connections</h1><p class="muted">Bring the people you already work with, so business requests between you go agent to agent.</p></div>' +
        '<div class="stack-16" id="ct-body">' + body() + '</div></div></div>';
    },
    mount: function () {
      const root = document.getElementById('ct-body');
      root.addEventListener('change', function (e) { if (e.target.id === 'ct-file') upload(e.target.files[0]); });
      root.addEventListener('dragover', function (e) { if (e.target.closest('#ct-drop')) { e.preventDefault(); e.target.closest('#ct-drop').classList.add('is-over'); } });
      root.addEventListener('dragleave', function (e) { const z = e.target.closest('#ct-drop'); if (z) z.classList.remove('is-over'); });
      root.addEventListener('drop', function (e) { const z = e.target.closest('#ct-drop'); if (!z) return; e.preventDefault(); z.classList.remove('is-over'); upload(e.dataTransfer.files[0]); });
      if (A.live || !data) load().then(paint);
    },
  });

  A.act['ct-filter'] = function (el) { filter = el.dataset.k; shown = 100; paint(); };
  A.act['ct-more'] = function () { shown += 200; paint(); };
  let qT;
  A.inp['ct-q'] = function (el) {
    clearTimeout(qT);
    qT = setTimeout(function () {
      query = el.value.trim().toLowerCase();
      const list = document.getElementById('ct-list');
      if (list) list.innerHTML = data.contacts.filter(matches).slice(0, shown).map(row).join('') || '<p class="pad muted">No contacts match.</p>';
    }, 150);
  };
  A.chg['ct-pick'] = function (el) {
    if (el.checked) picked[el.dataset.id] = true; else delete picked[el.dataset.id];
    paint();
  };

  function emailPreview(first, note) {
    const me = A.P(A.me);
    if (note == null) note = (document.getElementById('ct-note') || {}).value;
    note = (note || '').replace(/\{first\}/gi, first);
    return 'Hi ' + first + ',\n\n' + (note && note.trim() ? note.trim() + '\n— ' + me.name.split(' ')[0] + '\n\n' : '') +
      me.name + ' (' + me.headline + ') uses ' + A.brand.name + ', a professional network where an AI agent you control screens business requests. The relevant ones reach you with a short brief; the rest get a polite answer.\n\n[ Set up your agent ]\n\nYou’re connected with ' + me.name.split(' ')[0] + ' on LinkedIn, which is why you got this invitation. You’ll get at most one reminder.\nDon’t want invitations? One click stops them.';
  }

  A.act['ct-invite'] = function (el) {
    const all = !!el.dataset.all;
    const ids = all ? null : Object.keys(picked).map(Number);
    const n = all ? data.summary.invitable : ids.length;
    const count = Math.min(n, data.remainingToday);
    const sample = (data.contacts.find(function (c) { return canPick(c) && (all || picked[c.id]); }) || { first: 'Ana' }).first;
    A.modal({
      title: 'Invite ' + count.toLocaleString() + ' ' + (count === 1 ? 'connection' : 'connections') + ' by email',
      wide: true,
      body: '<div class="stack-16">' +
        '<div class="field"><label class="label" for="ct-note">Personal note <span class="muted">(optional, goes to everyone; write {first} for each person’s first name)</span></label><textarea class="textarea" id="ct-note" rows="3" maxlength="600" data-in="ct-note">' + esc(NOTE) + '</textarea></div>' +
        '<div class="stack"><span class="label">Preview</span><div class="rawmsg small" id="ct-preview" style="white-space:pre-line">' + esc(emailPreview(sample, NOTE)) + '</div></div>' +
        '<ul class="small muted ct-rules"><li>Each person gets one email from you, sent as “' + esc(A.P(A.me).name) + ' via ' + esc(A.brand.name) + '”. Replies go to your email address.</li>' +
          '<li>People who are already here, have no email in the export, or opted out are skipped.</li>' +
          (n > count ? '<li>' + (n - count).toLocaleString() + ' more stay for tomorrow (limit ' + data.dailyLimit + ' a day).</li>' : '') + '</ul></div>',
      foot: '<button class="btn btn--tertiary" data-act="modal-close">Cancel</button><button class="btn btn--primary" data-act="ct-send"' + (all ? ' data-all="1"' : '') + '>' + I('send', 'ico-20') + 'Send ' + count.toLocaleString() + ' invitations</button>',
    });
  };
  A.inp['ct-note'] = function () {
    const p = document.getElementById('ct-preview');
    if (p) p.textContent = emailPreview((data.contacts.find(canPick) || { first: 'Ana' }).first);
  };
  A.act['ct-send'] = async function (el) {
    const all = !!el.dataset.all, ids = all ? null : Object.keys(picked).map(Number);
    const note = (document.getElementById('ct-note') || {}).value || '';
    el.disabled = true;
    if (!A.live) {
      let k = 0;
      data.contacts.forEach(function (c) { if (canPick(c) && (all || picked[c.id]) && k < data.remainingToday) { c.status = 'invited'; c.invitedAt = new Date().toISOString(); k++; } });
      data.remainingToday -= k; data.summary = demoSummary(data.contacts);
      Object.keys(picked).forEach(function (x) { delete picked[x]; });
      A.closeModal(); paint();
      A.toast('Demo: ' + k + ' invitations marked as sent. Nothing left your browser.', 'info');
      return;
    }
    try {
      const r = await A.Live.call('POST', 'api/contacts/invite', { ids: ids, all: all, note: note });
      Object.keys(picked).forEach(function (x) { delete picked[x]; });
      A.closeModal();
      await load(); paint();
      const skipped = [r.alreadyInvited && r.alreadyInvited + ' already invited', r.onNetwork && r.onNetwork + ' already here', r.optedOut && r.optedOut + ' opted out', r.noEmail && r.noEmail + ' without email', r.overDailyLimit && r.overDailyLimit + ' left for tomorrow'].filter(Boolean);
      A.toast('<b>' + r.queued + ' invitations</b> on their way.' + (skipped.length ? ' Skipped: ' + skipped.join(', ') + '.' : ''), 'info');
    } catch (e) { el.disabled = false; A.toast(esc(e.message), 'warn'); }
  };

  A.act['ct-link'] = async function (el) {
    const c = data.contacts.find(function (x) { return String(x.id) === el.dataset.id; });
    if (!A.live) { A.copy('Hi ' + c.first + ', I’ve moved my inbound business requests to ' + A.brand.name + '. Setting up your own agent takes two minutes: ' + location.origin + location.pathname + '#welcome', 'Demo invite message copied. On the live server it carries a personal link.'); return; }
    try {
      const r = await A.Live.call('POST', 'api/contacts/' + c.id + '/link');
      if (!r.url) { A.toast(esc(c.first) + ' is already on the network.', 'info'); return; }
      A.copy(r.message, 'Invite message with ' + esc(c.first) + '’s personal link copied. Paste it into a LinkedIn message.');
    } catch (e) { A.toast(esc(e.message), 'warn'); }
  };

  A.act['ct-delete'] = function () {
    A.modal({
      title: 'Delete imported contacts?',
      body: '<p>This removes all ' + data.summary.total.toLocaleString() + ' imported contacts and cancels invitations that haven’t gone out yet. Links you already shared stop working. People who joined stay connected with you.</p>',
      foot: '<button class="btn btn--tertiary" data-act="modal-close">Cancel</button><button class="btn btn--danger" data-act="ct-delete-go">Delete contacts</button>',
    });
  };
  A.act['ct-delete-go'] = async function () {
    A.closeModal();
    if (A.live) { try { await A.Live.call('DELETE', 'api/contacts'); } catch (e) { A.toast(esc(e.message), 'warn'); return; } }
    data = null;
    await load(); paint();
    A.toast('Imported contacts deleted.', 'info');
  };

  // ---------- the invited person ----------

  A.view('invite', {
    lo: true,
    render: function () { return '<div class="auth"><div class="card auth__card" id="inv-card"><p class="muted">Opening your invitation…</p></div></div>'; },
    mount: async function (code) {
      const card = document.getElementById('inv-card');
      if (!A.live) { card.innerHTML = '<h1>Invitation</h1><p class="muted">Invitation links open on the live network. This is the demo site.</p><a class="btn btn--primary btn--block" href="#welcome">See how it works</a>'; return; }
      try {
        const inv = await A.Live.call('GET', 'api/invites/' + encodeURIComponent(code));
        if (A.S.signedIn) {
          card.innerHTML = '<h1>You’re already signed in</h1><p class="muted">This invitation from ' + esc(inv.inviter.name) + ' is for a new account. Sign out first to accept it, or continue as ' + esc(A.P(A.me).name) + '.</p><a class="btn btn--primary btn--block" href="#feed">Continue</a>';
          return;
        }
        A.invite = Object.assign({ code: code }, inv);
        A.go('join');
      } catch (e) {
        card.innerHTML = '<h1>Invitation</h1><p class="muted">' + esc(e.message) + '</p><a class="btn btn--primary btn--block" href="#join">Create your agent</a><a class="btn btn--tertiary btn--block" href="#signin">Sign in</a>';
      }
    },
  });

  A.view('optout', {
    lo: true,
    render: function (code) {
      return '<div class="auth"><div class="card auth__card" id="oo-card"><h1>Stop invitations</h1><p class="muted">No more invitations to join ' + esc(A.brand.name) + ' will be sent to this email address, by anyone.</p>' +
        '<button class="btn btn--primary btn--block" data-act="optout" data-code="' + esc(code) + '">Stop invitations</button></div></div>';
    },
  });
  A.act.optout = async function (el) {
    const card = document.getElementById('oo-card');
    if (!A.live) { card.innerHTML = '<h1>Stop invitations</h1><p class="muted">This works on the live network.</p>'; return; }
    try {
      await A.Live.call('POST', 'api/invites/' + encodeURIComponent(el.dataset.code) + '/optout');
      card.innerHTML = '<h1>Done</h1><p class="muted">You won’t receive invitations to this address again. If you change your mind, you can still join any time.</p><a class="btn btn--secondary btn--block" href="#welcome">What is ' + esc(A.brand.name) + '?</a>';
    } catch (e) { card.innerHTML = '<h1>Stop invitations</h1><p class="muted">That link isn’t valid any more, so no further invitations will use it.</p>'; }
  };
})(window.ABN);
