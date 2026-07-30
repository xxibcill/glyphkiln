import { mkdir, readFile, writeFile } from "node:fs/promises";
import prettier from "prettier";

const root = new URL("../", import.meta.url);
const outputDirectory = new URL("fixtures/renderable/", root);
const source = JSON.parse(
  await readFile(new URL("examples/product-announcement.json", root), "utf8"),
);
const fixtures = [
  fixture("short-headline", (document) => {
    textLayer(document, "headline").text = "Ship it.";
  }),
  fixture("long-headline", (document) => {
    textLayer(document, "headline").text =
      "A deterministic launch system for every product team";
  }),
  fixture("missing-optional-subtitle", (document) => {
    document.layers = document.layers.filter((layer) => layer.type !== "subtitle");
  }),
  fixture("light-theme", (document) => {
    document.mode = "light";
    document.brand.palette.accent = "#6C2BD9";
  }),
  fixture("dark-theme", () => {}),
  fixture("instagram-square", (document) => {
    document.format = "instagram-square";
  }),
  fixture("instagram-portrait", (document) => {
    document.format = "instagram-portrait";
  }),
  fixture("instagram-story", (document) => {
    document.format = "instagram-story";
  }),
  fixture("unicode-text", (document) => {
    textLayer(document, "headline").text =
      "Crème brûlée, naïve façade — deterministic in 2026";
  }),
  fixture("ltr-layout", (document) => {
    textLayer(document, "headline").text =
      "Café façade — deterministic metrics 123 remain horizontal";
  }),
  fixture(
    "strong-bidi-layout",
    (document) => {
      textLayer(document, "headline").text = "Strong bidi \u05D0";
    },
    "quality-failure",
    "BIDI_LAYOUT_UNSUPPORTED",
  ),
  fixture(
    "bidi-control-layout",
    (document) => {
      textLayer(document, "headline").text = "Bidi control \u200F";
    },
    "quality-failure",
    "BIDI_CONTROL_UNSUPPORTED",
  ),
  fixture(
    "vertical-layout",
    (document) => {
      textLayer(document, "headline").text = "Vertical primary \u1820";
    },
    "quality-failure",
    "VERTICAL_LAYOUT_UNSUPPORTED",
  ),
  fixture(
    "low-contrast",
    (document) => {
      document.brand.themes.dark.text = document.brand.themes.dark.background;
    },
    "quality-failure",
  ),
  fixture(
    "maximum-text",
    (document) => {
      textLayer(document, "headline").text = "Maximum text "
        .repeat(142)
        .slice(0, 2_000);
    },
    "quality-failure",
  ),
  fixture(
    "unsupported-font",
    (document) => {
      textLayer(document, "headline").fontFamily = "Unavailable Fixture Font";
      document.fonts.push({
        family: "Unavailable Fixture Font",
        weight: 800,
        style: "normal",
      });
    },
    "resource-failure",
  ),
];

await mkdir(outputDirectory, { recursive: true });
for (const entry of fixtures) {
  const rendered = await prettier.format(JSON.stringify(entry.document), {
    parser: "json",
  });
  const outputUrl = new URL(`${entry.name}.json`, outputDirectory);
  if (process.argv.includes("--verify")) {
    const committed = await readFile(outputUrl, "utf8");
    if (committed !== rendered) {
      throw new Error(`${entry.name}.json is stale; run npm run fixtures:update.`);
    }
  } else {
    await writeFile(outputUrl, rendered, "utf8");
  }
}

process.stdout.write(
  `${process.argv.includes("--verify") ? "Verified" : "Wrote"} ${fixtures.length} full design fixtures.\n`,
);

function fixture(name, mutate, expected = "render-success", expectedCode) {
  const document = structuredClone(source);
  document.id = `fixture-${name}`;
  document.metadata = {
    fixtureExpected: expected,
    ...(expectedCode === undefined ? {} : { fixtureExpectedCode: expectedCode }),
  };
  mutate(document);
  return { name, document };
}

function textLayer(document, type) {
  const layer = document.layers.find((candidate) => candidate.type === type);
  if (layer === undefined) throw new Error(`Missing ${type} layer.`);
  return layer;
}
