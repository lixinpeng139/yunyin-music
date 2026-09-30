import { getClientId, setSessionPresent } from "./session";

/**
 * Thin, typed wrapper around the bundled NetEaseCloudMusicApi sidecar.
 *
 * Every call goes to `127.0.0.1:<sidecar port>`; the sidecar performs the
 * `weapi`/`eapi` encryption and the outbound HTTPS request to NetEase. The
 * webview never talks to NetEase directly, which keeps us clear of CORS and
 * of NetEase's `Referer` checks.
 */

const FALLBACK_BASE = "http://127.0.0.1:38471";

let baseOverride: string | null = null;

/** Rust injects the real port once the sidecar reports ready. */
export function setApiBase(base: string) {
  baseOverride = base.replace(/\/+$/, "");
}

export function apiBase(): string {
  if (baseOverride) return baseOverride;
  if (typeof window !== "undefined" && window.__YUNYIN__?.apiBase) {
    return window.__YUNYIN__.apiBase;
  }
  const fromEnv = import.meta.env.VITE_NCM_API as string | undefined;
  return (fromEnv || FALLBACK_BASE).replace(/\/+$/, "");
}




/**
 * GET via XMLHttpRequest, which always settles.
 *
 * WebKitGTK's `fetch` can hang permanently on the QR-status endpoint: the
 * request reaches the server, the server answers, and the promise still never
 * resolves — `AbortController` included, and it blocks the timers scheduled
 * around it. XHR takes a different path through the same network stack and
 * answers normally (verified side by side against the same bridge), and its
 * `ontimeout` guarantees the poll loop keeps moving.
 */
/**
 * Performs one GET and returns the parsed JSON body.
 *
 * XMLHttpRequest rather than fetch, deliberately.
 *
 * WebKitGTK — the engine Tauri renders with — can leave `fetch` permanently
 * unresolved against the local bridge: the request arrives (the bridge logs it),
 * the bridge answers, and the promise still never settles. `AbortController`
 * does not fire either, and the timers scheduled around it stop running, so the
 * login poll simply died after its first call. XHR takes a different path
 * through the same network stack and answers immediately, and its `timeout`
 * guarantees this promise always settles.
 *
 * Every endpoint the app uses is reachable with GET query parameters, which is
 * what the sidecar exposes, so one transport covers the whole client.
 */
function transport<T>(
  url: string,
  endpoint: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
  timeoutMs = 30_000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      fn();
    };

    function onAbort() {
      try {
        xhr.abort();
      } catch {
        /* already done */
      }
      finish(() => reject(new ApiError(endpoint, -1, "请求已取消")));
    }

    xhr.open("GET", url, true);
    xhr.timeout = timeoutMs;
    for (const [key, value] of Object.entries(headers)) {
      try {
        xhr.setRequestHeader(key, value);
      } catch {
        /* a forbidden header simply is not sent */
      }
    }

    xhr.onload = () =>
      finish(() => {
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(
            new ApiError(endpoint, xhr.status, `侧车服务返回 HTTP ${xhr.status}`),
          );
          return;
        }
        try {
          resolve(JSON.parse(xhr.responseText) as T);
        } catch (error) {
          reject(
            new ApiError(
              endpoint,
              xhr.status,
              error instanceof Error ? error.message : "响应解析失败",
            ),
          );
        }
      });

    xhr.onerror = () =>
      finish(() => reject(new ApiError(endpoint, -1, "网络错误，无法连接本地服务")));
    xhr.ontimeout = () =>
      finish(() =>
        reject(new ApiError(endpoint, -1, `请求超时（${timeoutMs}ms）`)),
      );
    xhr.onabort = () => finish(() => reject(new ApiError(endpoint, -1, "请求已取消")));

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort);
    }

    try {
      xhr.send();
    } catch (error) {
      finish(() =>
        reject(
          new ApiError(endpoint, -1, error instanceof Error ? error.message : "请求发送失败"),
        ),
      );
    }
  });
}

export class ApiError extends Error {
  readonly code: number;
  readonly endpoint: string;
  /** Present when NetEase answered with a risk-control verdict. */
  readonly redirectUrl?: string;

  constructor(
    endpoint: string,
    code: number,
    message: string,
    redirectUrl?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.endpoint = endpoint;
    this.redirectUrl = redirectUrl;
  }

  /**
   * NetEase risk control. `8810` reports a suspicious network and `10004` a
   * suspicious account; both block password login from an API client no matter
   * whether the credentials are correct, so the UI steers to QR login instead.
   */
  get isRiskControl() {
    return this.code === 8810 || this.code === 10004;
  }

  /** NetEase's "you must be logged in" code. */
  get isAuthError() {
    return this.code === 301 || this.code === 302 || this.code === 250;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>

/** The fields every NetEase response may carry, whatever the endpoint. */
interface Envelope {
  code?: number
  msg?: string
  message?: string
  cookie?: string | string[]
};

function buildUrl(endpoint: string, query?: Query) {
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = new URL(apiBase() + path);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

interface RequestOptions {
  /** Skip attaching the session cookie (used by the login handshake). */
  anonymous?: boolean;
  signal?: AbortSignal;
  retries?: number;
  /**
   * Response codes that are legitimate answers rather than failures.
   *
   * NetEase signals progress with non-200 codes — the QR handshake answers 801
   * (waiting), 802 (scanned) and 803 (authorised), and the 803 body carries the
   * session cookie. Treating those as errors made the caller discard them, so
   * the login could never complete.
   */
  acceptedCodes?: readonly number[];
}

/**
 * Performs a request and returns the raw JSON body.
 *
 * NetEase signals failure with an HTTP 200 and an in-body `code`, so this
 * unwraps that convention and surfaces `ApiError` instead of silently handing
 * back an empty object.
 */
export async function request<T = unknown>(
  endpoint: string,
  query?: Query,
  options: RequestOptions = {},
): Promise<T> {
  const { anonymous = false, signal, retries = 1, acceptedCodes } = options;
  const url = new URL(buildUrl(endpoint, query));
  const headers: Record<string, string> = { Accept: "application/json" };
  // The client id is sent on *every* request, including the login handshake.
  // It carries no credentials — only an opaque handle for the bridge's jar — and
  // omitting it during login stored the session under a different key than the
  // one later requests looked up, so the session appeared to vanish.
  url.searchParams.set("clientId", getClientId());
  void anonymous;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const body = (await transport<T & Envelope>(url.toString(), endpoint, headers, signal)) as T &
        Envelope;
      // Some endpoints legitimately omit `code` (e.g. legacy `top/playlist`).
      const accepted =
        typeof body.code === "number" &&
        (body.code === 200 ||
          body.code === 0 ||
          (acceptedCodes?.includes(body.code) ?? false));
      if (typeof body.code === "number" && !accepted) {
        const message =
          body.msg || body.message || `接口返回 code=${body.code}`;
        throw new ApiError(
          endpoint,
          body.code,
          message,
          (body as { redirectUrl?: string }).redirectUrl,
        );
      }
      return body;
    } catch (error) {
      lastError = error;
      const isAbort =
        error instanceof DOMException && error.name === "AbortError";
      const isApiError = error instanceof ApiError;
      // A real API-level rejection will not fix itself on retry; a transport
      // failure usually will, because the sidecar is still booting.
      if (isAbort || isApiError || attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }

  if (lastError instanceof ApiError) throw lastError;
  const detail =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new ApiError(endpoint, -1, `无法连接本地音乐服务：${detail}`);
}

/** Asks the bridge whether it currently holds a signed-in session. */
export async function refreshSessionState(): Promise<boolean> {
  try {
    const url = new URL(apiBase() + "/health");
    url.searchParams.set("clientId", getClientId());
    const response = await fetch(url.toString());
    const body = (await response.json()) as { signedIn?: boolean };
    setSessionPresent(Boolean(body.signedIn));
    return Boolean(body.signedIn);
  } catch {
    return false;
  }
}

/** Polls the sidecar until it answers or the deadline passes. */
export async function waitForApi(timeoutMs = 30_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      // Probe the bridge's own health route, not a NetEase endpoint.
      //
      // This used to call `/search`, so a NetEase-side rejection (a rate limit,
      // for instance) was indistinguishable from the local bridge being down:
      // the app sat on "正在启动本地音乐服务" with the message "无法连接
      // 127.0.0.1" while the bridge was healthy the whole time.
      const url = new URL(apiBase() + "/health");
      url.searchParams.set("clientId", getClientId());
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as { ok?: boolean; signedIn?: boolean };
      if (!body.ok) throw new Error("unexpected health payload");
      // Keep the cached session view in step while we are here.
      setSessionPresent(Boolean(body.signedIn));
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  return false;
}

export { hasSession } from "./session";
