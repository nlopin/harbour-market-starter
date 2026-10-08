// Every request to the Harbour Market API goes through this module.
// The rest of the app imports these functions and never calls fetch() itself.

// Your own market on the course server: put your GitHub username in the URL
// (lower case). The control page: https://harbour-api.lopin.me
export const API = "https://harbour-api.lopin.me/digantasarmah1001-crypto/api";

// An Error for a 4xx/5xx response, carrying the status and the parsed error
// body, so callers can tell a 404 from a 422 and read body.fields.
export class HttpError extends Error {
  constructor(response, body) {
    const detail = body?.message ? `: ${body.message}` : "";
    super(`HTTP ${response.status}${detail}`);
    this.name = "HttpError";
    this.status = response.status;
    this.body = body;
  }
}

// One request, JSON in and out. `path` is relative to API: request("GET", "/stalls").
// Resolves with the parsed body (null for a 204); rejects with an HttpError
// for 4xx/5xx, and lets network errors and aborts through.
export async function request(method, path, data, options = {}) {
  const headers = { Accept: "application/json", ...options.headers };
  const init = { ...options, method, headers };
  if (data !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(data);
  }

  const response = await fetch(API + path, init);

  if (!response.ok) {
    const body = await response.json().catch((error) => {
      if (error.name === "AbortError") throw error;
      return null; // an error page that isn't JSON
    });
    throw new HttpError(response, body);
  }
  return response.status === 204 ? null : response.json();
}

export const getJSON = (path, options) => request("GET", path, undefined, options);
export const postJSON = (path, data, options) => request("POST", path, data, options);
export const deleteJSON = (path, options) => request("DELETE", path, undefined, options);

// A short sentence for people; the error itself goes to the console.
export function describe(error) {
  if (error?.name === "HttpError") {
    if (error.status === 404) return "we couldn't find that (404)";
    if (error.status === 422) return "some fields need another look (422)";
    if (error.status >= 500) return `the server had a problem (it answered ${error.status})`;
    return `the server answered ${error.status}`;
  }
  if (error?.name === "AbortError") return "the request was cancelled";
  if (error?.name === "TimeoutError") return "the server took too long to answer";
  if (error?.name === "TypeError") return "no connection: check your internet";
  return "something went wrong";
}
