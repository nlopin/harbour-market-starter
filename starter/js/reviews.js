// Issue #1 · the review wall: a stall's reviews in a dialog. Read them, post
// one, delete your own. Every request goes through api.js.
import { getJSON, postJSON, deleteJSON, describe } from "./api.js";
import { state } from "./state.js";
import { render, ratingText } from "./render.js";

const MINE_KEY = "harbour-my-reviews";

const dialog = document.querySelector("dialog.reviews");
const title = dialog.querySelector("#reviews-title");
const summary = dialog.querySelector(".reviews-summary");
const statusLine = dialog.querySelector(".reviews-status");
const errorText = dialog.querySelector(".reviews-error [role='alert']");
const retry = dialog.querySelector(".reviews-retry");
const list = dialog.querySelector(".review-list");
const form = dialog.querySelector(".review-form");
const submit = form.querySelector(".review-submit");
const formError = form.querySelector(".form-error");

// What the dialog shows. One dialog, so one stall at a time.
const reviews = {
  stallId: null,
  status: "idle",       // "loading" | "ready" | "error": where GET …/reviews is
  error: null,          // a sentence when the GET failed
  actionError: null,    // a sentence when a DELETE failed
  items: [],            // newest first, as the server sends them
  posting: false,       // a POST in flight: the button stays disabled
  deleting: new Set(),  // ids of reviews with a DELETE in flight
};
let controller = null;  // the GET in flight; aborted when another stall opens

// ids of the reviews posted from this browser: only those can be deleted
function loadMine() {
  try {
    return new Set(JSON.parse(localStorage.getItem(MINE_KEY)) ?? []);
  } catch {
    return new Set(); // broken or old data
  }
}
const mine = loadMine();
function saveMine() {
  try {
    localStorage.setItem(MINE_KEY, JSON.stringify([...mine]));
  } catch {
    // storage full or blocked: the review is posted, only "Delete" is lost after a reload
  }
}

const stallById = (id) => state.stalls.find((stall) => stall.id === id);
const stallPath = (id) => `/stalls/${encodeURIComponent(id)}`;

// "3 hours ago", "yesterday"
const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
function ago(iso) {
  const seconds = (new Date(iso) - Date.now()) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

// Data in, element out. textContent everywhere: a review with HTML stays text.
function reviewItem(review) {
  const li = document.createElement("li");
  li.className = "review";
  li.dataset.id = review.id;

  const meta = document.createElement("p");
  meta.className = "review-meta";
  const stars = document.createElement("span");
  stars.className = "review-stars";
  stars.setAttribute("role", "img");
  stars.setAttribute("aria-label", `${review.rating} out of 5`);
  stars.textContent = "★".repeat(review.rating) + "☆".repeat(5 - review.rating);
  const author = document.createElement("strong");
  author.textContent = review.author;
  const time = document.createElement("time");
  time.dateTime = review.createdAt;
  time.textContent = ago(review.createdAt);
  meta.append(stars, " ", author, " · ", time);

  const text = document.createElement("p");
  text.className = "review-text";
  text.textContent = review.text;
  li.append(meta, text);

  if (mine.has(review.id)) {
    const busy = reviews.deleting.has(review.id);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "review-delete";
    remove.textContent = busy ? "Deleting…" : "Delete";
    remove.disabled = busy;
    remove.setAttribute("aria-label", `Delete your review “${review.text.slice(0, 30)}”`);
    li.append(remove);
  }
  return li;
}

function statusText() {
  if (reviews.status === "loading") return "Loading the reviews…";
  if (reviews.status === "error") return "";
  const n = reviews.items.length;
  if (!n) return "No reviews yet: be the first";
  return `${n} ${n === 1 ? "review" : "reviews"}, newest first`;
}

// Draws the dialog from `reviews`. Safe to call any number of times.
function renderDialog() {
  const stall = stallById(reviews.stallId);
  title.textContent = stall ? `Reviews · ${stall.name}` : "Reviews";
  summary.textContent = stall ? ratingText(stall) : "";

  statusLine.textContent = statusText();
  if (reviews.status === "error") errorText.textContent = `Couldn't load the reviews: ${reviews.error}.`;
  else errorText.textContent = reviews.actionError ?? "";
  retry.hidden = reviews.status !== "error";

  list.setAttribute("aria-busy", String(reviews.status === "loading"));
  list.replaceChildren(...(reviews.status === "ready" ? reviews.items.map(reviewItem) : []));

  submit.disabled = reviews.posting;
  submit.textContent = reviews.posting ? "Posting…" : "Post review";
}

// GET the open stall's reviews. Only the stall that's open now may write:
// opening another one aborts this request, and a late answer is dropped.
async function loadReviews() {
  controller?.abort();
  controller = new AbortController();
  const stallId = reviews.stallId;

  reviews.status = "loading";
  reviews.error = null;
  reviews.items = [];
  renderDialog();
  try {
    const items = await getJSON(`${stallPath(stallId)}/reviews`, { signal: controller.signal });
    if (stallId !== reviews.stallId) return;
    reviews.items = items;
    reviews.status = "ready";
  } catch (error) {
    if (error.name === "AbortError" || stallId !== reviews.stallId) return;
    console.error(error);
    reviews.error = describe(error);
    reviews.status = "error";
  }
  renderDialog();
}

// The card's rating changes with every review. Guess it right away from the
// review itself, then ask the server for the real numbers.
function estimate(stall, { added, removed }) {
  let count = stall.reviewCount ?? 0;
  let total = (stall.rating ?? 0) * count;
  if (added) { count += 1; total += added.rating; }
  if (removed) { count -= 1; total -= removed.rating; }
  stall.reviewCount = Math.max(count, 0);
  stall.rating = count > 0 ? Math.round((total / count) * 10) / 10 : null;
}

// render() replaces every card: if focus was on a card's Reviews button (the
// dialog closed before the numbers came back), put it on the new one
function redrawCards() {
  const focused = document.activeElement?.closest(".stall");
  render();
  if (focused && !focused.isConnected) focusReviewsButton(focused.dataset.id);
}

function focusReviewsButton(stallId) {
  const card = document.querySelector(`.stall[data-id="${CSS.escape(stallId)}"]`);
  card?.querySelector(".reviews-open").focus();
}

async function refreshStall(stallId, change) {
  const stall = stallById(stallId);
  if (!stall) return;
  estimate(stall, change);
  redrawCards();
  renderDialog();
  try {
    const fresh = await getJSON(stallPath(stallId));
    stall.rating = fresh.rating;
    stall.reviewCount = fresh.reviewCount;
    redrawCards();
    renderDialog();
  } catch (error) {
    console.error(error); // the estimate stays; the next page load has the real numbers
  }
}

// ---------- the form ----------

function clearErrors() {
  formError.textContent = "";
  for (const slot of form.querySelectorAll("[data-error-for]")) slot.textContent = "";
  for (const input of form.querySelectorAll("[aria-invalid]")) input.removeAttribute("aria-invalid");
}

// 422: the server's message under each field, aria-invalid on its input
function showFieldErrors(body) {
  let first = null;
  let unplaced = false;
  for (const [name, message] of Object.entries(body.fields)) {
    const slot = form.querySelector(`[data-error-for="${name}"]`);
    if (!slot) { unplaced = true; continue; }
    slot.textContent = message;
    const inputs = form.querySelectorAll(`[name="${name}"]`);
    for (const input of inputs) input.setAttribute("aria-invalid", "true");
    first ??= inputs[0];
  }
  formError.textContent = unplaced ? body.message : "Some fields need another look.";
  first?.focus();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (reviews.posting) return; // a double click posts once

  const stallId = reviews.stallId;
  const data = Object.fromEntries(new FormData(form));
  const review = {
    author: (data.author ?? "").trim(),
    rating: data.rating ? Number(data.rating) : undefined, // a number, not "5"
    text: (data.text ?? "").trim(),
  };

  clearErrors();
  reviews.posting = true;
  renderDialog();

  let created;
  try {
    created = await postJSON(`${stallPath(stallId)}/reviews`, review);
  } catch (error) {
    reviews.posting = false;
    renderDialog();
    if (stallId !== reviews.stallId) return;
    if (error.status === 422 && error.body?.fields) {
      showFieldErrors(error.body);
    } else {
      console.error(error);
      formError.textContent = `Your review wasn't posted: ${describe(error)}. It's still in the form: post it again.`;
    }
    return;
  }

  reviews.posting = false;
  mine.add(created.id);
  saveMine();
  if (stallId === reviews.stallId) {
    if (reviews.status === "ready") reviews.items.unshift(created);
    form.reset();
  }
  renderDialog();
  refreshStall(stallId, { added: created });
});

// ---------- delete your own ----------

list.addEventListener("click", async (event) => {
  const button = event.target.closest(".review-delete");
  if (!button) return;
  const id = button.closest(".review").dataset.id;
  if (reviews.deleting.has(id)) return;

  const stallId = reviews.stallId;
  const removed = reviews.items.find((review) => review.id === id);
  statusLine.focus(); // the button is about to be redrawn: keep focus in the dialog
  reviews.deleting.add(id);
  reviews.actionError = null;
  renderDialog();

  let gone = true;
  try {
    await deleteJSON(`/reviews/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error.status !== 404) { // 404: already deleted, which is what we wanted
      console.error(error);
      reviews.deleting.delete(id);
      reviews.actionError = `Couldn't delete your review: ${describe(error)}. Try again.`;
      renderDialog();
      return;
    }
    gone = false; // nothing to subtract from the card: the server already had
  }

  reviews.deleting.delete(id);
  mine.delete(id);
  saveMine();
  if (stallId === reviews.stallId) reviews.items = reviews.items.filter((review) => review.id !== id);
  renderDialog();
  if (gone && removed) refreshStall(stallId, { removed });
});

// ---------- open and close ----------

export function openReviews(stallId) {
  if (stallId !== reviews.stallId) {
    form.reset(); // a half-written review belongs to the stall it was written for
    clearErrors();
  }
  reviews.stallId = stallId;
  reviews.actionError = null;
  if (!dialog.open) dialog.showModal();
  loadReviews();
}

// render() redraws the cards while the dialog is open, so the button that
// opened it may be gone: give focus back to this stall's new button
function closeReviews() {
  dialog.close();
  focusReviewsButton(reviews.stallId);
}

export function setupReviews() {
  dialog.querySelector(".reviews-close").addEventListener("click", closeReviews);

  // A click on the backdrop lands on the dialog itself, but so does a click
  // on the dialog's own padding: only a click outside its box closes it
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    const inside = event.clientX >= box.left && event.clientX <= box.right
      && event.clientY >= box.top && event.clientY <= box.bottom;
    if (!inside) closeReviews();
  });

  retry.addEventListener("click", () => {
    statusLine.focus();
    loadReviews();
  });

  // Escape closes the dialog without our button: the same clean-up
  dialog.addEventListener("close", () => {
    controller?.abort();
    focusReviewsButton(reviews.stallId);
  });
}
