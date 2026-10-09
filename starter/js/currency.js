// Prices in the visitor's currency (issue #7). The server's prices stay in
// euros; converting is display only.
import { getExternalJSON } from "./api.js";
import { state } from "./state.js";

export const CURRENCIES = ["EUR", "GBP", "USD", "CHF"];
const RATES_URL = "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=GBP,USD,CHF";
const KEY = "harbour-rates";

// Today on the visitor's calendar, "2026-10-09": rates are fetched once per day
const today = () => new Date().toLocaleDateString("en-CA");

// A rates object we can trust: a date and a positive number for every currency
function isValid(data) {
  return typeof data?.date === "string" &&
    CURRENCIES.slice(1).every((c) => Number.isFinite(data.rates?.[c]) && data.rates[c] > 0);
}

// The rates stored today, or null (none, from another day, or broken)
function storedRates() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    return isValid(data) && data.fetchedOn === today() ? data : null;
  } catch {
    return null;
  }
}

// GET the rates at most once a day. Never throws: a failure becomes ratesStatus "error"
export async function loadRates() {
  let data = storedRates();
  if (!data) {
    try {
      const body = await getExternalJSON(RATES_URL);
      if (!isValid(body)) throw new Error("rates: unexpected answer");
      data = { fetchedOn: today(), date: body.date, rates: body.rates };
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage full or blocked: fine, ask again next time */ }
    } catch (error) {
      console.error(error);
      state.ratesStatus = "error";
      return;
    }
  }
  state.rates = data.rates;
  state.ratesDate = data.date;
  state.ratesStatus = "ready";
}
