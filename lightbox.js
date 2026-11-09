import "./lightbox.css";

// Full-screen photo viewer shared by the map panel, colony pages and blog
// posts. Swipe (native scroll-snap) on touch, arrows / keyboard on desktop.
//
//   openLightbox(["/a.webp", "/b.webp"], startIndex, altText)
//   wireLightboxLinks(root)  → <a data-lightbox="group" href="…full image…">
//                              links in `root` open the viewer for their group.

let box, track, counter, prevBtn, nextBtn, lastFocus;
let count = 0;

function build() {
  box = document.createElement("div");
  box.className = "lb";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", "Photo gallery");
  box.hidden = true;
  box.innerHTML = `
    <div class="lb__track"></div>
    <button type="button" class="lb__btn lb__close" aria-label="Close">&times;</button>
    <button type="button" class="lb__btn lb__nav lb__prev" aria-label="Previous photo">&#8249;</button>
    <button type="button" class="lb__btn lb__nav lb__next" aria-label="Next photo">&#8250;</button>
    <p class="lb__count" aria-live="polite"></p>`;
  document.body.appendChild(box);
  track = box.querySelector(".lb__track");
  counter = box.querySelector(".lb__count");
  prevBtn = box.querySelector(".lb__prev");
  nextBtn = box.querySelector(".lb__next");

  box.querySelector(".lb__close").addEventListener("click", closeLightbox);
  prevBtn.addEventListener("click", () => go(current() - 1));
  nextBtn.addEventListener("click", () => go(current() + 1));
  // Click on the dark backdrop (not the photo) closes.
  track.addEventListener("click", (e) => {
    if (e.target.tagName !== "IMG") closeLightbox();
  });
  track.addEventListener("scroll", () => requestAnimationFrame(() => sync()), {
    passive: true,
  });
  document.addEventListener("keydown", (e) => {
    if (box.hidden) return;
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowRight") go(current() + 1);
    else if (e.key === "ArrowLeft") go(current() - 1);
  });
}

const current = () =>
  track.clientWidth ? Math.round(track.scrollLeft / track.clientWidth) : 0;

function go(i, instant) {
  const n = Math.max(0, Math.min(count - 1, i));
  track.scrollTo({
    left: n * track.clientWidth,
    behavior: instant ? "instant" : "smooth",
  });
  sync(n);
}

function sync(forced) {
  const i = typeof forced === "number" ? forced : current();
  counter.textContent = count > 1 ? `${i + 1} / ${count}` : "";
  prevBtn.disabled = i <= 0;
  nextBtn.disabled = i >= count - 1;
}

export function openLightbox(urls, start = 0, alt = "") {
  if (!urls || !urls.length) return;
  if (!box) build();
  lastFocus = document.activeElement;
  count = urls.length;
  track.innerHTML = urls
    .map(
      (u, i) =>
        `<figure class="lb__slide"><img src="${u}" alt="${String(alt).replace(/"/g, "&quot;")}${count > 1 ? ` (${i + 1}/${count})` : ""}" ${Math.abs(i - start) > 1 ? 'loading="lazy"' : ""} /></figure>`,
    )
    .join("");
  box.classList.toggle("is-single", count < 2);
  box.hidden = false;
  document.documentElement.classList.add("lb-open");
  requestAnimationFrame(() => go(start, true));
  box.querySelector(".lb__close").focus({ preventScroll: true });
}

export function closeLightbox() {
  if (!box || box.hidden) return;
  box.hidden = true;
  track.innerHTML = "";
  document.documentElement.classList.remove("lb-open");
  lastFocus?.focus?.({ preventScroll: true });
}

export function wireLightboxLinks(root = document) {
  root.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-lightbox]");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    const group = [
      ...root.querySelectorAll(`a[data-lightbox="${a.dataset.lightbox}"]`),
    ];
    openLightbox(
      group.map((x) => x.getAttribute("href")),
      group.indexOf(a),
      a.querySelector("img")?.alt || "",
    );
  });
}
