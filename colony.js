// Colony page: (future) load this colony's blog posts from the Workers API.
// The blog backend (Cloudflare D1 + Workers) isn't built yet, so this is a
// placeholder — the static colony data renders fine without it.
const blog = document.getElementById("col-blog");
if (blog) {
  const colonyId = blog.dataset.colonyId;
  // TODO: once the Workers API exists, fetch this colony's posts and render
  // them here; otherwise keep the "No posts yet." fallback.
  void colonyId;
}
