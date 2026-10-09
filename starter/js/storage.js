import { state } from "./state.js";
import { CURRENCIES } from "./currency.js";

// localStorage keeps strings, so the choices go through JSON.
const KEY = "harbour-night";

export function save() {
  const data = { tag: state.tag, saved: [...state.saved], currency: state.currency }; // a Set isn't JSON
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (!data) return; // first visit
    state.tag = data.tag ?? "all";
    state.saved = new Set(data.saved ?? []);
    state.currency = CURRENCIES.includes(data.currency) ? data.currency : "EUR"; // unknown → euros
  } catch {
    // broken or old data: keep the defaults
  }
}
