export function readGlyphkilnHostname(environment = process.env) {
  return environment.GLYPHKILN_HOSTNAME?.trim() || "127.0.0.1";
}
