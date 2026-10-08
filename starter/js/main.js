// The only file the HTML loads. It wires events to state and starts the page.
import { state, toggleSaved } from "./state.js";
import { save, load } from "./storage.js";
import { render } from "./render.js";
import { getJSON, describe } from "./api.js";
import { setupMenu } from "./menu.js";
import { setupTickets } from "./tickets.js";
import { setupReviews, openReviews } from "./reviews.js";

const filters = document.querySelector(".filters");
const list = document.querySelector(".vendor-list");
const statusLine = document.querySelector(".status");
const retry = document.querySelector(".load-error .retry");

// Every change goes through here: draw, then remember
function update() {
  render();
  save();
}

// loading → render → GET /stalls → ready or error → render.
// Only the newest call may write: an older answer arriving late is dropped.
let latestLoad = 0;
async function loadStalls() {
  const thisLoad = ++latestLoad;
  state.status = "loading";
  state.error = null;
  render();
  try {
    const stalls = await getJSON("/stalls", { signal: AbortSignal.timeout(15000) });
    if (thisLoad !== latestLoad) return;
    state.stalls = stalls;
    state.status = "ready";
  } catch (error) {
    if (thisLoad !== latestLoad) return;
    console.error(error); // the details for us; a sentence for people
    state.error = describe(error);
    state.status = "error";
  }
  render();
}

filters.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  state.tag = button.dataset.filter;
  update();
});

document.querySelector("#vendor-search").addEventListener("input", (event) => {
  state.query = event.target.value;
  update();
});

// The cards are redrawn all the time: one listener on the list hears every ♡
// and every Reviews button
list.addEventListener("click", (event) => {
  const reviews = event.target.closest(".reviews-open");
  if (reviews) {
    openReviews(reviews.closest(".stall").dataset.id);
    return;
  }
  const button = event.target.closest(".save");
  if (!button) return;
  toggleSaved(button.closest(".stall").dataset.id);
  update();
});

// Try again hides itself while loading: focus goes to the status line first,
// so keyboard users aren't left on a button that just disappeared
retry.addEventListener("click", () => {
  statusLine.focus();
  loadStalls();
});

setupMenu();
setupTickets();
setupReviews();
load();
await loadStalls();
