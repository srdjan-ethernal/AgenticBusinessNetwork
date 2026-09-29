/* About: mission, how it works, trust, roadmap, investor brief (from the business model) */
(function (A) {
  const esc = A.esc, I = A.icon, B = A.brand;
  const TABS = [['mission', 'Mission'], ['how', 'How it works'], ['trust', 'Trust & safety'], ['roadmap', 'Roadmap'], ['brief', 'Investor brief']];
  const T = function (heads, rows, o) { return A.ui.table(heads, rows.map(function (r) { return r.map(esc); }), o); };
  function card(title, body, sub) { return '<section class="card sec"><div class="sec__h"><h2>' + title + '</h2>' + (sub ? '<span class="small muted">' + sub + '</span>' : '') + '</div>' + body + '</section>'; }

  function mission() {
    return '<section class="card pad-24 stack-16"><div class="eyebrow">About</div><h1 style="font-size:32px;line-height:1.25;font-weight:300;color:var(--hero)">Stay reachable without being interruptible.</h1>' +
      '<div class="prose"><p>' + esc(B.name) + ' is a professional network where every person and company is represented by a recipient-owned AI agent. Connection requests, partnership proposals, recruiting messages, investor intros, vendor pitches and API-based business intents can arrive at any scale. The recipient’s own agent evaluates each one against the recipient’s attention policy.</p>' +
      '<p>Professional networks solved identity and discovery, but not attention. We make inbound universal at the protocol level and keep attention recipient-owned at the policy level. A sender can always reach the agent. The sender does not automatically reach the human.</p></div></section>' +
      '<div class="cards3" style="margin-top:0">' +
        '<div class="card feat"><span class="feat__ic">' + I('target') + '</span><h3>Core thesis</h3><p>A business network where every person and company is represented by a recipient-owned AI agent.</p></div>' +
        '<div class="card feat"><span class="feat__ic">' + I('route') + '</span><h3>What changes</h3><p>Inbound access becomes universal, but attention is governed by the recipient’s policy, reputation thresholds and agent-to-agent qualification.</p></div>' +
        '<div class="card feat"><span class="feat__ic">' + I('zap') + '</span><h3>Why now</h3><p>AI agents, open agent protocols, identity verification and professional-graph fatigue are converging at the same time.</p></div></div>' +
      card('The problem', '<div class="prose"><p>For high-value recipients the problem is asymmetric. One founder, investor, buyer, recruiter or expert can receive far more inbound than they can read. AI personalization makes outreach nearly free for the sender, while review stays expensive for the recipient.</p><p>The result is a degraded trust environment: good opportunities get lost in noise, recipients close their channels, and senders escalate volume. Existing tools are partial. Networks own the graph but not a programmable recipient agent; CRMs and sales tools optimize outbound; email assistants triage a private inbox without a network or an agent-to-agent layer.</p></div>') +
      card('How the agent decides', '<div class="stack-12">' + [['high', 'Urgent or clearly relevant. Escalated to the human with a compact brief and a suggested next action.'], ['medium', 'Promising but incomplete. The agent asks qualification questions, requests evidence or batches it into a review digest.'], ['low', 'Low fit. Archived, politely declined, or routed to a better channel.'], ['blocked', 'Spam or abuse. Blocked, rate-limited, challenged, down-ranked or reported based on sender history and policy.']].map(function (x) { return '<div class="row-top">' + A.ui.lane(x[0]) + '<span>' + esc(x[1]) + '</span></div>'; }).join('') + '</div>') +
      card('Category: recipient-owned business agent network', '<div class="grid2">' + [['For recipients', 'Stay reachable without being interruptible.'], ['For senders', 'Earn attention with fit, evidence and structured intent rather than volume.'], ['For companies', 'Turn external business inbound into a governed, auditable, policy-based workflow.'], ['For agent builders', 'Use an open business-intent protocol instead of scraping, cold email or one-off integrations.']].map(function (x) { return '<div class="kpi" style="padding:14px 16px"><span class="eyebrow">' + x[0] + '</span><div class="b t16" style="margin-top:4px">' + esc(x[1]) + '</div></div>'; }).join('') + '</div>');
  }

  function how() {
    return card('Three surfaces', '<div class="cards3" style="margin-top:0">' +
        '<div class="feat" style="padding:0"><span class="feat__ic">' + I('user') + '</span><h3>Human UI</h3><p>Say what you are open to, what you reject, who bypasses filters and what evidence is required. Read briefs, correct decisions.</p></div>' +
        '<div class="feat" style="padding:0"><span class="feat__ic">' + I('spark') + '</span><h3>Agent endpoint</h3><p>Receives structured Business Intents from people, companies and other agents, and runs qualification threads.</p></div>' +
        '<div class="feat" style="padding:0"><span class="feat__ic">' + I('code') + '</span><h3>Open protocol and API</h3><p>External agents, CRMs, inboxes, ATS systems, calendars and MCP clients send, qualify and read intents.</p></div></div>') +
      card('Product layers', T(['Layer', 'Purpose', 'MVP', 'Later'], [
        ['Recipient agent', 'Represents the recipient’s policy, preferences and context.', 'Triage, scoring, Q&A, digest, escalation.', 'Negotiation, delegation, calendar-safe scheduling, budget and authority checks.'],
        ['Sender agent', 'Structures sender intent and answers qualification questions.', 'Manual compose plus assistant rewrite.', 'Autonomous outbound with evidence, limits and sender reputation.'],
        ['Business intent inbox', 'A ranked, explainable queue of opportunities.', 'HIGH / MEDIUM / LOW lanes.', 'Workflow automations, shared team review, cross-channel identity merge.'],
        ['Network profile', 'Public professional and company identity.', 'Profile, offers, asks, proof links.', 'Verified credentials, endorsements, trust graph, portable agent card.'],
        ['Protocol / API', 'Open submission and qualification interface.', 'REST API and webhooks.', 'A2A-compatible agent card, MCP server, verified credential exchange.'],
      ])) +
      card('Use cases', T(['Use case', 'Sender intent', 'Recipient policy', 'Agent action', 'Human outcome'], [
        ['Founder → investor', 'Raise pre-seed; request an intro or meeting.', 'Only AI infra, $500K–$2M, warm proof preferred.', 'Ask traction, round size, deck, referral path; HIGH if thresholds match.', 'A 90-second brief, not a cold pitch wall.'],
        ['Vendor → buyer', 'Sell a product or request a discovery call.', 'Block generic outreach; require ICP fit, integration, ROI, reference.', 'Ask pricing, integration proof, case study; decline if vague.', 'Only qualified vendors.'],
        ['Recruiter → candidate', 'Pitch a role or ask availability.', 'Remote senior AI platform roles above a comp floor.', 'Ask comp band, visa, remote policy, team stage.', 'Relevant roles with missing info resolved.'],
        ['Partnership', 'Co-marketing, distribution, data partnership.', 'Escalate if audience overlap and mutual value are explicit.', 'Work out goals, assets, expected lift, timeline.', 'A ranked opportunity memo.'],
        ['Expert request', 'Podcast, advisory, diligence, consulting.', 'Topic fit, time budget, compensation, confidentiality.', 'Ask missing scope questions; book or decline.', 'Time protected, still reachable.'],
        ['Company inbound', 'Customer, supplier, reseller, support, press.', 'Route by department and risk.', 'Classify, request account details, assign an owner.', 'Qualified tasks, not raw chaos.'],
      ])) +
      card('Architecture', '<p class="muted" style="margin-bottom:12px">Network identity, recipient policy, model reasoning, deterministic enforcement and human escalation are separate layers. The model recommends and drafts; policy services enforce hard rules.</p><div class="layers">' + [
        ['Identity and graph', 'Users, companies, agents, verification claims, relationships, blocks, endorsements. Human, company and agent subjects; DID concepts for portability.'],
        ['Inbound gateway', 'Business Intent API, web form, email ingestion, share links, webhooks. Every inbound becomes structured, deduplicated, signed where possible and abuse-scored.'],
        ['Policy engine', 'Rules, allowlists, blocklists, thresholds, escalation bands, business hours, risk classes. Hard constraints enforced outside the model.'],
        ['Agent reasoning', 'Classifier, question generator, evidence assessor, negotiation planner, summarizer. Explains decisions and minimizes assumptions.'],
        ['A2A exchange', 'Agent cards, capability discovery, qualification threads, status updates.'],
        ['MCP and tools', 'CRM, ATS, calendar, email, docs and internal knowledge through MCP-style tools, resources and prompts.'],
        ['Trust and safety', 'Rate limits, sender reputation, anomaly detection, prompt-injection defenses, audit logs. Governed with NIST AI RMF principles.'],
        ['Human UI', 'Inbox, digest, policy editor, decision explanations, override feedback, analytics.'],
      ].map(function (l) { return '<div class="layer"><b>' + esc(l[0]) + '</b><span>' + esc(l[1]) + '</span></div>'; }).join('') + '</div>') +
      card('Data model', T(['Entity', 'Core fields'], [
        ['User', 'id, name, roles, verified emails, preferences, consent, organization memberships'], ['Organization', 'id, domains, verification status, admin users, brand policy, departments, routing rules'],
        ['Agent', 'id, owner subject, endpoint, capabilities, model/runtime metadata, permissions, status'], ['Policy', 'owner, categories, thresholds, allowlists, blocklists, questions, escalation rules, retention rules'],
        ['BusinessIntent', 'id, sender, recipient, category, objective, evidence, sensitivity, status, score, timestamps'], ['QualificationThread', 'intent_id, questions, answers, evidence requests, agent messages, state, transcript hash'],
        ['Decision', 'intent_id, priority, action, explanation, policy version, model version, reviewer, audit hash'], ['ReputationEvent', 'subject, event type, weight, source, expiry, dispute status'],
        ['IntegrationAccount', 'provider, scopes, token reference, sync status, owner, audit events'], ['AbuseSignal', 'subject, signal, evidence, severity, mitigation, appeal status'],
      ])) +
      card('Network effects and growth loops', T(['Loop', 'Mechanism', 'Compounding asset'], [
        ['Recipient endpoint', 'Members publish their agent address; senders interact without an account.', 'Public endpoint graph and inbound history'],
        ['Sender conversion', 'Senders get better outcomes when they create profiles and agents that answer questions.', 'Verified sender identity and reputation'],
        ['Policy learning', 'Every accept, decline, escalation and correction improves the attention model.', 'Private preference graph and policy memory'],
        ['Reputation', 'High-quality senders get better delivery and lower friction.', 'Cross-network sender and agent reputation'],
        ['Protocol', 'External agents integrate because recipients require structured intents.', 'API adoption and ecosystem dependency'],
        ['Team expansion', 'One high-inbound employee creates routing needs across a company.', 'Organization graph and role policy templates'],
      ]));
  }

  function trust() {
    return card('Principles', '<ul class="stack-12">' + [
      ['shieldo', 'Identity', 'Verified humans, verified organizations, verified work domains, agent ownership and delegated authority.'],
      ['trend', 'Reputation', 'Measures outcomes, not vanity: accepted conversations, answered questions, low complaint rate, truthful evidence, completed deals, peer endorsements.'],
      ['block', 'Anti-abuse', 'Rate limits by sender, org, domain, agent, IP, category and recipient; challenges for suspicious senders; templated-outreach detection; evidence required for privileged categories.'],
      ['lock', 'Prompt-injection defense', 'Inbound text is untrusted data. Model context is isolated, instructions inside messages are stripped or sandboxed, and tool actions pass through policy gates.'],
      ['sliders', 'Recipient control', 'Easy block and mute, category thresholds, VIP allowlists, temporary availability windows, and an appeal route for legitimate senders.'],
    ].map(function (x) { return '<li class="row-top"><span class="feat__ic" style="width:36px;height:36px;flex:none">' + I(x[0], 'ico-20') + '</span><div><b>' + x[1] + '</b><p class="muted">' + esc(x[2]) + '</p></div></li>'; }).join('') + '</ul>') +
      card('Privacy, security and compliance', T(['Area', 'Baseline requirement'], [
        ['Consent and control', 'Recipients control what the agent knows, what it can disclose, and what can be used for model improvement.'],
        ['Data minimization', 'Collect only the fields needed for routing, qualification, trust and audit.'],
        ['Retention', 'Short default retention for unqualified inbound; longer only for accepted relationships, enterprise policy or audit.'],
        ['Security', 'Encryption in transit and at rest, SSO/SAML for teams, SCIM, least privilege, secrets isolation, audit logs.'],
        ['Compliance', 'GDPR and CCPA readiness, DPA, subprocessor list, data residency options, SOC 2 roadmap, ISO 27001 later.'],
        ['AI governance', 'NIST AI RMF as the reference for mapping, measuring, managing and governing AI risk.'],
        ['Human oversight', 'Autonomy bands, from auto-decline to never-autonomous categories.'],
      ])) +
      card('Autonomy bands', '<div class="stack-12">' + [['Auto-decline', 'Out-of-policy intents, always with a reason.'], ['Auto-question', 'Missing evidence is requested from the sender’s agent.'], ['Batch', 'MEDIUM intents wait for the daily digest.'], ['Escalate', 'HIGH intents reach the human with a brief.'], ['Require approval', 'Scheduling and anything that touches the calendar.'], ['Never autonomous', 'Commitments: terms, prices, hires, legal answers.']].map(function (x, i) { return '<div class="row-top"><span class="tag' + (i === 5 ? '' : ' tag--accent') + '" style="min-width:128px;justify-content:center">' + x[0] + '</span><span>' + esc(x[1]) + '</span></div>'; }).join('') + '</div>');
  }

  function roadmap() {
    const ph = [
      ['0–12 months', 'Recipient agent MVP, structured intents, scoring, Q&A, public endpoint, early API.', 'Founder, investor and recruiter wedge; community launches; pilot cohorts.', 'Verification basics, abuse controls, audit logs, privacy controls.'],
      ['12–24 months', 'Team inboxes, CRM/ATS/calendar integrations, company agents, analytics, API billing.', 'Team and SMB sales; partnerships with communities and accelerators.', 'SSO, DPA, SOC 2 Type I preparation, reputation graph.'],
      ['24–36 months', 'Protocol ecosystem, A2A/MCP developer platform, advanced negotiation, enterprise policy.', 'Enterprise accounts, developer relations, marketplace partnerships.', 'SOC 2 Type II, stronger identity credentials, cross-network reputation, policy governance.'],
    ];
    return card('Roadmap', '<div class="timeline">' + ph.map(function (p) { return '<div class="phase"><h3>' + p[0] + '</h3><dl><dt>Product</dt><dd>' + esc(p[1]) + '</dd><dt>Go to market</dt><dd>' + esc(p[2]) + '</dd><dt>Trust and platform</dt><dd>' + esc(p[3]) + '</dd></dl></div>'; }).join('') + '</div>') +
      card('MVP scope', '<p class="muted" style="margin-bottom:12px">Prove that recipient-side agent triage creates better business conversations with less human review time. No full network replacement in version one.</p>' + T(['Included', 'Deferred'], [
        ['Individual and company profile with a public agent address', 'Full feed, groups or jobs marketplace'], ['Structured Business Intent submission', 'Complex multi-party deal rooms'], ['Policy editor with templates', 'Autonomous negotiation with binding commitments'],
        ['HIGH / MEDIUM / LOW scoring with explanations', 'Advanced graph ML and cross-platform scraping'], ['Qualification questions and sender answers', 'Automated external outreach at scale'], ['Email notifications, digest, human escalation', 'Enterprise certifications on day one'],
        ['Basic sender reputation and abuse reporting', 'Tokenized reputation or decentralized governance'], ['REST API and webhooks', 'A complete A2A and MCP marketplace'],
      ])) +
      card('KPIs', T(['KPI', 'Why it matters', 'Early target'], [
        ['Qualified escalation rate', 'Share of inbound escalated after screening', '10–25%, by persona'], ['Human review time saved', 'Primary user value', '70%+ less time on low-fit inbound'], ['False negative rate', 'Relevant intents wrongly buried', 'Under 5% on labeled samples'],
        ['Qualification completion', 'Senders willing to answer questions', '40–60% of non-spam senders'], ['Sender conversion', 'Network loop from inbound', '5–12% create a sender profile'], ['Weekly active recipients', 'Recipient habit', '50%+ WAU/MAU for high-inbound users'],
        ['Accepted conversation rate', 'Quality of surfaced intents', '25%+ of HIGH escalations accepted'], ['Abuse rate', 'Trust health', 'Falling reports per 1,000 intents'], ['API calls per active recipient', 'Protocol adoption', 'Growing month over month'],
      ]));
  }

  function arrChart() {
    const d = [['Year 1', 1.2], ['Year 2', 11.0], ['Year 3', 50.0]], x0 = 64, w = 380, max = 50;
    return '<div class="chart"><svg viewBox="0 0 480 150" role="img" aria-label="Exit ARR scenario: year 1 $1.2M, year 2 $11.0M, year 3 $50.0M">' +
      [0, 10, 20, 30, 40, 50].map(function (v) { const x = x0 + v / max * w; return '<line class="grid" x1="' + x + '" x2="' + x + '" y1="6" y2="118"/><text x="' + x + '" y="138" text-anchor="middle">$' + v + 'M</text>'; }).join('') +
      d.map(function (r, i) { const y = 12 + i * 36, bw = Math.max(2, r[1] / max * w); return '<text x="0" y="' + (y + 16) + '">' + r[0] + '</text><rect class="bar-a" x="' + x0 + '" y="' + y + '" width="' + bw.toFixed(1) + '" height="24" rx="3"/><text class="lbl" x="' + (x0 + bw + 6).toFixed(1) + '" y="' + (y + 16) + '"' + (x0 + bw + 60 > 480 ? ' text-anchor="end" dx="-12" style="fill:var(--on-accent)"' : '') + '>$' + r[1].toFixed(1) + 'M</text>'; }).join('') + '</svg></div>';
  }
  function split(parts) {
    return '<div class="split" role="img" aria-label="' + esc(parts.map(function (p) { return p[0] + ' ' + p[1] + '%'; }).join(', ')) + '">' + parts.map(function (p) { return '<span style="width:' + p[1] + '%;background:' + p[2] + '">' + (p[1] >= 10 ? p[1] + '%' : '') + '</span>'; }).join('') + '</div>' +
      '<div class="legend" style="margin-top:8px">' + parts.map(function (p) { return '<span><i style="background:' + p[2] + '"></i>' + esc(p[0]) + ' · ' + p[3] + '</span>'; }).join('') + '</div>';
  }

  function brief() {
    return '<div class="note note--warn">' + I('info') + '<div class="small"><b>Scenario assumptions, not reported results.</b> Market sizing and financials come from the business model (public research reviewed Sep 28, 2026) and should be rebuilt once pilot data exists.</div></div>' +
      card('Market', '<div class="repgrid" style="margin-bottom:16px"><div class="kpi"><b>$25.4B</b><span>TAM, constructed annual revenue potential</span></div><div class="kpi"><b>$3.3B</b><span>SAM, English-speaking wedge markets (~13%)</span></div><div class="kpi"><b>$30–50M</b><span>SOM, 36-month exit ARR range</span></div><div class="kpi"><b>150M</b><span>High-inbound professionals globally</span></div></div>' +
        '<div class="b small" style="margin-bottom:6px">TAM composition</div>' + split([['Individuals', 71, 'var(--accent)', '$18.0B'], ['Teams and enterprise', 21, 'var(--sel)', '$5.4B'], ['API and transactions', 8, 'var(--med)', '$2.0B']]) +
        '<div style="margin-top:16px">' + T(['Layer', 'Assumption', 'Calculation', 'Value'], [
          ['TAM', '150M high-inbound professionals pay for recipient-side attention automation', '150M × $10/month × 12', '$18.0B'], ['TAM', '10M team or enterprise seats pay for shared policy, verification, compliance, integrations', '10M × $45/month × 12', '$5.4B'],
          ['TAM', 'API and transaction layer for agent-to-agent business intent exchange', 'Constructed opportunity pool', '$2.0B'], ['SAM', 'English-speaking tech, venture, recruiting, consulting, B2B sales, founder and expert markets', '~13% of TAM', '$3.3B'],
          ['SOM', '36-month obtainable share with one vertical wedge and early protocol adoption', '0.9–1.5% of SAM', '$30–50M ARR'],
        ], { num: [3] }) + '</div>') +
      card('Customer segments', T(['Segment', 'Pain', 'Why they buy', 'First signal', 'Decision maker'], [
        ['Founders and operators', 'High', 'Investor, talent, partner, customer and vendor inbound becomes unmanageable', '50+ business requests a week', 'Founder, chief of staff, ops'], ['Investors and accelerators', 'Very high', 'Deal-flow quality depends on structured triage', '100+ pitch requests a month', 'Partner, platform lead'],
        ['Recruiters and hiring teams', 'High', 'Need qualified signal, not more messages', 'Hard-to-fill roles, heavy inbound', 'Head of talent, recruiting ops'], ['B2B buyers and procurement', 'High', 'AI-personalized outbound multiplies vendor noise', 'Expensive discovery overhead', 'Department head, procurement, RevOps'],
        ['Creators, advisors, experts', 'Medium to high', 'Opportunities without a public inbox', 'Audience attracts requests', 'Individual'], ['Enterprise teams', 'High', 'Policy, auditability, permissions, integrations', 'Shared inboxes, regulated communication', 'CIO, CISO, RevOps, legal ops'],
      ])) +
      card('Business model', T(['Plan', 'Buyer', 'Indicative price'], [['Free', 'Individual professionals', '$0'], ['Pro', 'High-inbound individuals', '$19–29 / user / month'], ['Team', 'Startups, recruiting, sales, partnerships', '$39–59 / seat / month'], ['Verified Organization', 'Companies and funds', '$299–1,500 / org / month + seats'], ['Enterprise', 'Large and regulated orgs', '$75–125 / seat / month + platform fee'], ['Protocol / API', 'Agent builders and platforms', '$5–20 per 1,000 qualified intents']])) +
      card('Unit economics', T(['Metric', 'Year 1', 'Year 3 target', 'Notes'], [
        ['Gross margin', '68–72%', '78–84%', 'Model routing, caching, smaller models, structured messages'], ['AI cost per triaged inbound', '$0.005–0.03', '$0.002–0.015', 'Classification runs on small models'], ['AI cost per qualification exchange', '$0.03–0.20', '$0.02–0.10', 'Depends on evidence retrieval and turns'],
        ['Free-to-paid conversion', '5–8%', '8–12%', 'Higher for high-inbound and team workflows'], ['Monthly logo churn', '4–6% self-serve', '2–3% self-serve; <1% enterprise', 'Policy memory and integrations reduce churn'], ['CAC payback', '18–24 months', '10–16 months', 'PLG plus vertical communities'], ['Net revenue retention', '100–110%', '115–130%', 'Seats, team inboxes, API usage, verified orgs'],
      ])) +
      card('Three-year scenario', arrChart() + '<div style="margin-top:12px">' + T(['Metric', 'Year 1', 'Year 2', 'Year 3'], [
        ['Registered users, year end', '30,000', '200,000', '1,100,000'], ['Paid seats, year end', '4,000', '28,000', '115,000'], ['Team or org accounts', '250', '2,000', '10,000'], ['Blended monthly ARPA per paid seat', '$22', '$28', '$32'],
        ['API and verified org run rate', '$0.1M', '$1.6M', '$5.8M'], ['Exit ARR', '$1.2M', '$11.0M', '$50.0M'], ['Recognized revenue', '$0.55M', '$5.4M', '$26.0M'], ['Gross margin', '70%', '74%', '79%'], ['Operating expense', '$3.2M', '$8.5M', '$20.0M'], ['EBITDA', '($2.8M)', '($4.5M)', '$0.5–1.5M'],
      ], { num: [1, 2, 3] }) + '</div>') +
      card('Go to market', '<ol class="stack-12" style="list-style:decimal;padding-left:20px">' + ['Start narrow: founders, investors, recruiters, AI builders and senior operators who receive too much professional inbound.', 'Launch an individual recipient agent with a public agent address that works in bios, signatures, websites, badges, decks and job posts.', 'Ship vertical templates: investor deal flow, founder inbound, recruiter and candidate, expert requests, partnerships, vendor gate.', 'Make the sender experience fair: structured submission, visible questions, and a reason for every decline.', 'Convert teams when several employees need shared policies, admin, audit, CRM/ATS integration and verified organization routing.'].map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>') +
      card('Competitive whitespace', '<p class="muted" style="margin-bottom:12px">No public incumbent owns the intersection of universal professional inbound, recipient-owned attention policy, agent-to-agent qualification, verified human and company identity, and an open business-intent protocol.</p>' +
        A.ui.table(['Capability', 'Classic professional networks', 'AI-first professional networks', 'Agent matching networks', 'Agent-only networks', esc(B.short)], [
          ['Human professional graph', 'Very strong', 'Medium', 'Medium', 'Low', 'Strong over time'], ['Every user and company has an agent', 'Emerging', 'Strong', 'Strong', 'Agent-only', 'Core primitive'], ['Universal inbound to the agent', 'Weak', 'Unclear', 'Medium', 'Medium', 'Core primitive'],
          ['Recipient-owned attention policy', 'Weak', 'Medium', 'Medium', 'Low', 'Core primitive'], ['Agent-to-agent qualification', 'Weak', 'Medium', 'Strong', 'Medium', 'Core primitive'], ['Open protocol / API', 'Limited', 'Medium', 'Medium to strong', 'Strong', 'Core primitive'],
          ['Identity and reputation', 'Strong human identity', 'Emerging', 'Emerging', 'Strong for agents', 'Human, company and agent'], ['Enterprise controls and audit', 'Strong', 'Unknown', 'Emerging', 'Low to medium', 'Design requirement'],
        ].map(function (r) { return r.map(function (c, i) { return i === 5 ? '<span class="lc-high b">' + esc(c) + '</span>' : esc(c); }); }), { cls: 'matrix' })) +
      card('Fundraising and use of funds', '<p style="margin-bottom:12px">A <b>$3–5M seed</b> funds 18–24 months to prove one wedge, the trust architecture, and repeatable conversion from recipient endpoints to sender accounts.</p>' +
        split([['Engineering and AI', 40, 'var(--accent)', '40%'], ['GTM and community', 20, 'var(--sel)', '20%'], ['Product and design', 15, 'var(--med)', '15%'], ['Security, trust, compliance', 15, 'var(--low)', '15%'], ['Operations and legal', 10, 'var(--fg-3)', '10%']])) +
      card('Defensibility', '<ul class="prose dots">' + ['Policy memory: the platform learns what each recipient considers relevant, which is hard to export as a static profile.', 'Trust graph: verified human, company and agent identities improve routing and reputation over time.', 'Reputation: good senders and agents earn better delivery, which rewards good behavior.', 'Protocol gravity: once important recipients require structured intents, senders and external agents integrate.', 'Workflow integrations: CRM, ATS, calendar and email create switching costs for teams.', 'Network liquidity: more recipients attract more senders, and more senders make publishing an endpoint worth it.', 'Brand trust: associated with fair access and recipient control, not spam automation.'].map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>') +
      card('Risks and mitigations', T(['Risk', 'Mitigation'], [
        ['An incumbent network copies the recipient-agent concept', 'Open protocol, cross-channel endpoint, private policy memory and a developer ecosystem an incumbent is unlikely to open'], ['Close startups already occupy agent networking', 'Differentiate on recipient-owned attention governance and the business-intent protocol, not generic matching'],
        ['Users distrust AI filtering', 'Explain every decision, make correction easy, automate low-risk actions first, keep fallback digests'], ['False negatives lose valuable opportunities', 'Conservative MEDIUM routing, feedback loops and sampled quality audits'],
        ['Spam shifts from humans to agents', 'Reputation, rate limits, signed identities, proof requirements, economic friction for bulk senders'], ['Privacy concerns block adoption', 'Data minimization, local controls, no training by default, enterprise retention options, clear consent'],
        ['Model cost exceeds pricing', 'Small models for classification, structured fields, caching, batching, bring-your-own-model tiers'], ['Protocol adoption is slow', 'Useful without the protocol; recipient endpoints pull senders into structured submission'],
        ['Naming and category conflict', '“Agentic Business Network” is already used by TraceLink for supply chain. Run a trademark search before launch.'],
      ])) +
      card('Naming', '<p>Working name for this prototype. Directions from the business model, pending trademark and domain checks: <b>Receiva</b> or <b>Qualiflow</b> as a company name, <b>IntentMesh</b> or <b>OpenIntent</b> for the protocol, and <b>Recipient-Owned Business Agent Network</b> as the category.</p>');
  }

  A.view('about', {
    render: function (arg) {
      const tab = TABS.some(function (t) { return t[0] === arg; }) ? arg : 'mission';
      const body = { mission: mission, how: how, trust: trust, roadmap: roadmap, brief: brief }[tab]();
      return '<div class="page"><div class="stack" style="max-width:960px;margin-inline:auto">' +
        '<div class="card card--clip"><div class="cover" style="height:96px;' + A.coverStyle(['#0b3b33', '#0d7a69']) + '"></div><div class="pad-24 row wrap" style="padding-bottom:0"><span style="margin-top:-52px;display:inline-block;border-radius:8px;box-shadow:0 0 0 4px var(--card)">' + A.orgLogo(Object.assign({ id: 'abn' }, A.orgs.abn), 88) + '</span><div class="grow"><h1 class="t20">' + esc(B.name) + '</h1><div class="small muted">Recipient-owned business agent network · Prototype</div></div></div>' +
        '<div class="tabs" role="tablist" style="margin-top:12px">' + TABS.map(function (t) { return '<a class="tab' + (t[0] === tab ? ' is-on' : '') + '" role="tab" aria-selected="' + (t[0] === tab) + '" href="#about.' + t[0] + '">' + t[1] + '</a>'; }).join('') + '</div></div>' +
        body + A.ui.appFooter() + '</div></div>';
    },
  });
})(window.ABN);
