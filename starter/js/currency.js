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

// Prices show in the chosen currency only once the rates are here
const shownCurrency = () => (state.ratesStatus === "ready" ? state.currency : "EUR");

// 8 → "€8", "£6.78", "$8.96", "CHF 7.45". Always converted from the euro price,
// so switching back and forth never converts twice.
export function formatPrice(euros) {
  if (euros === 0) return "free";
  const currency = shownCurrency();
  const amount = currency === "EUR" ? euros : euros * state.rates[currency];
  const decimals = Number.isInteger(amount) ? 0 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency, minimumFractionDigits: decimals, maximumFractionDigits: 2,
  }).format(amount);
}

// "2026-10-02" → "Rates of 2 October"
export function ratesNote() {
  if (state.ratesStatus !== "ready") return "";
  const day = new Date(`${state.ratesDate}T00:00`); // local midnight, not UTC
  return `Rates of ${day.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`;
}
