// The HTTP probe: the one part of this worker that reaches the outside world,
// and therefore the one part every test injects a fake for.

export interface ProbeResult {
  ok: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  error: string | null;
}

export type Probe = (url: string, method: "GET" | "HEAD", expectedStatus: number) => Promise<ProbeResult>;

const TIMEOUT_MS = 10_000;
const MAX_ERROR_LENGTH = 500;

/**
 * A monitor's URL is user-supplied and fetched by our own infrastructure, so
 * the host is checked before the request goes out: loopback, link-local and
 * private ranges are refused. This is a coarse guard, not a full SSRF defence
 * (DNS can still resolve a public name inwards), which is why the probe also
 * refuses redirects to a different origin.
 */
export function isProbeableUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;

  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return false;
  if (host === "0.0.0.0" || host === "::1" || host === "[::1]") return false;

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127 || a === 10 || a === 0) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false;
    if (a >= 224) return false;
  }
  return true;
}

/** The production probe. `ok` means the status matched what the monitor expects. */
export const httpProbe: Probe = async (url, method, expectedStatus) => {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method,
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": "Cirrus-Monitors/1.0 (+uptime check)" },
    });
    const latencyMs = Date.now() - started;
    return {
      ok: response.status === expectedStatus,
      statusCode: response.status,
      latencyMs,
      error: response.status === expectedStatus ? null : `Expected ${expectedStatus}, got ${response.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      statusCode: null,
      latencyMs: Date.now() - started,
      error: String(err instanceof Error ? err.message : err).slice(0, MAX_ERROR_LENGTH),
    };
  }
};
