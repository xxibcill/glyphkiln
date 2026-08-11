export function installedCliInvocation(
  platform,
  cliPath,
  args,
  commandShell = "cmd.exe",
) {
  if (platform === "win32") {
    return {
      file: commandShell,
      args: ["/d", "/s", "/c", cliPath, ...args],
    };
  }
  return { file: cliPath, args: [...args] };
}
