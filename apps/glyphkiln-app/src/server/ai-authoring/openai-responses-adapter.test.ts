import { describe, expect, it, vi } from "vitest";

import { createPreviewDesign } from "@/test/preview-design";

import {
  BRIEF_INTERPRETER_INPUT_CONTRACT_VERSION,
  BRIEF_INTERPRETER_RESPONSE_CONTRACT_VERSION,
  OpenAIResponsesBriefInterpreter,
  type BriefInterpreterInput,
} from "./index";

const API_KEY = "test-operator-api-key-value-123456789";

describe("OpenAI Responses BriefInterpreter adapter", () => {
  it("uses only operator configuration and returns parsed output as unknown", async () => {
    const proposal = {
      contractVersion: BRIEF_INTERPRETER_RESPONSE_CONTRACT_VERSION,
      candidates: [{ document: { proposal: true }, rationale: "Proposal only." }],
    };
    let capturedUrl: string | URL | Request | undefined;
    let capturedInitialization: RequestInit | undefined;
    const providerFetch = vi.fn(
      (input: string | URL | Request, initialization?: RequestInit) => {
        capturedUrl = input;
        capturedInitialization = initialization;
        return Promise.resolve(responseEnvelope(JSON.stringify(proposal)));
      },
    );
    const interpreter = new OpenAIResponsesBriefInterpreter({
      apiKey: API_KEY,
      modelId: "gpt-5.6-terra",
      timeoutMs: 15_000,
      maximumOutputTokens: 12_000,
      retentionDisclosure:
        "Requests use store=false; OpenAI platform retention remains governed by the operator account configuration.",
      fetch: providerFetch,
    });

    const interpreted = await interpreter.interpret(authoringInput());
    expect(interpreted.response).toEqual(proposal);
    expect(interpreted.responseHash).toMatch(/^[0-9a-f]{64}$/);
    expect(interpreter.descriptor).toEqual({
      providerId: "openai-responses",
      modelId: "gpt-5.6-terra",
      retentionDisclosure:
        "Requests use store=false; OpenAI platform retention remains governed by the operator account configuration.",
    });
    expect(providerFetch).toHaveBeenCalledOnce();
    expect(capturedUrl).toBe("https://api.openai.com/v1/responses");
    const headers = capturedInitialization?.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${API_KEY}`);
    if (typeof capturedInitialization?.body !== "string") {
      throw new Error("Expected the provider body to be JSON text.");
    }
    const body = JSON.parse(capturedInitialization.body) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "gpt-5.6-terra",
      store: false,
      max_output_tokens: 12_000,
      text: { format: { type: "json_object" } },
    });
    expect(body).not.toHaveProperty("apiKey");
    expect(JSON.stringify(body)).not.toContain(API_KEY);
    expect(String(body.input)).toContain('"authoringContract"');
    expect(String(body.input)).toContain('"designDocumentJsonSchema"');
    expect(String(body.input)).not.toContain("storageKey");
    expect(String(body.input)).not.toContain("createdBy");
  });

  it("rejects invalid operator configuration without retaining credential detail", () => {
    expect(
      () =>
        new OpenAIResponsesBriefInterpreter({
          apiKey: "short-key",
          modelId: "model with whitespace",
          timeoutMs: 100,
          maximumOutputTokens: 20,
          retentionDisclosure: "",
        }),
    ).toThrow(
      expect.objectContaining({
        code: "PROVIDER_CONFIGURATION_INVALID",
        message: "The operator-owned authoring-provider configuration is invalid.",
      }),
    );
  });

  it.each([
    {
      name: "non-success status",
      response: new Response('{"error":{"message":"sensitive provider detail"}}', {
        status: 429,
      }),
      code: "PROVIDER_REQUEST_FAILED",
    },
    {
      name: "incomplete response",
      response: new Response(JSON.stringify({ status: "incomplete", output: [] })),
      code: "PROVIDER_RESPONSE_INVALID",
    },
    {
      name: "model refusal",
      response: new Response(
        JSON.stringify({
          status: "completed",
          output: [
            {
              type: "message",
              content: [{ type: "refusal", refusal: "sensitive refusal" }],
            },
          ],
        }),
      ),
      code: "PROVIDER_RESPONSE_INVALID",
    },
    {
      name: "oversized response",
      response: new Response("{}", {
        headers: { "content-length": String(4 * 1024 * 1024 + 1) },
      }),
      code: "PROVIDER_RESPONSE_TOO_LARGE",
    },
    {
      name: "oversized streamed response without a declared length",
      response: new Response(new Uint8Array(4 * 1024 * 1024 + 1)),
      code: "PROVIDER_RESPONSE_TOO_LARGE",
    },
    {
      name: "invalid UTF-8 response",
      response: new Response(new Uint8Array([0xc3, 0x28])),
      code: "PROVIDER_RESPONSE_INVALID",
    },
  ])(
    "fails closed for $name without echoing provider output",
    async ({ response, code }) => {
      const interpreter = interpreterWithFetch(() => Promise.resolve(response));

      const rejection = interpreter.interpret(authoringInput());

      await expect(rejection).rejects.toMatchObject({ code });
      await expect(rejection).rejects.not.toHaveProperty(
        "message",
        expect.stringContaining("sensitive"),
      );
    },
  );

  it("maps aborted provider requests to the bounded timeout code", async () => {
    const interpreter = interpreterWithFetch(() =>
      Promise.reject(new DOMException("aborted request details", "AbortError")),
    );

    await expect(interpreter.interpret(authoringInput())).rejects.toEqual(
      expect.objectContaining({
        code: "PROVIDER_TIMED_OUT",
        message: "The configured authoring provider exceeded its bounded timeout.",
      }),
    );
  });

  it.each([
    {
      name: "unsupported input contract",
      mutate: (input: Record<string, unknown>) => {
        input.contractVersion = "2.0.0";
      },
    },
    {
      name: "oversized brief",
      mutate: (input: Record<string, unknown>) => {
        input.brief = "sensitive brief ".repeat(300);
      },
    },
    {
      name: "unknown template",
      mutate: (input: Record<string, unknown>) => {
        input.templateKeys = ["unknown-template@1.0.0"];
      },
    },
    {
      name: "duplicate locks",
      mutate: (input: Record<string, unknown>) => {
        input.locks = ["copy", "copy"];
      },
    },
    {
      name: "brand mismatch",
      mutate: (input: Record<string, unknown>) => {
        input.brandSnapshot = {
          ...(input.brandSnapshot as Record<string, unknown>),
          name: "Different brand",
        };
      },
    },
  ])("rejects $name before a provider request", async ({ mutate }) => {
    const providerFetch = vi.fn(() => Promise.resolve(responseEnvelope("{}")));
    const interpreter = interpreterWithFetch(providerFetch);
    const input = structuredClone(authoringInput()) as unknown as Record<
      string,
      unknown
    >;
    mutate(input);

    await expect(
      interpreter.interpret(input as unknown as BriefInterpreterInput),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "INTERPRETER_INPUT_INVALID",
        message:
          "The proposal request did not match the bounded interpreter input contract.",
      }),
    );
    expect(providerFetch).not.toHaveBeenCalled();
  });
});

function interpreterWithFetch(
  providerFetch: NonNullable<
    ConstructorParameters<typeof OpenAIResponsesBriefInterpreter>[0]["fetch"]
  >,
): OpenAIResponsesBriefInterpreter {
  return new OpenAIResponsesBriefInterpreter({
    apiKey: API_KEY,
    modelId: "operator-model-snapshot",
    timeoutMs: 1_000,
    maximumOutputTokens: 10_000,
    retentionDisclosure: "Operator-reviewed provider retention disclosure.",
    fetch: providerFetch,
  });
}

function authoringInput(): BriefInterpreterInput {
  const baseDocument = createPreviewDesign();
  return {
    contractVersion: BRIEF_INTERPRETER_INPUT_CONTRACT_VERSION,
    brief: "Create three distinct launch directions. This is inert brief data.",
    candidateCount: 3,
    baseDocument,
    brandSnapshot: baseDocument.brand,
    templateKeys: ["product-announcement@1.1.1"],
    locks: ["image", "palette"],
  };
}

function responseEnvelope(outputText: string): Response {
  return new Response(
    JSON.stringify({
      status: "completed",
      output: [
        { type: "reasoning", summary: [] },
        {
          type: "message",
          content: [{ type: "output_text", text: outputText }],
        },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}
