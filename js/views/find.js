/* Find: search people and businesses by what they do, offer and look for, and see who matches you.
   Live: the server searches every member profile. Demo: searches the fictional members in the browser. */
(function (A) {
  const esc = A.esc, I = A.icon;
  let q = '', industry = '', results = null, matches = null, loading = false, seq = 0, timer = null;

  function card(c) {
    const p = { name: c.name, photo: c.photo, c: c.colors || c.c };
    const list = function (label, items) { return items && items.length ? '<div class="small"><span class="muted">' + label + '</span> ' + esc(items.slice(0, 3).join(' · ')) + '</div>' : ''; };
    return '<div class="card find-card">' +
      '<div class="row-top" style="gap:12px"><a href="#in.' + esc(c.id) + '">' + A.avatar(p, 52) + '</a><div class="grow stack-4" style="min-width:0">' +
        '<a class="b t16 clamp1" href="#in.' + esc(c.id) + '" style="color:var(--fg)">' + esc(c.name) + '</a><div class="small clamp2">' + esc(c.headline || '') + '</div>' +
        ((c.location || (c.industries || []).length) ? '<div class="small muted clamp1">' + esc([c.location].concat((c.industries || []).slice(0, 2)).filter(Boolean).join(' · ')) + '</div>' : '') +
      '</div></div>' +
      (c.why && !/^(Name|Headline|Industry)
.test(c.why) ? '<div class="find-why">' + I('target', 'ico-16') + esc(c.why) + '</div>' : '') +
      list('Offers:', c.offers) + list('Looking for:', c.needs) +
      '<div class="row wrap" style="gap:8px;margin-top:auto"><a class="btn btn--primary btn--sm" href="#send.' + esc(c.id) + '">' + I('spark', 'ico-16') + 'Knock</a><a class="btn btn--tertiary btn--sm" href="#in.' + esc(c.id) + '">View profile</a></div>' +
      '</div>';
  }
  function grid(list) { return '<div class="find-grid">' + list.map(card).join('') + '</div>'; }

  // Demo: the fictional members, searched in the browser.
  function demoSearch() {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return Object.keys(A.people).filter(function (id) {
      const p = A.people[id];
      if (id === A.me || p.kind || id.indexOf('anon-') === 0) return false;
      if (industry && (p.topics || []).indexOf(industry) < 0) return false;
      const hay = (p.name + ' ' + p.headline + ' ' + (p.topics || []).join(' ') + ' ' + (p.loc || '')).toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) >= 0; });
    }).slice(0, 50).map(function (id) { const p = A.people[id]; return { id: id, name: p.name, headline: p.headline, colors: p.c, location: p.loc, industries: p.topics || [], offers: [], needs: [] }; });
  }

  async function load() {
    const my = ++seq;
    if (!A.live) { results = demoSearch(); matches = []; paint(); return; }
    loading = true; paint();
    try {
      const params = '?q=' + encodeURIComponent(q) + (industry ? '&industry=' + encodeURIComponent(industry) : '');
      const [r, m] = await Promise.all([A.Live.call('GET', 'api/directory' + params), matches ? Promise.resolve(matches) : A.Live.call('GET', 'api/directory/matches')]);
      if (my !== seq) return;
      results = r; matches = m;
    } catch (e) { A.toast(esc(e.message), 'warn'); }
    loading = false;
    paint();
  }

  function body() {
    const me = A.P(A.me), searching = q || industry;
    const hasProfile = (me.offers || []).length || (me.needs || []).length;
    let h = '';
    if (!searching && A.live) {
      h += '<section class="stack-12"><div class="row between wrap"><h2 class="card__h">Matches for you</h2>' + (hasProfile ? '<a class="link small" href="#in.' + A.me + '">Edit what you offer and need</a>' : '') + '</div>';
      if (!hasProfile) h += '<div class="card pad stack-12"><p class="muted">Add what you offer and what you’re looking for, and Knockero shows who offers what you need and who needs what you offer.</p><div><a class="btn btn--primary btn--sm" href="#in.' + A.me + '">Complete your profile</a></div></div>';
      else if (matches && matches.length) h += grid(matches.slice(0, 6));
      else if (matches) h += '<div class="card pad"><p class="muted">No matches yet. As more businesses join, they show up here.</p></div>';
      h += '</section>';
    }
    h += '<section class="stack-12"><h2 class="card__h">' + (searching ? 'Results' : 'Everyone on Knockero') + (results ? ' <span class="muted">(' + results.length + ')</span>' : '') + '</h2>';
    if (loading && !results) h += '<p class="muted">Searching…</p>';
    else if (results && !results.length) h += '<div class="card pad"><p class="muted">Nobody matches yet. Try another word, or <a class="link" href="#contacts">invite your LinkedIn connections</a>.</p></div>';
    else if (results) h += grid(results);
    return h + '</section>';
  }
  function paint() { const el = document.getElementById('find-body'); if (el) el.innerHTML = body(); }

  A.view('find', {
    render: function (arg) {
      if (arg) { q = decodeURIComponent(arg).replace(/\+/g, ' '); }
      return '<div class="page"><div class="stack-16" style="max-width:980px;margin-inline:auto">' +
        '<div class="stack-4"><h1 class="ct-h1">Find</h1><p class="muted">Customers, suppliers, partners, people and expertise. Search by what businesses do, offer or look for.</p></div>' +
        '<div class="card pad find-bar"><div class="ibsearch grow">' + I('search') + '<input id="find-q" type="search" placeholder="What are you looking for? e.g. printing, accountant, hotel linen" value="' + esc(q) + '" data-in="find-q" aria-label="Search"></div>' +
          '<label class="sr" for="find-ind">Industry</label><select class="select" id="find-ind" data-ch="find-ind" style="width:auto"><option value="">All industries</option>' + A.TOPICS.map(function (t) { return '<option' + (t === industry ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></div>' +
        '<div class="stack-24" id="find-body">' + body() + '</div></div></div>';
    },
    mount: function () { matches = null; load(); },
  });
  A.inp['find-q'] = function (el) { clearTimeout(timer); timer = setTimeout(function () { q = el.value.trim(); load(); }, 250); };
  A.chg['find-ind'] = function (el) { industry = el.value; load(); };
})(window.ABN);
