import type { MalwareScanner, MalwareScanResult } from "./malware-scanner";

/**
 * Test fixture only. Production composition must configure an actual scanner.
 */
export class TestOnlyCleanMalwareScanner implements MalwareScanner {
  readonly #scannedAt: Date;

  public constructor(scannedAt = new Date("2026-07-31T00:00:00.000Z")) {
    this.#scannedAt = new Date(scannedAt);
  }

  public scan(): Promise<MalwareScanResult> {
    return Promise.resolve({
      status: "clean",
      scannerName: "glyphkiln-test-only-clean",
      scannerVersion: "1",
      scannedAt: new Date(this.#scannedAt),
    });
  }
}
