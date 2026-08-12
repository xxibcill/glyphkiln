import { describe, expect, it } from "vitest";

import { createBriefInterpreterFromEnvironment } from "./configured-brief-interpreter";

describe("configured BriefInterpreter", () => {
  it("keeps optional AI authoring disabled by default", () => {
    expect(createBriefInterpreterFromEnvironment(environment())).toBeUndefined();
    expect(
      createBriefInterpreterFromEnvironment(
        environment({ GLYPHKILN_AI_PROVIDER: "disabled" }),
      ),
    ).toBeUndefined();
  });

  it("builds the one supported adapter only from operator-owned settings", () => {
    const interpreter = createBriefInterpreterFromEnvironment(
      environment({
        GLYPHKILN_AI_PROVIDER: "openai-responses",
        GLYPHKILN_OPENAI_API_KEY: "operator-owned-key-value-123456789",
        GLYPHKILN_AI_MODEL: "operator-model-snapshot",
        GLYPHKILN_AI_TIMEOUT_MS: "30000",
        GLYPHKILN_AI_MAX_OUTPUT_TOKENS: "16000",
        GLYPHKILN_AI_RETENTION_DISCLOSURE:
          "Operator-reviewed OpenAI platform retention disclosure.",
      }),
    );

    expect(interpreter?.descriptor).toEqual({
      providerId: "openai-responses",
      modelId: "operator-model-snapshot",
      retentionDisclosure: "Operator-reviewed OpenAI platform retention disclosure.",
    });
    expect(interpreter).not.toHaveProperty("apiKey");
    expect(JSON.stringify(interpreter)).not.toContain("operator-owned-key");
  });

  it.each([
    [{ GLYPHKILN_AI_PROVIDER: "other" }, "GLYPHKILN_AI_PROVIDER"],
    [
      {
        GLYPHKILN_AI_PROVIDER: "openai-responses",
        GLYPHKILN_AI_MODEL: "model",
        GLYPHKILN_AI_RETENTION_DISCLOSURE: "disclosure",
      },
      "GLYPHKILN_OPENAI_API_KEY",
    ],
    [
      {
        GLYPHKILN_AI_PROVIDER: "openai-responses",
        GLYPHKILN_OPENAI_API_KEY: "operator-owned-key-value-123456789",
        GLYPHKILN_AI_MODEL: "model",
        GLYPHKILN_AI_RETENTION_DISCLOSURE: "disclosure",
        GLYPHKILN_AI_TIMEOUT_MS: "999",
      },
      "GLYPHKILN_AI_TIMEOUT_MS",
    ],
  ])("rejects partial or unsupported settings", (environment, message) => {
    expect(() =>
      createBriefInterpreterFromEnvironment({ NODE_ENV: "test", ...environment }),
    ).toThrow(message);
  });
});

function environment(
  values: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...values };
}
