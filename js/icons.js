/* Agentic Business Network — icon set, logo, avatars, reactions */
window.ABN = window.ABN || {};
(function (A) {
  A.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };
  // Filled glyphs (24x24)
  const F = {
    home: '<path d="M12 3 2.4 10.4l1.2 1.6L5 10.9V20a1 1 0 0 0 1 1h4.5v-6h3v6H18a1 1 0 0 0 1-1v-9.1l1.4 1.1 1.2-1.6z"/>',
    network: '<circle cx="8.5" cy="7.5" r="3.5"/><path d="M1.5 20c0-4 3.1-7 7-7s7 3 7 7z"/><circle cx="17.2" cy="8" r="2.8"/><path d="M16.9 13.2c3.1-.1 5.6 2.5 5.6 5.7V20h-5.2a8.8 8.8 0 0 0-2.3-6.4c.6-.2 1.2-.4 1.9-.4z"/>',
    inbox: '<path d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v9h4.2a2.9 2.9 0 0 0 5.6 0H19V5z"/><path d="m12 5.6.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z"/>',
    policy: '<path d="M3 6h9v2H3zm13 0h5v2h-5zM3 16h4v2H3zm8 0h10v2H11z"/><circle cx="14" cy="7" r="2.8"/><circle cx="9" cy="17" r="2.8"/>',
    bell: '<path d="M12 2.5a6 6 0 0 0-6 6v4.2L4 16.3V18h16v-1.7l-2-3.6V8.5a6 6 0 0 0-6-6zM9.5 19.5a2.5 2.5 0 0 0 5 0z"/>',
    chat: '<path d="M7 4h10a5 5 0 0 1 0 10h-3.3L8 19v-5H7A5 5 0 0 1 7 4z"/>',
    grid: '<path d="M3 3h4v4H3zm7 0h4v4h-4zm7 0h4v4h-4zM3 10h4v4H3zm7 0h4v4h-4zm7 0h4v4h-4zM3 17h4v4H3zm7 0h4v4h-4zm7 0h4v4h-4z"/>',
    search: '<path d="M10.5 3a7.5 7.5 0 0 1 6 12l5 5-1.5 1.5-5-5A7.5 7.5 0 1 1 10.5 3zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z"/>',
    briefcase: '<path d="M9 3h6a2 2 0 0 1 2 2v1h3a2 2 0 0 1 2 2v3H2V8a2 2 0 0 1 2-2h3V5a2 2 0 0 1 2-2zm0 3h6V5H9zM2 13h8v2h4v-2h8v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/>',
    spark: '<path d="M10.5 2.5 12.6 8.4l5.9 2.1-5.9 2.1-2.1 5.9-2.1-5.9-5.9-2.1 5.9-2.1zM18.5 14l.9 2.4 2.4.9-2.4.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z"/>',
    more: '<circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>',
    moreV: '<circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>',
    code: '<path d="M8.4 6.3 9.8 7.7 5.5 12l4.3 4.3-1.4 1.4L2.7 12zm7.2 0 5.7 5.7-5.7 5.7-1.4-1.4 4.3-4.3-4.3-4.3z"/>',
    zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    star: '<path d="m12 2.5 2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.2 1.3-6.6-4.9-4.6 6.6-.8z"/>',
    image: '<path d="M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 2v9.6l4-4 3 3 2.5-2.5L19 16.6V6zm4.5 1.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/>',
    calendar: '<path d="M7 2h2v2h6V2h2v2h3a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3zM5 9v10h14V9z"/>',
    article: '<path d="M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm2 4v2h10V7zm0 4v2h10v-2zm0 4v2h6v-2z"/>',
    send: '<path d="M21.5 2.5 2 10.3l7.4 3.4L17 7l-6.1 8.2 3.4 7.3z"/>',
    building: '<path d="M4 2h11a1 1 0 0 1 1 1v6h4a1 1 0 0 1 1 1v12H3V3a1 1 0 0 1 1-1zm2 4v2h2V6zm4 0v2h2V6zm-4 4v2h2v-2zm4 0v2h2v-2zm-4 4v2h2v-2zm4 0v2h2v-2zm6-3v2h2v-2zm0 4v2h2v-2z"/>',
    shield: '<path d="M12 2 4 5v6.1c0 5 3.4 9.4 8 10.9 4.6-1.5 8-5.9 8-10.9V5z"/>',
    user: '<circle cx="12" cy="7.5" r="4.5"/><path d="M3.5 21a8.5 8.5 0 0 1 17 0z"/>',
    bookmark: '<path d="M6 2h12a1 1 0 0 1 1 1v19l-7-4.5L5 22V3a1 1 0 0 1 1-1z"/>',
    people: '<circle cx="12" cy="7" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0z"/><circle cx="4.5" cy="9.5" r="2.2"/><circle cx="19.5" cy="9.5" r="2.2"/>',
    route: '<circle cx="5" cy="12" r="2.6"/><circle cx="19.5" cy="5.5" r="2"/><circle cx="19.5" cy="12" r="2"/><circle cx="19.5" cy="18.5" r="2"/><path d="M7.5 11h10v2h-10z"/><path d="M7 10.6c3.4-.4 4.2-5.1 10.4-5.1v2c-4.9 0-5.2 4-10.1 5z"/><path d="M7 13.4c3.4.4 4.2 5.1 10.4 5.1v-2c-4.9 0-5.2-4-10.1-5z"/>',
  };
  // Stroked glyphs (24x24, 1.8 stroke)
  const S = {
    like: '<path d="M7 10.5v9.5H4.5a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1zm0 0 3.8-6.7a1.8 1.8 0 0 1 3.3 1.3L13.5 9h5.4a2 2 0 0 1 2 2.4l-1.4 7A2 2 0 0 1 17.5 20H7"/>',
    comment: '<path d="M20 4H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h3v4l5-4h8a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1zM7.5 9h9M7.5 12.5h6"/>',
    repost: '<path d="m17 3 3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3m13-2v2a3 3 0 0 1-3 3H4"/>',
    sendo: '<path d="M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.4 2.6 3.7 5.6 3.7 9s-1.3 6.4-3.7 9c-2.4-2.6-3.7-5.6-3.7-9S9.6 5.6 12 3z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    up: '<path d="m6 15 6-6 6 6"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    left: '<path d="m15 6-6 6 6 6"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    flag: '<path d="M5 21V4m0 0h11l-1.6 4L16 12H5"/>',
    block: '<circle cx="12" cy="12" r="9"/><path d="m5.7 5.7 12.6 12.6"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L12 6.3M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    filter: '<path d="M3 5h18l-7 8.5V19l-4 2v-7.5z"/>',
    trend: '<path d="m3 17 6-6 4 4 8-8m-6 0h6v6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-9.5v.5"/>',
    warn: '<path d="M12 3.5 2.5 20h19zM12 10v4.5m0 2.5v.5"/>',
    pause: '<circle cx="12" cy="12" r="9"/><path d="M10 9v6m4-6v6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.5 2.4c-.6.3-1.1.9-1.1 1.6v.5m0 3v.4"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9m-3 3 3 3m-5-1 2 2"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16zm9.5-13.5 4 4"/>',
    ext: '<path d="M14 4h6v6m0-6-9 9m7 1v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    sliders: '<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5zm-9 9 9 5 9-5m-18 4 9 5 9-5"/>',
    plug: '<path d="M9 2v5m6-5v5M6 7h12v4a6 6 0 0 1-12 0zm6 10v5"/>',
    archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>',
    reply: '<path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 6 6v5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6 6 0 0 1 3.5 6"/>',
    shieldo: '<path d="M12 2.5 4.5 5.3v5.8c0 4.7 3.2 8.8 7.5 10.4 4.3-1.6 7.5-5.7 7.5-10.4V5.3z"/><path d="m8.8 12 2.3 2.3 4.2-4.3"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
    hand: '<path d="M7 11V6a1.5 1.5 0 0 1 3 0v4m0-5.5a1.5 1.5 0 0 1 3 0V10m0-4a1.5 1.5 0 0 1 3 0v5m0-2.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1a7 7 0 0 1-5.6-2.8L3.3 15a1.6 1.6 0 0 1 2.5-2L7 14.5"/>',
    api: '<path d="M4 7h16M4 12h16M4 17h10"/><circle cx="18" cy="17" r="2"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.1a4.3 4.3 0 0 1 7.5 2.7C19.5 15.4 12 20 12 20z"/>',
    save: '<path d="M6.5 3.5h11v17l-5.5-3.8-5.5 3.8z"/>',
  };

  A.icon = function (name, cls, title) {
    const c = cls ? ' ' + cls : '';
    const t = title ? '<title>' + title + '</title>' : '';
    if (F[name]) return '<svg class="ico' + c + '" viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd" aria-hidden="' + (title ? 'false' : 'true') + '">' + t + F[name] + '</svg>';
    if (S[name]) return '<svg class="ico' + c + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="' + (title ? 'false' : 'true') + '">' + t + S[name] + '</svg>';
    return '';
  };

  // Brand glyph: an agent node that fans inbound out into three lanes
  A.glyph = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.6" cy="12" r="2.9" fill="currentColor"/><path d="M8.3 12H18M8 11.2c3.1-.6 3.9-5.2 9.2-5.2M8 12.8c3.1.6 3.9 5.2 9.2 5.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="19.2" cy="6" r="1.9" fill="currentColor"/><circle cx="19.6" cy="12" r="1.9" fill="currentColor"/><circle cx="19.2" cy="18" r="1.9" fill="currentColor"/></svg>';
  A.logo = function (size) {
    const s = size || 34;
    return '<span class="logo" style="width:' + s + 'px;height:' + s + 'px">' + A.glyph.replace('<svg ', '<svg style="width:' + Math.round(s * 0.76) + 'px;height:' + Math.round(s * 0.76) + 'px" ') + '</span>';
  };

  A.verifiedBadge = function (title) {
    return '<span class="verified" title="' + (title || 'Verified') + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 4 5v6.1c0 5 3.4 9.4 8 10.9 4.6-1.5 8-5.9 8-10.9V5z"/><path d="m8.6 12 2.4 2.4 4.4-4.5" fill="none" style="stroke:var(--card)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
  };

  A.initials = function (name) {
    return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase();
  };
  A.avatar = function (p, size, extra) {
    const s = size || 48;
    const c = (p && p.c) || ['#56687a', '#9db3c8'];
    const inner = p && p.kind === 'agent' ? A.glyph.replace('<svg ', '<svg style="width:' + Math.round(s * 0.55) + 'px;height:' + Math.round(s * 0.55) + 'px" ') : A.esc(A.initials(p && p.name));
    return '<span class="av' + (extra ? ' ' + extra : '') + '" style="width:' + s + 'px;height:' + s + 'px;font-size:' + Math.round(s * 0.38) + 'px;background:linear-gradient(135deg,' + c[0] + ',' + c[1] + ')" aria-hidden="true">' + inner + '</span>';
  };
  A.orgLogo = function (o, size) {
    const s = size || 48;
    const c = (o && o.c) || ['#56687a', '#9db3c8'];
    const inner = o && o.id === 'abn' ? A.glyph.replace('<svg ', '<svg style="width:' + Math.round(s * 0.7) + 'px;height:' + Math.round(s * 0.7) + 'px" ') : A.esc((o && o.mark) || A.initials(o && o.name).slice(0, 1));
    return '<span class="orglogo" style="width:' + s + 'px;height:' + s + 'px;font-size:' + Math.round(s * 0.44) + 'px;background:linear-gradient(135deg,' + c[0] + ',' + c[1] + ')" aria-hidden="true">' + inner + '</span>';
  };
  A.coverStyle = function (c) {
    const a = (c && c[0]) || '#a0b4b7', b = (c && c[1]) || '#d4dfe1';
    return 'background:radial-gradient(circle at 85% 20%, rgba(255,255,255,.28) 0 18%, transparent 19%),radial-gradient(circle at 70% 110%, rgba(255,255,255,.18) 0 30%, transparent 31%),radial-gradient(circle at 12% -20%, rgba(0,0,0,.12) 0 35%, transparent 36%),linear-gradient(120deg,' + a + ',' + b + ')';
  };
})(window.ABN);
