import { readBoundedEnvironmentInteger } from "@/server/environment";

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
    timeoutMs: readBoundedEnvironmentInteger(
      environment,
      "GLYPHKILN_AI_TIMEOUT_MS",
      DEFAULT_TIMEOUT_MS,
      1_000,
      120_000,
    ),
    maximumOutputTokens: readBoundedEnvironmentInteger(
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
