// Issue #1 · Review wall: a stall's reviews in a <dialog>
import { request, getJSON, postJSON, HttpError, describe } from "./api.js";
import { state } from "./state.js";
import { render } from "./render.js";

// ids of the reviews posted from this browser. Only decides where Delete shows:
// the server lets anyone delete any review.
const MY_REVIEWS_KEY = "harbour-my-reviews";

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
  deletingIds: new Set(),
  note: "",          // "Review deleted." and the like, in the status line
  deleteError: "",
};

const findStall = (id) => state.stalls.find((stall) => stall.id === id);

function myReviewIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(MY_REVIEWS_KEY)) ?? []);
  } catch {
    return new Set(); // broken data: no Delete buttons, nothing worse
  }
}

function saveMyReviewIds(ids) {
  localStorage.setItem(MY_REVIEWS_KEY, JSON.stringify([...ids]));
}

function reviewItem(review, myIds) {
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

  const deleteBtn = li.querySelector(".review-delete");
  deleteBtn.hidden = !myIds.has(review.id);
  deleteBtn.disabled = reviewState.deletingIds.has(review.id);
  deleteBtn.setAttribute("aria-label", `Delete your review “${review.text.slice(0, 30)}”`);
  return li;
}

function statusText() {
  if (reviewState.status === "loading") return "Loading the reviews…";
  if (reviewState.status === "error") return "";
  if (reviewState.note) return reviewState.note;
  const count = reviewState.reviews.length;
  if (count === 0) return "No reviews yet: be the first.";
  return count === 1 ? "1 review" : `${count} reviews`;
}

function drawReviews() {
  const stall = findStall(reviewState.stallId);
  titleEl.textContent = stall ? stall.name : "Reviews";
  statusEl.textContent = statusText();

  if (reviewState.status === "ready") {
    const myIds = myReviewIds();
    reviewList.replaceChildren(...reviewState.reviews.map((review) => reviewItem(review, myIds)));
  } else {
    reviewList.replaceChildren();
  }

  if (reviewState.status === "error") {
    errorEl.textContent = `Couldn't load the reviews: ${reviewState.error}.`;
  } else {
    errorEl.textContent = reviewState.deleteError;
  }
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
  reviewState.note = "";
  reviewState.deleteError = "";
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
  reviewState.note = "";
  reviewState.deleteError = "";
  drawReviews();
  try {
    const saved = await postJSON(`/stalls/${encodeURIComponent(stallId)}/reviews`, review);
    const myIds = myReviewIds();
    myIds.add(saved.id);
    saveMyReviewIds(myIds);
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

async function deleteReview(id) {
  if (reviewState.deletingIds.has(id)) return; // a double click sends one DELETE
  const stallId = reviewState.stallId;
  const review = reviewState.reviews.find((r) => r.id === id);

  reviewState.deletingIds.add(id);
  reviewState.note = "Deleting the review…";
  reviewState.deleteError = "";
  drawReviews();
  try {
    await request("DELETE", `/reviews/${encodeURIComponent(id)}`);
  } catch (err) {
    // 404: it's gone already, which is what we wanted
    if (!(err instanceof HttpError && err.status === 404)) {
      console.error(`DELETE /reviews/${id} failed:`, err);
      reviewState.deletingIds.delete(id);
      if (stallId === reviewState.stallId) {
        reviewState.note = "";
        reviewState.deleteError = `The review wasn't deleted: ${describe(err)}.`;
        drawReviews();
      }
      return;
    }
  }

  reviewState.deletingIds.delete(id);
  const myIds = myReviewIds();
  myIds.delete(id);
  saveMyReviewIds(myIds);

  const stall = findStall(stallId);
  if (stall && review) estimateRating(stall, review.rating, -1);
  render();
  refreshStall(stallId);

  if (stallId === reviewState.stallId) {
    reviewState.reviews = reviewState.reviews.filter((r) => r.id !== id);
    reviewState.note = "Review deleted.";
    drawReviews();
  }
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

  // Focus first: the list is redrawn and the Delete button goes away with its review
  reviewList.addEventListener("click", (event) => {
    const button = event.target.closest(".review-delete");
    if (!button || button.disabled) return;
    statusEl.focus();
    deleteReview(button.closest(".review").dataset.id);
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
