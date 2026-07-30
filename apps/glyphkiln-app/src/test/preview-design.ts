import { DEVELOPMENT_FONT_SHA256 } from "@glyphkiln/core";
import type { DesignDocument } from "@glyphkiln/core";

export function createPreviewDesign(): DesignDocument {
  return {
    schemaVersion: "1.0.0",
    id: "local-project-preview",
    template: {
      id: "product-announcement",
      version: "1.1.1",
    },
    format: "linkedin-landscape",
    seed: "launch-analytics-01",
    mode: "dark",
    brand: {
      snapshotId: "brand-glyphkiln-local",
      version: "1.0.0",
      name: "Glyphkiln",
      palette: {
        primary: "#6C5CE7",
        secondary: "#00B894",
        accent: "#FDCB6E",
        neutrals: ["#0B1020", "#F7F8FC"],
      },
      themes: {
        light: {
          background: "#F7F8FC",
          surface: "#FFFDF8",
          text: "#0B1020",
          mutedText: "#47506A",
        },
        dark: {
          background: "#0B1020",
          surface: "#171D32",
          text: "#F7F8FC",
          mutedText: "#B8C0D9",
        },
      },
      typography: {
        headlineFamily: "Inter",
        bodyFamily: "Inter",
      },
      spacingScale: [4, 8, 12, 16, 24, 32, 48, 64],
      borderRadii: [0, 16, 28],
      visualDensity: "balanced",
      preferredProceduralStyles: ["layered-waves"],
      safeArea: {
        top: 0.07,
        right: 0.07,
        bottom: 0.07,
        left: 0.07,
      },
      prohibitedColors: [],
      prohibitedStyles: [],
    },
    assets: [],
    fonts: [400, 700, 800].map((weight) => ({
      family: "Inter",
      weight,
      style: "normal",
      sha256: DEVELOPMENT_FONT_SHA256,
    })),
    layers: [
      {
        id: "background",
        type: "background",
        visible: true,
      },
      {
        id: "waves",
        type: "procedural-decoration",
        style: "layered-waves",
        intensity: 0.58,
        density: 0.62,
        complexity: 0.48,
        contrast: 0.55,
        quietRegion: {
          x: 0.04,
          y: 0.12,
          width: 0.7,
          height: 0.62,
        },
        visible: true,
      },
      {
        id: "eyebrow",
        type: "eyebrow",
        text: "NOW IN PUBLIC BETA",
        visible: true,
      },
      {
        id: "headline",
        type: "headline",
        text: "Ship on-brand graphics from deterministic code",
        visible: true,
      },
      {
        id: "subtitle",
        type: "subtitle",
        text: "One structured document. Reproducible SVG, PNG, and provenance.",
        visible: true,
      },
      {
        id: "cta",
        type: "cta",
        text: "Explore Glyphkiln Core →",
        visible: true,
      },
    ],
  };
}
