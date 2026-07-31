import { z } from "zod";

import { ResourceIngestionError } from "./errors";
import { containsControlCharacter } from "./inert-text";
import type {
  FontIngestionInput,
  RasterIngestionInput,
  ResourceLicense,
} from "./types";

const boundedInertString = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine((value) => value === value.trim(), "Must not have outer whitespace.")
    .refine((value) => value.isWellFormed(), "Must contain well-formed text.")
    .refine(
      (value) => !containsControlCharacter(value),
      "Must not contain control characters.",
    );

const identifierSchema = z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,127})$/u);

const optionalBoundedString = (maximum: number) =>
  boundedInertString(maximum).optional();

const originalFilenameSchema = boundedInertString(255).refine(
  (value) => !/[\\/]/u.test(value),
  "Must be a filename, not a path.",
);

const originSchema = z
  .object({
    kind: z.enum(["user-upload", "licensed-library", "generated", "unknown"]),
    sourceName: optionalBoundedString(200),
    sourceReference: optionalBoundedString(500),
    generativeImageModel: optionalBoundedString(200),
  })
  .strict();

const licenseSchema = z
  .object({
    status: z.enum(["owned", "licensed", "public-domain", "unknown"]),
    identifier: optionalBoundedString(128),
    name: optionalBoundedString(200),
    reference: optionalBoundedString(500),
    notes: optionalBoundedString(2_000),
  })
  .strict();

const bytesSchema = z
  .instanceof(Uint8Array)
  .refine((bytes) => bytes.byteLength > 0, "File bytes must not be empty.");

const commonShape = {
  workspaceId: identifierSchema,
  actorUserId: identifierSchema,
  bytes: bytesSchema,
  originalFilename: originalFilenameSchema.optional(),
  origin: originSchema,
  license: licenseSchema,
} as const;

const rasterInputSchema = z
  .object({
    ...commonShape,
    declaredMediaType: z.enum(["image/png", "image/jpeg"]),
  })
  .strict();

const fontInputSchema = z
  .object({
    ...commonShape,
    declaredMediaType: z.enum(["font/ttf", "font/otf"]),
    family: boundedInertString(120),
    weight: z.number().int().min(100).max(900).multipleOf(100),
    style: z.enum(["normal", "italic"]),
  })
  .strict();

function invalidInput(cause: z.ZodError): ResourceIngestionError {
  return new ResourceIngestionError(
    "The resource upload metadata is invalid.",
    "INVALID_RESOURCE_INPUT",
    {
      problems: cause.issues.map((issue) => ({
        code: issue.code,
        path: issue.path.join("."),
      })),
    },
    { cause },
  );
}

export function parseRasterIngestionInput(input: unknown): RasterIngestionInput {
  const result = rasterInputSchema.safeParse(input);
  if (!result.success) {
    throw invalidInput(result.error);
  }
  return result.data;
}

export function parseFontIngestionInput(input: unknown): FontIngestionInput {
  const result = fontInputSchema.safeParse(input);
  if (!result.success) {
    throw invalidInput(result.error);
  }
  return result.data;
}

export function parseResourceIngestionWorkspaceId(input: unknown): string {
  const result = identifierSchema.safeParse(input);
  if (!result.success) {
    throw invalidInput(result.error);
  }
  return result.data;
}

export function copyLicense(license: ResourceLicense): ResourceLicense {
  return { ...license };
}
