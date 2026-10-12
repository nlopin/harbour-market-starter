import { state } from "./state.js";

// localStorage keeps strings, so the choices go through JSON.
const KEY = "harbour-night";

export function save() {
  const data = { tag: state.tag };
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (!data) return; // first visit
    state.tag = data.tag ?? "all";
  } catch {
    // broken or old data: keep the defaults
  }
}
