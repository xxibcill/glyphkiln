// Types for the development-only oracle helpers used by tests.
export type OracleScriptRun = { script: string; start: number; end: number };
export function createScriptItemizer(): (text: string) => OracleScriptRun[];
