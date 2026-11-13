/* Studio client. Served inline by index.js (imported as text), so it must stay
   a classic script: no imports, no top-level await. Everything the server knows
   about the signed-in person is in <body data-*> (see editorPage). */
(function () {
  'use strict';

  // ---- environment ---------------------------------------------------------
  var B = document.body.dataset;
  var ROLE = B.role, IS_ADMIN = ROLE === 'admin', RAW = B.raw, SITE = B.site || 'https://beyondthecities.org';
  var ME = JSON.parse(B.me || '{}');
  var MAXP = Number(B.maxPhotos) || 7, MAXG = Number(B.maxGallery) || 12;
  var PLACEHOLDER = RAW + '/assets/images/colony-placeholder.png';

  // ---- tiny DOM helpers ----------------------------------------------------
  function q(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function ico(name, small) { return '<svg class="i' + (small ? ' s' : '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>'; }
  function svg(name, small) { var w = el('span'); w.innerHTML = ico(name, small); return w.firstChild; }
  function btn(cls, icon, label, title) {
    var b = el('button', 'btn ' + cls); b.type = 'button';
    if (icon) b.appendChild(svg(icon, true));
    if (label) b.appendChild(el('span', null, label));
    if (title) { b.title = title; b.setAttribute('aria-label', title); }
    return b;
  }
  function link(cls, href, icon, label, ext) {
    var a = el('a', cls); a.href = href;
    if (icon) a.appendChild(svg(icon, true));
    if (label) a.appendChild(el('span', null, label));
    if (ext) { a.target = '_blank'; a.rel = 'noopener'; }
    return a;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function initial(s) { var t = String(s || '?').trim(); return (t.charAt(0) || '?').toUpperCase(); }
  function fmtDate(s) { if (!s) return ''; var d = new Date(s.length === 10 ? s + 'T12:00:00Z' : s); if (isNaN(d)) return s; return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function daysUntil(ymd) { var t = new Date(); var today = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()); var p = ymd.split('-'); return Math.round((Date.UTC(+p[0], +p[1] - 1, +p[2]) - today) / 864e5); }
  function foldSearch(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'dj'); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many || one + 's'); }
  function photoSrc(p) { if (localPrev[p]) return localPrev[p]; return /^https?:/.test(p) ? p : RAW + p; }
  function realList(l) { return (Array.isArray(l) ? l : []).map(function (p) { return String(p || '').trim(); }).filter(function (p) { return p && p.indexOf('placehold.co') === -1; }); }
  function mapUrl(id) { return SITE + '/map.html?colony=' + encodeURIComponent(id); }
  function blogUrl(slug) { return SITE + '/blog/' + encodeURIComponent(slug) + '.html'; }
  async function api(path, opts) {
    var r = await fetch(path, opts);
    var out = await r.json().catch(function () { return {}; });
    if (!r.ok) { var e = new Error(out.detail || out.error || ('Error ' + r.status)); e.status = r.status; e.body = out; throw e; }
    return out;
  }
  function jsonReq(method, body) { return { method: method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }; }

  // ---- toast ---------------------------------------------------------------
  var toastEl = q('toast'), toastTimer;
  function toast(msg, kind) {
    q('toast-t').textContent = msg;
    toastEl.classList.toggle('err', kind === 'err');
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, kind === 'err' ? 5000 : 3000);
  }
  function fail(prefix, e) { toast(prefix + ': ' + (e && e.message ? e.message : 'check your connection'), 'err'); }

  // ---- shared state --------------------------------------------------------
  var colonies = [];            // what this account may edit (picker)
  var currentId = null, currentColony = null, currentPhotos = [], photoBusy = false, localPrev = {};
  var posts = null, taggable = [], postFilter = 'all', postTerm = '';
  var editingSlug = null, postCover = '', savedCover = '', postGallery = [], galleryBusy = false, postColonies = [];
  var bodyEditor = null, bodyLoading = false, bodyImgQueue = [], bodyImgBusy = false;
  var netMe = null, dirPeople = null, dirAdmin = false, community = null, dirTerm = '';
  var notices = null, noticesMine = [], noticeFilter = 'all', editingNotice = null;
  var colonyDirty = false, postDirty = false, noticeDirty = false, profileDirty = false;
  var COUNTRY_ORDER = ['Serbia', 'Bosnia and Herzegovina', 'North Macedonia'];
  var NOTICE_TYPES = { open_call: 'Open call', partners: 'Looking for partners', offering: 'Offering', question: 'Question', other: 'Other' };
  var NOTICE_SHORT = { open_call: 'Open call', partners: 'Partners', offering: 'Offering', question: 'Question', other: 'Other' };

  // ---- account block (sidebar, tab bar, profile) ---------------------------
  function renderMe() {
    var name = (netMe && netMe.name) || ME.name || ME.email;
    document.querySelectorAll('[data-me=name]').forEach(function (x) { x.textContent = name; });
    document.querySelectorAll('[data-me=mail]').forEach(function (x) { x.textContent = ME.email; });
    document.querySelectorAll('[data-me=av]').forEach(function (x) { x.textContent = initial(name); });
  }

  // ---- router --------------------------------------------------------------
  var VIEWS = ['home', 'colony', 'colony-edit', 'posts', 'post-edit', 'network', 'notices', 'notice-edit', 'access', 'profile'];
  var NAV_OF = { home: 'home', colony: 'colony', 'colony-edit': 'colony', posts: 'posts', 'post-edit': 'posts', network: 'network', notices: 'network', 'notice-edit': 'network', access: 'access', profile: 'profile' };
  var main = q('main'), curHash = '', ignoreHash = false, current = '';

  function anyDirty() { return colonyDirty || postDirty || noticeDirty || profileDirty; }
  function go(h) { if (location.hash === h) route(); else location.hash = h; }
  function route() {
    if (ignoreHash) { ignoreHash = false; return; }
    if (anyDirty() && !confirm('Discard unsaved changes?')) { ignoreHash = true; location.hash = curHash || '#home'; return; }
    colonyDirty = postDirty = noticeDirty = profileDirty = false;
    var h = (location.hash || '#home').slice(1).split('/');
    open(h[0] || 'home', h.slice(1).join('/'));
  }
  function open(view, arg) {
    if (view === 'post') view = arg ? 'post-edit' : 'posts';
    if (view === 'notice') view = arg ? 'notice-edit' : 'notices';
    if (view === 'colony' && arg) view = 'colony-edit';
    if (view === 'colony' && colonies.length === 1) { view = 'colony-edit'; arg = colonies[0].id; }
    if (view === 'colony-edit' && !arg) { if (colonies.length === 1) arg = colonies[0].id; else view = 'colony'; }
    if (view === 'access' && !IS_ADMIN) view = 'home';
    if (VIEWS.indexOf(view) < 0) view = 'home';
    curHash = location.hash || '#home';
    current = view;
    VIEWS.forEach(function (v) { var sec = q('v-' + v); if (sec) sec.hidden = v !== view; });
    var top = NAV_OF[view];
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      var k = a.getAttribute('data-nav');
      a.classList.toggle('on', k === top || (k === 'directory' && view === 'network') || (k === 'notices' && (view === 'notices' || view === 'notice-edit')));
    });
    q('net-sub').hidden = top !== 'network';
    main.scrollTop = 0;
    if (view === 'home') loadHome();
    else if (view === 'colony') renderPicker();
    else if (view === 'colony-edit') loadColony(arg);
    else if (view === 'posts') loadPosts();
    else if (view === 'post-edit') (arg === 'new' ? newPost() : editPost(arg));
    else if (view === 'network') loadNetwork();
    else if (view === 'notices') loadNotices();
    else if (view === 'notice-edit') (arg === 'new' ? newNotice() : editNotice(arg));
    else if (view === 'access') loadAccessPanel();
    else if (view === 'profile') loadProfile();
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', function (e) { if (anyDirty()) { e.preventDefault(); e.returnValue = ''; } });

  // Rows that act as links (a <div> so the buttons inside stay valid HTML).
  document.addEventListener('click', function (e) {
    var row = e.target.closest('.row.link'); if (!row) return;
    if (e.target.closest('a,button,input,select,label')) return;
    go(row.dataset.href);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return; var row = e.target.closest && e.target.closest('.row.link'); if (row && e.target === row) go(row.dataset.href);
  });
  // Search boxes: clear button.
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.search-clear'); if (!b) return;
    var inp = q(b.dataset.for); inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.focus();
  });
  function syncClear(id) { var b = document.querySelector('.search-clear[data-for="' + id + '"]'); if (b) b.hidden = !q(id).value; }

  // ---- home ----------------------------------------------------------------
  function greeting() { var h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }
  function firstName() { var n = (netMe && netMe.name) || ME.name || ''; return n.split(/\s+/)[0] || ''; }
  function colonyNames(list) {
    var names = list.map(function (c) { return c.name; });
    if (names.length <= 2) return names.join(' and ');
    return names.slice(0, 2).join(', ') + ' and ' + (names.length - 2) + ' more';
  }
  function checkItem(done, label, href, action, icon) {
    var li = el('li', done ? '' : 'todo');
    var dot = el('span', 'dot'); dot.appendChild(svg(done ? 'check' : (icon || 'info'), true)); li.appendChild(dot);
    li.appendChild(el('span', 'lbl', label));
    if (!done && href) li.appendChild(link('', href, null, action));
    return li;
  }
  function renderHomeColony(c) {
    var body = clear(q('hc-body'));
    var photos = realList(c.photos);
    var items = [
      [photos.length > 0, 'Main photo set', 'No main photo yet', 'Add a photo', 'camera'],
      [photos.length >= 3, plural(photos.length, 'photo') + ' of ' + MAXP, photos.length ? 'Only ' + photos.length + ' of ' + MAXP + ' photos' : 'No photos yet', 'Add photos', 'camera'],
      [!!(String(c.contact_person || '').trim() && String(c.email_address || '').trim()), 'Contact person and email', 'Contact person or email missing', 'Fill in', 'mail'],
      [!!String(c.web_page || '').trim(), 'Website', 'No website', 'Add', 'globe'],
      [!!String(c.art_field || '').trim(), 'Art fields chosen', 'No art fields chosen', 'Choose', 'palette'],
      [!!String(c.time_period || '').trim(), 'Time period', 'Time period is empty', 'Fill in', 'cal'],
    ];
    var done = items.filter(function (i) { return i[0]; }).length;
    var stat = el('div', 'stat'); stat.appendChild(el('b', null, String(done))); stat.appendChild(el('span', null, 'of ' + items.length + ' things done')); body.appendChild(stat);
    var meter = el('div', 'meter'); var bar = el('i'); bar.style.width = Math.round(done / items.length * 100) + '%'; meter.appendChild(bar); body.appendChild(meter);
    var ul = el('ul', 'check');
    items.forEach(function (i) { ul.appendChild(checkItem(i[0], i[0] ? i[1] : i[2], '#colony/' + c.id, i[3], i[4])); });
    body.appendChild(ul);
    q('hc-title').textContent = c.art_colony_name || 'Your colony';
    q('hc-sub').textContent = [c.city, c.country].filter(Boolean).join(', ') + ' · live on the site';
    q('hc-map').href = mapUrl(c.id);
    q('hc-edit').href = '#colony/' + c.id;
  }
  function renderHomeColonies() {
    var body = clear(q('hc-body'));
    q('hc-title').textContent = 'Your colonies';
    q('hc-sub').textContent = plural(colonies.length, 'colony', 'colonies') + ' you can edit';
    q('hc-map').href = SITE + '/map.html';
    q('hc-edit').href = '#colony';
    var list = el('div', 'mini');
    colonies.forEach(function (c) {
      var a = link('', '#colony/' + c.id); a.appendChild(svg('pin', true));
      var d = el('div'); d.appendChild(el('b', null, c.name)); d.appendChild(el('small', null, [c.place, c.photos ? plural(c.photos, 'photo') : 'no photos'].filter(Boolean).join(' · '))); a.appendChild(d);
      list.appendChild(a);
    });
    body.appendChild(list);
  }
  function renderHomeAdmin() {
    var body = clear(q('ha-body'));
    var withPhotos = colonies.filter(function (c) { return c.photos > 0; }).length;
    var g = el('div', 'stats');
    [[colonies.length, 'colonies'], [withPhotos, 'with photos'], [posts ? posts.length : '–', 'posts']].forEach(function (s) {
      var d = el('div', 'stat'); d.appendChild(el('b', null, String(s[0]))); d.appendChild(el('span', null, s[1])); g.appendChild(d);
    });
    body.appendChild(g);
    var ul = el('ul', 'check');
    var ph = colonies.length - withPhotos;
    ul.appendChild(checkItem(ph === 0, ph ? plural(ph, 'colony still uses', 'colonies still use') + ' the placeholder photo' : 'Every colony has a photo', '#colony', 'Show', 'camera'));
    if (dirPeople) {
      var never = dirPeople.filter(function (p) { return p.signed_in === false; }).length;
      ul.appendChild(checkItem(never === 0, never ? plural(never, 'person', 'people') + ' invited, not signed in yet' : 'Everyone invited has signed in', '#access', 'Access', 'users'));
      var nf = dirPeople.filter(function (p) { return p.signed_in && !p.filled; }).length;
      ul.appendChild(checkItem(nf === 0, nf ? plural(nf, 'organizer') + ' signed in but no profile yet' : 'Everyone signed in has a profile', '#network', 'Directory', 'users'));
    }
    if (posts) { var dr = posts.filter(function (p) { return p.draft; }).length; ul.appendChild(checkItem(dr === 0, dr ? plural(dr, 'draft') + ' waiting on the blog' : 'No drafts waiting', '#posts', 'Posts', 'post')); }
    body.appendChild(ul);
  }
  function miniNotice(n) {
    var a = link('', '#notices'); var pill = el('span', 'pill t-' + n.type, NOTICE_SHORT[n.type] || n.type); a.appendChild(pill);
    var d = el('div'); d.appendChild(el('b', null, n.title));
    var who = n.mine ? 'You' : (n.author.name || n.author.email);
    d.appendChild(el('small', null, who + (n.deadline ? ' · deadline ' + fmtDate(n.deadline) : ' · ' + fmtDate(n.created_at)))); a.appendChild(d);
    return a;
  }
  function miniPost(p) {
    var a = link('', '#post/' + p.slug); a.appendChild(el('span', 'pill ' + (p.draft ? 'draft' : 'ok'), p.draft ? 'Draft' : 'Live'));
    var d = el('div'); d.appendChild(el('b', null, p.title)); d.appendChild(el('small', null, fmtDate(p.date) + (p.author ? ' · ' + p.author : ''))); a.appendChild(d);
    return a;
  }
  function renderHomeLists() {
    var nb = clear(q('home-notices'));
    if (notices) {
      q('hn-sub').textContent = notices.length ? plural(notices.length, 'open notice') : 'Nothing open right now';
      if (!notices.length) nb.appendChild(el('p', 'empty', 'No open notices. Post the first one.'));
      notices.slice(0, 3).forEach(function (n) { nb.appendChild(miniNotice(n)); });
    } else nb.appendChild(el('p', 'empty', 'Loading…'));
    var pb = clear(q('home-posts'));
    if (posts) {
      var live = posts.filter(function (p) { return !p.draft; }).length, drafts = posts.length - live;
      q('hp-sub').textContent = posts.length ? [plural(live, 'published', 'published'), drafts ? plural(drafts, 'draft') : ''].filter(Boolean).join(' · ') : 'No posts yet';
      if (!posts.length) pb.appendChild(el('p', 'empty', 'Nothing written yet. Your first post could be a short introduction of the colony.'));
      posts.slice(0, 3).forEach(function (p) { pb.appendChild(miniPost(p)); });
    } else pb.appendChild(el('p', 'empty', 'Loading…'));
  }
  async function loadHome() {
    q('hello-h1').textContent = greeting() + (firstName() ? ', ' + firstName() : '');
    var p = clear(q('hello-p'));
    if (IS_ADMIN) { p.appendChild(document.createTextNode('You manage all ')); p.appendChild(el('b', null, plural(colonies.length, 'colony', 'colonies'))); p.appendChild(document.createTextNode(', the blog and who has access. Changes go live on the site in about two minutes.')); }
    else if (colonies.length) { p.appendChild(document.createTextNode('You look after ')); p.appendChild(el('b', null, colonyNames(colonies))); p.appendChild(document.createTextNode('. Everything you change here goes live on the site in about two minutes.')); }
    else p.textContent = 'No colony is assigned to your account yet. Write to the project team and they will connect you to yours.';
    q('home-colony').hidden = IS_ADMIN || !colonies.length;
    q('home-admin').hidden = !IS_ADMIN;
    q('tool-colony').hidden = !IS_ADMIN && !colonies.length;
    renderHomeLists();
    if (IS_ADMIN) renderHomeAdmin();
    else if (colonies.length > 1) renderHomeColonies();
    else if (colonies.length === 1) {
      if (currentColony && String(currentColony.id) === String(colonies[0].id)) renderHomeColony(currentColony);
      else { clear(q('hc-body')).appendChild(el('p', 'empty', 'Loading…')); q('hc-title').textContent = colonies[0].name; }
    }
    var jobs = [fetchPosts(), fetchNotices()];
    if (!IS_ADMIN && colonies.length === 1) jobs.push(api('/api/colony/' + colonies[0].id).then(function (o) { currentColony = o.colony; currentColony.id = colonies[0].id; }).catch(function () {}));
    if (IS_ADMIN && !dirPeople) jobs.push(fetchDirectory().catch(function () {}));
    await Promise.all(jobs);
    if (current !== 'home') return;
    renderHomeLists();
    if (IS_ADMIN) renderHomeAdmin();
    else if (colonies.length === 1 && currentColony) renderHomeColony(currentColony);
  }

  // ---- colony picker (admins, organizers with several colonies) ------------
  var pickerTerm = '', pickerCountry = '';
  function renderCountryChips() {
    var box = clear(q('picker-countries'));
    var cs = {}; colonies.forEach(function (c) { cs[c.country] = (cs[c.country] || 0) + 1; });
    var names = Object.keys(cs).sort(function (a, b) { var ia = COUNTRY_ORDER.indexOf(a), ib = COUNTRY_ORDER.indexOf(b); return (ia === -1 ? 50 : ia) - (ib === -1 ? 50 : ib) || a.localeCompare(b); });
    box.hidden = names.length < 2;
    function mk(label, val, n) { var b = el('button', 'chip' + (pickerCountry === val ? ' on' : '')); b.type = 'button'; b.appendChild(document.createTextNode(label + ' ')); b.appendChild(el('span', 'n', String(n))); b.onclick = function () { pickerCountry = val; renderCountryChips(); renderPicker(); }; box.appendChild(b); }
    mk('All', '', colonies.length); names.forEach(function (c) { mk(c, c, cs[c]); });
  }
  function renderPicker() {
    renderCountryChips();
    var box = clear(q('picker-results')); var term = foldSearch(pickerTerm.trim());
    var list = colonies.filter(function (c) {
      if (pickerCountry && c.country !== pickerCountry) return false;
      if (term && foldSearch(c.name + ' ' + (c.place || '')).indexOf(term) === -1) return false;
      return true;
    });
    q('colony-count').textContent = plural(colonies.length, 'colony', 'colonies') + (IS_ADMIN ? ' in Serbia, Bosnia and Herzegovina and North Macedonia.' : ' you can edit.');
    q('picker-shown').textContent = list.length !== colonies.length ? 'Showing ' + list.length + ' of ' + colonies.length : '';
    if (!list.length) { box.appendChild(el('p', 'empty', 'No colonies match.')); return; }
    list.forEach(function (c) {
      var row = el('div', 'row link' + (String(c.id) === String(currentId) ? ' on' : '')); row.dataset.href = '#colony/' + c.id; row.tabIndex = 0;
      if (c.photo) { var im = el('img', 'thumb'); im.src = photoSrc(c.photo); im.alt = ''; im.loading = 'lazy'; row.appendChild(im); }
      else { var ph = el('span', 'thumb ph'); ph.appendChild(svg('image')); row.appendChild(ph); }
      var t = el('div', 't'); t.appendChild(el('b', null, c.name));
      t.appendChild(el('span', null, [c.place, c.country, c.photos ? plural(c.photos, 'photo') : 'no photos'].filter(Boolean).join(' · '))); row.appendChild(t);
      var acts = el('div', 'acts'); if (!c.photos) acts.appendChild(el('span', 'pill warn', 'Placeholder photo')); acts.appendChild(svg('right')).classList.add('chev'); row.appendChild(acts);
      box.appendChild(row);
    });
  }
  q('picker-search').addEventListener('input', function (e) { pickerTerm = e.target.value; syncClear('picker-search'); renderPicker(); });

  // ---- colony editor -------------------------------------------------------
  var FIELDS = ['art_colony_name', 'city', 'place', 'country', 'latitude', 'longitude', 'scope', 'art_colony_organisers', 'time_period', 'duration'];
  var MULTI = ['contact_person', 'contact_telephone', 'email_address', 'web_page'];
  function splitMulti(v) { return String(v || '').split(/\s*[&,;]\s*|\s+and\s+|\s+i\s+/i).map(function (s) { return s.trim(); }).filter(Boolean); }
  function addMulti(name, value) {
    var box = q('ml-' + name); var row = el('div', 'r');
    var inp = el('input'); inp.type = name === 'email_address' ? 'email' : name === 'web_page' ? 'url' : name === 'contact_telephone' ? 'tel' : 'text'; inp.value = value || '';
    if (name === 'web_page') inp.placeholder = 'https://'; if (name === 'email_address') inp.placeholder = 'name@example.com'; if (name === 'contact_telephone') inp.placeholder = '+381 …';
    var rm = btn('ghost icon', 'x', null, 'Remove'); rm.onclick = function () { row.remove(); if (!box.children.length) addMulti(name, ''); setColonyDirty(true); };
    row.appendChild(inp); row.appendChild(rm); box.appendChild(row); return inp;
  }
  function renderMulti(name, values) { clear(q('ml-' + name)); (values && values.length ? values : ['']).forEach(function (v) { addMulti(name, v); }); }
  function getMulti(name) { return [].slice.call(q('ml-' + name).querySelectorAll('input')).map(function (i) { return i.value.trim(); }).filter(Boolean).join(', '); }
  document.querySelectorAll('[data-add-multi]').forEach(function (b) { b.addEventListener('click', function () { addMulti(b.dataset.addMulti, '').focus(); }); });

  function setArtField(v) {
    var chips = document.querySelectorAll('#art-chips .chip'); chips.forEach(function (ch) { ch.classList.remove('on'); });
    var other = [];
    String(v).split(',').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (t) {
      var m = null; chips.forEach(function (ch) { if (ch.dataset.v.toLowerCase() === t.toLowerCase()) m = ch; });
      if (m) m.classList.add('on'); else other.push(t);
    });
    q('f-art_field_other').value = other.join(', ');
  }
  function getArtField() {
    var out = []; document.querySelectorAll('#art-chips .chip.on').forEach(function (ch) { out.push(ch.dataset.v); });
    q('f-art_field_other').value.split(',').forEach(function (s) { s = s.trim(); if (s) out.push(s); });
    return out.join(', ');
  }
  q('art-chips').addEventListener('click', function (e) { var ch = e.target.closest('.chip'); if (!ch) return; ch.classList.toggle('on'); setColonyDirty(true); });

  var savebar = q('savebar');
  function setColonyDirty(v) {
    colonyDirty = v; savebar.classList.toggle('dirty', v); savebar.classList.remove('busy');
    q('save-st').textContent = v ? 'Unsaved changes' : 'All changes saved'; q('discard').hidden = !v;
  }
  function setColonyBusy(t) { savebar.classList.add('busy'); q('save-st').textContent = t; }
  q('colony-form').addEventListener('input', function (e) { if (e.target.type !== 'file') setColonyDirty(true); });
  q('colony-form').addEventListener('change', function (e) { if (e.target.type !== 'file') setColonyDirty(true); });
  q('discard').addEventListener('click', function () { if (currentColony) fillColony(currentColony); setColonyDirty(false); });
  q('save-colony').addEventListener('click', saveColony);

  function fillColony(c) {
    FIELDS.forEach(function (f) { var e = q('f-' + f); if (e) e.value = c[f] == null ? '' : c[f]; });
    MULTI.forEach(function (f) { renderMulti(f, splitMulti(c[f])); });
    setArtField(c.art_field || '');
  }
  function renderColonyHead(c) {
    q('ce-title').textContent = c.art_colony_name || ('Colony ' + currentId);
    q('ce-sub').textContent = [c.city, c.country].filter(Boolean).join(', ');
    q('ce-map').href = mapUrl(currentId);
    q('ce-back').hidden = colonies.length <= 1;
  }
  async function loadColony(id) {
    q('ce-title').textContent = 'Loading…'; q('ce-sub').textContent = ''; q('ce-back').hidden = colonies.length <= 1;
    q('colony-form').hidden = true;
    try {
      var out = await api('/api/colony/' + id);
      if (current !== 'colony-edit') return;
      var c = out.colony; c.id = id; currentId = id; currentColony = c;
      fillColony(c); currentPhotos = realList(c.photos); q('photo-file').value = ''; renderPhotos();
      renderColonyHead(c); setColonyDirty(false); q('colony-form').hidden = false;
    } catch (e) { fail('Could not open the colony', e); go(colonies.length > 1 ? '#colony' : '#home'); }
  }
  async function saveColony() {
    if (!currentId || savebar.classList.contains('busy')) return;
    var body = {};
    FIELDS.forEach(function (f) { body[f] = q('f-' + f).value; });
    MULTI.forEach(function (f) { body[f] = getMulti(f); });
    body.art_field = getArtField();
    ['latitude', 'longitude'].forEach(function (k) { var v = String(body[k]).trim(); if (v !== '' && !isNaN(Number(v))) body[k] = Number(v); else delete body[k]; });
    setColonyBusy('Saving…');
    try {
      var out = await api('/api/colony/' + currentId, jsonReq('PUT', body));
      Object.keys(body).forEach(function (k) { currentColony[k] = body[k]; });
      var pc = colonies.filter(function (c) { return String(c.id) === String(currentId); })[0];
      if (pc) { pc.name = body.art_colony_name || pc.name; pc.country = body.country || pc.country; }
      renderColonyHead(currentColony); setColonyDirty(false);
      toast(out.unchanged ? 'No changes to save' : 'Saved · live on the site in about 2 minutes');
    } catch (e) { setColonyDirty(true); fail('Save failed', e); }
  }

  // Section jump links (desktop sidebar, chip strip on phones).
  var jumpLinks = document.querySelectorAll('[data-jump]');
  jumpLinks.forEach(function (j) {
    j.addEventListener('click', function (e) {
      e.preventDefault(); var t = q(j.dataset.jump); if (!t) return;
      var y = t.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - (innerWidth <= 760 ? 70 : 84);
      main.scrollTo({ top: y }); jumpLinks.forEach(function (x) { x.classList.toggle('on', x === j); });
    });
  });
  main.addEventListener('scroll', function () {
    if (current !== 'colony-edit') return;
    var best = null, top = main.getBoundingClientRect().top + 120;
    jumpLinks.forEach(function (j) { var t = q(j.dataset.jump); if (t && t.getBoundingClientRect().top <= top) best = j; });
    if (best) jumpLinks.forEach(function (x) { x.classList.toggle('on', x === best); });
  }, { passive: true });

  // ---- photo grids (colony photos + post gallery) --------------------------
  function renderGrid(id, list, markMain, act, busy, addLabel, fileId) {
    var box = clear(q(id));
    list.forEach(function (p, i) {
      var t = el('div', 'ptile' + (markMain && i === 0 ? ' main' : ''));
      var img = el('img'); img.src = photoSrc(p); img.alt = ''; img.loading = 'lazy'; t.appendChild(img);
      if (markMain && i === 0) t.appendChild(el('span', 'badge', 'Main'));
      var bar = el('div', 'pb');
      function mk(icon, title, fn, dis) { var b = btn('', icon, null, title); b.className = ''; b.disabled = !!dis || busy; b.onclick = fn; bar.appendChild(b); }
      if (markMain && i > 0) mk('star', 'Make this the main photo', function () { act('main', i); });
      mk('left', 'Move left', function () { act('move', i, -1); }, i === 0);
      mk('right', 'Move right', function () { act('move', i, 1); }, i === list.length - 1);
      mk('trash', 'Remove', function () { act('remove', i); });
      t.appendChild(bar); box.appendChild(t);
    });
    if (addLabel) {
      var add = el('label', 'ptile add' + (busy ? ' busy' : '')); add.htmlFor = fileId; add.appendChild(svg(list.length ? 'plus' : 'camera')); add.appendChild(el('span', null, addLabel)); box.appendChild(add);
    }
  }
  function reorder(list, op, i, d) {
    var a = list.slice();
    if (op === 'main') a.unshift(a.splice(i, 1)[0]);
    else if (op === 'move') { var j = i + d; if (j < 0 || j >= a.length) return a; var x = a[i]; a[i] = a[j]; a[j] = x; }
    else if (op === 'remove') a.splice(i, 1);
    return a;
  }
  function renderPhotos() {
    var room = MAXP - currentPhotos.length;
    renderGrid('photo-grid', currentPhotos, true, photoAction, photoBusy, room > 0 ? (currentPhotos.length ? 'Add up to ' + room + ' more' : 'Add the first photo') : null, 'photo-file');
    q('photo-count').textContent = currentPhotos.length + ' of ' + MAXP + ' · the first one is the main photo on the map and cards.';
    q('photo-file').disabled = photoBusy || room <= 0;
    q('photo-add-btn').hidden = room <= 0;
  }
  function setPhotoStatus(t) { q('photo-status').textContent = t; }
  async function photoAction(op, i, d) {
    if (photoBusy || !currentId) return;
    if (op === 'remove' && !confirm('Remove this photo? It will be deleted from the site.')) return;
    var next = reorder(currentPhotos, op, i, d); photoBusy = true; renderPhotos(); setPhotoStatus('Saving…');
    try {
      var out = await api('/api/colony/' + currentId + '/photos', jsonReq('PUT', { photos: next }));
      currentPhotos = realList(out.photos || next); setPhotoStatus('');
      toast(out.unchanged ? 'No change' : (op === 'remove' ? 'Photo removed' : 'Photos saved') + ' · live in about 2 minutes');
    } catch (e) { setPhotoStatus(''); fail('Could not save photos', e); }
    photoBusy = false; renderPhotos(); if (currentColony) currentColony.photos = currentPhotos.slice();
  }
  async function addPhotos(files) {
    var list = [].slice.call(files || []); q('photo-file').value = '';
    if (!currentId || photoBusy || !list.length) return;
    var room = MAXP - currentPhotos.length;
    if (list.length > room) { toast('A colony can have up to ' + MAXP + ' photos. Only the first ' + room + ' will be added.', 'err'); list = list.slice(0, room); }
    if (!list.length) return;
    photoBusy = true; renderPhotos(); var done = 0;
    for (var k = 0; k < list.length; k++) {
      setPhotoStatus('Uploading ' + (k + 1) + ' of ' + list.length + '…');
      try {
        var blob = await optimizeImage(list[k]); var fd = new FormData(); fd.append('file', blob, 'photo.webp');
        var out = await api('/api/colony/' + currentId + '/photo', { method: 'POST', body: fd });
        localPrev[out.photo] = URL.createObjectURL(blob); currentPhotos = realList(out.photos); done++; renderPhotos();
      } catch (e) { fail('Upload failed', e); break; }
    }
    photoBusy = false; setPhotoStatus(''); renderPhotos();
    if (currentColony) currentColony.photos = currentPhotos.slice();
    var pc = colonies.filter(function (c) { return String(c.id) === String(currentId); })[0];
    if (pc) { pc.photos = currentPhotos.length; pc.photo = currentPhotos[0] || ''; }
    if (done) toast((done > 1 ? done + ' photos' : 'Photo') + ' added · live in about 2 minutes');
  }
  q('photo-file').addEventListener('change', function () { addPhotos(this.files); });
  function optimizeImage(file) {
    return new Promise(function (resolve) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { resolve(file); return; }
      var url = URL.createObjectURL(file); var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url); var maxW = 1600, w = img.naturalWidth, h = img.naturalHeight;
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
        var cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h);
        cv.toBlob(function (b) { resolve(b && b.size < file.size ? b : file); }, 'image/webp', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  // ---- blog posts ----------------------------------------------------------
  async function fetchPosts() {
    try { var d = await api('/api/posts'); posts = d.posts || []; taggable = d.taggable || []; } catch (e) { if (!posts) posts = []; fail('Could not load posts', e); }
    return posts;
  }
  async function loadPosts() {
    if (posts) drawPosts(); else clear(q('posts-list')).appendChild(el('p', 'empty', 'Loading…'));
    await fetchPosts(); if (current === 'posts') drawPosts();
  }
  function drawPosts() {
    var box = clear(q('posts-list')); var fb = clear(q('posts-filters'));
    var live = posts.filter(function (p) { return !p.draft; }).length, drafts = posts.length - live;
    [['all', 'All', posts.length], ['live', 'Live', live], ['draft', 'Drafts', drafts]].forEach(function (f) {
      var b = el('button', 'chip' + (postFilter === f[0] ? ' on' : '')); b.type = 'button'; b.appendChild(document.createTextNode(f[1] + ' ')); b.appendChild(el('span', 'n', String(f[2])));
      b.onclick = function () { postFilter = f[0]; drawPosts(); }; fb.appendChild(b);
    });
    var t = foldSearch(postTerm.trim());
    var list = posts.filter(function (p) { return (postFilter === 'all' || (postFilter === 'draft') === !!p.draft) && (!t || foldSearch(p.title + ' ' + (p.author || '')).indexOf(t) !== -1); });
    q('posts-count').textContent = posts.length ? plural(live, 'post') + ' on the blog' + (drafts ? ', ' + plural(drafts, 'draft') : '') + '. Drafts are only visible here.' : 'News and stories for beyondthecities.org/blog. Drafts are only visible here.';
    if (!posts.length) { box.appendChild(el('p', 'empty', 'No posts yet. Start with the button above.')); return; }
    if (!list.length) { box.appendChild(el('p', 'empty', 'No posts match.')); return; }
    list.forEach(function (p) {
      var row = el('div', 'row link'); row.dataset.href = '#post/' + p.slug; row.tabIndex = 0;
      if (p.cover) { var im = el('img', 'thumb'); im.src = photoSrc(p.cover); im.alt = ''; im.loading = 'lazy'; row.appendChild(im); }
      else { var ph = el('span', 'thumb ph'); ph.appendChild(svg('image')); row.appendChild(ph); }
      var tt = el('div', 't'); tt.appendChild(el('b', null, p.title));
      var where = p.colonies && p.colonies.length ? p.colonies.map(taggableName).join(', ') : 'general post';
      tt.appendChild(el('span', null, [fmtDate(p.date), p.author, where].filter(Boolean).join(' · '))); row.appendChild(tt);
      var acts = el('div', 'acts'); acts.appendChild(el('span', 'pill ' + (p.draft ? 'draft' : 'ok'), p.draft ? 'Draft' : 'Live'));
      if (!p.draft) { var v = link('btn quiet sm', blogUrl(p.slug), 'ext', 'View', true); v.title = 'View on the blog'; acts.appendChild(v); }
      acts.appendChild(svg('right')).classList.add('chev'); row.appendChild(acts); box.appendChild(row);
    });
  }
  q('posts-search').addEventListener('input', function (e) { postTerm = e.target.value; syncClear('posts-search'); if (posts) drawPosts(); });
  function taggableName(id) { var c = taggable.filter(function (x) { return String(x.id) === String(id); })[0]; if (c) return c.name; var pc = colonies.filter(function (x) { return String(x.id) === String(id); })[0]; return pc ? pc.name : ('#' + id); }

  // ---- post editor ---------------------------------------------------------
  function slugify(s) {
    var map = { 'č': 'c', 'ć': 'c', 'ž': 'z', 'š': 's', 'đ': 'dj', 'Č': 'c', 'Ć': 'c', 'Ž': 'z', 'Š': 's', 'Đ': 'dj' };
    s = String(s).replace(/[čćžšđČĆŽŠĐ]/g, function (m) { return map[m] || m; });
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  var postbar = q('post-savebar');
  function setPostDirty(v) { postDirty = v; postbar.classList.toggle('dirty', v); postbar.classList.remove('busy'); q('p-status').textContent = v ? 'Unsaved changes' : (editingSlug ? 'All changes saved' : 'Not saved yet'); }
  function setPostBusy(t) { postbar.classList.add('busy'); q('p-status').textContent = t; }
  q('post-form').addEventListener('input', function (e) { if (e.target.type !== 'file') setPostDirty(true); if (e.target.id === 'p-title') q('pe-title').textContent = e.target.value.trim() || (editingSlug ? 'Untitled post' : 'New post'); if (e.target.id === 'p-draft') renderPostSub(); });
  q('post-form').addEventListener('change', function (e) { if (e.target.type !== 'file') setPostDirty(true); if (e.target.id === 'p-draft') renderPostSub(); });
  function renderPostSub() {
    var draft = q('p-draft').checked;
    q('pe-sub').textContent = !editingSlug ? (draft ? 'New draft · stays private until you publish' : 'New post · goes on the blog when you save') : draft ? 'Draft · not on the blog' : 'Live on the blog';
    q('pe-view').hidden = !editingSlug || draft;
  }
  function setCoverPreview(p) { var img = q('p-cover-preview'); img.hidden = !p; if (p) img.src = photoSrc(p); q('p-cover-add').hidden = !!p; q('p-cover-replace').hidden = !p; q('p-cover-clear').hidden = !p; }
  function renderPostColonies() {
    var box = clear(q('p-colonies-chips'));
    postColonies.forEach(function (id) {
      var c = el('button', 'chip on'); c.type = 'button'; c.appendChild(document.createTextNode(taggableName(id))); c.appendChild(svg('x', true)); c.title = 'Remove';
      c.onclick = function () { postColonies = postColonies.filter(function (x) { return x !== String(id); }); renderPostColonies(); setPostDirty(true); }; box.appendChild(c);
    });
    var rest = taggable.filter(function (c) { return postColonies.indexOf(String(c.id)) === -1; });
    if (rest.length) {
      var sel = el('select', 'chip'); var ph = el('option', null, '+ add colony'); ph.value = ''; sel.appendChild(ph);
      rest.forEach(function (c) { var o = el('option', null, c.name); o.value = c.id; sel.appendChild(o); });
      sel.onchange = function () { if (sel.value) { postColonies.push(String(sel.value)); renderPostColonies(); setPostDirty(true); } }; box.appendChild(sel);
    }
  }
  function initEditor() {
    if (bodyEditor) return;
    bodyEditor = new toastui.Editor({
      el: q('p-body'), height: innerWidth < 640 ? '380px' : '460px', initialEditType: 'wysiwyg', previewStyle: 'tab',
      usageStatistics: false, autofocus: false, hideModeSwitch: true, placeholder: 'Write your post here…', initialValue: '',
      toolbarItems: [['heading', 'bold', 'italic'], ['link', 'image'], ['ul', 'ol', 'quote', 'hr']],
      hooks: { addImageBlobHook: function (blob, cb) { queueBodyImage(blob, cb); return false; } },
    });
    bodyEditor.on('change', function () { if (!bodyLoading) setPostDirty(true); });
  }
  function queueBodyImage(file, cb) { bodyImgQueue.push({ file: file, cb: cb }); runBodyImages(); }
  async function runBodyImages() {
    if (bodyImgBusy) return; bodyImgBusy = true; var ok = 0;
    while (bodyImgQueue.length) {
      var job = bodyImgQueue.shift(); setPostBusy('Uploading image' + (bodyImgQueue.length ? ' (' + bodyImgQueue.length + ' more queued)' : '') + '…');
      try {
        var blob = await optimizeImage(job.file); var fd = new FormData(); fd.append('file', blob, 'image.webp'); fd.append('kind', 'inline'); fd.append('title', q('p-title').value || '');
        var out = await api('/api/upload', { method: 'POST', body: fd }); job.cb(out.path, ''); ok++;
      } catch (e) { fail('Image upload failed', e); }
    }
    bodyImgBusy = false; setPostDirty(true); if (ok) toast('Image' + (ok > 1 ? 's' : '') + ' inserted · remember to save the post');
  }
  function unwrap(md) {
    var L = String(md || '').split('\n'); var out = []; var BLK = /^\s*([#>|!]|[-*+]\s|\d+[.)]\s|```|---|___|\*\*\*|<)/;
    for (var i = 0; i < L.length; i++) {
      var cur = L[i], prev = out.length ? out[out.length - 1] : '';
      if (out.length && prev.trim() && cur.trim() && !BLK.test(cur) && !/^\s*([#|!]|```)/.test(prev) && !/  $/.test(prev) && !/\\$/.test(prev)) out[out.length - 1] = prev + ' ' + cur.trim(); else out.push(cur);
    }
    return out.join('\n');
  }
  function setBody(md) { initEditor(); bodyLoading = true; bodyEditor.setMarkdown(unwrap(md), false); bodyLoading = false; bodyEditor.changeMode('wysiwyg', true); }
  function getBody() { return bodyEditor ? bodyEditor.getMarkdown() : ''; }
  function renderGallery() {
    renderGrid('pg-grid', postGallery, false, galleryAction, galleryBusy, postGallery.length < MAXG ? (postGallery.length ? 'Add more' : 'Add gallery photos') : null, 'pg-file');
    q('pg-count').textContent = postGallery.length ? postGallery.length + ' of ' + MAXG : '';
    q('pg-file').disabled = galleryBusy || postGallery.length >= MAXG;
  }
  function galleryAction(op, i, d) { if (galleryBusy) return; postGallery = reorder(postGallery, op, i, d); renderGallery(); setPostDirty(true); }
  async function addGallery(files) {
    var list = [].slice.call(files || []); q('pg-file').value = '';
    if (galleryBusy || !list.length) return;
    var room = MAXG - postGallery.length;
    if (list.length > room) { toast('Up to ' + MAXG + ' gallery photos. Only the first ' + room + ' will be added.', 'err'); list = list.slice(0, room); }
    if (!list.length) return; galleryBusy = true; renderGallery();
    for (var k = 0; k < list.length; k++) {
      setPostBusy('Uploading ' + (k + 1) + ' of ' + list.length + '…');
      try {
        var blob = await optimizeImage(list[k]); var fd = new FormData(); fd.append('file', blob, 'gallery.webp'); fd.append('kind', 'gallery'); fd.append('title', q('p-title').value || '');
        var out = await api('/api/upload', { method: 'POST', body: fd }); localPrev[out.path] = URL.createObjectURL(blob); postGallery.push(out.path); renderGallery();
      } catch (e) { fail('Upload failed', e); break; }
    }
    galleryBusy = false; renderGallery(); setPostDirty(true); toast('Uploaded · remember to save the post');
  }
  q('pg-file').addEventListener('change', function () { addGallery(this.files); });
  async function uploadCover() {
    var f = q('p-cover-file').files[0]; if (!f) return;
    q('p-cover-preview').src = URL.createObjectURL(f); q('p-cover-preview').hidden = false; q('p-cover-add').hidden = true; setPostBusy('Optimising cover…');
    try {
      var blob = await optimizeImage(f); setPostBusy('Uploading cover…');
      var fd = new FormData(); fd.append('file', blob, 'cover.webp'); fd.append('title', q('p-title').value || '');
      if (postCover && postCover !== savedCover && postCover.indexOf('/assets/images/blog/') === 0) fd.append('replace', postCover);
      var out = await api('/api/upload', { method: 'POST', body: fd });
      postCover = out.path; localPrev[postCover] = q('p-cover-preview').src; setCoverPreview(postCover); setPostDirty(true); toast('Cover uploaded · remember to save the post');
    } catch (e) { setCoverPreview(postCover); setPostDirty(postDirty); fail('Cover upload failed', e); }
    q('p-cover-file').value = '';
  }
  q('p-cover-file').addEventListener('change', uploadCover);
  q('p-cover-clear').addEventListener('click', function () { postCover = ''; setCoverPreview(''); setPostDirty(true); });
  function resetPostForm() {
    ['p-title', 'p-author', 'p-excerpt', 'p-tags'].forEach(function (id) { q(id).value = ''; });
    q('p-date').value = new Date().toISOString().slice(0, 10); q('p-cover-file').value = ''; postGallery = []; bodyImgQueue = [];
  }
  async function newPost() {
    if (!taggable.length && !posts) await fetchPosts();
    editingSlug = null; postCover = ''; savedCover = ''; resetPostForm();
    q('pe-title').textContent = 'New post'; q('p-draft').checked = false;
    q('p-author').value = (netMe && netMe.name) || ME.name || '';
    postColonies = IS_ADMIN ? [] : taggable.map(function (c) { return String(c.id); });
    renderPostColonies(); setCoverPreview(''); renderGallery(); q('pe-delete').hidden = true;
    setBody(''); renderPostSub(); setPostDirty(false); q('p-title').focus();
  }
  async function editPost(slug) {
    q('pe-title').textContent = 'Loading…'; q('pe-sub').textContent = '';
    if (!taggable.length) await fetchPosts();
    try {
      var out = await api('/api/post/' + slug); if (current !== 'post-edit') return;
      var p = out.post; editingSlug = slug; postCover = p.cover || ''; savedCover = p.cover || ''; resetPostForm();
      q('pe-title').textContent = p.title || 'Untitled post'; q('p-title').value = p.title || ''; q('p-date').value = p.date || ''; q('p-author').value = p.author || '';
      q('p-excerpt').value = p.excerpt || ''; q('p-tags').value = (p.tags || []).join(', '); postColonies = (p.colonies || []).map(String); renderPostColonies();
      q('p-draft').checked = !!p.draft; setCoverPreview(postCover); postGallery = realList(p.gallery); renderGallery();
      q('pe-delete').hidden = false; q('pe-view').href = blogUrl(slug); setBody(p.body || ''); renderPostSub(); setPostDirty(false);
    } catch (e) { fail('Could not open the post', e); go('#posts'); }
  }
  async function savePost() {
    var title = q('p-title').value.trim();
    if (!title) { toast('Give the post a title first', 'err'); q('p-title').focus(); return; }
    if (galleryBusy || bodyImgBusy || postbar.classList.contains('busy')) { toast('Wait for the uploads to finish', 'err'); return; }
    var slug = editingSlug || slugify(title);
    if (!slug) { toast('Could not build a web address from that title', 'err'); return; }
    var body = {
      title: title, date: q('p-date').value || '', author: q('p-author').value, excerpt: q('p-excerpt').value, cover: postCover, gallery: postGallery.slice(),
      body: getBody(), draft: q('p-draft').checked, tags: q('p-tags').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean), colonies: postColonies.slice(),
    };
    setPostBusy('Saving…');
    try {
      await api('/api/post/' + slug, jsonReq('PUT', body));
      postDirty = false; posts = null;
      toast(body.draft ? 'Draft saved' : 'Post saved · live on the blog in about 2 minutes'); go('#posts');
    } catch (e) { setPostDirty(true); fail('Save failed', e); }
  }
  async function deletePost() {
    if (!editingSlug || !confirm('Delete this post? This cannot be undone.')) return;
    try { await api('/api/post/' + editingSlug, { method: 'DELETE' }); postDirty = false; posts = null; toast('Post deleted'); go('#posts'); }
    catch (e) { fail('Delete failed', e); }
  }
  q('save-post').addEventListener('click', savePost); q('save-post-top').addEventListener('click', savePost); q('pe-delete').addEventListener('click', deletePost);

  // ---- network: directory --------------------------------------------------
  async function fetchMe() {
    if (netMe) return netMe;
    try { var o = await api('/api/network/me'); netMe = o.profile; renderMe(); } catch (e) { /* profile is optional for the rest of the studio */ }
    return netMe;
  }
  async function fetchDirectory() {
    var o = await api('/api/network/directory'); dirPeople = o.people || []; dirAdmin = !!o.isAdmin; community = o.community || {}; renderCommunity(); return dirPeople;
  }
  async function fetchNotices() {
    try { var o = await api('/api/network/notices'); notices = o.notices || []; noticesMine = o.mine || []; } catch (e) { if (!notices) { notices = []; } }
    var n = notices.length; document.querySelectorAll('.notice-n').forEach(function (x) { x.textContent = String(n); x.hidden = !n; });
    return notices;
  }
  function renderCommunity() {
    var a = q('community-link'); var note = q('community-admin');
    if (community && community.url) { a.href = community.url; a.querySelector('span').textContent = community.label || 'Group chat'; a.hidden = false; note.hidden = true; }
    else { a.hidden = true; note.hidden = !IS_ADMIN; }
  }
  var AV_COLORS = ['#1c1c1c', '#726a5d', '#1c5f9c', '#2f6f4f', '#8a5a3c', '#5b4a7a'];
  function avatarFor(name) { var s = 0; for (var i = 0; i < name.length; i++) s = (s * 31 + name.charCodeAt(i)) >>> 0; var a = el('span', 'avatar', initial(name)); a.style.background = AV_COLORS[s % AV_COLORS.length]; return a; }
  function phoneDigits(p) { var d = String(p || '').replace(/\D/g, ''); if (d.indexOf('00') === 0) d = d.slice(2); return d; }
  function personMatches(p, t) { if (!t) return true; var hay = [p.name, p.email, p.about].concat(p.colonies.map(function (c) { return c.name + ' ' + c.city + ' ' + c.country; })).join(' '); return foldSearch(hay).indexOf(t) !== -1; }
  function groupOf(p) { if (p.countries.length) return p.countries[0]; return p.role === 'admin' ? 'Project team' : 'Other'; }
  function personCard(p) {
    var card = el('div', 'person' + (p.me ? ' me' : ''));
    var ph = el('div', 'ph'); var name = p.name || p.email || 'No name yet'; ph.appendChild(avatarFor(name));
    var d = el('div'); var b = el('b', null, name); d.appendChild(b);
    if (p.me) d.appendChild(el('span', 'pill draft', 'You'));
    else if (p.role === 'admin') d.appendChild(el('span', 'role ' + (p.owner ? 'maintainer' : 'admin'), p.owner ? 'maintainer' : 'admin'));
    if (p.colonies.length) {
      var w = el('div', 'where'); w.appendChild(svg('pin', true)); var span = el('span');
      p.colonies.forEach(function (c, i) { if (i) span.appendChild(document.createTextNode(' · ')); var a = link('', mapUrl(c.id), null, c.name, true); span.appendChild(a); if (c.city) span.appendChild(document.createTextNode(', ' + c.city)); });
      w.appendChild(span); d.appendChild(w);
    } else if (p.role === 'admin') { var w2 = el('div', 'where'); w2.appendChild(svg('key', true)); w2.appendChild(el('span', null, 'Beyond the Cities team')); d.appendChild(w2); }
    ph.appendChild(d); card.appendChild(ph);
    if (p.about) card.appendChild(el('p', 'about', p.about));
    if (p.me) { var h = el('p', 'hint'); h.appendChild(document.createTextNode('This is how others see you. ')); h.appendChild(link('', '#profile', null, 'Change it in My profile')); card.appendChild(h); }
    else {
      var acts = el('div', 'acts');
      if (p.email) acts.appendChild(link('btn ghost sm', 'mailto:' + p.email, 'mail', 'Email'));
      var dg = phoneDigits(p.phone);
      if (dg) { acts.appendChild(link('btn ghost sm', 'https://wa.me/' + dg, 'chat', 'WhatsApp', true)); acts.appendChild(link('btn ghost sm', 'viber://chat?number=%2B' + dg, 'phone', 'Viber')); }
      if (acts.children.length) card.appendChild(acts);
    }
    if (dirAdmin && !p.me) {
      var notes = []; if (!p.filled) notes.push('No profile yet'); if (p.visible === false) notes.push('Hidden from the directory'); if (!p.email) notes.push('Email hidden');
      if (notes.length) card.appendChild(el('p', 'admin-note', notes.join(' · ') + ' · only admins see this'));
    }
    return card;
  }
  function renderDirectory() {
    var box = clear(q('dir-list')); var t = foldSearch(dirTerm.trim());
    var note = q('dir-admin-note');
    if (dirAdmin) {
      var tot = dirPeople.length, filled = dirPeople.filter(function (p) { return p.filled; }).length, never = dirPeople.filter(function (p) { return !p.signed_in; }).length;
      note.textContent = filled + ' of ' + tot + ' accounts have filled in a profile' + (never ? ' · ' + never + ' never signed in' : '') + '. Only admins see these notes.'; note.hidden = false;
    } else note.hidden = true;
    var groups = {}, invited = [];
    dirPeople.forEach(function (p) { if (!personMatches(p, t)) return; if (dirAdmin && p.signed_in === false) { invited.push(p); return; } var g = groupOf(p); (groups[g] = groups[g] || []).push(p); });
    var names = Object.keys(groups).sort(function (a, b) { var ia = COUNTRY_ORDER.indexOf(a), ib = COUNTRY_ORDER.indexOf(b); if (ia === -1) ia = a === 'Project team' ? 99 : 50; if (ib === -1) ib = b === 'Project team' ? 99 : 50; return ia - ib || a.localeCompare(b); });
    if (!names.length && !invited.length) { box.appendChild(el('p', 'empty', t ? 'No one matches "' + dirTerm.trim() + '".' : 'No organizers yet.')); return; }
    names.forEach(function (g) {
      var h = el('div', 'group', g); h.appendChild(el('small', null, plural(groups[g].length, 'person', 'people'))); box.appendChild(h);
      var grid = el('div', 'people'); groups[g].forEach(function (p) { grid.appendChild(personCard(p)); }); box.appendChild(grid);
    });
    if (invited.length) {
      var h2 = el('div', 'group', 'Invited, not signed in yet'); h2.appendChild(el('small', null, plural(invited.length, 'person', 'people') + ' · only admins see this')); box.appendChild(h2);
      var card = el('div', 'card rows');
      invited.forEach(function (p) {
        var row = el('div', 'row'); var av = el('span', 'avatar', '?'); av.style.background = 'var(--cream)'; av.style.color = 'var(--mute)'; row.appendChild(av);
        var tt = el('div', 't'); tt.appendChild(el('b', null, p.email)); tt.appendChild(el('span', null, p.colonies.length ? p.colonies.map(function (c) { return c.name; }).join(', ') : (p.role === 'admin' ? 'admin' : 'no colony assigned'))); row.appendChild(tt);
        var acts = el('div', 'acts'); acts.appendChild(link('btn quiet sm', 'mailto:' + p.email + '?subject=' + encodeURIComponent('Beyond the Cities Studio: your invitation') + '&body=' + encodeURIComponent('Hi,\n\nyou can sign in to the Beyond the Cities Studio with this Google account at ' + location.origin + '/ to edit your colony page and join the organizers\' network.\n\n'), 'send', 'Remind by email')); row.appendChild(acts);
        card.appendChild(row);
      });
      box.appendChild(card);
    }
  }
  async function loadNetwork() {
    if (dirPeople) renderDirectory(); else clear(q('dir-list')).appendChild(el('p', 'empty', 'Loading…'));
    fetchMe(); fetchNotices();
    try { await fetchDirectory(); if (current === 'network') renderDirectory(); }
    catch (e) { if (current === 'network') { clear(q('dir-list')).appendChild(el('p', 'empty', 'Could not load the directory: ' + e.message)); } }
  }
  q('dir-search').addEventListener('input', function (e) { dirTerm = e.target.value; syncClear('dir-search'); if (dirPeople) renderDirectory(); });

  // ---- network: notice board -----------------------------------------------
  async function loadNotices() {
    if (notices) renderNotices(); else clear(q('notices-list')).appendChild(el('p', 'empty', 'Loading…'));
    fetchMe(); await fetchNotices(); if (current === 'notices') renderNotices();
  }
  function renderNoticeFilters() {
    var box = clear(q('notice-filters')); var counts = {}; notices.forEach(function (n) { counts[n.type] = (counts[n.type] || 0) + 1; });
    if (noticeFilter !== 'all' && !counts[noticeFilter]) noticeFilter = 'all';
    if (!notices.length) return;
    function mk(label, val, cnt) { var b = el('button', 'chip' + (noticeFilter === val ? ' on' : '')); b.type = 'button'; b.appendChild(document.createTextNode(label + ' ')); b.appendChild(el('span', 'n', String(cnt))); b.onclick = function () { noticeFilter = val; renderNotices(); }; box.appendChild(b); }
    mk('All', 'all', notices.length); Object.keys(NOTICE_TYPES).forEach(function (t) { if (counts[t]) mk(NOTICE_SHORT[t], t, counts[t]); });
  }
  function noticeCard(n, off) {
    var card = el('div', 'notice' + (n.mine ? ' mine' : '') + (off ? ' off' : ''));
    var top = el('div', 'top'); top.appendChild(el('span', 'pill t-' + n.type, NOTICE_SHORT[n.type] || n.type));
    if (n.deadline) {
      var d = daysUntil(n.deadline); var dl = el('span', 'dead' + (d >= 0 && d <= 7 ? ' soon' : '')); dl.appendChild(svg('clock', true));
      dl.appendChild(document.createTextNode('Deadline ' + fmtDate(n.deadline) + ' · ' + (d < 0 ? 'passed' : d === 0 ? 'today' : d === 1 ? 'tomorrow' : d + ' days left'))); top.appendChild(dl);
    } else if (!off) { var ou = el('span', 'dead'); ou.appendChild(svg('clock', true)); ou.appendChild(document.createTextNode('Open until ' + fmtDate(n.expires_at))); top.appendChild(ou); }
    if (n.mine) top.appendChild(el('span', 'pill draft', 'Your notice'));
    card.appendChild(top); card.appendChild(el('h3', null, n.title));
    var by = el('div', 'by'); by.appendChild(document.createTextNode(n.mine ? 'You' : (n.author.name || n.author.email)));
    if (n.colony) { by.appendChild(document.createTextNode(' · ')); by.appendChild(link('', mapUrl(n.colony.id), null, n.colony.name, true)); if (n.colony.city) by.appendChild(document.createTextNode(', ' + n.colony.city)); }
    by.appendChild(document.createTextNode(' · posted ' + fmtDate(n.created_at))); card.appendChild(by);
    if (n.body) card.appendChild(el('p', 'body', n.body));
    var acts = el('div', 'acts');
    if (!n.mine && !off) {
      acts.appendChild(link('btn sm', 'mailto:' + n.author.email + '?subject=' + encodeURIComponent('Re: ' + n.title), 'mail', 'Reply by email'));
      var dg = phoneDigits(n.author.phone);
      if (dg) { acts.appendChild(link('btn ghost sm', 'https://wa.me/' + dg + '?text=' + encodeURIComponent('Hi, about your notice "' + n.title + '": '), 'chat', 'WhatsApp', true)); acts.appendChild(link('btn ghost sm', 'viber://chat?number=%2B' + dg, 'phone', 'Viber')); }
    }
    if (n.can_edit) { var e = btn('ghost sm', 'edit', off ? 'Edit and repost' : 'Edit'); e.onclick = function () { go('#notice/' + n.id); }; acts.appendChild(e); }
    if (n.can_close && !n.expired) {
      if (n.status === 'open') { var c = btn('ghost sm', 'check', 'Close'); c.onclick = function () { setNoticeStatus(n.id, 'closed'); }; acts.appendChild(c); }
      else { var ro = btn('ghost sm', 'up', 'Reopen'); ro.onclick = function () { setNoticeStatus(n.id, 'open'); }; acts.appendChild(ro); }
    }
    if (n.can_delete) { var del = btn('quiet danger sm', 'trash', 'Delete'); del.onclick = function () { deleteNotice(n.id); }; acts.appendChild(del); }
    if (acts.children.length) card.appendChild(acts);
    if (off) card.appendChild(el('p', 'state', n.expired ? (n.deadline ? 'Expired: the deadline has passed. Edit it with a new deadline to repost.' : 'Expired after 90 days. Edit it to repost.') : 'Closed'));
    return card;
  }
  function renderNotices() {
    renderNoticeFilters();
    var box = clear(q('notices-list')); var list = notices.filter(function (n) { return noticeFilter === 'all' || n.type === noticeFilter; });
    if (!list.length) box.appendChild(el('p', 'empty', notices.length ? 'No notices of this type.' : 'No open notices yet. Post the first one: an open call, a partner search, an offer or a question.'));
    list.forEach(function (n) { box.appendChild(noticeCard(n, false)); });
    var ml = clear(q('notices-mine-list')); noticesMine.forEach(function (n) { ml.appendChild(noticeCard(n, true)); }); q('notices-mine').hidden = !noticesMine.length;
  }
  function fillNoticeColonies(sel) {
    clear(sel); var o = el('option', null, 'None / general'); o.value = ''; sel.appendChild(o);
    colonies.forEach(function (c) { var op = el('option', null, c.name + (c.place ? ' · ' + c.place : '')); op.value = c.id; sel.appendChild(op); });
  }
  function noticeContactLine() { q('n-contact').textContent = 'Replies come straight to you: other organizers see your email' + (netMe ? ' (' + netMe.email + ')' : '') + (netMe && netMe.phone ? ' and your phone for WhatsApp and Viber' : '') + '. Notices are visible to signed-in organizers only.'; }
  var noticebar = q('notice-savebar');
  function setNoticeDirty(v) { noticeDirty = v; noticebar.classList.toggle('dirty', v); noticebar.classList.remove('busy'); q('n-status').textContent = v ? 'Unsaved changes' : (editingNotice ? 'All changes saved' : 'Not posted yet'); }
  q('notice-form').addEventListener('input', function () { setNoticeDirty(true); });
  q('notice-form').addEventListener('change', function () { setNoticeDirty(true); });
  async function newNotice() {
    await fetchMe(); editingNotice = null; q('ne-title').textContent = 'New notice'; q('ne-sub').textContent = 'Visible to other organizers until the deadline, or for 90 days.';
    q('n-type').value = 'open_call'; q('n-title').value = ''; q('n-body').value = ''; q('n-deadline').value = '';
    var sel = q('n-colony'); fillNoticeColonies(sel); sel.value = colonies.length === 1 ? String(colonies[0].id) : '';
    q('n-save').lastChild.textContent = 'Post notice'; noticeContactLine(); setNoticeDirty(false); q('n-title').focus();
  }
  async function editNotice(id) {
    await fetchMe(); if (!notices) await fetchNotices();
    var n = notices.concat(noticesMine).filter(function (x) { return String(x.id) === String(id); })[0];
    if (!n) { toast('That notice is no longer available', 'err'); go('#notices'); return; }
    editingNotice = n.id; q('ne-title').textContent = 'Edit notice'; q('ne-sub').textContent = n.title;
    q('n-type').value = n.type; q('n-title').value = n.title; q('n-body').value = n.body || ''; q('n-deadline').value = n.deadline || '';
    var sel = q('n-colony'); fillNoticeColonies(sel); sel.value = n.colony_id || '';
    q('n-save').lastChild.textContent = (n.status !== 'open' || n.expired) ? 'Save and repost' : 'Save changes'; noticeContactLine(); setNoticeDirty(false);
  }
  async function saveNotice() {
    var title = q('n-title').value.trim(); if (!title) { toast('A title is required', 'err'); q('n-title').focus(); return; }
    noticebar.classList.add('busy'); q('n-status').textContent = 'Saving…';
    var body = { type: q('n-type').value, title: title, body: q('n-body').value, deadline: q('n-deadline').value, colony_id: q('n-colony').value };
    try {
      await api(editingNotice ? '/api/network/notice/' + editingNotice : '/api/network/notices', jsonReq(editingNotice ? 'PUT' : 'POST', body));
      noticeDirty = false; noticeFilter = 'all'; notices = null; toast(editingNotice ? 'Notice saved' : 'Notice posted'); go('#notices');
    } catch (e) { setNoticeDirty(true); fail('Could not save the notice', e); }
  }
  async function setNoticeStatus(id, status) {
    try { await api('/api/network/notice/' + id, jsonReq('PUT', { status: status })); toast(status === 'open' ? 'Notice reopened' : 'Notice closed'); await fetchNotices(); renderNotices(); }
    catch (e) { fail('Could not update the notice', e); }
  }
  async function deleteNotice(id) {
    if (!confirm('Delete this notice? This cannot be undone.')) return;
    try { await api('/api/network/notice/' + id, { method: 'DELETE' }); toast('Notice deleted'); await fetchNotices(); renderNotices(); }
    catch (e) { fail('Could not delete the notice', e); }
  }
  q('n-save').addEventListener('click', saveNotice);

  // ---- my profile ----------------------------------------------------------
  var profilebar = q('profile-savebar');
  function setProfileDirty(v) { profileDirty = v; profilebar.classList.toggle('dirty', v); profilebar.classList.remove('busy'); q('me-status').textContent = v ? 'Unsaved changes' : 'All changes saved'; }
  q('profile-form').addEventListener('input', function () { setProfileDirty(true); });
  q('profile-form').addEventListener('change', function () { setProfileDirty(true); });
  async function loadProfile() {
    q('acct-hint').textContent = IS_ADMIN ? 'You can edit every colony and post and manage who has access.' : colonies.length ? 'You can edit ' + colonyNames(colonies) + ' and the posts for ' + (colonies.length === 1 ? 'it' : 'them') + '. To change that, write to the project team.' : 'No colony is assigned to your account yet.';
    q('profile-form').hidden = true;
    await fetchMe();
    if (!netMe) { clear(q('profile-err')).appendChild(el('p', 'empty', 'Could not load your profile. Try again in a moment.')); return; }
    clear(q('profile-err'));
    q('me-name').value = netMe.name || ''; q('me-phone').value = netMe.phone || ''; q('me-about').value = netMe.about || '';
    q('me-show_email').checked = !!netMe.show_email; q('me-visible').checked = !!netMe.visible; q('me-newsletter').checked = !!netMe.newsletter;
    q('profile-form').hidden = false; setProfileDirty(false);
  }
  async function saveProfile() {
    profilebar.classList.add('busy'); q('me-status').textContent = 'Saving…';
    var body = { name: q('me-name').value, phone: q('me-phone').value, about: q('me-about').value, languages: netMe ? netMe.languages : '', show_email: q('me-show_email').checked, visible: q('me-visible').checked, newsletter: q('me-newsletter').checked };
    try { var out = await api('/api/network/me', jsonReq('PUT', body)); netMe = out.profile; renderMe(); dirPeople = null; setProfileDirty(false); toast('Profile saved'); }
    catch (e) { setProfileDirty(true); fail('Save failed', e); }
  }
  q('save-profile').addEventListener('click', saveProfile); q('save-profile-top').addEventListener('click', saveProfile);

  // ---- access (admins) -----------------------------------------------------
  var accessState = { admins: [], organizers: {} }, allColonies = [], accessOwners = [], isOwner = false;
  function colonyName(id) { var c = allColonies.filter(function (x) { return String(x.id) === String(id); })[0]; return c ? c.name : ('#' + id); }
  async function loadAccessPanel() {
    try {
      var d = await api('/api/access');
      accessState = { admins: (d.access.admins || []).slice(), organizers: JSON.parse(JSON.stringify(d.access.organizers || {})) };
      allColonies = d.colonies || []; accessOwners = d.owners || []; isOwner = !!d.isOwner;
      q('community-url').value = (d.community && d.community.url) || ''; q('community-label').value = (d.community && d.community.label) || '';
      if (!dirPeople) fetchDirectory().then(renderAccess).catch(function () {});
      renderAccess();
    } catch (e) { fail('Could not load access', e); }
  }
  function personInfo(email) { return (dirPeople || []).filter(function (p) { return (p.email || '').toLowerCase() === email.toLowerCase(); })[0]; }
  function whoBlock(email) {
    var who = el('div', 'who'); var p = personInfo(email);
    if (p && p.name) { who.appendChild(el('b', null, p.name)); who.appendChild(el('span', null, email + (p.last_login ? ' · signed in ' + fmtDate(p.last_login) : ''))); }
    else { who.appendChild(el('b', null, email)); var s = el('span'); if (p && p.signed_in === false) { s.appendChild(el('span', 'pill warn', 'Invited')); s.appendChild(document.createTextNode(' never signed in')); } else if (p && p.last_login) s.textContent = 'signed in ' + fmtDate(p.last_login); who.appendChild(s); }
    return who;
  }
  function renderAccess() {
    var ab = clear(q('admins-list'));
    accessOwners.forEach(function (email) { var row = el('div', 'acc-row'); row.appendChild(whoBlock(email)); row.appendChild(el('span', 'role maintainer', 'maintainer')); ab.appendChild(row); });
    accessState.admins.forEach(function (email) {
      var row = el('div', 'acc-row'); row.appendChild(whoBlock(email)); row.appendChild(el('span', 'role admin', 'admin'));
      if (isOwner) { var rm = btn('quiet danger sm', 'trash', null, 'Remove admin'); rm.onclick = function () { accessState.admins = accessState.admins.filter(function (x) { return x !== email; }); renderAccess(); }; row.appendChild(rm); }
      ab.appendChild(row);
    });
    q('add-admin-row').hidden = !isOwner;
    var ob = clear(q('orgs-list')); var emails = Object.keys(accessState.organizers);
    q('orgs-count').textContent = plural(emails.length, 'person', 'people') + ' · each edits only their own colonies and posts';
    if (!emails.length) ob.appendChild(el('p', 'empty', 'No organizers yet. Add the first one above.'));
    emails.forEach(function (email) {
      var ids = accessState.organizers[email] || []; var row = el('div', 'acc-row'); row.appendChild(whoBlock(email));
      var chips = el('div', 'chips');
      ids.forEach(function (id) { var c = el('button', 'chip on'); c.type = 'button'; c.appendChild(document.createTextNode(colonyName(id))); c.appendChild(svg('x', true)); c.title = 'Remove colony'; c.onclick = function () { accessState.organizers[email] = ids.filter(function (x) { return x !== String(id); }); renderAccess(); }; chips.appendChild(c); });
      var sel = el('select', 'chip'); var ph = el('option', null, '+ add colony'); ph.value = ''; sel.appendChild(ph);
      allColonies.forEach(function (c) { if (ids.indexOf(String(c.id)) === -1) { var o = el('option', null, c.name); o.value = c.id; sel.appendChild(o); } });
      sel.onchange = function () { if (sel.value) { ids.push(String(sel.value)); accessState.organizers[email] = ids; renderAccess(); } }; chips.appendChild(sel); row.appendChild(chips);
      var rm = btn('quiet danger sm', 'trash', null, 'Remove organizer'); rm.onclick = function () { if (confirm('Remove ' + email + ' from the organizers?')) { delete accessState.organizers[email]; renderAccess(); } }; row.appendChild(rm);
      ob.appendChild(row);
    });
  }
  if (IS_ADMIN) {
  q('add-admin').addEventListener('click', function () { var e = q('admin-email').value.trim(); if (!e) return; if (accessState.admins.indexOf(e) === -1) accessState.admins.push(e); q('admin-email').value = ''; renderAccess(); });
  q('add-org').addEventListener('click', function () { var e = q('org-email').value.trim(); if (!e) return; if (!accessState.organizers[e]) accessState.organizers[e] = []; q('org-email').value = ''; renderAccess(); });
  ['admin-email', 'org-email'].forEach(function (id) { q(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); q(id === 'admin-email' ? 'add-admin' : 'add-org').click(); } }); });
  async function saveAccess() {
    try { await api('/api/access', jsonReq('PUT', accessState)); toast('Access saved · applies at their next sign-in'); dirPeople = null; }
    catch (e) { fail('Save failed', e); }
  }
  q('save-access').addEventListener('click', saveAccess);
  q('save-community').addEventListener('click', async function () {
    try { var out = await api('/api/network/community', jsonReq('PUT', { url: q('community-url').value, label: q('community-label').value })); community = out.community; renderCommunity(); toast('Group link saved'); }
    catch (e) { fail('Save failed', e); }
  });
  }

  // ---- boot ----------------------------------------------------------------
  async function init() {
    renderMe();
    try { var d = await api('/api/colonies'); colonies = d.colonies || []; }
    catch (e) { fail('Could not load the colony list', e); }
    document.querySelectorAll('[data-nav=colony]').forEach(function (a) { a.hidden = !IS_ADMIN && !colonies.length; });
    route();
    fetchMe(); fetchNotices();
  }
  init();
})();
