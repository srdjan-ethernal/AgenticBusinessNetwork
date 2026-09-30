/* Account settings (email, password, digest, sessions) and the pages behind emailed links:
   #verify.<token>, #forgot, #reset.<token>, #digest-off.<token>. Live mode only; the demo explains that. */
(function (A) {
  const esc = A.esc, I = A.icon;
  let acct = null;

  // ---------- banner: confirm your email ----------
  A.ui.accountBanner = function () {
    const a = A.account;
    if (!A.live || !a || !a.email || a.emailVerified || A._bannerHidden) return '';
    return '<div class="acct-banner" role="status"><div class="page row wrap" style="gap:10px;padding-block:10px">' + I('mail', 'ico-20') +
      '<span class="grow small">Confirm <b>' + esc(a.email) + '</b> so senders see you as verified and your agent can send its daily digest.</span>' +
      '<button class="btn btn--secondary btn--sm" data-act="acct-resend">Send the link again</button>' +
      '<button class="iconbtn" data-act="acct-banner-x" aria-label="Hide">' + I('x', 'ico-16') + '</button></div></div>';
  };
  A.act['acct-banner-x'] = function () { A._bannerHidden = true; A.refresh(); };
  A.act['acct-resend'] = async function (el) {
    el.disabled = true;
    try {
      const r = await A.Live.call('POST', 'api/account/verify/resend');
      A.toast('A new confirmation link is on its way to <b>' + esc(r.sentTo) + '</b>.', 'info');
    } catch (e) { el.disabled = false; A.toast(esc(e.message), 'warn'); }
  };

  // ---------- settings ----------
  function section(title, body) { return '<section class="card pad stack-12"><h2 class="card__h">' + title + '</h2>' + body + '</section>'; }
  function settingsBody() {
    if (!A.live) return section('Account', '<p class="muted">Account settings work on the live network. In this demo there is nothing to configure.</p>');
    if (!acct) return section('Account', '<p class="muted">Loading…</p>');
    if (acct.devAccount) return section('Account', '<p class="muted">You are signed in with a development account of the seeded demo network. It has no email address or password.</p>');
    const mailOff = !acct.emailDelivers ? '<div class="note note--warn">' + I('warn') + '<div class="small">Email isn’t set up on this server yet, so confirmation links and digests aren’t delivered.</div></div>' : '';
    const email = '<div class="row wrap" style="gap:10px"><b>' + esc(acct.email) + '</b>' +
      (acct.emailVerified ? '<span class="ct-st ct-st--high">' + I('check', 'ico-16') + 'Confirmed</span>' + (acct.workEmail ? '<span class="ct-st ct-st--accent">Work email · verified sender</span>' : '<span class="small muted">Personal address: confirmed, but not a work email</span>')
        : '<span class="ct-st">Not confirmed</span><button class="btn btn--secondary btn--sm" data-act="acct-resend">Send the link again</button>') + '</div>' +
      '<p class="small muted">A confirmed company address adds the “work email” claim that senders’ and recipients’ agents take into account.</p>';
    const password = (acct.google ? '<p class="small row" style="gap:6px">' + I('check', 'ico-16') + 'Google sign-in is linked to this account.</p>' : '') +
      '<form id="pw-form" class="stack-12" novalidate>' +
        (acct.hasPassword ? '<div class="field"><label class="label" for="pw-cur">Current password</label><input class="input" id="pw-cur" type="password" autocomplete="current-password"></div>' : '<p class="small muted">You sign in with Google only. Set a password to also sign in with your email.</p>') +
        '<div class="field"><label class="label" for="pw-new">New password</label><input class="input" id="pw-new" type="password" autocomplete="new-password" minlength="10"><span class="small muted">At least 10 characters. Other devices are signed out.</span></div>' +
        '<p class="small err" id="pw-err" role="alert" hidden></p>' +
        '<div><button class="btn btn--primary" type="submit">' + (acct.hasPassword ? 'Change password' : 'Set password') + '</button></div></form>';
    const digest = '<label class="check" for="dg-on"><input type="checkbox" id="dg-on" data-ch="dg-on"' + (acct.digestEnabled ? ' checked' : '') + '> Email me a daily digest of what my agent screened</label>' +
      '<p class="small muted">Sent at the start of your working hours (set under Policy → Availability) when something new arrived, including intents you held for it.' + (acct.lastDigestAt ? ' Last one: ' + esc(new Date(acct.lastDigestAt).toLocaleString()) + '.' : '') + '</p>' +
      '<div><button class="btn btn--tertiary btn--sm" data-act="dg-send"' + (acct.emailVerified ? '' : ' disabled title="Confirm your email first"') + '>' + I('send', 'ico-16') + 'Send me one now</button></div>';
    const sessions = '<p class="small muted">Lost a laptop, or signed in on a shared computer? End every session except this one.</p><div><button class="btn btn--secondary btn--sm" data-act="acct-signout-all">Sign out everywhere else</button></div>';
    return mailOff + section('Email', email) + section('Password', password) + section('Daily digest', digest) + section('Sessions', sessions);
  }
  function paint() { const el = document.getElementById('st-body'); if (el) { el.innerHTML = settingsBody(); bindPw(); } }
  function bindPw() {
    const f = document.getElementById('pw-form');
    if (!f) return;
    f.addEventListener('submit', async function (e) {
      e.preventDefault();
      const err = document.getElementById('pw-err'), cur = document.getElementById('pw-cur'), nw = document.getElementById('pw-new');
      err.hidden = true;
      try {
        await A.Live.call('PUT', 'api/account/password', { current: cur ? cur.value : null, password: nw.value });
        acct = await A.Live.call('GET', 'api/account');
        paint();
        A.toast('Password saved. Other devices were signed out.', 'info');
      } catch (x) { err.textContent = x.message; err.hidden = false; }
    });
  }

  A.view('settings', {
    render: function () {
      return '<div class="page"><div class="stack-16" style="max-width:720px;margin-inline:auto"><h1 class="ct-h1">Account and email</h1><div class="stack-16" id="st-body">' + settingsBody() + '</div></div></div>';
    },
    mount: function () {
      bindPw();
      if (!A.live) return;
      A.Live.call('GET', 'api/account').then(function (a) { acct = a; paint(); }, function (e) { A.toast(esc(e.message), 'warn'); });
    },
  });
  A.chg['dg-on'] = async function (el) {
    try { acct = await A.Live.call('PUT', 'api/account/digest', { enabled: el.checked }); A.toast(el.checked ? 'Daily digest on.' : 'Daily digest off.', 'info'); }
    catch (e) { el.checked = !el.checked; A.toast(esc(e.message), 'warn'); }
  };
  A.act['dg-send'] = async function (el) {
    el.disabled = true;
    try { const r = await A.Live.call('POST', 'api/account/digest/send'); A.toast('Digest on its way to <b>' + esc(r.sentTo) + '</b>.', 'info'); }
    catch (e) { A.toast(esc(e.message), 'warn'); }
    el.disabled = false;
  };
  A.act['acct-signout-all'] = async function () {
    try { await A.Live.call('POST', 'api/account/signout-all'); A.toast('Every other session was signed out.', 'info'); }
    catch (e) { A.toast(esc(e.message), 'warn'); }
  };

  // ---------- pages behind emailed links ----------
  function card(id, inner) { return '<div class="auth"><div class="card auth__card" id="' + id + '">' + inner + '</div></div>'; }
  const LIVE_ONLY = '<p class="muted">This link works on the live network, not in the demo.</p><a class="btn btn--secondary btn--block" href="#welcome">Back</a>';

  A.view('verify', {
    lo: true,
    render: function () { return card('vf-card', '<h1>Confirming…</h1>'); },
    mount: async function (token) {
      const c = document.getElementById('vf-card');
      if (!A.live) { c.innerHTML = '<h1>Confirm your email</h1>' + LIVE_ONLY; return; }
      try {
        const r = await A.Live.call('POST', 'api/auth/verify', { token: token });
        if (A.S.signedIn) { try { await A.Live.bootstrap(); } catch (e) { /* the page still says it worked */ } }
        c.innerHTML = '<h1>Email confirmed</h1><p class="muted"><b>' + esc(r.email) + '</b> is confirmed' + (r.workEmail ? ', and senders now see you as a verified member with a work email.' : '.') + '</p>' +
          '<a class="btn btn--primary btn--block" href="' + (A.S.signedIn ? '#feed' : '#signin') + '">' + (A.S.signedIn ? 'Continue' : 'Sign in') + '</a>';
      } catch (e) { c.innerHTML = '<h1>Confirm your email</h1><p class="muted">' + esc(e.message) + '</p><a class="btn btn--secondary btn--block" href="' + (A.S.signedIn ? '#settings' : '#signin') + '">' + (A.S.signedIn ? 'Send a new link' : 'Sign in') + '</a>'; }
    },
  });

  A.view('forgot', {
    lo: true,
    render: function () {
      if (!A.live) return card('fg-card', '<h1>Reset your password</h1>' + LIVE_ONLY);
      return card('fg-card', '<h1>Reset your password</h1><p class="muted">Enter the email of your account. We’ll send a link to choose a new password.</p>' +
        '<form id="fg-form" class="stack-12" novalidate><div class="field"><label class="label" for="fg-email">Email</label><input class="input" id="fg-email" type="email" autocomplete="email" required></div>' +
        '<button class="btn btn--primary btn--lg btn--block" type="submit">Send the link</button></form><a class="link small" href="#signin">Back to sign in</a>');
    },
    mount: function () {
      const f = document.getElementById('fg-form');
      if (!f) return;
      f.addEventListener('submit', async function (e) {
        e.preventDefault();
        const email = document.getElementById('fg-email').value.trim();
        if (!email) return;
        f.querySelector('button').disabled = true;
        try { await A.Live.call('POST', 'api/auth/reset/request', { email: email }); } catch (x) { /* same answer either way */ }
        document.getElementById('fg-card').innerHTML = '<h1>Check your email</h1><p class="muted">If an account uses <b>' + esc(email) + '</b>, a reset link is on its way. It works for one hour.</p><a class="btn btn--secondary btn--block" href="#signin">Back to sign in</a>';
      });
    },
  });

  A.view('reset', {
    lo: true,
    render: function () {
      if (!A.live) return card('rs-card', '<h1>Choose a new password</h1>' + LIVE_ONLY);
      return card('rs-card', '<h1>Choose a new password</h1><form id="rs-form" class="stack-12" novalidate>' +
        '<div class="field"><label class="label" for="rs-pw">New password</label><input class="input" id="rs-pw" type="password" autocomplete="new-password" minlength="10" required><span class="small muted">At least 10 characters.</span></div>' +
        '<div class="field"><label class="label" for="rs-pw2">Repeat it</label><input class="input" id="rs-pw2" type="password" autocomplete="new-password" required></div>' +
        '<p class="small err" id="rs-err" role="alert" hidden></p><button class="btn btn--primary btn--lg btn--block" type="submit">Save and sign in</button></form>');
    },
    mount: function (token) {
      const f = document.getElementById('rs-form');
      if (!f) return;
      f.addEventListener('submit', async function (e) {
        e.preventDefault();
        const err = document.getElementById('rs-err'), pw = document.getElementById('rs-pw').value;
        err.hidden = true;
        if (pw !== document.getElementById('rs-pw2').value) { err.textContent = 'The two passwords don’t match.'; err.hidden = false; return; }
        try {
          await A.Live.call('POST', 'api/auth/reset', { token: token, password: pw });
          await A.Live.bootstrap();
          A.save();
          A.go('feed');
          A.toast('Password saved. You’re signed in, and every other session was signed out.', 'info');
        } catch (x) { err.textContent = x.message; err.hidden = false; }
      });
    },
  });

  A.view('digest-off', {
    lo: true,
    render: function (token) {
      if (!A.live) return card('do-card', '<h1>Daily digest</h1>' + LIVE_ONLY);
      return card('do-card', '<h1>Stop the daily digest?</h1><p class="muted">Your agent keeps screening; you just won’t get the morning email. You can turn it back on under Account and email.</p>' +
        '<button class="btn btn--primary btn--block" data-act="digest-off" data-t="' + esc(token) + '">Turn the digest off</button>');
    },
  });
  A.act['digest-off'] = async function (el) {
    const c = document.getElementById('do-card');
    try { await A.Live.call('POST', 'api/digest/off', { token: el.dataset.t }); c.innerHTML = '<h1>Digest off</h1><p class="muted">You won’t receive the daily digest any more.</p><a class="btn btn--secondary btn--block" href="#welcome">OK</a>'; }
    catch (e) { c.innerHTML = '<h1>Daily digest</h1><p class="muted">That link isn’t valid any more.</p>'; }
  };
})(window.ABN);
