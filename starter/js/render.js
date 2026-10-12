import { state, visibleStalls } from "./state.js";

const template = document.querySelector("#stall-template");
const list = document.querySelector(".vendor-list");
const filters = document.querySelector(".filters"); // module scope: main.js has its own
const count = document.querySelector(".filter-count");
const savedCount = document.querySelector(".saved-count");
const search = document.querySelector("#vendor-search");
const errorText = document.querySelector(".load-error p[role='alert']");
const retryButton = document.querySelector(".load-error button");

const saveError = document.querySelector(".save-error");

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

  const ratingEl = li.querySelector(".rating");
  if (ratingEl) {
    if (stall.rating != null && stall.reviewCount) {
      const reviews = stall.reviewCount === 1 ? "1 review" : `${stall.reviewCount} reviews`;
      ratingEl.textContent = `★ ${stall.rating} · ${reviews}`;
    } else {
      ratingEl.textContent = "no reviews yet";
    }
  }

  const save = li.querySelector(".save");
  const isSaved = state.saved.has(stall.id);
  const isPending = state.pending.has(stall.id);

  save.setAttribute("aria-pressed", String(isSaved));
  save.setAttribute("aria-label", `Save ${stall.name}`);
  save.textContent = isSaved ? "♥" : "♡";

  if (state.savedAvailable === false) {
    save.disabled = true;
    save.title = "Saved stalls unavailable";
    save.style.opacity = "";
  } else {
    save.disabled = false;
    save.removeAttribute("title");
    save.style.opacity = isPending ? 0.5 : 1;
  }
  
  return li;
}

// Draws everything that depends on state. Safe to call any number of times.
export function render() {
  const { status, stalls } = state;
  list.setAttribute("aria-busy", String(status === "loading"));

  if (retryButton) retryButton.hidden = status !== "error";
  if (errorText) errorText.textContent = status === "error" ? state.error : "";
  if (saveError) saveError.textContent = state.saveError || "";

  if (status === "loading") {
    count.textContent = "";
    savedCount.textContent = "";
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "Loading the vendors…";
    list.replaceChildren(empty);
  } else if (status === "error") {
    count.textContent = "";
    savedCount.textContent = "";
    list.replaceChildren();
  } else {
    const visible = visibleStalls();

    if (visible.length) {
      list.replaceChildren(...visible.map(card));
    } else {
      const empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = stalls.length === 0 ? "No stalls yet." : `No stall matches “${state.query}”.`;
      list.replaceChildren(empty);
    }

    count.textContent = visible.length === stalls.length ? `${stalls.length} stalls` : `${visible.length} of ${stalls.length} stalls`;
    if (state.savedAvailable === false) {
      savedCount.textContent = "♥ unavailable";
    } else {
      savedCount.textContent = state.saved.size ? `♥ ${state.saved.size} saved` : "";
    }
  }

  for (const button of filters.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.filter === state.tag));
  }

  // Controls are part of the page too: draw them from state
  // (only when different: rewriting the box you're typing in can move the cursor)
  if (search.value !== state.query) search.value = state.query;
}
