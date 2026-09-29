/* Developer docs: Business Intent Protocol, REST, webhooks, MCP, A2A, sandbox */
(function (A) {
  const esc = A.esc, I = A.icon, E = A.Engine, B = A.brand;
  let lang = 'curl';
  const ADDR = 'maya.okafor@' + B.ns;
  const SECS = [['overview', 'Overview'], ['format', 'Business Intent format'], ['actions', 'Protocol actions'], ['rest', 'REST API'], ['quickstart', 'Quickstart'], ['webhooks', 'Webhooks'], ['mcp', 'MCP server'], ['a2a', 'A2A agent card'], ['limits', 'Rate limits and reputation'], ['security', 'Security model'], ['sandbox', 'Sandbox']];

  const INTENT = {
    business_intent_version: B.pv,
    intent_id: 'bi_01K8Z3Q9V4',
    sender: { subject_type: 'person|company|agent', display_name: 'Daniel Kovač', verified_claims: ['work_email', 'company_domain', 'identity'], reputation: { network_score: 86, recent_abuse_flags: 0 } },
    recipient: { agent_address: ADDR, target_role: 'founder|investor|buyer|candidate|partner|expert' },
    intent: { category: 'fundraising|sales|recruiting|partnership|advisory|support|press|intro|other', objective: 'Request a 20-minute meeting about a $1.5M pre-seed round', value_proposition: 'Cuts GPU serving cost 38% for mid-size AI teams', urgency: 'low|normal|time_sensitive', requested_action: 'reply|meet|intro|review|quote' },
    fit_evidence: [{ type: 'profile_overlap', value: 'AI infrastructure founder' }, { type: 'proof_link', url: 'https://example.com/benchmark' }, { type: 'metric', name: 'MRR', value: '$45K' }],
    qualification_state: { questions_answered: 1, open_questions: ['Who leads the round?'], sender_agent_can_answer: true },
    privacy: { sensitivity: 'public|confidential|restricted', retention_preference: '30d|1y|org_policy', training_allowed: false },
  };
  const CARD = {
    name: 'Maya Okafor’s agent',
    description: 'Recipient agent for Maya Okafor, General Partner at Tidewell Ventures.',
    url: B.api.replace('/v1', '') + '/a2a/maya.okafor',
    version: B.pv,
    capabilities: { streaming: true, pushNotifications: true },
    skills: [{ id: 'submit_intent', name: 'Receive a Business Intent', tags: ['fundraising', 'partnership', 'intro'] }, { id: 'answer_question', name: 'Qualification thread' }],
    authentication: { schemes: ['bearer'] },
    'x-agentic': { owner: 'person:maya-okafor', verified_claims: ['identity', 'work_email', 'company_domain', 'org'], policy: 'public-summary' },
  };
  const SANDBOX = {
    business_intent_version: B.pv,
    sender: { subject_type: 'person', display_name: 'Lucas Moreau', verified_claims: ['work_email'], reputation: { network_score: 70, recent_abuse_flags: 0 } },
    recipient: { agent_address: ADDR, target_role: 'investor' },
    intent: { category: 'fundraising', objective: 'Request a meeting about Driftline’s $800K pre-seed', value_proposition: 'Small language models on edge devices for field technicians', urgency: 'normal', requested_action: 'meet', topics: ['Inference', 'Edge AI'], stage: 'Pre-seed', round_size_usd: 800000 },
    fit_evidence: [{ type: 'round', value: '$800K pre-seed, raising from angels' }],
    privacy: { sensitivity: 'confidential', retention_preference: '30d', training_allowed: false },
  };
  const CODE = {
    curl: 'curl ' + B.api + '/intents \\\n  -H "Authorization: Bearer $AGENTIC_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "recipient": { "agent_address": "' + ADDR + '" },\n    "intent": {\n      "category": "fundraising",\n      "objective": "20-minute meeting about a $1.5M pre-seed",\n      "requested_action": "meet"\n    },\n    "fit_evidence": [{ "type": "metric", "name": "MRR", "value": "$45K" }]\n  }\'',
    js: 'const res = await fetch("' + B.api + '/intents", {\n  method: "POST",\n  headers: {\n    Authorization: `Bearer ${process.env.AGENTIC_API_KEY}`,\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify({\n    recipient: { agent_address: "' + ADDR + '" },\n    intent: {\n      category: "fundraising",\n      objective: "20-minute meeting about a $1.5M pre-seed",\n      requested_action: "meet",\n    },\n    fit_evidence: [{ type: "metric", name: "MRR", value: "$45K" }],\n  }),\n});\nconst { intent_id, status, open_questions } = await res.json();',
    py: 'import os, requests\n\nr = requests.post(\n    "' + B.api + '/intents",\n    headers={"Authorization": f"Bearer {os.environ[\'AGENTIC_API_KEY\']}"},\n    json={\n        "recipient": {"agent_address": "' + ADDR + '"},\n        "intent": {\n            "category": "fundraising",\n            "objective": "20-minute meeting about a $1.5M pre-seed",\n            "requested_action": "meet",\n        },\n        "fit_evidence": [{"type": "metric", "name": "MRR", "value": "$45K"}],\n    },\n)\nprint(r.json()["status"], r.json()["open_questions"])',
  };

  function code(o) { return '<pre class="code">' + A.ui.json(o) + '</pre>'; }
  function sec(id, title, body) { return '<section class="card pad-24" id="doc-' + id + '"><div class="doc"><h2>' + title + '</h2>' + body + '</div></section>'; }
  function mapType(e) { if (A.EVID[e.type]) return e.type; return { metric: 'traction', proof_link: 'deck', profile_overlap: 'context' }[e.type] || 'context'; }
  function runSandbox() {
    const out = document.getElementById('sbx-out'), ta = document.getElementById('sbx-in');
    let j;
    try { j = JSON.parse(ta.value); } catch (err) { out.innerHTML = '<div class="note note--bad">' + I('warn') + '<div class="small"><b>400 Bad Request.</b> The body is not valid JSON: ' + esc(err.message) + '</div></div>'; return; }
    const it = j.intent || {}, s = j.sender || {}, rep = s.reputation || {};
    const intent = {
      id: 'sandbox', category: A.CATS[it.category] ? it.category : 'other', objective: it.objective || '', value: it.value_proposition || '', action: it.requested_action || 'reply', urgency: it.urgency || 'normal',
      tags: it.topics || [], stage: it.stage || null, amount: it.round_size_usd || null, evidence: (j.fit_evidence || []).map(function (e) { return { type: mapType(e), value: e.value || e.url || e.name || '' }; }),
      text: [it.objective, it.value_proposition, j.message].join(' '), valueScore: 0.6,
    };
    intent.generic = E.parseText(intent.text).intent.generic;
    const sender = { name: s.display_name || 'Sender', rep: rep.network_score == null ? 50 : rep.network_score, verified: s.verified_claims || [], abuse: rep.recent_abuse_flags || 0, mutuals: 0 };
    const r = E.evaluate(intent, A.S.policy, sender);
    const status = { high: 'delivered', medium: r.questions.length ? 'qualifying' : 'queued_for_digest', low: 'declined', declined: 'declined', blocked: 'rejected' }[r.lane];
    const res = {
      intent_id: 'bi_sbx_' + Math.random().toString(36).slice(2, 10), status: status,
      sender_view: { status: status, open_questions: r.lane === 'medium' ? r.questions.map(function (q, i) { return { id: 'q_' + (i + 1), type: q.type, text: q.q }; }) : [], decline_reason: r.lane === 'low' || r.lane === 'declined' || r.lane === 'blocked' ? r.why : null },
      recipient_view: { lane: E.LABEL[r.lane].toUpperCase(), priority_score: r.score, explanation: r.why, reasons: r.reasons.map(function (x) { return x[1]; }), penalties: r.pens.map(function (p) { return { reason: p[0], points: -p[1] }; }), policy_version: A.S.policy.version },
    };
    out.innerHTML = '<div class="row wrap" style="margin-bottom:8px"><span class="tag tag--accent mono">201 Created</span>' + A.ui.lane(r.lane) + '<span class="small muted">Scored against Maya’s live policy (v' + A.S.policy.version + ')</span></div>' + code(res);
  }

  A.view('developers', {
    render: function () {
      return '<div class="page"><div class="docs">' +
        '<aside class="hide-md"><nav class="card docnav sticky" style="padding-block:8px" aria-label="Docs">' + SECS.map(function (s) { return '<a href="#developers.' + s[0] + '">' + s[1] + '</a>'; }).join('') + '</nav></aside>' +
        '<div class="main">' +
        sec('overview', esc(B.protocol) + ' <span class="tag tag--accent" style="vertical-align:middle">Draft v' + B.pv + '</span>',
          '<p>Send business intents to any agent address and read the decision. The protocol treats business communication as structured intent plus evidence, not a plain-text message: agents inspect, challenge and update typed fields before any human attention is spent.</p>' +
          '<dl class="kv"><dt>Base URL</dt><dd class="mono">' + esc(B.api) + '</dd><dt>Auth</dt><dd><span class="mono">Authorization: Bearer &lt;API key&gt;</span></dd><dt>Formats</dt><dd>JSON over HTTPS · webhooks · MCP · A2A agent cards</dd><dt>Status</dt><dd>Request for comments. Field names may change before v1.</dd></dl>' +
          '<div class="note">' + I('info') + '<div class="small">Senders see status, questions and decline reasons. The lane and priority score stay private to the recipient.</div></div>') +
        sec('format', 'Business Intent format', '<p>Routing depends on typed fields that agents can inspect. Free text can be attached, but it is always treated as untrusted data.</p>' + code(INTENT)) +
        sec('actions', 'Protocol actions', A.ui.table(['Action', 'Called by', 'What it does'], [
          ['submit_intent', 'Sender agent', 'Creates a Business Intent for an agent address.'],
          ['ask_qualification_question', 'Recipient agent', 'Asks for one missing fact; the thread stays open.'],
          ['answer_question', 'Sender agent', 'Answers an open question, optionally with evidence.'],
          ['request_evidence', 'Recipient agent', 'Asks for a specific proof: a link, a metric or a reference.'],
          ['revise_intent', 'Sender agent', 'Updates fields after feedback and keeps the history.'],
          ['decline_with_reason', 'Recipient agent', 'Closes the intent with a reason and an optional better route.'],
          ['escalate_to_human', 'Recipient agent', 'Sends a brief to the human. Nothing leaves the policy boundary.'],
          ['schedule_safe', 'Recipient agent', 'Proposes slots inside availability windows; needs approval by default.'],
          ['report_abuse', 'Either agent', 'Flags injection, spam or deception. Affects reputation network-wide.'],
          ['update_reputation', 'Network', 'Records an outcome event with weight, source and expiry.'],
        ].map(function (r) { return ['<span class="mono">' + r[0] + '</span>', esc(r[1]), esc(r[2])]; })) + '<p class="small muted">Agents sign every material action (Ed25519) and keep an auditable thread with a transcript hash.</p>') +
        sec('rest', 'REST API', A.ui.table(['Method', 'Path', 'Purpose'], [
          ['POST', '/v1/intents', 'Submit an intent'], ['GET', '/v1/intents/{id}', 'Read status and open questions'], ['POST', '/v1/intents/{id}/answers', 'Answer qualification questions'],
          ['POST', '/v1/intents/{id}/evidence', 'Attach evidence'], ['POST', '/v1/intents/{id}/revise', 'Revise an intent'], ['GET', '/v1/agents/{address}/card', 'Fetch a public agent card'],
          ['GET', '/v1/reputation/{subject}', 'Read a public reputation summary'], ['POST', '/v1/abuse-reports', 'Report abuse'], ['POST', '/v1/webhooks', 'Register a webhook endpoint'],
        ].map(function (r) { return ['<span class="method method--' + r[0].toLowerCase() + '">' + r[0] + '</span>', '<span class="mono">' + r[1] + '</span>', esc(r[2])]; }))) +
        sec('quickstart', 'Quickstart', '<div class="codetabs" role="tablist">' + [['curl', 'cURL'], ['js', 'JavaScript'], ['py', 'Python']].map(function (t) { return '<button class="pill' + (lang === t[0] ? ' is-on' : '') + '" role="tab" aria-selected="' + (lang === t[0]) + '" data-act="doc-lang" data-k="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div><pre class="code" id="doc-code">' + esc(CODE[lang]) + '</pre>' +
          '<h3>Response</h3>' + code({ intent_id: 'bi_01K8Z3Q9V4', status: 'qualifying', open_questions: [{ id: 'q_1', type: 'deck', text: 'Can you share a deck or a one-page memo?' }], next_poll_after_s: 30 })) +
        sec('webhooks', 'Webhooks', '<p>Register an HTTPS endpoint to receive events. Every delivery carries an <span class="mono">Agentic-Signature</span> header (HMAC-SHA256 over the timestamp and body).</p>' +
          A.ui.table(['Event', 'When it fires'], [['intent.received', 'A new intent reached your agent'], ['intent.scored', 'The agent assigned a lane'], ['qualification.requested', 'Your agent asked the sender a question'], ['qualification.answered', 'The sender answered'], ['intent.escalated', 'A brief was sent to the human'], ['intent.declined', 'Declined with a reason'], ['intent.scheduled', 'A meeting slot was proposed or confirmed'], ['abuse.reported', 'Abuse was reported by or about you']].map(function (r) { return ['<span class="mono">' + r[0] + '</span>', esc(r[1])]; })) +
          code({ id: 'evt_7Qm2', type: 'intent.escalated', created: '2026-09-29T07:02:11Z', data: { intent_id: 'bi-101', lane: 'HIGH', priority_score: 87, brief_url: B.api + '/intents/bi-101/brief' } })) +
        sec('mcp', 'MCP server', '<p>AI clients can use the network through a Model Context Protocol server. The MVP exposes three tools; policy resources and agent cards follow.</p>' +
          A.ui.table(['Kind', 'Name', 'Description'], [['Tool', 'submit_intent', 'Submit a Business Intent to an agent address'], ['Tool', 'read_status', 'Read status and open questions for an intent'], ['Tool', 'answer_question', 'Answer a qualification question'], ['Resource', 'policy://{address}/public', 'Public summary of a recipient’s policy'], ['Resource', 'agent-card://{address}', 'The recipient’s agent card'], ['Prompt', 'draft_intent', 'Turn a free-text request into a structured intent']].map(function (r) { return [esc(r[0]), '<span class="mono">' + esc(r[1]) + '</span>', esc(r[2])]; })) +
          code({ mcpServers: { agentic: { url: 'https://mcp.agentic.example/v1', headers: { Authorization: 'Bearer <API key>' } } } })) +
        sec('a2a', 'A2A agent card', '<p>Every agent address publishes a discoverable card so other agents know what it accepts and how to authenticate.</p>' + code(CARD)) +
        sec('limits', 'Rate limits and reputation', A.ui.table(['Sender', 'Daily limit', 'Per recipient'], [['Unverified', '20 intents', '3 per week'], ['Verified person', '200 intents', '5 per week'], ['Verified organization', '5,000 intents', 'Set by each recipient’s policy'], ['API partner', 'Custom', 'Reputation-weighted']].map(function (r) { return r.map(esc); })) +
          '<p>High-reputation senders get higher limits and fewer questions. Abuse reports, templated outreach and injection attempts lower reputation across the network.</p>') +
        sec('security', 'Security model', '<ul class="dots"><li>Inbound text is untrusted data. It is isolated from the agent’s instructions and never executed.</li><li>Hard rules (closed categories, blocklists, VIPs, thresholds) are enforced by a deterministic policy service outside the model.</li><li>Tool actions such as scheduling pass through policy gates and, by default, human approval.</li><li>Material actions are signed; threads keep a transcript hash for audit.</li><li>Unqualified inbound is deleted after 30 days by default; training on customer data is opt-in.</li></ul>') +
        sec('sandbox', 'Sandbox', '<p>Edit the request and send it. The sandbox runs the same scoring engine as the product against Maya Okafor’s live policy, in your browser.</p>' +
          '<label class="label" for="sbx-in">POST /v1/intents</label><textarea class="textarea mono" id="sbx-in" rows="18" spellcheck="false">' + esc(JSON.stringify(SANDBOX, null, 2)) + '</textarea>' +
          '<div class="row wrap"><button class="btn btn--primary" data-act="sbx-run">' + I('sendo', 'ico-20') + 'Send request</button><button class="btn btn--tertiary" data-act="sbx-reset">Reset</button></div><div id="sbx-out"></div>') +
        '</div></div></div>';
    },
    mount: function (arg) {
      runSandbox();
      if (arg) { const el = document.getElementById('doc-' + arg); if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70); }
    },
  });
  A.act['doc-lang'] = function (el) {
    lang = el.dataset.k;
    el.parentNode.querySelectorAll('.pill').forEach(function (p) { const on = p === el; p.classList.toggle('is-on', on); p.setAttribute('aria-selected', String(on)); });
    document.getElementById('doc-code').textContent = CODE[lang];
  };
  A.act['sbx-run'] = function () { runSandbox(); };
  A.act['sbx-reset'] = function () { document.getElementById('sbx-in').value = JSON.stringify(SANDBOX, null, 2); runSandbox(); };
})(window.ABN);
