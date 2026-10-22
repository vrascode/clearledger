import { describe, expect, it } from "vitest";
import {
  allowedUpstream,
  boundedBody,
  guardRequest,
  localApiUrl,
} from "@/server/security";
import { batchSchema, connectionSchema } from "@/lib/contracts";

describe("proxy security boundary", () => {
  it.each([
    "https://example.com",
    "http://169.254.169.254",
    "http://127.0.0.1.evil.test",
    "http://user:secret@127.0.0.1:8000",
    "http://127.0.0.1:8000/path",
    "file:///etc/passwd",
    "http://localhost:8000/?url=x",
  ])("rejects unsafe destination %s", (value) => {
    expect(() => localApiUrl(value)).toThrow();
  });
  it.each([
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    "http://[::1]:8000",
  ])("accepts loopback %s", (value) => {
    expect(localApiUrl(value)).toBe(value);
  });
  it("rejects cross-origin mutations, missing origins and DNS rebinding hosts", () => {
    const cases: Record<string, string>[] = [
      { origin: "https://evil.test" },
      {},
      { origin: "http://evil.test", host: "evil.test" },
      { origin: "http://127.0.0.1:3000", "sec-fetch-site": "cross-site" },
    ];
    for (const headers of cases)
      expect(() =>
        guardRequest(
          new Request("http://127.0.0.1:3000/api/demo", {
            method: "POST",
            headers,
          }),
        ),
      ).toThrow();
    expect(() =>
      guardRequest(
        new Request("http://127.0.0.1:3000/api/demo", {
          method: "POST",
          headers: { origin: "http://127.0.0.1:3000" },
        }),
      ),
    ).not.toThrow();
  });
  it("bounds streamed content even when Content-Length is missing or lies", async () => {
    const cases: Record<string, string>[] = [{}, { "content-length": "1" }];
    for (const headers of cases)
      await expect(
        boundedBody(
          new Request("http://localhost", {
            method: "POST",
            body: "123456",
            headers,
          }),
          5,
        ),
      ).rejects.toThrow();
    expect(
      await boundedBody(
        new Request("http://localhost", { method: "POST", body: "12345" }),
        5,
      ),
    ).toEqual(new TextEncoder().encode("12345"));
  });
  it("rejects encoded and declared oversized bodies", async () => {
    await expect(
      boundedBody(
        new Request("http://localhost", {
          method: "POST",
          body: "x",
          headers: { "content-length": "100" },
        }),
        5,
      ),
    ).rejects.toThrow();
    await expect(
      boundedBody(
        new Request("http://localhost", {
          method: "POST",
          body: "x",
          headers: { "content-encoding": "gzip" },
        }),
        5,
      ),
    ).rejects.toThrow();
  });
  it("only forwards supported methods and routes", () => {
    expect(allowedUpstream("v1/imports/orders", "POST")).toBe(true);
    expect(allowedUpstream(`v1/runs/${"a".repeat(32)}/export`, "GET")).toBe(
      true,
    );
    for (const route of [
      "docs",
      "openapi.json",
      "../healthz",
      "v1/runs/bad",
      "v1/imports/abc",
      "http://evil.test",
    ])
      expect(allowedUpstream(route, "GET")).toBe(false);
    expect(allowedUpstream("v1/runs", "DELETE")).toBe(false);
  });
  it("rejects malformed credentials and invalid idempotency keys before sending", () => {
    expect(
      connectionSchema.safeParse({
        apiUrl: "http://localhost",
        apiKey: "short",
      }).success,
    ).toBe(false);
    expect(batchSchema.safeParse("bad/key").success).toBe(false);
    expect(batchSchema.safeParse("orders-v1").success).toBe(true);
  });
});
