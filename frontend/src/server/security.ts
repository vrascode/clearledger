export class BoundaryError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function localApiUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BoundaryError(422, "Enter a valid local API URL");
  }
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new BoundaryError(
      422,
      "Use http://127.0.0.1:8000 (or another loopback port), without a path or credentials",
    );
  }
  return url.origin;
}
export function guardRequest(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host))
    throw new BoundaryError(
      403,
      "This dashboard accepts local connections only",
    );
  const origin = request.headers.get("origin");
  if (origin && origin !== `${url.protocol}//${host}`)
    throw new BoundaryError(403, "Cross-origin access is not allowed");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new BoundaryError(403, "Cross-site access is not allowed");
  if (!["GET", "HEAD"].includes(request.method) && !origin)
    throw new BoundaryError(403, "A same-origin browser request is required");
}
export async function boundedBody(request: Request, limit: number) {
  if (
    request.headers.has("content-encoding") &&
    request.headers.get("content-encoding") !== "identity"
  )
    throw new BoundaryError(415, "Compressed bodies are not supported");
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit))
    throw new BoundaryError(413, "Request exceeds the upload limit");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new BoundaryError(413, "CSV files must be 2 MiB or smaller");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return body;
}
export function allowedUpstream(path: string, method: string) {
  if (method === "GET")
    return (
      /^(healthz|readyz|v1\/(imports|runs)(\/[a-f0-9]{32}(\/export)?)?)$/.test(
        path,
      ) && !path.startsWith("v1/imports/")
    );
  return (
    method === "POST" &&
    /^(v1\/imports\/(orders|transactions|deposits)|v1\/runs)$/.test(path)
  );
}
