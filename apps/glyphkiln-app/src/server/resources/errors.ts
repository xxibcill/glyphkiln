export type ResourceIngestionErrorCode =
  | "INVALID_RESOURCE_INPUT"
  | "RESOURCE_CAPACITY_REACHED"
  | "RESOURCE_BYTES_INVALID"
  | "RESOURCE_NOT_FOUND"
  | "RESOURCE_QUOTA_EXCEEDED"
  | "RESOURCE_STORAGE_INTEGRITY_ERROR"
  | "SCANNER_REJECTED"
  | "SCANNER_UNAVAILABLE"
  | "UNSUPPORTED_RESOURCE_MEDIA_TYPE";

export class ResourceIngestionError extends Error {
  public constructor(
    message: string,
    public readonly code: ResourceIngestionErrorCode,
    public readonly details?: Readonly<Record<string, unknown>>,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ResourceIngestionError";
  }
}
