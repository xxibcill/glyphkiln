type LittleCmsRawModule = Record<string, unknown>;

declare function createLittleCmsModule(options?: {
  locateFile: () => string;
}): Promise<LittleCmsRawModule>;

export default createLittleCmsModule;
