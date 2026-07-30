import { access, cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

import { appRoot, readStandaloneLayout } from "./standalone-paths.mjs";

const { standaloneAppRoot } = await readStandaloneLayout();
await copyRequiredDirectory(
  join(appRoot, ".next/static"),
  join(standaloneAppRoot, ".next/static"),
);
await copyOptionalDirectory(join(appRoot, "public"), join(standaloneAppRoot, "public"));

process.stdout.write("Packaged standalone application assets.\n");

async function copyRequiredDirectory(source, destination) {
  await access(source);
  await replaceDirectory(source, destination);
}

async function copyOptionalDirectory(source, destination) {
  try {
    await access(source);
  } catch (error) {
    if (error?.code === "ENOENT") {
      await rm(destination, { recursive: true, force: true });
      return;
    }
    throw error;
  }
  await replaceDirectory(source, destination);
}

async function replaceDirectory(source, destination) {
  await rm(destination, { recursive: true, force: true });
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true });
}
