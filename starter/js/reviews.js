// Issue #1 · Review wall: a stall's reviews in a <dialog>
import { getJSON, postJSON, HttpError, describe } from "./api.js";
import { state } from "./state.js";
import { render } from "./render.js";

const list = document.querySelector(".vendor-list");
const dialog = document.querySelector(".reviews-dialog");
const titleEl = dialog.querySelector("#reviews-title");
const statusEl = dialog.querySelector(".reviews-status");
const reviewList = dialog.querySelector(".review-list");
const errorEl = dialog.querySelector(".reviews-error p");
const retryBtn = dialog.querySelector(".reviews-error button");
const closeBtn = dialog.querySelector(".reviews-close");
const template = document.querySelector("#review-template");
const form = dialog.querySelector(".review-form");
const formErrorEl = form.querySelector(".form-error");
const submitBtn = form.querySelector("button[type=submit]");

const reviewState = {
  stallId: null,
  status: "loading", // "loading" | "ready" | "error"
  error: "",
  reviews: [],
  controller: null,  // the GET in flight, so it can be cancelled
  isPosting: false,
};

const findStall = (id) => state.stalls.find((stall) => stall.id === id);

function reviewItem(review) {
  const li = template.content.firstElementChild.cloneNode(true);
  li.dataset.id = review.id;
  li.querySelector(".review-author").textContent = review.author;

  const stars = li.querySelector(".review-stars");
  stars.textContent = "★".repeat(review.rating) + "☆".repeat(5 - review.rating);
  stars.setAttribute("aria-label", `${review.rating} out of 5`);

  const time = li.querySelector("time");
  time.dateTime = review.createdAt;
  time.textContent = new Date(review.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  li.querySelector(".review-text").textContent = review.text;
  return li;
}

function statusText() {
  if (reviewState.status === "loading") return "Loading the reviews…";
  if (reviewState.status === "error") return "";
  const count = reviewState.reviews.length;
  if (count === 0) return "No reviews yet: be the first.";
  return count === 1 ? "1 review" : `${count} reviews`;
}

function drawReviews() {
  const stall = findStall(reviewState.stallId);
  titleEl.textContent = stall ? stall.name : "Reviews";
  statusEl.textContent = statusText();

  if (reviewState.status === "ready") {
    reviewList.replaceChildren(...reviewState.reviews.map(reviewItem));
  } else {
    reviewList.replaceChildren();
  }

  errorEl.textContent = reviewState.status === "error" ? `Couldn't load the reviews: ${reviewState.error}.` : "";
  retryBtn.hidden = reviewState.status !== "error";

  submitBtn.disabled = reviewState.isPosting;
  submitBtn.textContent = reviewState.isPosting ? "Posting…" : "Post review";
}

async function loadReviews() {
  reviewState.controller?.abort();
  const controller = new AbortController();
  reviewState.controller = controller;
  const stallId = reviewState.stallId;

  reviewState.status = "loading";
  reviewState.error = "";
  reviewState.reviews = [];
  drawReviews();
  try {
    const reviews = await getJSON(`/stalls/${encodeURIComponent(stallId)}/reviews`, {
      signal: controller.signal,
    });
    if (controller !== reviewState.controller) return; // another stall was opened meanwhile
    reviewState.reviews = reviews;
    reviewState.status = "ready";
  } catch (err) {
    if (err.name === "AbortError" || controller !== reviewState.controller) return;
    console.error(`GET /stalls/${stallId}/reviews failed:`, err);
    reviewState.error = describe(err);
    reviewState.status = "error";
  }
  drawReviews();
}

// Used when GET /stalls/:id fails, so the card doesn't keep the old numbers
function estimateRating(stall, rating, sign) {
  const count = stall.reviewCount + sign;
  const sum = (stall.rating ?? 0) * stall.reviewCount + rating * sign;
  stall.reviewCount = count;
  stall.rating = count > 0 ? Math.round((sum / count) * 10) / 10 : null;
}

async function refreshStall(stallId) {
  try {
    const fresh = await getJSON(`/stalls/${encodeURIComponent(stallId)}`);
    const index = state.stalls.findIndex((stall) => stall.id === stallId);
    if (index !== -1) state.stalls[index] = fresh;
    render();
  } catch (err) {
    console.warn(`GET /stalls/${stallId} failed, the card keeps the estimate:`, err);
  }
}

// Every field has a note under it: the server's message, or the hint when there's no error
function clearFieldErrors() {
  for (const field of form.querySelectorAll("[name]")) {
    const note = form.querySelector(`#review-${field.name}-note`);
    field.removeAttribute("aria-invalid");
    note.textContent = note.dataset.hint ?? "";
    note.classList.remove("field-error");
  }
  formErrorEl.textContent = "";
}

function showFieldErrors(fields) {
  let first = null;
  for (const [name, message] of Object.entries(fields)) {
    const field = form.elements[name];
    if (!field) continue;
    const note = form.querySelector(`#review-${name}-note`);
    field.setAttribute("aria-invalid", "true");
    note.textContent = message;
    note.classList.add("field-error");
    first ??= field;
  }
  first?.focus();
}

async function postReview() {
  if (reviewState.isPosting) return; // a double click posts once
  const stallId = reviewState.stallId;
  const data = new FormData(form);
  const review = {
    author: data.get("author"),
    rating: Number(data.get("rating")), // the server wants 5, not "5"
    text: data.get("text"),
  };

  clearFieldErrors();
  reviewState.isPosting = true;
  drawReviews();
  try {
    const saved = await postJSON(`/stalls/${encodeURIComponent(stallId)}/reviews`, review);
    if (stallId === reviewState.stallId) {
      reviewState.reviews = [saved, ...reviewState.reviews];
      form.reset();
    }
    const stall = findStall(stallId);
    if (stall) estimateRating(stall, saved.rating, 1);
    render();
    refreshStall(stallId);
  } catch (err) {
    console.error(`POST /stalls/${stallId}/reviews failed:`, err);
    if (stallId !== reviewState.stallId) {
      // another stall is open now: this form isn't theirs any more
    } else if (err instanceof HttpError && err.status === 422 && err.body?.fields) {
      showFieldErrors(err.body.fields);
    } else {
      formErrorEl.textContent = `Your review wasn't posted: ${describe(err)}. Your text is still here, try again.`;
    }
  }
  reviewState.isPosting = false;
  drawReviews();
}

function openReviews(stallId) {
  if (stallId !== reviewState.stallId) {
    // what was typed for another stall shouldn't be posted here
    form.reset();
    clearFieldErrors();
  }
  reviewState.stallId = stallId;
  if (!dialog.open) dialog.showModal();
  loadReviews();
}

export function setupReviews() {
  // The cards get redrawn, so the stall is read from the card at click time
  list.addEventListener("click", (event) => {
    const button = event.target.closest(".reviews-open");
    if (!button) return;
    openReviews(button.closest(".stall").dataset.id);
  });

  retryBtn.addEventListener("click", () => {
    statusEl.focus();
    loadReviews();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    postReview();
  });

  closeBtn.addEventListener("click", () => dialog.close());

  // a click on the backdrop lands on the dialog itself, not on .reviews-inner
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  // Esc, × or the backdrop
  dialog.addEventListener("close", () => {
    reviewState.controller?.abort();
    // the old button may be gone after a render(): find the card's button again
    const id = CSS.escape(reviewState.stallId);
    list.querySelector(`.stall[data-id="${id}"] .reviews-open`)?.focus();
  });
}
