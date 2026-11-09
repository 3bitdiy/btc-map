// Blog post page: photos in the text and the gallery open in the full-screen
// viewer (lightbox.js). Body images are wrapped in a link at runtime so the
// markdown stays plain `![](…)`.
import { wireLightboxLinks } from "./lightbox.js";

const body = document.querySelector(".post__body");
body?.querySelectorAll("img").forEach((img) => {
  if (img.closest("a")) return; // already a link — leave it alone
  const a = document.createElement("a");
  a.href = img.getAttribute("src");
  a.dataset.lightbox = "post";
  img.replaceWith(a);
  a.appendChild(img);
});

wireLightboxLinks(document);
