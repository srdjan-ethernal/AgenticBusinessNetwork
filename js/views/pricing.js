/* Plans (Premium-style page) */
(function (A) {
  const esc = A.esc, I = A.icon;
  let annual = true;

  const PLANS = [
    { k: 'free', name: 'Free', who: 'Individual professionals', price: function () { return ['$0', 'forever']; }, cta: 'Current plan', feats: ['Public profile and agent address', 'Up to 100 screened intents a month', 'Template policy with HIGH / MEDIUM / LOW lanes', 'Weekly digest and manual review'] },
    { k: 'pro', name: 'Pro', who: 'High-inbound individuals', featured: true, price: function () { return annual ? ['$19', 'per month, billed yearly'] : ['$29', 'per month']; }, cta: 'Start a free month', feats: ['Unlimited screened intents', 'Custom attention policy and VIP list', 'Agent-to-agent qualification questions', 'Calendar-safe scheduling', 'Daily digest and instant HIGH escalation'] },
    { k: 'team', name: 'Team', who: 'Startups, recruiting, sales and partnerships', price: function () { return annual ? ['$39', 'per seat / month, billed yearly'] : ['$59', 'per seat / month']; }, cta: 'Start a team trial', feats: ['Shared team inboxes and policies', 'Routing by role and topic', 'Analytics on response time and quality', 'CRM, ATS and webhook integrations'] },
    { k: 'org', name: 'Verified Organization', who: 'Companies and funds', price: function () { return ['$299', 'per org / month, plus seats']; }, cta: 'Verify your organization', feats: ['Company agent with department routing', 'Verified employees and brand protection', 'Role-based routing and admin controls', 'Up to $1,500 / month for large orgs'] },
    { k: 'ent', name: 'Enterprise', who: 'Large and regulated teams', price: function () { return ['$75', 'per seat / month, plus platform fee']; }, cta: 'Contact sales', feats: ['SSO, SCIM and DLP', 'Audit logs and custom retention', 'Private models and policy approvals', 'Procurement controls and a DPA'] },
    { k: 'api', name: 'Protocol / API', who: 'Agent builders and platforms', price: function () { return ['$5', 'per 1,000 qualified intents, up to $20']; }, cta: 'Get an API key', feats: ['Business Intent API and webhooks', 'Agent card lookup', 'Reputation queries', 'MCP server for AI clients'] },
  ];
  const ROWS = [
    ['Public profile and agent address', '✓', '✓', '✓', '✓', '✓'],
    ['Screened intents per month', '100', 'Unlimited', 'Unlimited', 'Unlimited', 'Unlimited'],
    ['Custom attention policy', 'Template', '✓', '✓', '✓', '✓'],
    ['Qualification questions', '—', '✓', '✓', '✓', '✓'],
    ['Calendar-safe scheduling', '—', '✓', '✓', '✓', '✓'],
    ['Digest', 'Weekly', 'Daily', 'Daily', 'Daily', 'Daily'],
    ['Shared inboxes and team policies', '—', '—', '✓', '✓', '✓'],
    ['CRM, ATS and webhook integrations', '—', '—', '✓', '✓', '✓'],
    ['Company agent and verified employees', '—', '—', '—', '✓', '✓'],
    ['Audit logs', '—', '—', '—', '✓', '✓'],
    ['SSO, SCIM, DLP, private models', '—', '—', '—', '—', '✓'],
  ];
  const FAQ = [
    ['Does a sender need an account?', 'No. Anyone can reach an agent address through the public agent page or the API. Senders who create a profile and verify their identity get better delivery and fewer questions.'],
    ['Can my agent make commitments for me?', 'No. Agents ask, decline with a reason, batch or escalate. Scheduling needs your approval by default, and commitments such as prices, terms, hires or legal answers always need you.'],
    ['Is my data used to train models?', 'Not unless you opt in. Unqualified inbound is deleted after 30 days by default, and Enterprise plans can set custom retention and use private models.'],
    ['What happens to intents my agent declines?', 'The sender gets a reason and, where possible, a better route. You can review every decline and correct your agent in one click.'],
    ['How is the Protocol / API billed?', 'Per qualified intent, from $5 to $20 per 1,000 depending on volume and verification level. Reading your own intents and webhooks costs nothing extra.'],
    ['Can we bring our own model?', 'Enterprise plans can bring their own model for reasoning and drafting. Deterministic policy enforcement always runs outside the model.'],
  ];

  function plans() {
    return PLANS.map(function (p) {
      const pr = p.price();
      const current = p.k === 'free' && A.S.signedIn;
      return '<div class="card plan' + (p.featured ? ' is-featured' : '') + '"><div class="row between"><h2 class="t20">' + esc(p.name) + '</h2>' + (p.featured ? '<span class="gold-sq" title="Recommended">' + I('spark') + '</span>' : '') + '</div>' +
        '<div class="small muted">' + esc(p.who) + '</div><div class="plan__price">' + pr[0] + ' <small>' + esc(pr[1]) + '</small></div>' +
        '<ul>' + p.feats.map(function (f) { return '<li>' + I('check') + '<span>' + esc(f) + '</span></li>'; }).join('') + '</ul>' +
        '<button class="btn ' + (current ? 'btn--muted' : p.featured ? 'btn--primary' : 'btn--secondary') + ' btn--block"' + (current ? ' disabled' : '') + ' data-act="plan" data-k="' + p.k + '">' + esc(current ? 'Current plan' : p.cta) + '</button></div>';
    }).join('');
  }

  A.view('pricing', {
    render: function () {
      return '<div class="page stack-24">' +
        '<div class="card pad-24 stack-12" style="text-align:center;align-items:center"><span class="gold-sq" style="width:40px;height:40px">' + I('spark') + '</span><h1 class="t24">Reach the right people. Protect your attention.</h1>' +
          '<p class="muted t16" style="max-width:60ch">Every plan includes a recipient-owned agent. Upgrade when your inbound outgrows the free tier. Prices are indicative while the product is in pilot.</p>' +
          '<div class="seg" role="radiogroup" aria-label="Billing period"><button class="' + (annual ? 'is-on' : '') + '" role="radio" aria-checked="' + annual + '" data-act="billing" data-v="y">Yearly · save up to 34%</button><button class="' + (!annual ? 'is-on' : '') + '" role="radio" aria-checked="' + !annual + '" data-act="billing" data-v="m">Monthly</button></div></div>' +
        '<div class="plans" id="plans">' + plans() + '</div>' +
        '<section class="card sec"><div class="sec__h"><h2>Compare plans</h2></div>' + A.ui.table(['Feature', 'Free', 'Pro', 'Team', 'Verified Org', 'Enterprise'], ROWS.map(function (r) { return r.map(function (c, i) { return i === 0 ? esc(c) : c === '✓' ? '<span class="lc-high b" aria-label="Included">✓</span>' : c === '—' ? '<span class="faint" aria-label="Not included">—</span>' : esc(c); }); })) + '</section>' +
        '<section class="card sec faq"><div class="sec__h"><h2>Frequently asked questions</h2></div>' + FAQ.map(function (f) { return '<details><summary>' + esc(f[0]) + '</summary><p>' + esc(f[1]) + '</p></details>'; }).join('') + '</section>' +
        A.ui.appFooter() + '</div>';
    },
  });
  A.act.billing = function (el) { annual = el.dataset.v === 'y'; A.refresh(); };
  A.act.plan = function (el) {
    const p = PLANS.filter(function (x) { return x.k === el.dataset.k; })[0];
    if (p.k === 'api') { A.go('developers'); return; }
    A.toast('This prototype has no billing. In the product, <b>' + esc(p.name) + '</b> starts with a one-month free trial.', 'info');
  };
})(window.ABN);
