// Issue #1 · Review wall: a stall's reviews in a <dialog>
import { getJSON, describe } from "./api.js";
import { state } from "./state.js";

const list = document.querySelector(".vendor-list");
const dialog = document.querySelector(".reviews-dialog");
const titleEl = dialog.querySelector("#reviews-title");
const statusEl = dialog.querySelector(".reviews-status");
const reviewList = dialog.querySelector(".review-list");
const errorEl = dialog.querySelector(".reviews-error p");
const retryBtn = dialog.querySelector(".reviews-error button");
const closeBtn = dialog.querySelector(".reviews-close");
const template = document.querySelector("#review-template");

const reviewState = {
  stallId: null,
  status: "loading", // "loading" | "ready" | "error"
  error: "",
  reviews: [],
  controller: null,  // the GET in flight, so it can be cancelled
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

function openReviews(stallId) {
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
