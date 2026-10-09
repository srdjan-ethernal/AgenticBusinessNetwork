/* Knockero — recipient policy + priority scoring engine.
   Priority = 0.30 policy fit + 0.20 completeness + 0.15 reputation + 0.15 relationship + 0.10 value + 0.10 urgency − penalties.
   Hard rules (blocked, closed categories, VIP, thesis cap) are enforced outside the score. */
(function (A) {
  const E = (A.Engine = {});
  const clamp = function (x, a, b) { return Math.max(a == null ? 0 : a, Math.min(b == null ? 1 : b, x)); };
  E.clamp = clamp;
  E.lc = function (s) { return /^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1); };
  E.LANES = ['high', 'medium', 'low', 'declined', 'blocked'];
  E.LABEL = { high: 'HIGH', medium: 'MEDIUM', low: 'LOW', declined: 'Declined', blocked: 'Blocked' };

  const INJ = /(ignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier)\s+(instructions|rules|prompts?))|(disregard\s+(your|the|all|any)\s+(policy|policies|rules|instructions))|(system\s+(prompt|note|message|override)\b)|(\byou\s+are\s+now\s+)|(mark\s+(this|it|me)\s+(message\s+)?(as\s+)?(high|urgent|vip)(\s+priority)?)|(new\s+instructions\s*:)/i;
  E.injection = function (t) { const m = INJ.exec(t || ''); return m ? m[0] : null; };

  E.money = function (n) {
    if (n == null || isNaN(n)) return '—';
    if (n >= 1e6) return '$' + String(Math.round((n / 1e6) * 10) / 10).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + n;
  };
  A.money = E.money;

  // Demo data is anchored to a fixed moment; live mode (js/api.js) switches this to the real clock.
  E.now = new Date(2026, 8, 29, 9, 40);
  E.ago = function (min) {
    if (min < 1) return 'now';
    if (min < 60) return Math.round(min) + 'm';
    if (min < 1440) return Math.floor(min / 60) + 'h';
    if (min < 10080) return Math.floor(min / 1440) + 'd';
    return Math.floor(min / 10080) + 'w';
  };
  E.stamp = function (min) {
    const d = new Date(E.now.getTime() - min * 60000);
    if (d.toDateString() === E.now.toDateString()) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    if (min < 7 * 1440) return d.toLocaleDateString('en-US', { weekday: 'short' });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  // Next three slots inside the recipient's availability window (weekdays, with buffers)
  E.slots = function () {
    const out = [], times = [[10, 30], [14, 0], [16, 30]];
    const d = new Date(E.now.getTime());
    let i = 0;
    while (out.length < 3 && i < 14) {
      d.setDate(d.getDate() + 1); i++;
      const wd = d.getDay();
      if (wd === 0 || wd === 6) continue;
      const t = times[out.length];
      const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), t[0], t[1]);
      out.push(s.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ', ' + s.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ' CET');
    }
    return out;
  };

  E.policyFor = function (id) {
    if (id === A.me) return A.S.policy;
    if (A.live && A.Live.cards[id]) return A.Live.policyFromCard(A.Live.cards[id]);
    const p = A.people[id] || {};
    const t = A.templates[p.tpl || 'founder'] || A.templates.founder;
    return Object.assign({}, JSON.parse(JSON.stringify(A.defaultPolicy)), JSON.parse(JSON.stringify(t.policy)), {
      openTo: (p.topics || []).slice(), stages: A.STAGES.slice(), check: { min: 0, max: 1e12 }, geo: [], vip: [],
      blocked: ['guaranteed returns', 'crypto yield'], thesisHardFilter: false, focus: false, requireVerified: false, template: p.tpl || 'founder',
    });
  };

  E.prepared = function (it) {
    const S = A.S;
    if (!it.patch || !S || !S.answered || !S.answered[it.id]) return it;
    const p = it.patch;
    return Object.assign({}, it, { amount: p.amount != null ? p.amount : it.amount, evidence: (it.evidence || []).concat(p.evidence || []), note: p.note, answeredNow: true });
  };

  E.evaluate = function (it, pol, sender) {
    pol = pol || A.S.policy;
    const p = sender || A.people[it.from] || { rep: 50, verified: [] };
    const who = p.name ? p.name.split(' ')[0] : 'The sender';
    const text = [it.text, it.objective, it.value].join(' ');
    const R = [];
    const catLabel = (A.CATS[it.category] || A.CATS.other).label;
    const status = pol.categories[it.category] || 'ask';
    const vip = !!it.from && (pol.vip || []).indexOf(it.from) >= 0;
    const tags = it.tags || [];
    const overlap = tags.filter(function (t) { return pol.openTo.indexOf(t) >= 0; });
    const inj = E.injection(text);
    const lower = text.toLowerCase();
    const blockedKw = (pol.blocked || []).filter(function (k) { return k && lower.indexOf(k.toLowerCase()) >= 0; })[0];
    const verified = (p.verified || []).length > 0;
    const questions = [];

    // 1. Policy fit
    let pf = status === 'open' ? 0.4 : status === 'ask' ? 0.25 : 0;
    if (!pol.openTo.length) { pf += 0.25; R.push(['info', 'No topic filter in this policy']); }
    else if (overlap.length >= 2) { pf += 0.4; R.push(['pos', 'Matches your topics: ' + overlap.join(', ')]); }
    else if (overlap.length === 1) { pf += 0.3; R.push(['pos', 'Matches your topic: ' + overlap[0]]); }
    else { pf -= 0.1; R.push(['neg', tags.length ? 'Outside your topics: ' + tags.join(', ') : 'No overlap with your topics']); }
    if (it.category === 'fundraising') {
      if (it.stage) {
        if (pol.stages.indexOf(it.stage) >= 0) { pf += 0.1; R.push(['pos', it.stage + ' is a stage you invest in']); }
        else { pf -= 0.1; R.push(['neg', it.stage + ' is outside your stages']); }
      }
      if (it.amount) {
        const mn = pol.check.min, mx = pol.check.max, rng = E.money(mn) + '–' + E.money(mx);
        if (it.amount >= mn && it.amount <= mx) { pf += 0.1; R.push(['pos', 'Round of ' + E.money(it.amount) + (it.note ? ' allocation' : '') + ' fits your ' + rng + ' range']); }
        else {
          if (it.amount <= mx * 1.75 && it.amount >= mn * 0.5) { pf -= 0.05; R.push(['warn', 'Round of ' + E.money(it.amount) + ' is outside your ' + rng + ' range']); }
          else { pf -= 0.2; R.push(['neg', 'Round of ' + E.money(it.amount) + ' is far outside your ' + rng + ' range']); }
          questions.push({ type: 'round', q: 'First checks here are ' + rng + '. Is there an allocation in that range, and who leads?' });
        }
      }
    } else pf += 0.2;
    if (it.geo && pol.geo.length && pol.geo.indexOf(it.geo) < 0) { pf -= 0.1; R.push(['warn', it.geo + ' is outside your geographies']); }
    pf = clamp(pf);

    // 2. Intent completeness
    const fields = ['objective', 'value', 'action'].filter(function (k) { return it[k]; }).length / 3;
    const req = (pol.evidence && pol.evidence[it.category]) || [];
    const have = {};
    (it.evidence || []).forEach(function (e) { have[e.type] = true; });
    const missing = req.filter(function (r) { return !have[r]; });
    const ev = req.length ? (req.length - missing.length) / req.length : 1;
    const c = 0.4 * fields + 0.6 * ev;
    if (req.length && !missing.length) R.push(['pos', 'All required evidence is attached']);
    else if (missing.length) R.push(['warn', 'Missing: ' + missing.map(function (m) { return E.lc((A.EVID[m] || { label: m }).label); }).join(', ')]);
    missing.forEach(function (m) { if (!questions.some(function (q) { return q.type === m; })) questions.push({ type: m, q: (A.EVID[m] || { q: 'Can you tell me more?' }).q }); });

    // 3. Sender reputation
    let rep = (p.rep == null ? 50 : p.rep) / 100;
    if (!verified && pol.requireVerified) { rep -= 0.2; R.push(['warn', 'Sender identity is not verified']); }
    else if (verified) R.push(['pos', 'Verified: ' + p.verified.map(function (v) { return (A.CLAIMS[v] || v).toLowerCase(); }).join(', ')]);
    if (p.abuse) { rep -= 0.15 * p.abuse; R.push(['neg', p.abuse + ' abuse report' + (p.abuse > 1 ? 's' : '') + ' in the last 30 days']); }
    rep = clamp(rep);

    // 4. Relationship trust
    const rel = vip ? 1 : clamp(Math.min(1, (p.mutuals || 0) / 15) * 0.7 + Math.min(1, (p.prior || 0) / 3) * 0.3);
    if (vip) R.push(['pos', who + ' is on your VIP list']);
    else if ((p.mutuals || 0) >= 5) R.push(['pos', p.mutuals + ' mutual connections']);

    // 5–6. Business value and urgency
    const val = clamp(it.valueScore == null ? 0.4 : it.valueScore);
    const urg = { low: 0.2, normal: 0.5, time_sensitive: 0.9 }[it.urgency || 'normal'];
    if (it.urgency === 'time_sensitive') R.push(['info', 'Time-sensitive' + (it.deadline ? ': ' + it.deadline : '')]);

    // Penalties
    const pens = [];
    if (inj) pens.push(['Prompt-injection attempt', 45]);
    if (it.templated) pens.push(['Templated outreach (sent to ' + Number(it.templated).toLocaleString('en-US') + ' recipients)', 12]);
    else if ((it.generic || 0) >= 2) pens.push(['Templated phrasing (' + it.generic + ' stock phrases)', 10]);
    if (p.abuse) pens.push(['Recent abuse reports', 8 * p.abuse]);
    if (blockedKw) pens.push(['Blocked topic “' + blockedKw + '”', 30]);
    const penalty = pens.reduce(function (s, x) { return s + x[1]; }, 0);

    const W = pol.weights || A.defaultPolicy.weights;
    const parts = [
      { k: 'pf', label: 'Policy fit', w: W.pf, v: pf },
      { k: 'c', label: 'Intent completeness', w: W.c, v: c },
      { k: 'r', label: 'Sender reputation', w: W.r, v: rep },
      { k: 'rel', label: 'Relationship trust', w: W.rel, v: rel },
      { k: 'v', label: 'Business value', w: W.v, v: val },
      { k: 'u', label: 'Urgency', w: W.u, v: urg },
    ];
    const raw = parts.reduce(function (s, x) { return s + x.w * x.v; }, 0);
    const score = Math.max(0, Math.min(100, Math.round(raw - penalty)));
    const th = pol.thresholds;

    let lane, why;
    if (inj || (p.abuse || 0) >= 3) { lane = 'blocked'; why = inj ? 'Prompt injection detected. The text was treated as data, quarantined, and the sender was rate-limited.' : 'Repeated abuse reports. The sender is blocked.'; }
    else if (blockedKw) { lane = 'declined'; why = 'Contains a blocked topic: “' + blockedKw + '”.'; }
    else if (status === 'closed' && !vip) { lane = 'declined'; why = catLabel + ' is closed in your policy. Declined automatically with a reason.'; }
    else if (vip) { lane = 'high'; why = 'VIP bypass: escalated regardless of score.'; }
    else if (pol.thesisHardFilter && it.category === 'fundraising' && pol.openTo.length && !overlap.length) { lane = 'low'; why = 'Outside the industries you invest in. Your policy caps these at LOW.'; }
    else if (score >= th.high && pf >= 0.6 && (!pol.requireVerified || verified)) { lane = 'high'; why = 'Score ' + score + ' clears your HIGH threshold of ' + th.high + ' and the policy check passed.'; }
    else if (score >= th.high) { lane = 'medium'; why = pf < 0.6 ? 'Score is high, but policy fit is weak. Held for review.' : 'Score is high, but the sender is not verified.'; }
    else if (score >= th.medium) { lane = 'medium'; why = missing.length || questions.length ? 'Promising but incomplete. Qualification questions triggered.' : 'Score ' + score + ' sits between your MEDIUM (' + th.medium + ') and HIGH (' + th.high + ') thresholds.'; }
    else { lane = 'low'; why = 'Score ' + score + ' is below your MEDIUM threshold of ' + th.medium + '.'; }
    if (pol.focus && lane === 'high' && !vip) { lane = 'medium'; why = 'Focus mode is on. Held for your next digest; only VIPs interrupt you.'; }

    const au = pol.autonomy || {};
    const nq = questions.length;
    const action = {
      high: 'Escalate to you with a brief',
      medium: nq && au.autoQuestion ? 'Ask ' + nq + ' qualification question' + (nq > 1 ? 's' : '') : au.digest ? 'Batch into your ' + (au.digestTime || '08:30') + ' digest' : 'Hold for review',
      low: au.autoDecline ? 'Decline politely with a reason' : 'Archive quietly',
      declined: 'Declined with a reason',
      blocked: 'Blocked and reported',
    }[lane];

    return { it: it, p: p, lane: lane, score: score, raw: raw, parts: parts, pens: pens, penalty: penalty, reasons: R, why: why, action: action, missing: missing, questions: questions, overlap: overlap, vip: vip, inj: inj, status: status, verified: verified, th: th };
  };

  E.inbox = function (pol) {
    pol = pol || A.S.policy;
    return A.intents.map(function (it) {
      const r = E.evaluate(E.prepared(it), pol);
      const d = A.S.decisions[it.id];
      if (d && d.lane && d.lane !== r.lane) { r.origLane = r.lane; r.lane = d.lane; r.overridden = true; }
      r.decision = d || null;
      return r;
    });
  };
  E.sort = function (list) {
    return list.slice().sort(function (a, b) { return E.LANES.indexOf(a.lane) - E.LANES.indexOf(b.lane) || b.score - a.score; });
  };
  E.counts = function (list) {
    const m = { high: 0, medium: 0, low: 0, declined: 0, blocked: 0 };
    list.forEach(function (r) { m[r.lane]++; });
    return m;
  };

  // ---------- free text → structured intent (used by the live demo and the sandbox) ----------
  const CAT_RE = {
    purchase: /\b(quotes?|quotation|price list|prices|order(ing)?|buy(ing)?|purchas\w*|we need|need \d+|supply|supplier|deliver(y|ed)? by|samples?|rfq|tender)\b/g,
    fundraising: /\b(investors?|investment|invest(ing)?|funding|loans?|rais(e|es|ing)|pre-?seed|series [abc]|valuation|equity stake|cap table|funding round)\b/g,
    sales: /\b(our (platform|product|solution|tool|software|services?)|demo|pricing|free trial|book a (call|demo)|quick call|synerg\w*|unlock\w*|boost\w*|10x|3x|special offer|discount)\b/g,
    recruiting: /\b(hiring|role|position|candidate|recruit\w*|compensation|salary|vacanc\w*|head of|job|cv|resume)\b/g,
    partnership: /\b(partner(ship)?s?|co-?market\w*|collaborat\w*|resell\w*|distribut\w*|joint offer|together we)\b/g,
    press: /\b(journalist|reporter|story|article|on (the )?record|press|newsletter|quote from you|feature)\b/g,
    advisory: /\b(podcast|advice|advis(e|or|ory)|consult\w*|mentor\w*|interview|episode|guest|opinion)\b/g,
    event: /\b(events?|fair|expo|conference|summit|panel|speak(er|ing)?|talk|workshop|webinar|festival|booth)\b/g,
    intro: /\b(intro(duce|duction|s)?|connect (you|me) with)\b/g,
  };
  const TAG_RE = [
    ['Hospitality & tourism', /\b(hotels?|hostels?|tourism|tourists?|travel agenc\w*|guest ?houses?|resorts?)\b/],
    ['Food & drink', /\b(restaurants?|caf(e|é)s?|bakery|bakeries|food|catering|coffee|wine|drinks?|beverages?)\b/],
    ['Retail & e-commerce', /\b(shops?|stores?|retail\w*|e-?commerce|online shop|webshop)\b/],
    ['Manufacturing', /\b(manufactur\w*|factory|factories|production line|machin\w*|cnc|textiles?)\b/],
    ['Construction & real estate', /\b(construction|real estate|renovation|architect\w*|property|properties)\b/],
    ['Transport & logistics', /\b(logistics|transport\w*|deliveries|shipping|freight|warehouse\w*|trucks?)\b/],
    ['Technology & software', /\b(software|apps?|saas|it services|websites?|developers?)\b/],
    ['AI & data', /\b(ai|artificial intelligence|machine learning|analytics|data (science|platform))\b/],
    ['Agriculture', /\b(farm\w*|agricultur\w*|crops?|harvest|orchards?|livestock)\b/],
    ['Energy & environment', /\b(energy|solar|electricity|heating|recycl\w*|emissions|carbon)\b/],
    ['Finance & insurance', /\b(bank\w*|loans?|insurance|payments?|crypto|fintech|apy|yield)\b/],
    ['Legal & accounting', /\b(lawyers?|legal|accountants?|accounting|bookkeeping|tax(es)?)\b/],
    ['Consulting & business services', /\b(consult\w*|office supplies|cleaning|outsourc\w*|business services)\b/],
    ['Marketing & advertising', /\b(marketing|advertis\w*|seo|social media|branding|lead gen\w*)\b/],
    ['Media & creative', /\b(design(ers)?|photograph\w*|video|magazine|newsletter|podcast|journalis\w*)\b/],
    ['Health & wellness', /\b(health\w*|clinic\w*|patients?|doctors?|fitness|wellness|pharma\w*)\b/],
    ['Education & training', /\b(schools?|training|courses?|education|students?)\b/],
    ['HR & staffing', /\b(staffing|hr|human resources|recruit\w*)\b/],
    ['Fashion & beauty', /\b(fashion|clothing|beauty|cosmetics|salons?|bed linen)\b/],
    ['Automotive', /\b(cars?|vehicles?|automotive|garages?|tyres?|tires?)\b/],
    ['Import & export', /\b(import\w*|export\w*|customs)\b/],
    ['Crafts & trades', /\b(plumb\w*|electricians?|carpent\w*|craftsm\w*|repairs?)\b/],
    ['Nonprofit & public sector', /\b(nonprofit|ngo|charity|municipal\w*|public sector|government)\b/],
  ];
  const MONTH = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
  const EV_RE = {
    offer: /\b(we offer|our (offer|services?|products?)|price list|from (€|\$)\s?\d|per (month|hour|piece|unit|night))\b/i,
    need: /\b(we need|i need|looking for|need \d+|\d+\s?(pcs|pieces|units|sets|kg|tons?|rooms|liters?|litres?))\b/i,
    budget: /\b(budget|price range)\b|(€|\$)\s?\d[\d,.]*|\b\d[\d,.]*\s?(k\s)?(eur|euros?|usd|rsd|dinars?)\b/i,
    company: /\b(we are an? [a-z]+ (company|business|firm|shop|agency)|our company|family business|since (19|20)\d\d|founded in|in business for)\b/i,
    website: /\b(www\.[a-z0-9-]+|https?:\/\/|[a-z0-9-]+\.(com|rs|net|org|io|eu)\b|portfolio)/i,
    traction: /(\d[\d,.]*\s?(k|m)?\s?(mrr|arr))|\b(mrr|arr|paying customers|regular customers|\d[\d,.]*\s?(users|customers|clients|pilots))\b/i,
    deck: /\b(deck|presentation|proposal|memo|one-?pager|brochure|catalog(ue)?)\b/i,
    team: /\b(co-?founders?|previously|we built|team of \d+|years of experience)\b/i,
    icp: /\b(used by|customers include|clients include|\d+ (companies|businesses|restaurants|hotels|shops|firms) (like|use|already))\b/i,
    integration: /\b(integrat(es|ion|ions)\s+with|works with (your|our))\b/i,
    roi: /(\b\d+\s?%|\b\d+x\b|\broi\b|\bsaves?\s+\d)/i,
    reference: /\b(reference|case study|customers include|clients include|we (supplied|delivered|worked) (for|with))\b/i,
    comp: /((€|\$)\s?\d+\s?(k|000))|\b(compensation|salary|pay|net (a|per) month|per hour|equity)\b/i,
    remote: /\b(remote|hybrid|on-?site)\b/i,
    teamstage: /\b\d+\s(people|employees|staff)\b/i,
    audience: /\b(audience|attendees|listeners|readers|subscribers|visitors|\d+ (members|companies|exhibitors))\b/i,
    mutual_value: /\b(for you|in return|mutual|both ways|two-way|you would get|we both)\b/i,
    timeline: new RegExp('\\b(' + MONTH + '\\s\\d{1,2}|\\d{1,2}(st|nd|rd|th)?\\s' + MONTH + ')\\b|\\bq[1-4]\\b|\\bnext (week|month)\\b|\\bthis (week|season)\\b', 'i'),
    topic: /\b(about|topic|story on|feature on|discuss|questions? on|article on)\b/i,
    time: /\b\d+\s?(min|mins|minutes|hours?)\b/i,
    fee: /\b(paid|honorarium|fee|unpaid)\b/i,
    confidentiality: /\b(nda|confidential|off the record)\b/i,
    outlet: /\b(for|at)\s+(the\s+)?[a-z]+\s+(weekly|daily|times|journal|news|wire|review|post|magazine)\b/i,
    deadline: new RegExp('\\b(deadline|by (tomorrow|monday|tuesday|wednesday|thursday|friday|eod|end of day|the end of)|by \\d{1,2}(st|nd|rd|th)?\\s' + MONTH + '|by ' + MONTH + '\\s\\d{1,2})', 'i'),
    context: /\b(suggested|introduced|we met|mutual|referred|following our|recommended you)\b/i,
  };
  const GEN = /\b(hope (this|you)[^.!?]{0,30}well|reach(ing)? out|touch base|synerg\w*|game-?changer|quick call|quick question|circle back|companies like yours|funds like yours|just checking in|unlock\w*|on autopilot|10x)\b/gi;
  const VALUE_BY_CAT = { fundraising: 0.7, purchase: 0.65, intro: 0.6, partnership: 0.55, press: 0.4, advisory: 0.4, event: 0.35, sales: 0.3, recruiting: 0.3, support: 0.3, other: 0.25 };

  function sentenceAt(t, i) {
    let a = t.lastIndexOf('.', i); a = a < 0 ? 0 : a + 1;
    let b = t.indexOf('.', i); b = b < 0 ? t.length : b + 1;
    let s = t.slice(a, b).trim();
    if (s.length > 90) s = s.slice(0, 87).trim() + '…';
    return s;
  }

  E.parseText = function (text, opts) {
    opts = opts || {};
    const t = String(text || '');
    const lo = t.toLowerCase();
    let cat = 'other', best = 0;
    Object.keys(CAT_RE).forEach(function (k) { const n = (lo.match(CAT_RE[k]) || []).length; if (n > best) { best = n; cat = k; } });
    const tags = TAG_RE.filter(function (x) { return x[1].test(lo); }).map(function (x) { return x[0]; });

    const MONEY = /(\$|€|usd\s?|eur\s?)\s?(\d+(?:[.,]\d+)?)\s?(k|m|mm|million|thousand|bn)?\b/gi;
    const monies = [];
    let m;
    while ((m = MONEY.exec(t))) {
      let n = parseFloat(m[2].replace(/[,.](\d{3})(?!\d)/g, '$1').replace(',', '.'));
      const u = (m[3] || '').toLowerCase();
      if (u === 'k' || u === 'thousand') n *= 1e3; else if (u === 'm' || u === 'mm' || u === 'million') n *= 1e6; else if (u === 'bn') n *= 1e9;
      const after = lo.slice(m.index + m[0].length, m.index + m[0].length + 12);
      const ctx = lo.slice(Math.max(0, m.index - 40), m.index + m[0].length + 30);
      monies.push({ n: n, rev: /^\s*(mrr|arr|\/mo|per month|revenue|apy)/.test(after), ctx: ctx });
    }
    const roundM = cat === 'fundraising' ? monies.filter(function (x) { return !x.rev && /\b(rais\w*|round|pre-?seed|seed|series|closing|committed|funding|loan|invest\w*)\b/.test(x.ctx); })[0] : null;
    const amount = roundM ? roundM.n : null;
    const stage = /pre-?seed/.test(lo) ? 'Pre-seed' : /\bseries a\b/.test(lo) ? 'Series A' : /\bseries [b-z]\b/.test(lo) ? 'Series B+' : /\bseed\b/.test(lo) ? 'Seed' : null;

    const evidence = [];
    if (amount && cat === 'fundraising') evidence.push({ type: 'round', value: E.money(amount) + ' round' + (stage ? ' (' + stage.toLowerCase() + ')' : '') });
    Object.keys(EV_RE).forEach(function (k) { const mm = EV_RE[k].exec(t); if (mm) evidence.push({ type: k, value: '“' + sentenceAt(t, mm.index) + '”' }); });

    const generic = (t.match(GEN) || []).length;
    const urgency = /\b(urgent|asap|today|tomorrow|deadline|time-?sensitive|within \d+ hours?|within 1 hour)\b/.test(lo) ? 'time_sensitive' : 'normal';
    const warm = /\b(suggested i (reach out|contact|write)|introduced|intro from|we met at|referred)\b/.test(lo);
    const action = /\b(\d+\s?min\w*|meet\w*|call|chat|coffee)\b/.test(lo) ? 'meet' : /\b(quotes?|quotation|prices|price list|offer for)\b/.test(lo) && cat === 'purchase' ? 'quote' : /\bintro/.test(lo) ? 'intro' : /\b(review|feedback)\b/.test(lo) ? 'review' : 'reply';
    const sentences = t.replace(/([.!?])\s+/g, '$1\n').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    const objective = sentences.filter(function (s) { return s.length > 12 && /\b(could|can|would|let'?s|request|looking for|raising|hiring|invite|asking|worth a)\b/i.test(s); })[0] || sentences[0] || '';
    const value = sentences.filter(function (s) { return s !== objective && /(\d+\s?%|\d+x|\bcut\w*|\bsav\w+|\breduc\w+|\bgrow\w*|\bhelp\w*|\bautomat\w*)/i.test(s); })[0] || '';
    let vs = VALUE_BY_CAT[cat] || 0.25;
    if (generic >= 2) vs = Math.min(vs, 0.15);

    const intent = {
      id: 'demo', from: null, category: cat, tags: tags, stage: stage, amount: amount, geo: opts.geo || null, objective: objective, value: value, action: action,
      urgency: urgency, evidence: evidence, text: t, generic: generic, valueScore: vs,
    };
    const sender = {
      name: opts.name || 'Anonymous sender', rep: opts.verified ? 72 : 50, verified: opts.verified ? ['work_email', 'company_domain'] : [],
      mutuals: warm ? 8 : 0, prior: 0, abuse: 0,
    };
    return { intent: intent, sender: sender, warm: warm };
  };
})(window.ABN);
