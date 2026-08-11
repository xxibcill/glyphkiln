export interface InstalledCliInvocation {
  file: string;
  args: string[];
}

export declare function installedCliInvocation(
  platform: NodeJS.Platform,
  cliPath: string,
  args: readonly string[],
  commandShell?: string,
): InstalledCliInvocation;
