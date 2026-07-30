import type { NextConfig } from "next";
import { cpSync, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const applicationRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(applicationRoot, "../..");
const corePackageRoot = resolve(repositoryRoot, "packages/glyphkiln-core");
const stagedCoreRoot = resolve(applicationRoot, "node_modules/@glyphkiln/core");

stageCorePackage();

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: repositoryRoot,
  serverExternalPackages: ["@glyphkiln/core"],
};

export default nextConfig;

function stageCorePackage(): void {
  rmSync(stagedCoreRoot, { recursive: true, force: true });
  copyFile("package.json");
  copyFile("assets/fonts/Inter-Variable.ttf");
  cpSync(resolve(corePackageRoot, "dist"), resolve(stagedCoreRoot, "dist"), {
    recursive: true,
    filter(source) {
      return (
        statSync(source).isDirectory() ||
        source.endsWith(".js") ||
        source.endsWith(".d.ts")
      );
    },
  });
}

function copyFile(relativePath: string): void {
  const destination = resolve(stagedCoreRoot, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(resolve(corePackageRoot, relativePath), destination);
}
