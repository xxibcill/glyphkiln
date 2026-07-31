import { describe, expect, it } from "vitest";

import {
  readBoundedJsonRequest,
  readCookie,
  verifySameOriginRequest,
} from "./json-request";

const ENDPOINT = "http://localhost/api/app/commands";

describe("application JSON request boundary", () => {
  it("requires JSON, valid UTF-8, valid JSON, and bounded bytes", async () => {
    const unsupported = await readBoundedJsonRequest(
      request("{}", { "content-type": "text/plain" }),
    );
    expect(unsupported).toMatchObject({
      ok: false,
      failure: { status: 415, code: "UNSUPPORTED_MEDIA_TYPE" },
    });

    const invalidUtf8 = await readBoundedJsonRequest(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: new Uint8Array([0xff]),
      }),
    );
    expect(invalidUtf8).toMatchObject({
      ok: false,
      failure: { status: 400, code: "INVALID_REQUEST_BODY" },
    });

    const malformed = await readBoundedJsonRequest(request('{"type":'));
    expect(malformed).toMatchObject({
      ok: false,
      failure: { status: 400, code: "MALFORMED_JSON" },
    });

    const oversized = await readBoundedJsonRequest(request('"12345"'), 4);
    expect(oversized).toMatchObject({
      ok: false,
      failure: { status: 413, code: "REQUEST_BYTES_LIMIT_EXCEEDED" },
    });
  });

  it("requires the configured exact origin and same-origin fetch metadata", () => {
    const accepted = request("{}", {
      origin: "https://kiln.example",
      "sec-fetch-site": "same-origin",
    });
    expect(
      verifySameOriginRequest(accepted, {
        NODE_ENV: "test",
        GLYPHKILN_PUBLIC_ORIGIN: "https://kiln.example",
      }),
    ).toBeUndefined();

    const rejected = request("{}", {
      origin: "https://attacker.example",
      "sec-fetch-site": "cross-site",
    });
    expect(
      verifySameOriginRequest(rejected, {
        NODE_ENV: "test",
        GLYPHKILN_PUBLIC_ORIGIN: "https://kiln.example",
      }),
    ).toMatchObject({ status: 403, code: "CSRF_ORIGIN_REJECTED" });
  });

  it("rejects DNS-rebinding hosts when no public origin is configured", () => {
    const rebound = new Request("http://attacker.example/api/app/commands", {
      method: "POST",
      body: "{}",
      headers: {
        "content-type": "application/json",
        origin: "http://attacker.example",
        "sec-fetch-site": "same-origin",
      },
    });

    expect(verifySameOriginRequest(rebound, { NODE_ENV: "test" })).toMatchObject({
      status: 403,
      code: "CSRF_ORIGIN_REJECTED",
    });
  });

  it("rejects ambiguous or malformed security cookies", () => {
    expect(
      readCookie(
        request("{}", { cookie: "gk_session=only-one; another=value" }),
        "gk_session",
      ),
    ).toBe("only-one");
    expect(
      readCookie(
        request("{}", { cookie: "gk_session=first; gk_session=second" }),
        "gk_session",
      ),
    ).toBeUndefined();
    expect(
      readCookie(request("{}", { cookie: "gk_session=%FF" }), "gk_session"),
    ).toBeUndefined();
  });
});

function request(body: string, headers: Record<string, string> = {}): Request {
  return new Request(ENDPOINT, {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
      ...headers,
    },
  });
}
