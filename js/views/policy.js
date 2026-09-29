/* Attention policy editor with a live routing preview */
(function (A) {
  const esc = A.esc, I = A.icon, E = A.Engine;
  const EV_OPTS = { fundraising: ['traction', 'round', 'deck', 'team'], partnership: ['audience', 'mutual_value', 'timeline'], intro: ['context'], press: ['outlet', 'deadline', 'topic'], advisory: ['topic', 'time', 'fee', 'confidentiality'], sales: ['icp', 'integration', 'roi', 'reference'], recruiting: ['comp', 'remote', 'teamstage'], support: ['context'], other: ['context'] };
  const SECS = [['templates', 'layers', 'Template'], ['topics', 'target', 'Topics'], ['stages', 'trend', 'Stage and check size'], ['categories', 'filter', 'Categories'], ['thresholds', 'sliders', 'Thresholds'], ['evidence', 'check', 'Required evidence'], ['vip', 'star', 'VIPs and blocklist'], ['availability', 'clock', 'Availability'], ['autonomy', 'spark', 'Agent autonomy'], ['privacy', 'lock', 'Privacy and data']];
  const VIP_SUGGEST = ['daniel-kovac', 'hannah-schulz', 'sofia-marin', 'tomas-herrera', 'omar-haddad'];
  const P = function () { return A.S.policy; };

  function sw(id, key, on, disabled) {
    return '<label class="switch" for="' + id + '"><input type="checkbox" id="' + id + '" data-ch="pol-sw" data-k="' + key + '"' + (on ? ' checked' : '') + (disabled ? ' disabled' : '') + '><span class="trk"></span><span class="sw-t">' + (on ? 'On' : 'Off') + '</span></label>';
  }
  function row(title, sub, ctrl) { return '<div class="setrow"><div class="setrow__t"><b>' + title + '</b><span>' + sub + '</span></div>' + ctrl + '</div>'; }
  function get(path) { return path.split('.').reduce(function (o, k) { return o && o[k]; }, P()); }
  function set(path, v) { const ks = path.split('.'), last = ks.pop(); ks.reduce(function (o, k) { return o[k]; }, P())[last] = v; }

  const CARDS = {
    templates: function () {
      const cur = P().template;
      return '<section class="card sec" id="pc-templates"><div class="sec__h"><h2>Policy template</h2><span class="small muted">Current: ' + esc(A.templates[cur].name) + '</span></div><p class="small muted" style="margin-bottom:12px">A template sets categories, required evidence and thresholds. Your topics, VIPs and blocklist stay as they are.</p><div class="tpl-grid">' +
        Object.keys(A.templates).map(function (k) { const t = A.templates[k]; return '<button class="tpl' + (k === cur ? ' is-on' : '') + '" data-act="pol-tpl" data-k="' + k + '" aria-pressed="' + (k === cur) + '"><span class="tpl__ic">' + I(t.icon) + '</span><span><b>' + esc(t.name) + '</b><span>' + esc(t.desc) + '</span></span></button>'; }).join('') + '</div></section>';
    },
    topics: function () {
      const p = P();
      return '<section class="card sec" id="pc-topics"><div class="sec__h"><h2>What you’re open to</h2></div><p class="small muted" style="margin-bottom:12px">Topics decide policy fit. Intents that match none of them lose points.</p>' +
        '<div class="pills">' + (p.openTo.length ? p.openTo.map(function (t) { return '<span class="tag tag--accent tag--x">' + esc(t) + '<button data-act="topic-rm" data-v="' + esc(t) + '" aria-label="Remove ' + esc(t) + '">' + I('x', 'ico-16') + '</button></span>'; }).join('') : '<span class="small muted">No topics. Every intent counts as a topic match.</span>') + '</div>' +
        '<div class="row wrap" style="margin-top:12px;gap:6px"><span class="small muted">Add:</span>' + A.TOPICS.filter(function (t) { return p.openTo.indexOf(t) < 0; }).map(function (t) { return '<button class="pill" data-act="topic-add" data-v="' + esc(t) + '">' + I('plus', 'ico-16') + esc(t) + '</button>'; }).join('') + '</div>' +
        '<div style="margin-top:16px;border-top:1px solid var(--line);padding-top:4px">' + row('Cap pitches outside my topics at LOW', 'Fundraising intents with no topic overlap never reach MEDIUM or HIGH.', sw('sw-thesis', 'thesisHardFilter', p.thesisHardFilter)) + '</div></section>';
    },
    stages: function () {
      const p = P();
      return '<section class="card sec" id="pc-stages"><div class="sec__h"><h2>Stage, check size and geography</h2></div><div class="stack-16">' +
        '<div class="field"><span class="label">Stages you invest in</span><div class="pills">' + A.STAGES.map(function (s) { const on = p.stages.indexOf(s) >= 0; return '<button class="pill' + (on ? ' is-on' : '') + '" aria-pressed="' + on + '" data-act="stage-t" data-v="' + s + '">' + (on ? I('check', 'ico-16') : '') + s + '</button>'; }).join('') + '</div></div>' +
        '<div class="grid2"><div class="field"><label class="label" for="chk-min">Smallest first check ($K)</label><input class="input" id="chk-min" type="number" min="0" step="50" value="' + p.check.min / 1000 + '" data-ch="chk"></div><div class="field"><label class="label" for="chk-max">Largest first check ($K)</label><input class="input" id="chk-max" type="number" min="0" step="50" value="' + p.check.max / 1000 + '" data-ch="chk"></div></div>' +
        '<div class="field"><span class="label">Geographies</span><div class="pills">' + A.GEOS.map(function (g) { const on = p.geo.indexOf(g) >= 0; return '<button class="pill' + (on ? ' is-on' : '') + '" aria-pressed="' + on + '" data-act="geo-t" data-v="' + g + '">' + (on ? I('check', 'ico-16') : '') + g + '</button>'; }).join('') + '</div></div>' +
        '</div></section>';
    },
    categories: function () {
      const p = P();
      return '<section class="card sec" id="pc-categories"><div class="sec__h"><h2>Categories</h2></div><p class="small muted" style="margin-bottom:8px">Open: scored normally. Ask first: needs stronger evidence. Closed: declined automatically with a reason; VIPs still get through.</p>' +
        Object.keys(A.CATS).map(function (k) {
          const c = A.CATS[k], cur = p.categories[k] || 'ask';
          return row(esc(c.label), esc(c.desc), '<div class="seg" role="radiogroup" aria-label="' + esc(c.label) + '">' + [['open', 'Open'], ['ask', 'Ask first'], ['closed', 'Closed']].map(function (v) { return '<button class="seg--' + v[0] + (cur === v[0] ? ' is-on' : '') + '" role="radio" aria-checked="' + (cur === v[0]) + '" data-act="cat-set" data-k="' + k + '" data-v="' + v[0] + '">' + v[1] + '</button>'; }).join('') + '</div>');
        }).join('') + '</section>';
    },
    thresholds: function () {
      const p = P(), w = p.weights;
      return '<section class="card sec" id="pc-thresholds"><div class="sec__h"><h2>Escalation thresholds</h2></div>' +
        '<p class="small muted" style="margin-bottom:12px">Priority = ' + (w.pf / 100).toFixed(2) + ' policy fit + ' + (w.c / 100).toFixed(2) + ' completeness + ' + (w.r / 100).toFixed(2) + ' reputation + ' + (w.rel / 100).toFixed(2) + ' relationship + ' + (w.v / 100).toFixed(2) + ' value + ' + (w.u / 100).toFixed(2) + ' urgency − penalties. HIGH also needs a policy pass.</p>' +
        '<div class="stack-16"><div class="field"><label class="label" for="th-high">HIGH at <b id="th-high-v" class="lc-high">' + p.thresholds.high + '</b> or above</label><input type="range" id="th-high" min="50" max="95" value="' + p.thresholds.high + '" data-in="th"></div>' +
        '<div class="field"><label class="label" for="th-med">MEDIUM at <b id="th-med-v" class="lc-medium">' + p.thresholds.medium + '</b> or above</label><input type="range" id="th-med" min="10" max="80" value="' + p.thresholds.medium + '" data-in="th"></div></div>' +
        '<div style="margin-top:8px">' + row('Require verified identity for HIGH', 'Unverified senders can reach MEDIUM at most.', sw('sw-ver', 'requireVerified', p.requireVerified)) + '</div></section>';
    },
    evidence: function () {
      const p = P();
      return '<section class="card sec" id="pc-evidence"><div class="sec__h"><h2>Required evidence</h2></div><p class="small muted" style="margin-bottom:8px">Your agent asks for anything missing before an intent can reach you.</p>' +
        Object.keys(EV_OPTS).map(function (k) {
          const have = p.evidence[k] || [];
          return '<div class="setrow"><div class="setrow__t"><b>' + esc(A.CATS[k].label) + '</b><span>' + (have.length ? have.length + ' required' : 'Nothing required') + '</span></div><div class="row wrap" style="gap:12px;justify-content:flex-end">' +
            EV_OPTS[k].map(function (t) { const id = 'ev-' + k + '-' + t; return '<label class="check small" for="' + id + '"><input type="checkbox" id="' + id + '" data-ch="ev-t" data-k="' + k + '" data-v="' + t + '"' + (have.indexOf(t) >= 0 ? ' checked' : '') + '>' + esc(A.EVID[t].label) + '</label>'; }).join('') + '</div></div>';
        }).join('') + '</section>';
    },
    vip: function () {
      const p = P();
      const sug = VIP_SUGGEST.filter(function (id) { return p.vip.indexOf(id) < 0; });
      return '<section class="card sec" id="pc-vip"><div class="sec__h"><h2>VIPs and blocked topics</h2></div><div class="stack-16">' +
        '<div class="field"><span class="label">VIP list · always reach you and skip every filter</span><div class="stack">' + (p.vip.length ? p.vip.map(function (id) { const u = A.P(id); return '<div class="row">' + A.avatar(u, 40) + '<div class="grow"><a class="b" href="#in.' + id + '" style="color:var(--fg)">' + esc(u.name) + '</a><div class="small muted clamp1">' + esc(u.headline) + '</div></div><button class="btn btn--tertiary btn--sm" data-act="vip-rm" data-id="' + id + '">Remove</button></div>'; }).join('') : '<span class="small muted">No VIPs yet.</span>') + '</div>' +
        (sug.length ? '<div class="row wrap" style="gap:6px;margin-top:8px"><span class="small muted">Suggested:</span>' + sug.map(function (id) { return '<button class="pill" data-act="vip-add2" data-id="' + id + '">' + I('plus', 'ico-16') + esc(A.P(id).name) + '</button>'; }).join('') + '</div>' : '') + '</div>' +
        '<div class="field"><span class="label">Blocked topics · declined automatically</span><div class="pills">' + p.blocked.map(function (b) { return '<span class="tag tag--x">' + esc(b) + '<button data-act="block-rm" data-v="' + esc(b) + '" aria-label="Remove ' + esc(b) + '">' + I('x', 'ico-16') + '</button></span>'; }).join('') + '</div>' +
        '<form class="row" data-sub="block-add" style="margin-top:8px"><label class="sr" for="block-new">New blocked topic</label><input class="input" id="block-new" placeholder="Add a word or phrase" style="max-width:280px" autocomplete="off"><button class="btn btn--secondary btn--sm" type="submit">Add</button></form></div>' +
        '</div></section>';
    },
    availability: function () {
      const p = P(), h = p.hours;
      return '<section class="card sec" id="pc-availability"><div class="sec__h"><h2>Availability</h2></div>' +
        '<div class="grid3"><div class="field"><label class="label" for="h-days">Days</label><select class="select" id="h-days" data-ch="hours">' + ['Mon–Fri', 'Mon–Thu', 'Every day'].map(function (d) { return '<option' + (d === h.days ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label class="label" for="h-start">From</label><input class="input" type="time" id="h-start" value="' + h.start + '" data-ch="hours"></div><div class="field"><label class="label" for="h-end">To (' + h.tz + ')</label><input class="input" type="time" id="h-end" value="' + h.end + '" data-ch="hours"></div></div>' +
        '<div style="margin-top:8px">' + row('Focus mode', 'Only VIPs interrupt you. Everything else waits for the digest.', sw('sw-focus', 'focus', p.focus)) + '</div></section>';
    },
    autonomy: function () {
      const a = P().autonomy;
      return '<section class="card sec" id="pc-autonomy"><div class="sec__h"><h2>What your agent may do on its own</h2></div>' +
        row('Decline out-of-policy intents', 'Always with a reason, and a better route when one exists.', sw('sw-ad', 'autonomy.autoDecline', a.autoDecline)) +
        row('Ask qualification questions', 'Your agent asks the sender’s agent for missing evidence.', sw('sw-aq', 'autonomy.autoQuestion', a.autoQuestion)) +
        row('Batch MEDIUM into a daily digest', 'Delivered at <input class="input" type="time" id="dg-time" value="' + a.digestTime + '" data-ch="digest-time" style="width:auto;min-height:28px;padding:2px 8px;display:inline-block"> in your time zone.', sw('sw-dg', 'autonomy.digest', a.digest)) +
        row('Escalate HIGH to me right away', 'Push notification with the 90-second brief.', sw('sw-es', 'autonomy.escalate', a.escalate)) +
        row('Ask me before scheduling anything', 'Your agent proposes slots only after you approve.', sw('sw-ap', 'autonomy.approveScheduling', a.approveScheduling)) +
        row(I('lock', 'ico-16') + ' Never make commitments for me', 'Term sheets, prices, hires and legal answers always need you. This one can’t be turned off.', sw('sw-nc', 'autonomy.neverCommit', true, true)) +
        '</section>';
    },
    privacy: function () {
      const pr = P().privacy;
      const dis = [['thesis', 'My topics and thesis'], ['check', 'My check size range'], ['response', 'My typical response times'], ['calendar', 'My calendar availability'], ['portfolio', 'My portfolio list']];
      return '<section class="card sec" id="pc-privacy"><div class="sec__h"><h2>Privacy and data</h2></div>' +
        row('Keep unqualified inbound for', 'Accepted conversations follow your normal retention.', '<select class="select" style="width:auto" id="ret" data-ch="ret" aria-label="Retention">' + [['7', '7 days'], ['30', '30 days'], ['90', '90 days']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === pr.retention ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>') +
        row('Allow model training on my data', 'Off by default. Shared models never learn from your data without opt-in.', sw('sw-tr', 'privacy.training', pr.training)) +
        '<div class="field" style="margin-top:12px"><span class="label">Your agent may tell senders</span><div class="stack-4" style="margin-top:4px">' + dis.map(function (d) { const id = 'dis-' + d[0]; return '<label class="check" for="' + id + '"><input type="checkbox" id="' + id + '" data-ch="disclose" data-k="' + d[0] + '"' + (pr.disclose[d[0]] ? ' checked' : '') + '>' + d[1] + '</label>'; }).join('') + '</div></div></section>';
    },
  };

  function preview() {
    const cur = E.inbox(), c = E.counts(cur), n = cur.length;
    const base = A.intents.map(function (it) { return E.evaluate(E.prepared(it), A.defaultPolicy); });
    const now = A.intents.map(function (it) { return E.evaluate(E.prepared(it), P()); });
    const moved = [];
    now.forEach(function (r, i) { if (r.lane !== base[i].lane) moved.push([r.p.name, base[i].lane, r.lane]); });
    const colors = { high: 'var(--high)', medium: 'var(--med)', low: 'var(--low)', declined: 'var(--fg-3)', blocked: 'var(--bad)' };
    return '<div class="card pad stack-12" id="pol-preview"><div class="row between"><h2 class="card__h">Live preview</h2><span class="small muted num">Policy v' + P().version + '</span></div>' +
      '<p class="small muted">How today’s ' + n + ' intents route under this policy.</p>' +
      '<div class="split" role="img" aria-label="' + E.LANES.map(function (l) { return c[l] + ' ' + E.LABEL[l]; }).join(', ') + '">' + E.LANES.filter(function (l) { return c[l]; }).map(function (l) { return '<span style="width:' + (c[l] / n * 100) + '%;background:' + colors[l] + '">' + c[l] + '</span>'; }).join('') + '</div>' +
      '<ul class="stack-4">' + E.LANES.map(function (l) { return '<li class="row between"><span class="row">' + A.ui.lane(l) + '</span><span class="small b num">' + c[l] + '</span></li>'; }).join('') + '</ul>' +
      '<div class="small">' + (moved.length ? '<b>Changed vs. your starting policy</b><ul class="stack-4" style="margin-top:4px">' + moved.slice(0, 5).map(function (m) { return '<li>' + esc(m[0]) + ': ' + E.LABEL[m[1]] + ' → <b>' + E.LABEL[m[2]] + '</b></li>'; }).join('') + (moved.length > 5 ? '<li class="muted">and ' + (moved.length - 5) + ' more</li>' : '') + '</ul>' : '<span class="muted">Same routing as your starting policy.</span>') + '</div>' +
      '<a class="btn btn--secondary btn--sm" href="#inbox" style="align-self:flex-start">Open Agent Inbox</a></div>';
  }
  function updatePreview() {
    const el = document.getElementById('pol-preview');
    if (el) el.outerHTML = preview();
    const v = document.getElementById('pol-ver');
    if (v) v.textContent = 'v' + P().version;
  }
  function changed(redrawSec) {
    A.policyTouched();
    if (redrawSec) { const el = document.getElementById('pc-' + redrawSec); if (el) el.outerHTML = CARDS[redrawSec](); }
    updatePreview();
    const s = document.getElementById('pol-saved');
    if (s) s.textContent = 'All changes saved';
  }

  A.view('policy', {
    render: function () {
      const p = P();
      return '<div class="page"><div class="scaffold">' +
        '<aside class="rail hide-md"><nav class="card setnav sticky" style="padding-block:8px" aria-label="Policy sections">' + SECS.map(function (s) { return '<a href="#policy.' + s[0] + '">' + I(s[1]) + s[2] + '</a>'; }).join('') + '</nav></aside>' +
        '<div class="main">' +
          '<div class="card pad-24 stack-12"><div class="row between wrap"><h1 class="t24">Attention policy</h1><span class="tag tag--accent num" id="pol-ver">v' + p.version + '</span></div>' +
            '<p class="muted t16">Your agent enforces these rules on every inbound intent. Hard rules run outside the model; the model only recommends and drafts.</p>' +
            '<div class="row wrap"><span class="live" id="pol-saved">All changes saved</span><a class="btn btn--secondary btn--sm" href="#a.' + A.me + '">' + I('eye', 'ico-16') + 'See your public agent page</a><button class="btn btn--tertiary btn--sm" data-act="pol-reset">Reset to defaults</button></div></div>' +
          SECS.map(function (s) { return CARDS[s[0]](); }).join('') +
        '</div>' +
        '<aside class="rail rail--right"><div class="sticky stack">' + preview() +
          '<div class="card pad stack-12"><h2 class="card__h">Test a message</h2><label class="sr" for="pt-text">Message</label><textarea class="textarea" id="pt-text" rows="4" placeholder="Paste an inbound message">' + esc(A.SAMPLES[0].text) + '</textarea><button class="btn btn--secondary btn--sm" data-act="pt-run" style="align-self:flex-start">' + I('spark', 'ico-16') + 'Run against this policy</button><div id="pt-out"></div></div>' +
        '</div></aside></div></div>';
    },
    mount: function (arg) {
      if (!arg) return;
      const el = document.getElementById('pc-' + arg);
      if (el) { const y = el.getBoundingClientRect().top + window.scrollY - 76; window.scrollTo(0, y); }
    },
  });

  A.act['pol-tpl'] = function (el) {
    A.applyTemplate(el.dataset.k);
    A.refresh();
    A.toast('Applied the <b>' + esc(A.templates[el.dataset.k].name) + '</b> template. Topics, VIPs and blocklist were kept.');
  };
  A.act['pol-reset'] = function () {
    const v = P().version;
    A.S.policy = JSON.parse(JSON.stringify(A.defaultPolicy));
    A.S.policy.version = v;
    A.policyTouched(); A.refresh();
    A.toast('Policy reset to the investor defaults.', 'info');
  };
  A.chg['pol-sw'] = function (el) {
    set(el.dataset.k, el.checked);
    const t = el.parentNode.querySelector('.sw-t');
    if (t) t.textContent = el.checked ? 'On' : 'Off';
    changed();
    if (el.dataset.k === 'focus') A.toast(el.checked ? 'Focus mode on. Only VIPs interrupt you until you turn it off.' : 'Focus mode off.', 'info');
  };
  A.act['topic-add'] = function (el) { P().openTo.push(el.dataset.v); changed('topics'); };
  A.act['topic-rm'] = function (el) { P().openTo = P().openTo.filter(function (t) { return t !== el.dataset.v; }); changed('topics'); };
  A.act['stage-t'] = function (el) { const s = P().stages, v = el.dataset.v, i = s.indexOf(v); if (i >= 0) s.splice(i, 1); else s.push(v); changed('stages'); };
  A.act['geo-t'] = function (el) { const s = P().geo, v = el.dataset.v, i = s.indexOf(v); if (i >= 0) s.splice(i, 1); else s.push(v); changed('stages'); };
  A.chg.chk = function () {
    const mn = Math.max(0, +document.getElementById('chk-min').value || 0) * 1000;
    let mx = Math.max(0, +document.getElementById('chk-max').value || 0) * 1000;
    if (mx < mn) { mx = mn; document.getElementById('chk-max').value = mx / 1000; }
    P().check = { min: mn, max: mx };
    changed();
  };
  A.act['cat-set'] = function (el) { P().categories[el.dataset.k] = el.dataset.v; changed('categories'); };
  A.inp.th = function () {
    const hi = document.getElementById('th-high'), md = document.getElementById('th-med');
    let h = +hi.value, m = +md.value;
    if (m > h - 5) { m = h - 5; md.value = m; }
    P().thresholds = { high: h, medium: m };
    document.getElementById('th-high-v').textContent = h;
    document.getElementById('th-med-v').textContent = m;
    changed();
  };
  A.chg['ev-t'] = function (el) {
    const k = el.dataset.k, v = el.dataset.v, arr = P().evidence[k] = P().evidence[k] || [];
    const i = arr.indexOf(v);
    if (el.checked && i < 0) arr.push(v);
    if (!el.checked && i >= 0) arr.splice(i, 1);
    changed();
    const sub = el.closest('.setrow').querySelector('.setrow__t span');
    if (sub) sub.textContent = arr.length ? arr.length + ' required' : 'Nothing required';
  };
  A.act['vip-rm'] = function (el) { P().vip = P().vip.filter(function (x) { return x !== el.dataset.id; }); changed('vip'); A.toast(esc(A.P(el.dataset.id).name) + ' is no longer a VIP.', 'info'); };
  A.act['vip-add2'] = function (el) { if (P().vip.indexOf(el.dataset.id) < 0) P().vip.push(el.dataset.id); changed('vip'); A.toast(esc(A.P(el.dataset.id).name) + ' is now a VIP.'); };
  A.act['block-rm'] = function (el) { P().blocked = P().blocked.filter(function (x) { return x !== el.dataset.v; }); changed('vip'); };
  A.sub['block-add'] = function (f) {
    const v = f.querySelector('input').value.trim();
    if (!v) return;
    if (P().blocked.indexOf(v) < 0) P().blocked.push(v);
    changed('vip');
    const inp = document.getElementById('block-new');
    if (inp) inp.focus();
  };
  A.chg.hours = function () { const h = P().hours; h.days = document.getElementById('h-days').value; h.start = document.getElementById('h-start').value || h.start; h.end = document.getElementById('h-end').value || h.end; changed(); };
  A.chg['digest-time'] = function (el) { P().autonomy.digestTime = el.value || '08:30'; changed(); };
  A.chg.ret = function (el) { P().privacy.retention = el.value; changed(); };
  A.chg.disclose = function (el) { P().privacy.disclose[el.dataset.k] = el.checked; changed(); };
  A.act['pt-run'] = function () {
    const t = document.getElementById('pt-text').value;
    const parsed = E.parseText(t, { verified: true });
    const r = E.evaluate(parsed.intent, P(), parsed.sender);
    document.getElementById('pt-out').innerHTML = t.trim() ? A.ui.triage(r, { bars: false }) : '<p class="small muted">Paste a message first.</p>';
  };
})(window.ABN);
