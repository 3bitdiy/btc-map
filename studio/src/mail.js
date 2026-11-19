// Beyond the Cities · Studio — outgoing mail.
// Every email (sign-in, invitations, later the newsletter) goes through
// mailLayout() so they all share one branded frame, and every HTML email has a
// plain-text twin for clients that don't show HTML. Sent via the Resend HTTP API.
//
// Email-client rules this follows: tables for layout, inline styles only, no
// SVG (Gmail drops it, hence the PNG logo on the public site), web-safe font
// fallbacks, a hidden preheader line for the inbox preview.

const SITE = "https://beyondthecities.org";
// Logo on its own white rounded tile (opaque), so it stays visible when a
// mail app switches the message to a dark theme. 168×216, shown at 56×72.
const LOGO_PNG = `${SITE}/assets/images/email/btc-logo-tile.png`;

// Brand palette (matches studio/src/ui.css and the public site).
const C = {
  bg: "#ebe9e4",
  paper: "#ffffff",
  cream: "#f3f1ea",
  ink: "#1c1c1c",
  mute: "#616161",
  line: "#dedbd4",
  accent: "#ff4326",
};
const FONT = "Montserrat,'Helvetica Neue',Helvetica,Arial,sans-serif";

export function esc(s = "") {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// --- building blocks (HTML) ---------------------------------------------------
export function p(html, extra = "") {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${C.ink};${extra}">${html}</p>`;
}

export function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 22px"><tr>
<td style="border-radius:999px;background:${C.accent}"><a href="${esc(href)}" target="_blank" rel="noopener" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px">${esc(label)}</a></td>
</tr></table>`;
}

// Numbered steps in a cream box.
export function steps(items) {
  const rows = items.map((html, i) => `<tr>
<td valign="top" style="padding:0 12px 14px 0;width:26px"><div style="width:26px;height:26px;line-height:26px;border-radius:13px;background:${C.accent};color:#fff;font-family:${FONT};font-size:13px;font-weight:800;text-align:center">${i + 1}</div></td>
<td valign="top" style="padding:3px 0 14px;font-family:${FONT};font-size:15px;line-height:1.55;color:${C.ink}">${html}</td>
</tr>`).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;background:${C.cream};border-radius:12px">
<tr><td style="padding:18px 18px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr></table>`;
}

export function bullets(items) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px">${items.map((html) => `<tr>
<td valign="top" style="padding:0 10px 8px 2px;font-family:${FONT};font-size:15px;line-height:1.55;color:${C.accent};font-weight:800">&bull;</td>
<td valign="top" style="padding:0 0 8px;font-family:${FONT};font-size:15px;line-height:1.55;color:${C.ink}">${html}</td></tr>`).join("")}</table>`;
}

export function small(html) {
  return `<p style="margin:0 0 14px;font-size:13px;line-height:1.55;color:${C.mute}">${html}</p>`;
}

export function link(href, label) {
  return `<a href="${esc(href)}" target="_blank" rel="noopener" style="color:${C.ink};font-weight:700;text-decoration:underline">${esc(label)}</a>`;
}

// --- the frame ----------------------------------------------------------------
// preheader: the grey preview line in the inbox list (plain text).
// body: HTML built from the blocks above.
export function mailLayout({ title = "", preheader = "", body = "" }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light"/><meta name="supported-color-schemes" content="light"/>
<title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg}">${esc(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg}">
<tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
    <tr><td align="center" style="padding:0 0 18px">
      <a href="${SITE}/" target="_blank" rel="noopener" style="text-decoration:none;color:${C.ink}">
        <img src="${LOGO_PNG}" width="56" height="72" alt="Beyond the Cities" style="display:block;margin:0 auto 10px;border:0"/>
        <span style="font-family:${FONT};font-size:14px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:${C.ink}">Beyond <span style="font-weight:400">the</span> Cities</span>
      </a>
    </td></tr>
    <tr><td style="background:${C.paper};border:1px solid ${C.line};border-top:4px solid ${C.accent};border-radius:16px;padding:30px 28px 14px;font-family:${FONT};color:${C.ink}">
      ${title ? `<h1 style="margin:0 0 16px;font-family:${FONT};font-size:22px;line-height:1.3;font-weight:800;color:#000">${esc(title)}</h1>` : ""}
      ${body}
    </td></tr>
    <tr><td align="center" style="padding:18px 8px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.mute}">
      Beyond the Cities &middot; a Goethe-Institut project &middot; <a href="${SITE}/" target="_blank" rel="noopener" style="color:${C.mute}">beyondthecities.org</a><br/>
      Artist colonies of Serbia, Bosnia and Herzegovina and North Macedonia
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

// Plain-text twin: same structure, readable in any client.
export function textLayout({ title = "", body = "" }) {
  return `BEYOND THE CITIES\n\n${title ? title + "\n" + "=".repeat(Math.min(title.length, 60)) + "\n\n" : ""}${body.trim()}\n\n--\nBeyond the Cities · a Goethe-Institut project · ${SITE}\n`;
}

// --- messages -----------------------------------------------------------------
export function loginMail({ link: url, code }) {
  const html = mailLayout({
    title: "Sign in to the Studio",
    preheader: `Your sign-in code is ${code}. It works once and expires in 15 minutes.`,
    body:
      p("Use this button to sign in to the Beyond the Cities Studio:") +
      button(url, "Sign in to Studio") +
      p("Or type this code on the sign-in page:", "margin-bottom:6px") +
      `<p style="margin:0 0 22px;font-family:${FONT};font-size:32px;font-weight:800;letter-spacing:.2em;color:#000">${esc(code)}</p>` +
      small("The link and the code work once and expire in 15 minutes. If you didn't ask to sign in, you can ignore this email."),
  });
  const text = textLayout({
    title: "Sign in to the Studio",
    body: `Open this link to sign in to the Beyond the Cities Studio:\n${url}\n\nOr type this code on the sign-in page: ${code}\n\nThe link and the code work once and expire in 15 minutes. If you didn't ask to sign in, you can ignore this email.`,
  });
  return { subject: `Your Studio sign-in code: ${code}`, html, text };
}

// First name for the greeting, skipping titles like "prof." or "dr".
function firstName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter((w) => !/^(prof|dr|mr|mrs|ms|doc|mag|ing|msc|ma|phd)\.?$/i.test(w));
  return parts[0] || "";
}

// Sign-in steps shared by both invitations.
function signInSteps(email) {
  return steps([
    `<b>If ${esc(email)} is a Gmail or Google account:</b> click <b>Continue with Google</b>.`,
    `<b>Any other address:</b> in the field under <i>“or sign in with any email”</i>, type <b>${esc(email)}</b> and click <b>Email me a sign-in link</b>. We'll send you a link and a 6-digit code. No password needed.`,
  ]);
}
function signInStepsText(email) {
  return `1. If ${email} is a Gmail or Google account: click "Continue with Google".
2. Any other address: in the field under "or sign in with any email", type ${email} and click "Email me a sign-in link". We'll send you a link and a 6-digit code. No password needed.`;
}

// Invitation for a project partner with an admin account and no colony
// (e.g. Goethe-Institut staff): review the Studio and give feedback.
export function adminInviteMail({ email, name = "", studioUrl }) {
  // No profile yet: take the first name from a "first.last@" address.
  const local = String(email).split("@")[0];
  const guess = /^[a-z]{2,}\.[a-z]{2,}$/i.test(local) ? local.split(".")[0] : "";
  const first = name ? firstName(name) : guess ? guess.charAt(0).toUpperCase() + guess.slice(1).toLowerCase() : "";
  const hi = first ? `Hi ${first},` : "Hi,";
  const studioHost = studioUrl.replace(/^https?:\/\//, "");
  const can = [
    "see the Studio exactly as colony organizers do: their colony pages, blog posts, the Network directory and the notice board",
    "open and edit any colony's page and any blog post",
    "add organizers and assign them their colonies (Access page)",
  ];
  const html = mailLayout({
    title: "Your access to the Studio",
    preheader: "An admin account for the Beyond the Cities Studio. We'd love your feedback.",
    body:
      p(esc(hi)) +
      p("you now have access to the <b>Beyond the Cities Studio</b>, the part of beyondthecities.org where colony organizers update their colony pages, publish news and connect with each other.") +
      p("You have an <b>admin account</b>, so you can:", "margin-bottom:8px") +
      bullets(can) +
      p("<b>We'd love your feedback.</b> What is unclear, what is missing, what would help organizers most? Just reply to this email with anything you notice, big or small.") +
      p("Feel free to look around: colony pages and blog posts are saved with their full history, so any change there can be undone.") +
      p(`<b>How to sign in</b> at ${link(studioUrl + "/", studioHost)}`, "margin-bottom:12px") +
      signInSteps(email) +
      button(studioUrl + "/", "Open the Studio") +
      small(`Please always sign in with <b style="color:${C.ink}">${esc(email)}</b>: it's the address on our access list. If you'd rather use another one, just reply to this email and we'll switch it.`) +
      p("Best,<br/>The Beyond the Cities team", "margin-top:8px"),
  });
  const text = textLayout({
    title: "Your access to the Studio",
    body:
`${hi}

you now have access to the Beyond the Cities Studio, the part of beyondthecities.org where colony organizers update their colony pages, publish news and connect with each other.

You have an admin account, so you can:
${can.map((c) => "- " + c).join("\n")}

We'd love your feedback. What is unclear, what is missing, what would help organizers most? Just reply to this email with anything you notice, big or small.

Feel free to look around: colony pages and blog posts are saved with their full history, so any change there can be undone.

HOW TO SIGN IN
Go to ${studioUrl}/ and then:

${signInStepsText(email)}

Please always sign in with ${email}: it's the address on our access list. If you'd rather use another one, just reply to this email and we'll switch it.

Best,
The Beyond the Cities team`,
  });
  return { subject: "Your access to the Beyond the Cities Studio", html, text };
}

// Invitation for a new organizer. colonies: names of their colonies (may be empty).
export function inviteMail({ email, name = "", colonies = [], studioUrl }) {
  const hi = firstName(name) ? `Hi ${firstName(name)},` : "Hi,";
  const colLine = colonies.length
    ? `You are registered as the organizer of <b>${colonies.map(esc).join("</b>, <b>")}</b>.`
    : "";
  const colText = colonies.length ? `You are registered as the organizer of ${colonies.join(", ")}.\n\n` : "";
  const studioHost = studioUrl.replace(/^https?:\/\//, "");

  const html = mailLayout({
    title: "Your access to the Studio",
    preheader: "You can now update your colony's page and join the organizers' network.",
    body:
      p(esc(hi)) +
      p(`you now have access to the <b>Beyond the Cities Studio</b>, the organizers' area of beyondthecities.org.${colLine ? " " + colLine : ""}`) +
      p("In the Studio you can:", "margin-bottom:8px") +
      bullets([
        "update your colony's page (details, contacts, photos)",
        "publish news from your colony on the blog",
        "find other organizers in the Network directory and post open calls, partner searches or questions on the notice board",
      ]) +
      p(`<b>How to sign in</b> at ${link(studioUrl + "/", studioHost)}`, "margin-bottom:12px") +
      signInSteps(email) +
      button(studioUrl + "/", "Open the Studio") +
      p("<b>Tell us what you think.</b> The Studio is new and we're building it for you. If something is unclear, doesn't work or is missing, just reply to this email.") +
      small(`Please always sign in with <b style="color:${C.ink}">${esc(email)}</b>: it's the address on our access list. If you'd rather use another one, just reply to this email and we'll switch it.`) +
      p("Best,<br/>The Beyond the Cities team", "margin-top:8px"),
  });

  const text = textLayout({
    title: "Your access to the Studio",
    body:
`${hi}

you now have access to the Beyond the Cities Studio, the organizers' area of beyondthecities.org.

${colText}In the Studio you can:
- update your colony's page (details, contacts, photos)
- publish news from your colony on the blog
- find other organizers in the Network directory and post open calls, partner searches or questions on the notice board

HOW TO SIGN IN
Go to ${studioUrl}/ and then:

${signInStepsText(email)}

Tell us what you think. The Studio is new and we're building it for you. If something is unclear, doesn't work or is missing, just reply to this email.

Please always sign in with ${email}: it's the address on our access list. If you'd rather use another one, just reply to this email and we'll switch it.

Best,
The Beyond the Cities team`,
  });
  return { subject: "Your access to the Beyond the Cities Studio", html, text };
}

// --- sending (Resend) ---------------------------------------------------------
function envelope(env, m) {
  return {
    from: env.MAIL_FROM || "Beyond the Cities Studio <studio@beyondthecities.org>",
    to: [m.to],
    reply_to: env.MAIL_REPLY_TO || undefined,
    subject: m.subject,
    html: m.html,
    text: m.text,
  };
}

export async function sendMail(env, m) {
  if (!env.RESEND_API_KEY) return { ok: false, detail: "RESEND_API_KEY not set" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(envelope(env, m)),
  });
  if (!res.ok) return { ok: false, detail: `${res.status} ${await res.text()}` };
  return { ok: true };
}

// Up to 100 messages in one request (Resend batch API; avoids the 2 req/s limit).
export async function sendMailBatch(env, messages) {
  if (!env.RESEND_API_KEY) return { ok: false, detail: "RESEND_API_KEY not set" };
  if (!messages.length) return { ok: true };
  const res = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(messages.map((m) => envelope(env, m))),
  });
  if (!res.ok) return { ok: false, detail: `${res.status} ${await res.text()}` };
  return { ok: true };
}
