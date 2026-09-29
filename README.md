# Agentic Business Network — prototype site

Web prototype for the *Agentic Business Network* business model: a professional
network where every person and company is represented by a recipient-owned AI agent.
All people, companies and numbers are fictional demo data.

**Live:** https://srdjan-ethernal.github.io/AgenticBusinessNetwork/

## What's inside

| Route | Screen |
|---|---|
| `#welcome` | Logged-out landing with a live triage demo (paste a message, the agent scores it) |
| `#signin`, `#join` | Demo sign-in (no password) and "create your agent" with policy templates |
| `#feed` | Home feed: profile rail, share box, agent morning brief, posts, poll, news, VIP suggestions |
| `#inbox` / `#inbox.<id>` | **Agent Inbox**: HIGH / MEDIUM / LOW / Declined / Blocked lanes, 90-second brief, score breakdown, agent-to-agent Q&A, actions (schedule, reply, delegate, decline with reason, report) |
| `#policy` | Attention policy editor with a live routing preview |
| `#in.<id>` | Member profile with agent card, reputation, experience |
| `#company.<id>` | Company page with company-agent routing by department |
| `#a.<id>` | Public agent page: what a sender sees (no account needed) |
| `#send.<id>` | Compose a Business Intent to another member with a live routing forecast |
| `#network`, `#notifications` | Agent-screened invitations, people you may know, agent notifications |
| `#pricing` | Plans from the business model (indicative pricing) |
| `#developers` | Business Intent Protocol docs: format, actions, REST, webhooks, MCP, A2A, sandbox |
| `#about.<tab>` | Mission, how it works, trust & safety, roadmap, investor brief |

Scoring follows the business model: `0.30 policy fit + 0.20 completeness + 0.15 reputation +
0.15 relationship + 0.10 value + 0.10 urgency − penalties`, with hard rules (blocked topics,
closed categories, VIP bypass, thesis cap, prompt-injection quarantine) enforced outside the score
(`js/engine.js`).

## Structure

```
index.html               full HTML document (local / GitHub Pages)
page.html                same page without <html>/<head>/<body> (Claude Artifact publish)
css/styles.css           design tokens, light + dark themes, responsive layout
js/icons.js              icon set, logo, avatars
js/data.js               brand, demo people, companies, intents, posts, templates, default policy
js/engine.js             policy evaluation, scoring, free-text parser
js/core.js               state (localStorage), hash router, global nav, toasts, modals
js/api.js                live mode: talks to the API when the page is served by it
js/views/*.js            one file per screen
src/Agentic.Api/         ASP.NET Core API (.NET 10)
tests/Agentic.Tests/     xUnit tests (engine parity, app API, protocol)
```

## Backend (Increment 1)

`src/Agentic.Api` is the real service behind the same UI:

- **Policy engine in C#** with exactly the scoring and hard rules of `js/engine.js`; parity with the
  web client is covered by tests for all 15 demo intents.
- **Business Intent Protocol v0.1** (snake_case JSON, no account needed):
  `POST /v1/intents`, `GET /v1/intents/{id}` and `POST /v1/intents/{id}/answers` (bearer = the
  `sender_token` returned on submit), `GET /v1/agents/{address}/card`.
  Senders see a status, open questions and a decline reason; the recipient's lane and score stay private.
- **App API** for the web client: `/api/bootstrap`, `PUT /api/policy`,
  `/api/intents/{id}/ask|action|lane`, `/api/session` (development sign-in as a seeded member).
- **SQLite** (`agentic.db`, created and seeded with the demo network on first run), an append-only
  audit log of every routing decision, abuse reports, and per-IP / per-member rate limiting.

```
dotnet run --project src/Agentic.Api     # http://localhost:5320, serves the web client in live mode
dotnet test                              # 38 tests
```

The same `index.html` runs in two modes: **live** when served by the API (data from the server,
development sign-in with any seeded member) and **demo** everywhere else (GitHub Pages, the artifact),
where everything stays in the browser. Delete `src/Agentic.Api/agentic.db` to reseed.

Next increments: email sign-in and real accounts, Postgres with migrations, Claude for briefs and
free-text intents, webhooks and digest emails, hosting.

## Run the static prototype only

Any static file server works, for example `npx serve .` in this folder. In Claude Code the `agentic`
launch configuration serves it on http://localhost:5321/ and `agentic-api` runs the API on 5320.

## Rename the brand

Change `A.brand` at the top of `js/data.js` (name, short name, agent-address namespace, API URL).
The business model recommends a distinct company name before launch (for example Receiva or
Qualiflow), because "Agentic Business Network" is already used by TraceLink for supply chain.
