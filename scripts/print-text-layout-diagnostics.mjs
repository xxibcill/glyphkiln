import { analyzeTextLayoutSupport } from "../dist/index.js";

const corpus = [
  "",
  "Deterministic text",
  "Crème brûlée",
  "中文 🚀 ١٢٣",
  "\u200F",
  "\u05D0",
  "\u0627",
  "\u1820",
  "\uA840",
  "\uFE10",
  "🚀\u05D0",
  "\uD800\u05D0\uDC00",
  "\u05D0".repeat(20),
];

process.stdout.write(
  `${JSON.stringify(corpus.map((text) => analyzeTextLayoutSupport(text)))}\n`,
);
