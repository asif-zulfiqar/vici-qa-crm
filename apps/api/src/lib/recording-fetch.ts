// Pure rules for fetching a recording from the recording server.
//
// Which URLs: only https, only hosts in RECORDING_HOSTS, no other port, no user:password.
// This stops SSRF: even if a bad URL ever lands in calls.recording_url, the api will not fetch
// another address with it.
//
// Raw IPs: VICIdial stores recording URLs with the dialer's raw IP, but its HTTPS certificate
// is for its name. RECORDING_HOST_MAP ("<ip>=<name>,...") swaps a mapped IP for the name
// first; then the RECORDING_HOSTS check runs on the name. TLS checks stay fully on.

export type RecordingHosts = {
  /** RECORDING_HOSTS, lower case. */
  allowed: ReadonlySet<string>;
  /** RECORDING_HOST_MAP: host in the stored URL -> host to fetch. */
  map: ReadonlyMap<string, string>;
};

/** A DNS name or an IPv4 address, lower case. */
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

/** "a.example.com, B.example.com" -> ["a.example.com", "b.example.com"]. null: a bad entry. */
export function parseHostList(value: string): string[] | null {
  const hosts = value
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host !== "");
  return hosts.every((host) => HOST.test(host)) ? hosts : null;
}

/** "203.0.113.10=rec.example.com,..." -> Map. "" -> empty Map. null: a bad pair. */
export function parseHostMap(value: string): Map<string, string> | null {
  const map = new Map<string, string>();
  for (const pair of value.split(",").map((p) => p.trim()).filter((p) => p !== "")) {
    const [from, to, extra] = pair.split("=").map((part) => part.trim().toLowerCase());
    if (!from || !to || extra !== undefined || !HOST.test(from) || !HOST.test(to)) return null;
    map.set(from, to);
  }
  return map;
}

/** The URL to fetch for a stored recording URL, or null when it may not be fetched. */
export function recordingFetchUrl(stored: string, hosts: RecordingHosts): URL | null {
  let url: URL;
  try {
    url = new URL(stored);
  } catch {
    return null;
  }
  // url.port is "" for the default port, also when the URL says ":443".
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "") return null;
  const mapped = hosts.map.get(url.hostname);
  if (mapped) url.hostname = mapped;
  return hosts.allowed.has(url.hostname) ? url : null;
}

/**
 * The browser's Range header, if we pass it on: one range only ("bytes=100-", "bytes=100-200",
 * "bytes=-500"). Anything else is dropped and the whole file is sent (allowed by HTTP), because
 * a multi-range answer is not plain audio/mpeg.
 */
export function forwardableRange(header: string | undefined): string | null {
  if (header === undefined) return null;
  const range = header.trim();
  return /^bytes=(\d{1,15}-\d{0,15}|-\d{1,15})$/.test(range) ? range : null;
}

/** A Content-Range we pass back on a 206: "bytes 0-999/5000" (size may be "*"). */
export const isContentRange = (value: string | null): value is string =>
  value !== null && /^bytes \d{1,15}-\d{1,15}\/(\d{1,15}|\*)$/.test(value);

/** Content-Length we pass back: digits only. */
export const isContentLength = (value: string | null): value is string => value !== null && /^\d{1,15}$/.test(value);
