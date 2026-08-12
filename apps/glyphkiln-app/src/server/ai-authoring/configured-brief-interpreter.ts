import type { BriefInterpreter } from "./brief-interpreter";
import { OpenAIResponsesBriefInterpreter } from "./openai-responses-adapter";

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAXIMUM_OUTPUT_TOKENS = 20_000;

export function createBriefInterpreterFromEnvironment(
  environment: NodeJS.ProcessEnv,
): BriefInterpreter | undefined {
  const provider = environment.GLYPHKILN_AI_PROVIDER?.trim();
  if (provider === undefined || provider === "" || provider === "disabled") {
    return undefined;
  }
  if (provider !== "openai-responses") {
    throw new Error("GLYPHKILN_AI_PROVIDER must be disabled or openai-responses.");
  }
  return new OpenAIResponsesBriefInterpreter({
    apiKey: requiredValue(environment, "GLYPHKILN_OPENAI_API_KEY"),
    modelId: requiredValue(environment, "GLYPHKILN_AI_MODEL"),
    timeoutMs: readBoundedInteger(
      environment,
      "GLYPHKILN_AI_TIMEOUT_MS",
      DEFAULT_TIMEOUT_MS,
      1_000,
      120_000,
    ),
    maximumOutputTokens: readBoundedInteger(
      environment,
      "GLYPHKILN_AI_MAX_OUTPUT_TOKENS",
      DEFAULT_MAXIMUM_OUTPUT_TOKENS,
      1_000,
      50_000,
    ),
    retentionDisclosure: requiredValue(
      environment,
      "GLYPHKILN_AI_RETENTION_DISCLOSURE",
    ),
  });
}

function requiredValue(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (value === undefined || value === "") {
    throw new Error(`${name} is required when AI authoring is enabled.`);
  }
  return value;
}

function readBoundedInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const input = environment[name]?.trim();
  if (input === undefined || input === "") return fallback;
  const value = Number(input);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be an integer from ${String(minimum)} through ${String(maximum)}.`,
    );
  }
  return value;
}
