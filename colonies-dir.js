// Client-side search + country filter for the colony directory.
// Fold diacritics so "backi" matches "Bački" (card data-* are folded at build).
const foldSearch = (s = "") =>
  String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "dj");

const search = document.getElementById("col-search");
const grid = document.getElementById("col-grid");
const empty = document.getElementById("col-empty");
const chips = document.getElementById("col-country-filter");
const cards = grid ? [...grid.querySelectorAll(".col-card")] : [];

let term = "";
let country = "";

function apply() {
  let visible = 0;
  for (const card of cards) {
    const matchesTerm =
      !term ||
      card.dataset.name.includes(term) ||
      (card.dataset.place || "").includes(term) ||
      card.dataset.fields.includes(term);
    const matchesCountry = !country || card.dataset.country === country;
    const show = matchesTerm && matchesCountry;
    card.hidden = !show;
    if (show) visible += 1;
  }
  if (empty) empty.hidden = visible > 0;
}

search?.addEventListener("input", (event) => {
  term = foldSearch(event.target.value.trim());
  apply();
});

chips?.addEventListener("click", (event) => {
  const btn = event.target.closest("button");
  if (!btn) return;
  country = btn.dataset.country || "";
  chips
    .querySelectorAll("button")
    .forEach((b) => b.classList.toggle("is-active", b === btn));
  apply();
});
