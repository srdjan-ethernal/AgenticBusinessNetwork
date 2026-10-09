# Knockero

*Anyone can knock. Your agent decides who comes in.*

Knockero is a general business network: anyone can present their business (what they offer and what
they are looking for) and find customers, suppliers, partners, jobs, experts or investors. Every person
and company is represented by a recipient-owned AI agent. Senders "knock" with a structured Business Intent; the recipient's agent
screens it against the recipient's own policy and routes it. The name comes from *knock*.

- **Live service:** https://knockero.com
- **Static demo** (fictional data, everything stays in the browser): https://srdjan-ethernal.github.io/AgenticBusinessNetwork/

## What's inside

| Route | Screen |
|---|---|
| `#welcome` | Logged-out landing with a live triage demo (paste a message, the agent scores it) |
| `#signin`, `#join` | Sign in and "create your agent" with policy templates (demo: no password; live: real accounts) |
| `#feed` | Home feed: profile rail, share box, agent morning brief, posts, poll, news, VIP suggestions |
| `#inbox` / `#inbox.<id>` | **Agent Inbox**: HIGH / MEDIUM / LOW / Declined / Blocked lanes, 90-second brief, score breakdown, agent-to-agent Q&A, actions (schedule, reply, delegate, decline with reason, report) |
| `#policy` | Attention policy editor with a live routing preview |
| `#in.<id>` | Member profile with agent card, reputation, experience |
| `#company.<id>` | Company page with company-agent routing by department |
| `#a.<id>` | Public agent page: what a sender sees (no account needed) |
| `#send.<id>` | Compose a Business Intent to another member with a live routing forecast |
| `#network`, `#notifications` | Agent-screened invitations, people you may know, agent notifications |
| `#company.<id>` | Company page: what the company offers and looks for, its people, its agent address; admins manage it as the company |
| `#find` | Find people and businesses by what they offer, look for and do, plus "Matches for you" |
| `#contacts` | Import LinkedIn connections (data export .zip or Connections.csv) and invite them by email or personal link |
| `#invite.<code>`, `#optout.<code>` | The invited person: prefilled sign-up that connects both agents, or stop all invitations |
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

## Backend

`src/Agentic.Api` is the real service behind the same UI:

- **Policy engine in C#** with exactly the scoring and hard rules of `js/engine.js`; parity with the
  web client is covered by tests for all 15 demo intents.
- **Business Intent Protocol v0.1** (snake_case JSON, no account needed):
  `POST /v1/intents`, `GET /v1/intents/{id}` and `POST /v1/intents/{id}/answers` (bearer = the
  `sender_token` returned on submit), `GET /v1/agents/{address}/card`.
  Senders see a status, open questions and a decline reason; the recipient's lane and score stay private.
- **Accounts:** sign-up creates a member, an agent address (`name.surname@knockero`) and a policy from the
  chosen template; email + password sign-in (PBKDF2-SHA256, 600k iterations) or **Continue with Google** (sign-up and
  sign-in; a verified Google address links an existing account), profile editing,
  per-IP limits on sign-up and password attempts. With an access code set, sign-up is invite-only.
- **Email for accounts:** confirmation links (a confirmed company address adds the `work_email` claim that
  scoring uses), password reset by link (other sessions end), password change and "sign out everywhere"
  (a security stamp checked on every request), and a **daily digest** at the start of the owner's working
  hours in their time zone, including intents held for it, with a one-click off link. Screen: `#settings`.
- **Claude (optional, `ANTHROPIC_API_KEY`):** a background worker writes each inbox intent's brief, next step
  and reply draft with `claude-opus-5-5` (structured JSON output, server-side refusal fallback, daily
  budget, per-call cost log); `POST /v1/intents/parse` turns a sender's free text into intent fields. The
  deterministic engine still decides every lane and score, and declined or quarantined intents never
  reach the model. Without a key everything falls back to the rule-based brief.
- **Company pages:** `POST /api/companies` creates a page with its own agent (a member of kind `company`, same id
  as the organization): agent address, policy, inbox, profile. Admins (`/api/companies/{id}/admins`) act as the
  company with the `X-Act-As` header, honoured only for its inbox, policy, profile and searches. People link
  their profile with `worksAt`.
- **Business profiles and Find:** members list what they offer and what they are looking for, their industries
  and website. `GET /api/directory?q=&industry=` searches every profile; `GET /api/directory/matches` pairs
  what you need with what others offer (and the other way round).
- **LinkedIn import and invitations:** `POST /api/contacts/import` takes LinkedIn's data export (the
  .zip or `Connections.csv`), deduplicates by profile URL, and marks people who are already members.
  `POST /api/contacts/invite` queues one email per contact (one reminder at most, after a week; a daily
  limit per member; opt-outs are global and permanent); a background dispatcher sends them over SMTP
  (MailKit) with retries. Contacts without an email get a personal link to share by hand. Joining
  through an invitation uses up the code and makes both agents 1st-degree connections.
- **App API** for the web client: `/api/auth/signup|login`, `/api/bootstrap`, `PUT /api/profile`,
  `PUT /api/policy`, `/api/intents/{id}/ask|action|lane`, `/api/session` (development sign-in as a
  seeded demo member, separate from real accounts).
- **SQLite** with EF Core migrations (`src/Agentic.Api/Migrations`, applied on start; the demo network
  is seeded into an empty database), an append-only
  audit log of every routing decision, abuse reports, and per-IP / per-member rate limiting.

```
dotnet run --project src/Agentic.Api     # http://localhost:5320, serves the web client in live mode
dotnet test                              # 88 tests
```

The same `index.html` runs in two modes: **live** when served by the API (data from the server, real
accounts, plus development sign-in as any seeded member) and **demo** everywhere else (GitHub Pages, the artifact),
where everything stays in the browser. Delete `src/Agentic.Api/agentic.db` to reseed.

## Deploy

`Dockerfile` + `docker-compose.yml` (app + Caddy with automatic HTTPS) run the whole thing on one VPS.
Step-by-step guide for Hetzner Cloud, backups and updates: [deploy/HETZNER.md](deploy/HETZNER.md).
CI (`.github/workflows/ci.yml`) runs the tests and a Docker smoke test on every push.

After a model change: `dotnet ef migrations add <Name> --project src/Agentic.Api` (the tool is pinned in
`dotnet-tools.json`; run `dotnet tool restore` once).

Google sign-in locally: create an OAuth client with the redirect URI `http://localhost:5320/signin-google`,
then `dotnet user-secrets set Auth:Google:ClientId <id> --project src/Agentic.Api` (and `ClientSecret`).

Without `Email:Smtp:Host`, development writes emails to the log and production refuses to send
invitations (personal links still work).

Next increments: webhooks, Postgres.

## Run the static prototype only

Any static file server works, for example `npx serve .` in this folder. In Claude Code the `agentic`
launch configuration serves it on http://localhost:5321/ and `agentic-api` runs the API on 5320.

## Brand

The name, short name, tagline, agent-address namespace (`@knockero`) and API URL live in `A.brand` at
the top of `js/data.js`, and the server's copy in `src/Agentic.Api/Seed/domain.json`. The logo is the
`A.glyph` door knocker in `js/icons.js`. The code, solution and repository keep their original
internal names (`Agentic.Api`, `AgenticBusinessNetwork`).
