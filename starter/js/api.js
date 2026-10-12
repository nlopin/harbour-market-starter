// Every request to the Harbour Market API goes through this module.
// The rest of the app imports these functions and never calls fetch() itself.

// Your own market on the course server: put your GitHub username in the URL
// (lower case). The control page: https://harbour-api.lopin.me
export const API = "https://harbour-api.lopin.me/djeniup/api";

// An Error for a 4xx/5xx response, carrying the status and the parsed error
// body, so callers can tell a 404 from a 422 and read body.fields.
export class HttpError extends Error {
  constructor(response, body) {
    super(`HTTP ${response.status}: ${body?.message ?? response.statusText}`);
    this.name = "HttpError";
    this.status = response.status;
    this.body = body;
  }
}

// One request, JSON in and out. `path` is relative to API: request("GET", "/stalls").
// Resolves with the parsed body (null for a 204); rejects with an HttpError
// for 4xx/5xx, and lets network errors and aborts through.
export async function request(method, path, data, options = {}) {
  const init = {
    ...options,
    method,
    headers: { Accept: "application/json", ...options.headers },
  };
  if (data !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(data);
  }

  const res = await fetch(API + path, init);

  if (!res.ok) {
    let body = null;
    try {
      body = await res.json();
    } catch {
      // not JSON (a proxy error page?): the status is still enough
    }
    throw new HttpError(res, body);
  }

  if (res.status === 204) return null;
  return res.json();
}

export const getJSON = (path, options) => request("GET", path, undefined, options);
export const postJSON = (path, data, options) => request("POST", path, data, options);

const STATUS_TEXT = {
  404: "it isn't there",
  500: "the server had a problem",
  503: "the server is busy right now",
};

// A short sentence for people; the error itself goes to the console.
export function describe(err) {
  if (err instanceof HttpError) {
    const text = STATUS_TEXT[err.status];
    return text ? `${text} (${err.status})` : `the server answered ${err.status}`;
  }
  if (err?.name === "TypeError") return "no connection";
  if (err?.name === "AbortError") return "the request was cancelled";
  return "something went wrong";
}
