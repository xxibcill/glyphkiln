import {
  assertRenderBlobAddress,
  assertStoredBlobIntegrity,
  prepareRenderBlob,
  renderBlobKey,
  RenderBlobStorageError,
  type RenderBlobAddress,
  type RenderBlobMetadata,
  type RenderBlobStorage,
  type StoreRenderBlobInput,
  type StoredRenderBlob,
} from "./content-addressed-storage";

export class InMemoryRenderBlobStorage implements RenderBlobStorage {
  readonly #objects = new Map<string, Uint8Array>();

  put(input: StoreRenderBlobInput): Promise<StoredRenderBlob> {
    const prepared = prepareRenderBlob(input);
    const existing = this.#objects.get(prepared.key);
    if (existing !== undefined) {
      assertStoredBlobIntegrity(prepared, existing);
      return Promise.resolve(prepared);
    }
    this.#objects.set(prepared.key, Uint8Array.from(input.bytes));
    return Promise.resolve(prepared);
  }

  read(address: RenderBlobAddress): Promise<Uint8Array> {
    assertRenderBlobAddress(address);
    const bytes = this.#objects.get(renderBlobKey(address));
    if (bytes === undefined) {
      throw new RenderBlobStorageError(
        "BLOB_NOT_FOUND",
        "The requested render blob does not exist.",
      );
    }
    assertStoredBlobIntegrity(address, bytes);
    return Promise.resolve(Uint8Array.from(bytes));
  }

  head(address: RenderBlobAddress): Promise<RenderBlobMetadata | undefined> {
    assertRenderBlobAddress(address);
    const key = renderBlobKey(address);
    const bytes = this.#objects.get(key);
    return Promise.resolve(
      bytes === undefined
        ? undefined
        : {
            ...address,
            byteSize: bytes.byteLength,
            key,
          },
    );
  }

  async ready(): Promise<void> {
    return Promise.resolve();
  }
}
