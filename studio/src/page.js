// Studio page shell: sidebar / tab bar, one <section data-view> per screen, and
// the signed-in person's data in <body data-*>. Behaviour lives in ui.client.js,
// styles in ui.css; index.js passes both in as text so this module stays
// importable from plain Node (used by the local render check).

const COUNTRIES = ["Serbia", "Bosnia and Herzegovina", "North Macedonia"];
const SCOPES = ["National", "Regional", "International", "Unspecified"];

export function renderStudio({ session, env, css, js, icons, logo, disciplines, limits, escapeHtml }) {
  const esc = escapeHtml;
  const rawBase = `https://raw.githubusercontent.com/${env.GITHUB_REPO}/${env.GITHUB_BRANCH}/public`;
  const site = "https://beyondthecities.org";
  const isAdmin = session.role === "admin";
  const roleLabel = session.owner ? "maintainer" : session.role;
  const me = { email: session.email, name: session.name || "", role: session.role, owner: !!session.owner };
  const i = (name, small) => `<svg class="i${small ? " s" : ""}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

  const field = (name, label, type = "text", extra = "") =>
    `<label class="fld"><span>${label}</span><input id="f-${name}" type="${type}" ${extra}/></label>`;
  const select = (name, label, opts) =>
    `<label class="fld"><span>${label}</span><select id="f-${name}"><option value=""></option>` +
    opts.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join("") +
    `</select></label>`;
  const multi = (name, label, addLabel) =>
    `<div class="fld"><span>${label}</span><div id="ml-${name}" class="multi"></div>` +
    `<button type="button" class="btn quiet sm" data-add-multi="${name}">${i("plus", true)}${addLabel}</button></div>`;
  const search = (id, placeholder) =>
    `<label class="search">${i("search")}<input id="${id}" type="search" placeholder="${placeholder}" autocomplete="off" enterkeyhint="search"/>` +
    `<button type="button" class="search-clear" data-for="${id}" aria-label="Clear search" hidden>${i("x", true)}</button></label>`;
  const phead = (icon, title, sub, acts = "", extra = "") =>
    `<div class="phead${extra}">${icon ? `<div class="ico">${i(icon)}</div>` : ""}<div class="grow"><h1>${title}</h1><p>${sub}</p></div>` +
    (acts ? `<div class="acts">${acts}</div>` : "") + `</div>`;
  const cardH = (icon, title, sub = "", id = "", acts = "") =>
    `<div class="card-h"><div class="ico">${i(icon, true)}</div><div class="grow"><h2${id ? ` id="${id}-title"` : ""}>${title}</h2>` +
    `<p${id ? ` id="${id}-sub"` : ""}>${sub}</p></div>${acts}</div>`;
  const savebar = (id, statusId, buttons) =>
    `<div class="savebar" id="${id}"><div class="st"><span class="d"></span><span id="${statusId}">All changes saved</span></div>${buttons}</div>`;
  const meBlock = (extra = "") =>
    `<span class="avatar" data-me="av"></span><div style="min-width:0"><div class="me-name" data-me="name"></div>` +
    `<div class="me-mail" data-me="mail"></div><span class="role ${esc(roleLabel)}" style="margin-top:3px">${esc(roleLabel)}</span></div>${extra}`;

  const artChips = disciplines.map((d) => `<button type="button" class="chip" data-v="${esc(d)}">${esc(d)}</button>`).join("");

  // ---------------------------------------------------------------- sidebar
  const sidebar = `
<aside class="side">
  <a class="brand" href="#home">${logo}<span class="brand-name">Beyond <em>the</em> Cities<span class="tag">Studio</span></span></a>
  <nav class="nav" aria-label="Main">
    <a href="#home" data-nav="home">${i("home")}Home</a>
    <a href="#colony" data-nav="colony">${i("pin")}${isAdmin ? "Colonies" : "My colony"}</a>
    <a href="#posts" data-nav="posts">${i("post")}Blog posts</a>
    <a href="#network" data-nav="network">${i("users")}Network<span class="cnt notice-n" hidden></span></a>
    <div class="sub" id="net-sub" hidden>
      <a href="#network" data-nav="directory">Directory</a>
      <a href="#notices" data-nav="notices">Notice board</a>
    </div>
    ${isAdmin ? `<a href="#access" data-nav="access">${i("key")}Access</a>` : ""}
  </nav>
  <div class="side-foot">
    <a class="me" href="#profile" data-nav="profile" title="My profile">${meBlock(`<svg class="i s go" aria-hidden="true"><use href="#i-right"/></svg>`)}</a>
    <div class="side-links">
      <a href="#profile">${i("edit", true)}My profile</a>
      <a href="${site}/" target="_blank" rel="noopener">${i("ext", true)}View site</a>
      <a href="/auth/logout">${i("out", true)}Log out</a>
    </div>
  </div>
</aside>`;

  // ------------------------------------------------------------------- home
  const home = `
<section id="v-home" data-view>
  ${phead("home", "Home", "Your colony, your posts and what is new in the network.", `<a class="btn ghost sm" href="${site}/" target="_blank" rel="noopener">${i("ext", true)}<span class="l">View site</span></a>`)}
  <div class="content">
    <div class="hello"><h1 id="hello-h1">Welcome</h1><p id="hello-p"></p></div>
    <div class="tools">
      <a class="tool" href="#colony" id="tool-colony"><span class="ico">${i("pin")}</span><b>${isAdmin ? "Edit a colony" : "Edit my colony"}</b><span>Name, contact, dates, art fields and the photos shown on the map.</span><span class="go">Open ${i("right", true)}</span></a>
      <a class="tool" href="#post/new"><span class="ico">${i("post")}</span><b>Write a post</b><span>News, calls and stories for the blog. Drafts stay private until you publish.</span><span class="go">New post ${i("right", true)}</span></a>
      <a class="tool" href="#notice/new"><span class="ico">${i("mega")}</span><b>Post a notice</b><span>Open calls, partner searches and offers for other organizers.</span><span class="go">Notice board ${i("right", true)}</span></a>
    </div>
    <div class="two">
      <div class="card" id="home-colony" hidden>
        ${cardH("eye", "Your colony", "", "hc", `<div class="acts"><a class="btn quiet sm" id="hc-map" href="${site}/map.html" target="_blank" rel="noopener">${i("ext", true)}<span>Map</span></a><a class="btn quiet sm" id="hc-edit" href="#colony">${i("edit", true)}<span>Edit</span></a></div>`)}
        <div class="card-b" id="hc-body"></div>
      </div>
      <div class="card" id="home-admin" hidden>
        ${cardH("eye", "Site at a glance", "Across all three countries")}
        <div class="card-b" id="ha-body"></div>
      </div>
      <div class="col">
        <div class="card">
          ${cardH("mega", "Notice board", "", "hn", `<a class="btn quiet sm" href="#notices">All</a>`)}
          <div class="card-b mini" id="home-notices"></div>
        </div>
        <div class="card">
          ${cardH("post", isAdmin ? "Latest posts" : "Your posts", "", "hp", `<a class="btn quiet sm" href="#posts">All</a>`)}
          <div class="card-b mini" id="home-posts"></div>
        </div>
      </div>
    </div>
    <div class="note">${i("info", true)}<div>Need help or found a mistake you cannot fix? Write to <a href="mailto:beyondthecitiesadm@gmail.com">beyondthecitiesadm@gmail.com</a> or ask in the organizers' group chat.</div></div>
  </div>
</section>`;

  // ---------------------------------------------------------- colony picker
  const colonyList = `
<section id="v-colony" data-view hidden>
  ${phead("pin", isAdmin ? "Colonies" : "My colonies", `<span id="colony-count"></span>`)}
  <div class="content">
    <div class="toolbar">${search("picker-search", "Search by name or city…")}<div class="chips" id="picker-countries"></div></div>
    <div class="card rows" id="picker-results"><p class="empty">Loading colonies…</p></div>
    <p class="hint" id="picker-shown"></p>
  </div>
</section>`;

  // ---------------------------------------------------------- colony editor
  const colonyEdit = `
<section id="v-colony-edit" data-view hidden>
  <div class="phead has-back">
    <a class="back" href="#colony" id="ce-back" hidden>${i("left", true)}Colonies</a>
    <div class="ico">${i("pin")}</div>
    <div class="grow"><h1 id="ce-title">Loading…</h1><p id="ce-sub"></p></div>
    <div class="acts"><a class="btn ghost sm" id="ce-map" href="${site}/map.html" target="_blank" rel="noopener">${i("ext", true)}<span class="l">View on map</span></a></div>
  </div>
  <div class="content">
    <div class="editor">
      <nav class="jump" aria-label="Sections">
        <a href="#" data-jump="s-basics" class="on">${i("text")}Basics</a>
        <a href="#" data-jump="s-photos">${i("camera")}Photos</a>
        <a href="#" data-jump="s-art">${i("palette")}Art fields</a>
        <a href="#" data-jump="s-contact">${i("mail")}Contact</a>
        <a href="#" data-jump="s-when">${i("cal")}When</a>
        <a href="#" data-jump="s-where">${i("globe")}Location</a>
      </nav>
      <form class="sections" id="colony-form" onsubmit="return false" hidden>
        <div class="card" id="s-basics">
          ${cardH("text", "Basics", "How the colony appears on the map and in the directory.")}
          <div class="card-b grid2">
            <div class="full">${field("art_colony_name", "Name")}</div>
            ${field("art_colony_organisers", "Organisers")}
            ${select("scope", "Scope", SCOPES)}
          </div>
        </div>
        <div class="card" id="s-photos">
          ${cardH("camera", "Photos", `<span id="photo-count"></span>`, "", `<label class="btn ghost sm file" id="photo-add-btn">${i("plus", true)}<span class="l">Add photos</span><input type="file" id="photo-file" multiple accept="image/png,image/jpeg,image/webp"/></label>`)}
          <div class="card-b">
            <div class="pgrid" id="photo-grid"></div>
            <p class="hint" id="photo-status" style="margin-top:10px;color:var(--info)"></p>
            <p class="hint" style="margin-top:10px">Landscape photos work best, at least 1600 px wide. You can pick several at once. Photos are saved as soon as you add, reorder or remove them.</p>
          </div>
        </div>
        <div class="card" id="s-art">
          ${cardH("palette", "Art fields", "Pick everything the colony works with. These power the map filter.")}
          <div class="card-b">
            <div class="chips" id="art-chips">${artChips}</div>
            <label class="fld" style="margin-top:12px"><span>Other <span class="opt">optional, comma-separated</span></span><input type="text" id="f-art_field_other" placeholder="e.g. mosaic"/></label>
          </div>
        </div>
        <div class="card" id="s-contact">
          ${cardH("mail", "Contact", "Shown on the colony page so artists can reach you.")}
          <div class="card-b grid2">
            ${multi("contact_person", "Contact person(s)", "Add person")}
            ${multi("contact_telephone", "Telephone(s)", "Add phone")}
            ${multi("email_address", "Email(s)", "Add email")}
            ${multi("web_page", "Website(s)", "Add website")}
          </div>
        </div>
        <div class="card" id="s-when">
          ${cardH("cal", "When", "When the colony usually runs and for how long.")}
          <div class="card-b grid2">
            ${field("time_period", "Time period", "text", 'placeholder="e.g. every August"')}
            ${field("duration", "Duration", "text", 'placeholder="e.g. 10 days"')}
          </div>
        </div>
        <div class="card" id="s-where">
          ${cardH("globe", "Location", "Coordinates place the pin on the map. Change them only if the pin is wrong.")}
          <div class="card-b grid2">
            ${field("city", "City")}
            ${field("place", "Place")}
            ${select("country", "Country", COUNTRIES)}
            <div class="fld"><span>Coordinates <span class="opt">latitude, longitude</span></span><div class="grid2" style="gap:8px"><input type="text" id="f-latitude" inputmode="decimal" aria-label="Latitude" placeholder="43.33"/><input type="text" id="f-longitude" inputmode="decimal" aria-label="Longitude" placeholder="22.09"/></div></div>
          </div>
        </div>
        ${savebar("savebar", "save-st", `<button type="button" class="btn ghost sm" id="discard" hidden>Discard</button><button type="button" class="btn" id="save-colony">${i("save", true)}Save changes</button>`)}
      </form>
    </div>
  </div>
</section>`;

  // ------------------------------------------------------------------ posts
  const postsList = `
<section id="v-posts" data-view hidden>
  ${phead("post", "Blog posts", `<span id="posts-count">News and stories for beyondthecities.org/blog. Drafts are only visible here.</span>`, `<a class="btn sm" href="#post/new">${i("plus", true)}<span class="l">New post</span></a>`)}
  <div class="content">
    <div class="toolbar">${search("posts-search", "Search posts…")}<div class="chips" id="posts-filters"></div></div>
    <div class="card rows" id="posts-list"><p class="empty">Loading…</p></div>
  </div>
</section>`;

  const postEdit = `
<section id="v-post-edit" data-view hidden>
  <div class="phead has-back">
    <a class="back" href="#posts">${i("left", true)}Posts</a>
    <div class="grow"><h1 id="pe-title">New post</h1><p id="pe-sub"></p></div>
    <div class="acts"><a class="btn ghost sm" id="pe-view" href="#" target="_blank" rel="noopener" hidden>${i("ext", true)}<span class="l">View</span></a><button type="button" class="btn sm" id="save-post-top">${i("save", true)}<span class="l">Save</span></button></div>
  </div>
  <div class="content">
    <form id="post-form" onsubmit="return false" class="two post">
      <div class="col">
        <div class="card"><div class="card-b stack">
          <label class="fld"><span>Title</span><input type="text" id="p-title" maxlength="160"/></label>
          <label class="fld"><span>Excerpt <span class="opt">one or two sentences, shown in the list</span></span><textarea id="p-excerpt" rows="2"></textarea></label>
          <div class="fld"><span>Text</span><div id="p-body"></div></div>
        </div></div>
      </div>
      <div class="col">
        <div class="card">
          ${cardH("send", "Publishing")}
          <div class="card-b stack">
            <label class="toggle"><input type="checkbox" id="p-draft"/>Keep as draft</label>
            <label class="fld"><span>Date</span><input type="date" id="p-date"/></label>
            <label class="fld"><span>Author</span><input type="text" id="p-author"/></label>
            <div class="fld"><span>News for</span><div class="chips" id="p-colonies-chips"></div><span class="hint">Leave empty for a general post.</span></div>
            <label class="fld"><span>Tags <span class="opt">optional, comma-separated</span></span><input type="text" id="p-tags"/></label>
          </div>
        </div>
        <div class="card">
          ${cardH("image", "Cover &amp; gallery")}
          <div class="card-b stack">
            <div class="cover"><img id="p-cover-preview" alt="" hidden/><label class="ptile add" id="p-cover-add" for="p-cover-file">${i("camera")}<span>Choose a cover image</span></label><div class="ctl"><label class="btn ghost sm file" id="p-cover-replace" hidden>${i("camera", true)}Replace cover<input type="file" id="p-cover-file" accept="image/png,image/jpeg,image/webp"/></label><button type="button" class="btn quiet danger sm" id="p-cover-clear" hidden>${i("x", true)}Remove cover</button><span class="hint">Landscape, at least 1600 px wide. Shown at the top of the post and in the blog list.</span></div></div>
            <div class="fld"><span>Gallery <span class="opt" id="pg-count"></span></span><div class="pgrid" id="pg-grid"></div><input type="file" id="pg-file" multiple accept="image/png,image/jpeg,image/webp" hidden/></div>
            <p class="hint">Up to ${limits.gallery} photos shown under the text. For a photo inside the text use the image button in the editor toolbar.</p>
          </div>
        </div>
      </div>
      <div class="full">${savebar("post-savebar", "p-status", `<button type="button" class="btn quiet danger sm" id="pe-delete" hidden>${i("trash", true)}Delete</button><button type="button" class="btn" id="save-post">${i("save", true)}Save post</button>`)}</div>
    </form>
  </div>
</section>`;

  // ---------------------------------------------------------------- network
  const segc = (on) =>
    `<div class="segc"><a href="#network"${on === "dir" ? ' class="on"' : ""}>${i("users", true)}Directory</a>` +
    `<a href="#notices"${on === "not" ? ' class="on"' : ""}>${i("mega", true)}Notice board <span class="n notice-n" hidden></span></a></div>`;

  const network = `
<section id="v-network" data-view hidden>
  ${phead("users", "Network", "Other organizers in the project. Only people signed in to the Studio can see this.", `<a class="btn ghost sm" id="community-link" href="#" target="_blank" rel="noopener" hidden>${i("chat", true)}<span class="l">Group chat</span></a>`)}
  <div class="content">
    <div class="toolbar">${segc("dir")}${search("dir-search", "Search people or colonies…")}</div>
    <p class="hint" id="community-admin" hidden>No group chat link yet. Set it under <a href="#access">Access</a> and a button appears here for everyone.</p>
    <p class="hint" id="dir-admin-note" hidden></p>
    <div id="dir-list" class="col" style="gap:18px"><p class="empty">Loading…</p></div>
  </div>
</section>`;

  const noticesView = `
<section id="v-notices" data-view hidden>
  ${phead("mega", "Notice board", "Open calls, partner searches and offers between organizers. Replies go straight to the author.", `<a class="btn sm" href="#notice/new">${i("plus", true)}<span class="l">Post a notice</span></a>`)}
  <div class="content">
    <div class="toolbar">${segc("not")}<div class="chips" id="notice-filters"></div></div>
    <div id="notices-list" class="col"><p class="empty">Loading…</p></div>
    <div id="notices-mine" hidden><div class="group">Your closed and expired notices</div><div id="notices-mine-list" class="col" style="margin-top:14px"></div></div>
  </div>
</section>`;

  const noticeTypes = [["open_call", "Open call"], ["partners", "Looking for partners"], ["offering", "Offering"], ["question", "Question"], ["other", "Other"]];
  const noticeEdit = `
<section id="v-notice-edit" data-view hidden>
  <div class="phead has-back">
    <a class="back" href="#notices">${i("left", true)}Notice board</a>
    <div class="grow"><h1 id="ne-title">New notice</h1><p id="ne-sub"></p></div>
  </div>
  <div class="content">
    <form id="notice-form" onsubmit="return false" class="col">
      <div class="card">
        ${cardH("mega", "Your notice", "Keep it short: what, for whom, when, and how to reply.")}
        <div class="card-b grid2">
          <label class="fld"><span>Type</span><select id="n-type">${noticeTypes.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label>
          <label class="fld"><span>Deadline <span class="opt">optional</span></span><input type="date" id="n-deadline"/></label>
          <label class="fld full"><span>Title</span><input type="text" id="n-title" maxlength="${limits.noticeTitle}" placeholder="e.g. Open call: residency for ceramic artists, July 2027"/></label>
          <label class="fld full"><span>Details</span><textarea id="n-body" rows="6" maxlength="${limits.noticeBody}" placeholder="What you are offering or looking for, for whom, when, and how to reply."></textarea></label>
          <label class="fld full"><span>Colony</span><select id="n-colony"></select></label>
          <p class="hint full" id="n-contact"></p>
        </div>
      </div>
      ${savebar("notice-savebar", "n-status", `<a class="btn ghost sm" href="#notices">Cancel</a><button type="button" class="btn" id="n-save">${i("send", true)}<span>Post notice</span></button>`)}
    </form>
  </div>
</section>`;

  // ----------------------------------------------------------------- access
  const access = !isAdmin ? "" : `
<section id="v-access" data-view hidden>
  ${phead("key", "Access", "Who can sign in and which colonies they can edit. Changes apply at their next sign-in.", `<button type="button" class="btn sm" id="save-access">${i("save", true)}<span class="l">Save access</span></button>`)}
  <div class="content">
    <div class="card">
      ${cardH("users", "Organizers", `<span id="orgs-count"></span>`)}
      <div class="card-b" style="padding:12px 18px;border-bottom:1px solid var(--line)"><div class="toolbar"><input type="email" id="org-email" placeholder="Google email of the new organizer…"/><button type="button" class="btn ghost sm" id="add-org">${i("plus", true)}Add organizer</button></div></div>
      <div class="rows" id="orgs-list"></div>
    </div>
    <div class="card">
      ${cardH("key", "Admins", "Edit everything and manage organizers")}
      <div class="card-b" id="add-admin-row" style="padding:12px 18px;border-bottom:1px solid var(--line)" hidden><div class="toolbar"><input type="email" id="admin-email" placeholder="Google email of the new admin…"/><button type="button" class="btn ghost sm" id="add-admin">${i("plus", true)}Add admin</button></div></div>
      <div class="rows" id="admins-list"></div>
    </div>
    <div class="card">
      ${cardH("chat", "Organizers' group chat", "Shown as a button on the Network page")}
      <div class="card-b grid2">
        <label class="fld"><span>Invite link <span class="opt">Viber or WhatsApp</span></span><input type="url" id="community-url" placeholder="https://invite.viber.com/…" maxlength="300"/></label>
        <label class="fld"><span>Label</span><input type="text" id="community-label" placeholder="Viber group" maxlength="60"/></label>
      </div>
      <div class="card-f"><button type="button" class="btn ghost sm" id="save-community">${i("save", true)}Save group link</button></div>
    </div>
  </div>
</section>`;

  // ---------------------------------------------------------------- profile
  const profile = `
<section id="v-profile" data-view hidden>
  ${phead("edit", "My profile", "How other organizers see you in the Network, and your account.", `<button type="button" class="btn sm" id="save-profile-top">${i("save", true)}<span class="l">Save</span></button>`)}
  <div class="content">
    <div class="two">
      <div class="col">
        <div id="profile-err"></div>
        <form id="profile-form" onsubmit="return false" class="col" hidden>
          <div class="card">
            ${cardH("users", "In the Network directory", "Visible only to signed-in organizers, never on the public site.")}
            <div class="card-b stack">
              <label class="fld"><span>Name</span><input type="text" id="me-name" maxlength="${limits.profileName}"/></label>
              <label class="fld"><span>Phone <span class="opt">optional, powers the WhatsApp and Viber buttons</span></span><input type="tel" id="me-phone" placeholder="+381 6x xxx xxxx" maxlength="${limits.profilePhone}"/></label>
              <label class="fld"><span>About you <span class="opt">what you do, what you are looking for</span></span><textarea id="me-about" rows="3" maxlength="${limits.profileAbout}"></textarea></label>
              <label class="toggle"><input type="checkbox" id="me-show_email"/>Show my email to other organizers</label>
              <label class="toggle"><input type="checkbox" id="me-visible"/>Show me in the directory</label>
              <label class="toggle"><input type="checkbox" id="me-newsletter"/>Send me the monthly network digest</label>
            </div>
          </div>
          ${savebar("profile-savebar", "me-status", `<button type="button" class="btn" id="save-profile">${i("save", true)}Save profile</button>`)}
        </form>
      </div>
      <div class="col">
        <div class="card">
          ${cardH("key", "Account", "You sign in with Google")}
          <div class="card-b stack" style="gap:12px">
            <div class="me" style="padding:0">${meBlock()}</div>
            <p class="hint" id="acct-hint"></p>
            <a class="btn ghost sm" href="/auth/logout" style="align-self:flex-start">${i("out", true)}Log out</a>
          </div>
        </div>
        ${isAdmin ? `<div class="card rows"><div class="row link" data-href="#access" tabindex="0"><span class="avatar" style="background:var(--cream);color:var(--accent)">${i("key", true)}</span><div class="t"><b>Access and roles</b><span>Organizers, admins, group chat link</span></div><svg class="i chev" aria-hidden="true"><use href="#i-right"/></svg></div></div>` : ""}
      </div>
    </div>
  </div>
</section>`;

  const tabbar = `
<nav class="tabbar" aria-label="Main">
  <a href="#home" data-nav="home">${i("home")}Home</a>
  <a href="#colony" data-nav="colony">${i("pin")}${isAdmin ? "Colonies" : "Colony"}</a>
  <a href="#posts" data-nav="posts">${i("post")}Posts</a>
  <a href="#network" data-nav="network">${i("users")}Network<span class="cnt notice-n" hidden></span></a>
  <a href="#profile" data-nav="profile"><span class="avatar" data-me="av"></span>Me</a>
</nav>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<meta name="format-detection" content="telephone=no,email=no,address=no"/>
<meta name="theme-color" content="#ffffff"/>
<title>Studio · Beyond the Cities</title>
<link rel="icon" type="image/svg+xml" href="${site}/favicon.svg"/>
<link rel="stylesheet" href="${site}/fonts.css"/>
<link rel="stylesheet" href="https://uicdn.toast.com/editor/3.2.2/toastui-editor.min.css"/>
<style>${css}</style>
<script src="https://uicdn.toast.com/editor/3.2.2/toastui-editor-all.min.js"></script>
</head><body data-role="${esc(session.role)}" data-raw="${esc(rawBase)}" data-site="${site}" data-me="${esc(JSON.stringify(me))}" data-max-photos="${limits.photos}" data-max-gallery="${limits.gallery}">
${icons}
<div class="app">
${sidebar}
<main class="main" id="main">
${home}${colonyList}${colonyEdit}${postsList}${postEdit}${network}${noticesView}${noticeEdit}${access}${profile}
</main>
${tabbar}
<div class="toast" id="toast" role="status" aria-live="polite">${i("check", true)}<span id="toast-t"></span></div>
</div>
<script>${js}</script>
</body></html>`;
}
