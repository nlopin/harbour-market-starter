import { state, visibleStalls } from "./state.js";

const template = document.querySelector("#stall-template");
const list = document.querySelector(".vendor-list");
const filters = document.querySelector(".filters"); // module scope: main.js has its own
const count = document.querySelector(".filter-count");
const savedCount = document.querySelector(".saved-count");
const search = document.querySelector("#vendor-search");
const errorEl = document.querySelector(".load-error p");
const retryBtn = document.querySelector(".load-error button");

// Data in, element out
function card(stall) {
  const li = template.content.firstElementChild.cloneNode(true);
  li.dataset.id = stall.id;
  li.dataset.tag = stall.tag;

  const article = li.querySelector(".vendor-card");
  article.classList.toggle("featured", Boolean(stall.featured));
  article.classList.toggle("sold-out", Boolean(stall.soldOut)); // Boolean: a missing key is undefined, and toggle(name, undefined) flips

  li.querySelector(".tag").textContent = stall.tag;
  li.querySelector("h3").textContent = stall.name;
  li.querySelector(".blurb").textContent = stall.blurb;
  li.querySelector(".price").textContent = stall.price === 0 ? "free" : `from €${stall.price}`;
  li.querySelector(".badge").hidden = !stall.soldOut;

  const isSaved = state.saved.has(stall.id);
  const save = li.querySelector(".save");
  save.setAttribute("aria-pressed", String(isSaved));
  save.setAttribute("aria-label", `Save ${stall.name}`);
  save.textContent = isSaved ? "♥" : "♡";
  return li;
}

function emptyItem(text) {
  const li = document.createElement("li");
  li.className = "empty";
  li.textContent = text; // textContent: their words stay text
  return li;
}

// Why there are no cards: still loading, nothing on the server, or the filters
function emptyText() {
  if (state.status === "loading") return "Loading the vendors…";
  if (state.stalls.length === 0) return "The market has no stalls yet.";
  if (state.query.trim()) return `No stall matches “${state.query}”.`;
  return `No ${state.tag} stalls right now.`;
}

function countText(visible) {
  if (state.status === "loading") return "Loading the vendors…";
  if (state.status === "error") return ""; // the alert says it
  const total = state.stalls.length;
  if (visible.length === total) return `${total} stalls`;
  return `${visible.length} of ${total} stalls`;
}

// Draws everything that depends on state. Safe to call any number of times.
export function render() {
  const visible = visibleStalls();

  list.setAttribute("aria-busy", String(state.status === "loading"));
  if (state.status === "error") {
    list.replaceChildren();
  } else if (visible.length) {
    list.replaceChildren(...visible.map(card));
  } else {
    list.replaceChildren(emptyItem(emptyText()));
  }

  errorEl.textContent = state.status === "error" ? `Couldn't load the vendors: ${state.error}.` : "";
  retryBtn.hidden = state.status !== "error";

  for (const button of filters.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.filter === state.tag));
  }
  count.textContent = countText(visible);
  savedCount.textContent = state.saved.size ? `♥ ${state.saved.size} saved` : "";

  // Controls are part of the page too: draw them from state
  // (only when different: rewriting the box you're typing in can move the cursor)
  if (search.value !== state.query) search.value = state.query;
}
