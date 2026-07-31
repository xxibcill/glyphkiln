export type ImmutableBlobWriteResult = "stored" | "already-present";

/**
 * Stores only application-generated immutable object keys. Browser input never
 * supplies a key, filesystem path, URL, or bucket name.
 */
export type ResourceBlobStorage = {
  putImmutable(
    key: string,
    contentHash: string,
    bytes: Uint8Array,
  ): Promise<ImmutableBlobWriteResult>;

  readBounded(key: string, maximumBytes: number): Promise<Uint8Array | null>;
};
