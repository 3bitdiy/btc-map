// Colony page: show this colony's blog posts in the "News from this colony"
// section. Posts are static markdown (public/data/blog/*.md); the build emits
// public/data/blog-index.json, and a post opts into a colony by listing its id
// in the front-matter `colonies:` array. No backend.
const blog = document.getElementById("col-blog");
if (blog) {
  const colonyId = String(blog.dataset.colonyId || "");
  const empty = blog.querySelector(".col-blog__empty");

  const fmtDate = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? iso || ""
      : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  };

  fetch("/data/blog-index.json")
    .then((r) => (r.ok ? r.json() : []))
    .then((posts) => {
      const mine = (Array.isArray(posts) ? posts : []).filter((p) =>
        (p.colonies || []).map(String).includes(colonyId),
      );
      if (!mine.length) return; // keep the "No posts yet." fallback

      const list = document.createElement("div");
      list.className = "col-blog__list";
      list.innerHTML = mine
        .map(
          (p) => `
        <a class="col-news" href="/blog/${p.slug}.html">
          <img src="${p.cover || "/assets/images/colony-placeholder.png"}" alt="" loading="lazy" />
          <span>
            <span class="col-news__date">${fmtDate(p.date)}</span>
            <span class="col-news__title">${p.title}</span>
          </span>
        </a>`,
        )
        .join("");

      empty?.remove();
      blog.appendChild(list);
    })
    .catch(() => {
      /* index missing — leave the static fallback in place */
    });
}
