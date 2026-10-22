import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import {
  connectionSchema,
  kinds,
  MAX_BYTES,
  type ImportKind,
} from "@/lib/contracts";
import {
  allowedUpstream,
  BoundaryError,
  boundedBody,
  guardRequest,
  localApiUrl,
} from "./security";

type Connection = { apiUrl: string; apiKey: string };
type Session = Connection & { expires: number };
const state = globalThis as typeof globalThis & {
  ledgerSessions?: Map<string, Session>;
};
const sessions = (state.ledgerSessions ??= new Map());
const cookieName = "clearledger-connection";
const ttl = 8 * 60 * 60 * 1000;
const responseHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: responseHeaders });
}

async function currentConnection(): Promise<Connection | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (token) {
    const session = sessions.get(token);
    if (!session || session.expires < Date.now()) {
      sessions.delete(token);
      return null;
    }
    return session;
  }
  const parsed = connectionSchema.safeParse({
    apiUrl: process.env.CLEARLEDGER_API_URL ?? "http://127.0.0.1:8000",
    apiKey: process.env.CLEARLEDGER_API_KEY ?? "",
  });
  if (!parsed.success) return null;
  return { ...parsed.data, apiUrl: localApiUrl(parsed.data.apiUrl) };
}
async function upstream(
  config: Connection,
  endpoint: string,
  init: RequestInit = {},
) {
  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}/${endpoint}`, {
      ...init,
      headers: { "X-API-Key": config.apiKey, ...(init.headers ?? {}) },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new BoundaryError(
      502,
      "Cannot reach the local API. Check that FastAPI is running and the address is correct.",
    );
  }
  if (!response.ok) {
    let message = "The API could not complete this request. Please retry.";
    if (response.status === 401)
      message =
        "API authentication failed. Update the key in Settings & connection.";
    else if (response.status < 500) {
      const body = await response.json().catch(() => null);
      message =
        typeof body?.error?.message === "string"
          ? body.error.message
          : typeof body?.detail === "string"
            ? body.detail
            : message;
    }
    throw new BoundaryError(
      response.status,
      message.replaceAll(config.apiKey, "[redacted]").slice(0, 600),
    );
  }
  return response;
}
async function example(kind: ImportKind) {
  return readFile(
    path.join(
      process.env.CLEARLEDGER_EXAMPLES_DIR ??
        path.resolve(process.cwd(), "../examples"),
      `${kind}.csv`,
    ),
  );
}
async function sampleTagged(report: Record<string, unknown>) {
  if (!("inputs" in report)) return report;
  const inputs = report.inputs as Record<string, { sha256: string }>;
  const hashes = await Promise.all(
    kinds.map(
      async (kind) =>
        [
          kind,
          createHash("sha256")
            .update(await example(kind))
            .digest("hex"),
        ] as const,
    ),
  ).catch(() => []);
  return {
    ...report,
    is_sample:
      hashes.length === 3 &&
      hashes.every(([kind, hash]) => inputs[kind]?.sha256 === hash),
  };
}
export async function handle(request: Request, segments: string[]) {
  try {
    guardRequest(request);
    const endpoint = segments.join("/");
    const config = await currentConnection();
    if (endpoint === "connection") {
      if (request.method === "GET") {
        if (!config)
          return json({
            configured: false,
            connected: false,
            apiUrl: "http://127.0.0.1:8000",
            source: "none",
          });
        try {
          await upstream(config, "healthz");
          await upstream(config, "readyz");
          await upstream(config, "v1/imports?limit=1");
          return json({
            configured: true,
            connected: true,
            apiUrl: config.apiUrl,
            source: (await cookies()).has(cookieName)
              ? "session"
              : "environment",
          });
        } catch (error) {
          return json({
            configured: true,
            connected: false,
            apiUrl: config.apiUrl,
            message:
              error instanceof BoundaryError
                ? error.message
                : "Connection unavailable",
          });
        }
      }
      if (request.method === "POST") {
        const body = JSON.parse(
          new TextDecoder().decode(await boundedBody(request, 8192)),
        );
        const parsed = connectionSchema.safeParse(body);
        if (!parsed.success)
          throw new BoundaryError(
            422,
            "Enter a local API address and a valid API key",
          );
        const next = {
          ...parsed.data,
          apiUrl: localApiUrl(parsed.data.apiUrl),
        };
        await upstream(next, "readyz");
        await upstream(next, "v1/imports?limit=1");
        for (const [token, session] of sessions)
          if (session.expires < Date.now()) sessions.delete(token);
        const previous = (await cookies()).get(cookieName)?.value;
        if (previous) sessions.delete(previous);
        if (sessions.size >= 100)
          throw new BoundaryError(
            429,
            "Too many local sessions; restart the dashboard to reset connections",
          );
        const token = randomBytes(32).toString("hex");
        sessions.set(token, { ...next, expires: Date.now() + ttl });
        (await cookies()).set(cookieName, token, {
          httpOnly: true,
          sameSite: "strict",
          secure: new URL(request.url).protocol === "https:",
          path: "/",
          maxAge: ttl / 1000,
        });
        return json({ connected: true, apiUrl: next.apiUrl });
      }
      if (request.method === "DELETE") {
        const token = (await cookies()).get(cookieName)?.value;
        if (token) sessions.delete(token);
        (await cookies()).delete(cookieName);
        return json({ reset: true });
      }
    }
    if (
      segments[0] === "examples" &&
      kinds.includes(segments[1] as ImportKind) &&
      segments.length === 2 &&
      request.method === "GET"
    ) {
      return new Response(
        new Uint8Array(await example(segments[1] as ImportKind)),
        {
          headers: {
            ...responseHeaders,
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="sample-${segments[1]}.csv"`,
          },
        },
      );
    }
    if (!config)
      throw new BoundaryError(
        401,
        "Connect your local API in Settings & connection to get started.",
      );
    if (endpoint === "demo" && request.method === "POST") {
      const ids: Record<string, string> = {};
      for (const kind of kinds) {
        const data = await example(kind);
        const digest = createHash("sha256")
          .update(data)
          .digest("hex")
          .slice(0, 12);
        const result = await upstream(
          config,
          `v1/imports/${kind}?batch_key=sample-v1-${digest}`,
          {
            method: "POST",
            headers: { "Content-Type": "text/csv" },
            body: data,
          },
        );
        ids[`${kind}_import_id`] = (await result.json()).id;
      }
      const run = await upstream(config, "v1/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids),
      });
      return json(await sampleTagged(await run.json()), run.status);
    }
    if (!allowedUpstream(endpoint, request.method))
      throw new BoundaryError(404, "Endpoint not found");
    const query = new URL(request.url).searchParams;
    const allowed = endpoint.includes("/export")
      ? ["format"]
      : endpoint.startsWith("v1/imports/")
        ? ["batch_key"]
        : ["limit", "offset"];
    for (const key of query.keys())
      if (!allowed.includes(key))
        throw new BoundaryError(422, "Unsupported query parameter");
    const init: RequestInit = { method: request.method };
    if (request.method === "POST") {
      const csv = endpoint.startsWith("v1/imports/");
      const type = csv ? "text/csv" : "application/json";
      if (request.headers.get("content-type")?.split(";")[0] !== type)
        throw new BoundaryError(415, `Expected ${type}`);
      init.body = Buffer.from(
        await boundedBody(request, csv ? MAX_BYTES : 8192),
      );
      init.headers = { "Content-Type": type };
    }
    const result = await upstream(
      config,
      `${endpoint}${query.size ? `?${query}` : ""}`,
      init,
    );
    if (endpoint.endsWith("/export")) {
      const format = query.get("format") === "json" ? "json" : "csv";
      return new Response(result.body, {
        headers: {
          ...responseHeaders,
          "Content-Type": format === "csv" ? "text/csv" : "application/json",
          "Content-Disposition": `attachment; filename="clearledger-${segments[2]}.${format}"`,
        },
      });
    }
    return json(await sampleTagged(await result.json()), result.status);
  } catch (error) {
    if (error instanceof BoundaryError)
      return json({ error: { message: error.message } }, error.status);
    if (error instanceof SyntaxError)
      return json({ error: { message: "Request is not valid JSON" } }, 422);
    return json(
      {
        error: {
          message:
            "The request could not be completed. Check the local service configuration.",
        },
      },
      500,
    );
  }
}
