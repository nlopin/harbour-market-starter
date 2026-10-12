import { savePin, deletePin } from "./api.js";

const controllers = new Map();

export const state = {
  status: "loading",
  error: "",
  stalls: [],
  tag: "all",       // the pressed filter button
  query: "",        // what's typed in the search box
  saved: new Set(), // ids of the ♥ stalls
  pending: new Set(),
  savedAvailable: true,
  saveError: "",
};

// Derived, never stored: what should be on screen right now?
export function visibleStalls() {
  const q = state.query.trim().toLowerCase();
  return state.stalls
    .filter((stall) => state.tag === "all" || stall.tag === state.tag)
    .filter((stall) => stall.name.toLowerCase().includes(q));
}

export async function toggleSaved(id) {
  if (state.savedAvailable === false) return;

  controllers.get(id)?.abort();
  const controller = new AbortController();
  controllers.set(id, controller);

  const willBeSaved = !state.saved.has(id);
  if (willBeSaved) {
    state.saved.add(id);
  } else {
    state.saved.delete(id);
  }

  state.pending.add(id);
  state.saveError = "";

  try {
    if (willBeSaved) {
      await savePin(id, { signal: controller.signal });
    } else {
      await deletePin(id, { signal: controller.signal });
    }
  } catch (err) {
    if (err.name === "AbortError") {
      return;
    }

    if (controllers.get(id) !== controller) {
      return;
    }

    if (willBeSaved) {
      state.saved.delete(id);
    } else {
      state.saved.add(id);
    }

    const stall = state.stalls.find((s) => s.id === id);
    const stallName = stall ? stall.name : "stall";
    const msg = `Couldn't save ${stallName}. Try again.`;
    state.saveError = msg;

    setTimeout(() => {
      if (state.saveError === msg) {
        state.saveError = "";
        const saveErrorEl = document.querySelector(".save-error");
        if (saveErrorEl) saveErrorEl.textContent = "";
      }
    }, 5000);
  } finally {
    if (controllers.get(id) === controller) {
      controllers.delete(id);
      state.pending.delete(id);
    }
  }
}
