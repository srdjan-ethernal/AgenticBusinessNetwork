/* Editing your own profile (live mode): photo, experience, education, skills, and filling them from
   LinkedIn's data export. Every save goes through the server and refreshes the page from its answer. */
(function (A) {
  const esc = A.esc, I = A.icon;
  const TYPES = ['', 'Full-time', 'Part-time', 'Self-employed', 'Freelance', 'Contract', 'Internship', 'Board member', 'Advisor', 'Volunteer'];

  function me() { return A.P(A.me); }
  function refresh(msg) { A.closeModal(); A._keep = true; A.render(); if (msg) A.toast(msg, 'info'); }
  function err(id, e) { const el = document.getElementById(id); if (el) { el.textContent = e.message || e; el.hidden = false; } }
  async function save(body, btn, errId, msg) {
    if (btn) btn.disabled = true;
    try { await A.Live.updateProfile(body); refresh(msg); }
    catch (e) { if (btn) btn.disabled = false; err(errId, e); }
  }
  function val(row, name) { const el = row.querySelector('[name="' + name + '"]'); return el ? el.value.trim() : ''; }
  function field(label, name, value, attrs) {
    return '<div class="field"><label class="label">' + label + '<input class="input" name="' + name + '" value="' + esc(value || '') + '"' + (attrs || '') + '></label></div>';
  }

  // ---------- photo ----------
  let photoBlob = null;
  A.act['pf-photo'] = function () {
    photoBlob = null;
    const p = me();
    A.modal({
      title: 'Profile photo',
      body: '<div class="stack-16" style="align-items:center"><div id="ph-preview">' + A.avatar(p, 160) + '</div>' +
        '<label class="btn btn--secondary" for="ph-file">' + I('image', 'ico-20') + 'Choose a photo</label><input type="file" id="ph-file" accept="image/jpeg,image/png,image/webp" class="sr">' +
        '<p class="small muted" style="text-align:center">A square crop of the center is used. Anyone who sees your profile sees the photo.</p>' +
        '<p class="small err" id="ph-err" role="alert" hidden></p></div>',
      foot: (p.photo ? '<button class="btn btn--tertiary" data-act="pf-photo-rm" style="margin-right:auto">Remove photo</button>' : '') +
        '<button class="btn btn--tertiary" data-act="modal-close">Cancel</button><button class="btn btn--primary" data-act="pf-photo-save" id="ph-save" disabled>Save</button>',
      mount: function (s) { s.querySelector('#ph-file').addEventListener('change', function (e) { pick(e.target.files[0]); }); },
    });
  };
  // Resize and center-crop in the browser: the server stores a small square JPEG.
  function pick(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () {
      const side = Math.min(img.naturalWidth, img.naturalHeight), out = Math.min(512, side);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = out;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out, out);
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);
      URL.revokeObjectURL(url);
      canvas.toBlob(function (blob) {
        photoBlob = blob;
        document.getElementById('ph-preview').innerHTML = '<span class="av av--photo" style="width:160px;height:160px"><img src="' + canvas.toDataURL('image/jpeg', 0.85) + '" alt="Preview"></span>';
        document.getElementById('ph-save').disabled = false;
      }, 'image/jpeg', 0.88);
    };
    img.onerror = function () { URL.revokeObjectURL(url); err('ph-err', 'That file can’t be read as an image. Use a JPEG, PNG or WebP photo.'); };
    img.src = url;
  }
  A.act['pf-photo-save'] = async function (el) {
    if (!photoBlob) return;
    el.disabled = true;
    try {
      const res = await fetch('api/profile/photo', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' }, body: photoBlob });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || 'The upload failed (' + res.status + ').');
      A.Live.apply(data);
      refresh('Photo saved.');
    } catch (e) { el.disabled = false; err('ph-err', e); }
  };
  A.act['pf-photo-rm'] = async function () {
    try { A.Live.apply(await A.Live.call('DELETE', 'api/profile/photo')); refresh('Photo removed.'); }
    catch (e) { err('ph-err', e); }
  };

  // ---------- experience ----------
  function expRow(e) {
    e = e || {};
    return '<fieldset class="pf-row"><div class="grid2">' + field('Title', 'title', e.title, ' maxlength="120" placeholder="e.g. CTO"') + field('Company', 'company', e.company || (e.org ? A.O(e.org).name : ''), ' maxlength="120"') + '</div>' +
      '<div class="grid3">' + '<div class="field"><label class="label">Type<select class="select" name="type">' + TYPES.map(function (t) { return '<option value="' + t + '"' + (t === (e.type || '') ? ' selected' : '') + '>' + (t || '—') + '</option>'; }).join('') + '</select></label></div>' +
        field('Start', 'start', e.start, ' maxlength="20" placeholder="Mar 2021"') + field('End', 'end', e.end, ' maxlength="20" placeholder="Present"') + '</div>' +
      field('Location', 'location', e.loc, ' maxlength="80"') +
      '<div class="field"><label class="label">Description<textarea class="textarea" name="description" rows="3" maxlength="2000">' + esc(e.desc || '') + '</textarea></label></div>' +
      '<button type="button" class="btn btn--tertiary btn--sm" data-act="pf-row-rm">' + I('x', 'ico-16') + 'Remove this position</button></fieldset>';
  }
  A.act['pf-exp'] = function () {
    const p = me(), rows = (p.exp || []).map(expRow).join('') || expRow();
    A.modal({
      title: 'Experience', wide: true,
      body: '<div class="stack-16"><div class="stack-16" id="pf-rows">' + rows + '</div><button type="button" class="btn btn--secondary btn--sm" data-act="pf-exp-add" style="align-self:flex-start">' + I('plus', 'ico-16') + 'Add a position</button><p class="small err" id="pf-err" role="alert" hidden></p></div>',
      foot: '<button class="btn btn--tertiary" data-act="modal-close">Cancel</button><button class="btn btn--primary" data-act="pf-exp-save">Save</button>',
    });
  };
  A.act['pf-exp-add'] = function () { document.getElementById('pf-rows').insertAdjacentHTML('beforeend', expRow()); };
  A.act['pf-row-rm'] = function (el) { el.closest('.pf-row').remove(); };
  A.act['pf-exp-save'] = function (el) {
    const list = Array.prototype.map.call(document.querySelectorAll('#pf-rows .pf-row'), function (r) {
      return { title: val(r, 'title'), company: val(r, 'company'), type: val(r, 'type'), start: val(r, 'start'), end: val(r, 'end'), location: val(r, 'location'), description: val(r, 'description') };
    });
    save({ experience: list }, el, 'pf-err', 'Experience saved.');
  };

  // ---------- education ----------
  function eduRow(e) {
    e = e || {};
    return '<fieldset class="pf-row"><div class="grid2">' + field('School', 'school', e.school, ' maxlength="150"') + field('Degree and field', 'degree', e.deg, ' maxlength="150" placeholder="e.g. MSc, Computer Science"') + '</div>' +
      '<div class="grid2">' + field('Start', 'start', e.start, ' maxlength="20" placeholder="2008"') + field('End', 'end', e.end, ' maxlength="20" placeholder="2013"') + '</div>' +
      '<button type="button" class="btn btn--tertiary btn--sm" data-act="pf-row-rm">' + I('x', 'ico-16') + 'Remove</button></fieldset>';
  }
  A.act['pf-edu'] = function () {
    const p = me(), rows = (p.edu || []).map(eduRow).join('') || eduRow();
    A.modal({
      title: 'Education', wide: true,
      body: '<div class="stack-16"><div class="stack-16" id="pf-rows">' + rows + '</div><button type="button" class="btn btn--secondary btn--sm" data-act="pf-edu-add" style="align-self:flex-start">' + I('plus', 'ico-16') + 'Add a school</button><p class="small err" id="pf-err" role="alert" hidden></p></div>',
      foot: '<button class="btn btn--tertiary" data-act="modal-close">Cancel</button><button class="btn btn--primary" data-act="pf-edu-save">Save</button>',
    });
  };
  A.act['pf-edu-add'] = function () { document.getElementById('pf-rows').insertAdjacentHTML('beforeend', eduRow()); };
  A.act['pf-edu-save'] = function (el) {
    const list = Array.prototype.map.call(document.querySelectorAll('#pf-rows .pf-row'), function (r) {
      return { school: val(r, 'school'), degree: val(r, 'degree'), start: val(r, 'start'), end: val(r, 'end') };
    });
    save({ education: list }, el, 'pf-err', 'Education saved.');
  };

  // ---------- what you offer / what you are looking for ----------
  const LISTS = {
    offers: { title: 'What we offer', add: 'Add a product or service', ph: 'e.g. Bed linen and towels for hotels', dph: 'e.g. Cotton, made to order, delivery in 3 weeks', saved: 'Offers saved.' },
    needs: { title: 'Looking for', add: 'Add something you need', ph: 'e.g. Distributors in Germany', dph: 'e.g. Shops or wholesalers for home textiles', saved: 'Saved what you’re looking for.' },
  };
  function itemRow(i, key) {
    i = i || {};
    const L = LISTS[key];
    return '<fieldset class="pf-row">' + field('Title', 'title', i.title, ' maxlength="100" placeholder="' + esc(L.ph) + '"') +
      '<div class="field"><label class="label">Details <span class="muted">(optional)</span><textarea class="textarea" name="desc" rows="2" maxlength="500" placeholder="' + esc(L.dph) + '">' + esc(i.desc || '') + '</textarea></label></div>' +
      '<button type="button" class="btn btn--tertiary btn--sm" data-act="pf-row-rm">' + I('x', 'ico-16') + 'Remove</button></fieldset>';
  }
  function editList(key) {
    const L = LISTS[key], items = me()[key] || [];
    A.modal({
      title: L.title, wide: true,
      body: '<div class="stack-16"><p class="small muted">Short titles work best: they show in search results and help your agent match you with the right people.</p><div class="stack-16" id="pf-rows">' + (items.map(function (i) { return itemRow(i, key); }).join('') || itemRow(null, key)) + '</div>' +
        '<button type="button" class="btn btn--secondary btn--sm" data-act="pf-list-add" data-k="' + key + '" style="align-self:flex-start">' + I('plus', 'ico-16') + L.add + '</button><p class="small err" id="pf-err" role="alert" hidden></p></div>',
      foot: '<button class="btn btn--tertiary" data-act="modal-close">Cancel</button><button class="btn btn--primary" data-act="pf-list-save" data-k="' + key + '">Save</button>',
    });
  }
  A.act['pf-offers'] = function () { editList('offers'); };
  A.act['pf-needs'] = function () { editList('needs'); };
  A.act['pf-list-add'] = function (el) { document.getElementById('pf-rows').insertAdjacentHTML('beforeend', itemRow(null, el.dataset.k)); };
  A.act['pf-list-save'] = function (el) {
    const key = el.dataset.k, body = {};
    body[key] = Array.prototype.map.call(document.querySelectorAll('#pf-rows .pf-row'), function (r) { return { title: val(r, 'title'), description: val(r, 'desc') }; });
    save(body, el, 'pf-err', LISTS[key].saved);
  };

  // ---------- skills ----------
  let skillList = [];
  function chips() {
    return skillList.map(function (s, i) { return '<span class="tag skill-chip">' + esc(s) + '<button type="button" data-act="pf-skill-rm" data-i="' + i + '" aria-label="Remove ' + esc(s) + '">' + I('x', 'ico-16') + '</button></span>'; }).join('') || '<span class="small muted">No skills yet.</span>';
  }
  A.act['pf-skills'] = function () {
    skillList = (me().skills || []).map(function (s) { return Array.isArray(s) ? s[0] : s; });
    A.modal({
      title: 'Skills',
      body: '<div class="stack-12"><div class="pills wrap" id="sk-chips">' + chips() + '</div>' +
        '<form id="sk-form" class="row" style="gap:8px"><label class="sr" for="sk-in">Add a skill</label><input class="input" id="sk-in" maxlength="60" placeholder="Add a skill, then press Enter"><button class="btn btn--secondary" type="submit">Add</button></form>' +
        '<p class="small muted">Tip: separate several with commas. Up to 60.</p><p class="small err" id="pf-err" role="alert" hidden></p></div>',
      foot: '<button class="btn btn--tertiary" data-act="modal-close">Cancel</button><button class="btn btn--primary" data-act="pf-skills-save">Save</button>',
      mount: function (s) {
        s.querySelector('#sk-form').addEventListener('submit', function (e) {
          e.preventDefault();
          const inp = document.getElementById('sk-in');
          inp.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (x) {
            if (!skillList.some(function (y) { return y.toLowerCase() === x.toLowerCase(); })) skillList.push(x);
          });
          inp.value = '';
          document.getElementById('sk-chips').innerHTML = chips();
        });
      },
    });
  };
  A.act['pf-skill-rm'] = function (el) { skillList.splice(+el.dataset.i, 1); document.getElementById('sk-chips').innerHTML = chips(); };
  A.act['pf-skills-save'] = function (el) {
    const pending = (document.getElementById('sk-in') || {}).value;
    if (pending && pending.trim()) pending.split(',').map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (x) { if (skillList.indexOf(x) < 0) skillList.push(x); });
    save({ skills: skillList }, el, 'pf-err', 'Skills saved.');
  };

  // ---------- fill from LinkedIn ----------
  let li = null;
  A.act['pf-linkedin'] = function () {
    li = null;
    A.modal({
      title: 'Fill your profile from LinkedIn', wide: true,
      body: '<div class="stack-16" id="li-body"><p class="muted">Use the archive from LinkedIn (<b>Settings → Data privacy → Get a copy of your data</b>), the same .zip you can use to import connections. Only your positions, education, skills, headline and summary are read, and nothing changes until you choose what to keep.</p>' +
        '<label class="ct-drop" for="li-file">' + I('archive', 'ico-20') + '<span><b>Choose the LinkedIn .zip</b><span class="small muted">The full archive, or one with Profile, Positions, Education and Skills</span></span></label><input type="file" id="li-file" accept=".zip,application/zip" class="sr">' +
        '<p class="small err" id="li-err" role="alert" hidden></p></div>',
      foot: '<button class="btn btn--tertiary" data-act="modal-close">Cancel</button><button class="btn btn--primary" data-act="pf-li-apply" id="li-apply" disabled>Update my profile</button>',
      mount: function (s) { s.querySelector('#li-file').addEventListener('change', function (e) { readLinkedIn(e.target.files[0]); }); },
    });
  };
  async function readLinkedIn(file) {
    if (!file) return;
    const drop = document.querySelector('#li-body .ct-drop');
    if (drop) drop.classList.add('is-busy');
    try {
      const res = await fetch('api/profile/linkedin', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || 'The file couldn’t be read (' + res.status + ').');
      li = data;
      const p = me(), opt = function (k, label, on, detail, enabled) {
        return '<label class="check li-opt' + (enabled ? '' : ' is-off') + '"><input type="checkbox" data-k="' + k + '"' + (on && enabled ? ' checked' : '') + (enabled ? '' : ' disabled') + '><span><b>' + label + '</b>' + (detail ? '<span class="small muted clamp2">' + esc(detail) + '</span>' : '') + '</span></label>';
      };
      document.getElementById('li-body').innerHTML =
        '<p class="muted">Found in your LinkedIn export. Ticked sections replace what is on your profile now.</p><div class="stack-12">' +
        opt('experience', 'Experience · ' + data.experience.length + ' positions', true, data.experience.slice(0, 3).map(function (e) { return e.title + (e.company ? ' at ' + e.company : ''); }).join(' · '), data.experience.length > 0) +
        opt('education', 'Education · ' + data.education.length + (data.education.length === 1 ? ' school' : ' schools'), true, data.education.map(function (e) { return e.school; }).join(' · '), data.education.length > 0) +
        opt('skills', 'Skills · ' + data.skills.length, true, data.skills.slice(0, 12).join(', '), data.skills.length > 0) +
        opt('headline', 'Headline', false, data.headline, !!data.headline) +
        opt('about', 'About', !p.about, data.about, !!data.about) +
        opt('location', 'Location', !p.loc, data.location, !!data.location) +
        '</div><p class="small err" id="li-err" role="alert" hidden></p>';
      document.getElementById('li-apply').disabled = false;
    } catch (e) {
      if (drop) drop.classList.remove('is-busy');
      err('li-err', e);
    }
  }
  A.act['pf-li-apply'] = function (el) {
    if (!li) return;
    const on = {};
    document.querySelectorAll('#li-body input[type=checkbox]').forEach(function (c) { on[c.dataset.k] = c.checked; });
    const body = {};
    if (on.experience) body.experience = li.experience;
    if (on.education) body.education = li.education;
    if (on.skills) body.skills = li.skills;
    if (on.headline) body.headline = li.headline.slice(0, 160);
    if (on.about) body.about = li.about.slice(0, 2600);
    if (on.location) body.location = li.location.slice(0, 80);
    if (!Object.keys(body).length) { err('li-err', 'Tick at least one section.'); return; }
    save(body, el, 'li-err', 'Your profile was updated from LinkedIn.');
  };
})(window.ABN);
