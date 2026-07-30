process.env.HOSTNAME = process.env.GLYPHKILN_HOSTNAME?.trim() || "127.0.0.1";

await import("./server.js");
