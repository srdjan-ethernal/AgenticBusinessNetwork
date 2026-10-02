# Deploying Knockero to Hetzner Cloud

One small VPS runs everything: the API (which also serves the web client) and Caddy for automatic
HTTPS. Data lives in SQLite on a Docker volume, backed up with one command.

```
Internet ──443──> Caddy (TLS, security headers) ──8080──> app (ASP.NET Core, .NET 10)
                                                              └── /data (volume): agentic.db, cookie keys
```

## 1. Create the server

1. In the Hetzner Cloud console: **Add server**
   - Location: Falkenstein, Nuremberg or Helsinki (EU)
   - Image: **Ubuntu 24.04**
   - Type: **CX22** (2 vCPU, 4 GB RAM) is plenty; CPX11 also works
   - SSH key: add your public key (no password login)
   - Optional: a Hetzner Cloud Firewall allowing inbound 22, 80, 443 (TCP) and 443 (UDP)
2. Note the server's IPv4 (and IPv6) address.

## 2. Point your domain at it

At your DNS provider create:

| Type | Name | Value |
|---|---|---|
| A | `@` | server IPv4 |
| A | `www` | server IPv4 (Caddy redirects www to the main domain) |
| AAAA | `@`, `www` | server IPv6 (optional) |

Wait until `nslookup knockero.com` returns the server IP. Caddy needs this to get the
Let's Encrypt certificate on first start.

## 3. Prepare the server (once)

```bash
ssh root@SERVER_IP
curl -fsSL https://raw.githubusercontent.com/srdjan-ethernal/AgenticBusinessNetwork/main/deploy/setup-server.sh | bash
```

The script installs Docker and the Compose plugin, enables the firewall (22, 80, 443) and automatic
security updates, clones the repository to `/opt/agentic`, and creates `/opt/agentic/.env` with a
random `ACCESS_CODE`.

## 4. Configure and start

```bash
cd /opt/agentic
nano .env            # set DOMAIN=knockero.com
docker compose up -d --build
docker compose ps    # app should become "healthy" within ~30 s
docker compose logs -f caddy   # watch the certificate being issued
```

Open `https://knockero.com` and choose **Create your agent**. While `ACCESS_CODE` is set,
sign-up asks for it, so only people you give the code to can join. **Sign in → Development accounts**
also lets you (with the same code) look around as a member of the fictional demo network.

### Settings (`.env`)

| Variable | Default | Meaning |
|---|---|---|
| `DOMAIN` | — | Public hostname served by Caddy |
| `SIGNUP` | `true` | Real accounts (email + password) |
| `ACCESS_CODE` | random | Invite code for sign-up and development sign-in. Clear it to open sign-up to everyone. |
| `DEV_LOGIN` | `true` | Development sign-in as a seeded demo member. Turn off once real members use the server. |
| `SEED_DEMO` | `true` | Seed the fictional demo network into an empty database |
| `SUBMIT_PER_HOUR` | `30` | Protocol submissions per IP or member per hour |
| `AUTH_ATTEMPTS_PER_10_MIN` | `20` | Sign-up and password attempts per IP per 10 minutes |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | — | "Continue with Google" for sign-up and sign-in (see below). Empty: the button is hidden |
| `ANTHROPIC_API_KEY` | — | Claude writes briefs and reply drafts and reads free-text intents (see below). Empty: rule-based briefs |
| `ANTHROPIC_MODEL`, `AI_DAILY_BUDGET_USD` | `claude-opus-5-5`, `5` | Model, and the daily spending cap after which model calls stop until midnight UTC |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | — | Outgoing mail for invitations (see below). Empty: no email is sent |
| `MAIL_FROM`, `MAIL_FROM_NAME` | — | Sender address; invitations go out as "Member Name via MAIL_FROM_NAME" with Reply-To the member |
| `INVITES_PER_DAY` | `200` | Invitations one member may send per 24 hours |

Anyone can still reach the public agent pages and `POST /v1/intents` without the code; that is the
point of the protocol, and it is rate-limited.

### Claude (briefs and free-text intents)

With `ANTHROPIC_API_KEY` set (create one in the Claude Console, [platform.claude.com](https://platform.claude.com/)):

- every intent that reaches an inbox gets a **model-written brief** (3 to 5 points, a next step and a reply
  draft) a few seconds after it arrives, and again after the sender answers questions;
- senders can paste free text on a public agent page and have the form **filled in for them**
  (`POST /v1/intents/parse`, 20 per hour per IP or member).

The policy engine alone decides lane and score; the model only explains. Declined and blocked
(prompt-injection) intents never reach the model. Every call is logged with its cost in the `AiUsage`
table, and `AI_DAILY_BUDGET_USD` stops calls for the rest of the day once reached. Intent content is
sent to Anthropic's API, so mention it in your privacy notice.

### Sign in with Google

1. In [Google Cloud Console](https://console.cloud.google.com/) create a project, then **APIs & Services →
   OAuth consent screen**: app name, support email, your domain under *Authorized domains*; scopes
   `openid`, `email`, `profile` (no verification by Google is needed for these). Publish the app
   (*In production*), otherwise only listed test users can sign in.
2. **Credentials → Create credentials → OAuth client ID**, type **Web application**, authorized redirect
   URI `https://knockero.com/signin-google`.
3. Put the client ID and secret into `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) and
   `docker compose up -d`.

A new person who continues with Google only adds a headline and a template; the email comes from
Google and no password is created. An existing account with the same, Google-verified address is
linked on first use. Sign-up rules still apply: while `ACCESS_CODE` is set, new people need the code or
a personal invitation.

### Email (confirmations, password reset, digest, invitations)

The server sends email for confirmation links, password resets, the daily digest and invitations to
imported LinkedIn contacts (**Network → Import connections**). For that it needs SMTP:

1. **Hetzner blocks outgoing ports 25 and 465** on new servers, so don't run your own mail server. Use a
   transactional email provider (Postmark, Brevo, Mailgun, Amazon SES and similar) on port **587**.
2. At the provider, verify the domain of `MAIL_FROM` and add the **SPF and DKIM** DNS records it gives you
   (and a DMARC record). Without them invitations land in spam.
3. Put the provider's SMTP host, user and password into `.env`, then `docker compose up -d`.

Without SMTP the app refuses email invitations (it does not pretend to send them); personal invite
links, which members paste into LinkedIn messages, work either way. Every invitation has a one-click
"don't send me invitations" link, and that opt-out applies to all members.

## 5. Update to the latest version

```bash
cd /opt/agentic && bash deploy/update.sh
```

It backs up the database, pulls `main`, rebuilds the image, restarts, and checks health. Database
migrations run automatically when the app starts.
CI on GitHub (`.github/workflows/ci.yml`) runs the tests and a Docker smoke test on every push,
so deploy a commit only after its CI run is green.

## 6. Backups

```bash
cd /opt/agentic && docker compose run --rm backup   # online SQLite backup into ./backups, keeps 14
```

Nightly at 03:00:

```bash
( crontab -l 2>/dev/null; echo '0 3 * * * cd /opt/agentic && docker compose run --rm backup >> /var/log/agentic-backup.log 2>&1' ) | crontab -
```

For off-site copies, add a Hetzner Storage Box and `rsync` `/opt/agentic/backups` to it, or enable
Hetzner's server backups (+20% of the server price).

### Restore

```bash
cd /opt/agentic
docker compose stop app
docker run --rm -v agentic_data:/data -v "$PWD/backups:/backup" alpine sh -c \
  "cp /backup/agentic-YYYYMMDD-HHMMSS.db /data/agentic.db && rm -f /data/agentic.db-wal /data/agentic.db-shm && chown 1654:1654 /data/agentic.db"
docker compose start app
```

(`agentic_data` is the volume name when the code lives in `/opt/agentic`; check with `docker volume ls`.)

## 7. Operations

| Task | Command |
|---|---|
| Status | `docker compose ps` |
| App logs | `docker compose logs -f app` |
| Restart | `docker compose restart app` |
| Reset to a fresh demo database | `docker compose down && docker volume rm agentic_data && docker compose up -d` |
| Roll back | `git checkout <previous-commit> && docker compose up -d --build` |

## Current limits

- **Email needs SMTP:** confirmation links, password reset and the daily digest are only delivered once
  `SMTP_HOST` is set. Until then people can't reset a forgotten password themselves.
- **SQLite, one instance.** Fine for a demo and early pilots. Postgres arrives when it is needed (the
  same pattern as Foundrmind: `ConnectionStrings__Default=Host=...`).
- Everything in the seeded network is fictional.
