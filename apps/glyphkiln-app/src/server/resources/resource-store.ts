import type {
  AdmittedResource,
  ResourceAdmission,
  ResourceVersion,
  ResourceWithBytes,
} from "./types";

export type FontResourceReference = {
  readonly family: string;
  readonly weight: number;
  readonly style: "normal" | "italic";
  readonly contentHash: string;
};

/**
 * The only resource persistence entry point. Every read is workspace-qualified
 * and every write receives bytes that have already passed scanner and format
 * admission.
 */
export type ResourceStore = {
  admit(resource: AdmittedResource): Promise<ResourceAdmission>;

  findById(workspaceId: string, resourceId: string): Promise<ResourceVersion | null>;

  readById(workspaceId: string, resourceId: string): Promise<ResourceWithBytes | null>;

  findFontVersion(
    workspaceId: string,
    reference: FontResourceReference,
  ): Promise<ResourceVersion | null>;

  readFontVersion(
    workspaceId: string,
    reference: FontResourceReference,
  ): Promise<ResourceWithBytes | null>;
};
