# Agentic Business Network — prototype site

LinkedIn-style web prototype for the *Agentic Business Network* business model: a professional
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
index.html          full HTML document (local / GitHub Pages)
page.html           same page without <html>/<head>/<body> (Claude Artifact publish)
css/styles.css      LinkedIn-style tokens, light + dark themes, responsive layout
js/icons.js         icon set, logo, avatars
js/data.js          brand, demo people, companies, intents, posts, templates, default policy
js/engine.js        policy evaluation, scoring, free-text parser
js/core.js          state (localStorage), hash router, global nav, toasts, modals
js/views/*.js       one file per screen
```

## Run locally

Any static file server works, for example:

```
cd AgenticBusinessNetwork
npx serve .            # or: python -m http.server 5321
```

In Claude Code the `agentic` launch configuration serves it on http://localhost:5321/.

## Rename the brand

Change `A.brand` at the top of `js/data.js` (name, short name, agent-address namespace, API URL).
The business model recommends a distinct company name before launch (for example Receiva or
Qualiflow), because "Agentic Business Network" is already used by TraceLink for supply chain.
