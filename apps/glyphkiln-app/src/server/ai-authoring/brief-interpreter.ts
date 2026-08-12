import type {
  AuthoringTemplateKey,
  BrandSnapshot,
  DesignDocument,
} from "@glyphkiln/core";

import type { AuthoringLockId } from "./lock-validation";

export const BRIEF_INTERPRETER_INPUT_CONTRACT_VERSION = "1.0.0" as const;

export type BriefInterpreterInput = {
  readonly contractVersion: typeof BRIEF_INTERPRETER_INPUT_CONTRACT_VERSION;
  readonly brief: string;
  readonly candidateCount: 3 | 4;
  readonly baseDocument: DesignDocument;
  readonly brandSnapshot: BrandSnapshot;
  readonly templateKeys: readonly AuthoringTemplateKey[];
  readonly locks: readonly AuthoringLockId[];
};

export type BriefInterpreterDescriptor = {
  readonly providerId: string;
  readonly modelId: string;
  readonly retentionDisclosure: string;
};

export type BriefInterpreterResult = {
  readonly response: unknown;
  readonly inputHash: string;
  readonly responseHash: string;
};

/**
 * An optional, proposal-only producer. Every result remains unknown until the
 * App response boundary and Core candidate validators accept it.
 */
export type BriefInterpreter = {
  readonly descriptor: BriefInterpreterDescriptor;
  interpret(input: BriefInterpreterInput): Promise<BriefInterpreterResult>;
};
