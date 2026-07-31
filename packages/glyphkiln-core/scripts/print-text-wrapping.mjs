import {
  LINE_BREAKING_POLICY_VERSION,
  THAI_SEGMENTATION_POLICY_VERSION,
  TYPOGRAPHY_ALGORITHM_VERSION,
  fitText,
  segmentThaiText,
  wrapText,
} from "../dist/index.js";

const registry = {
  measure(text, _family, _weight, _style, fontSize) {
    return Array.from(text).length * fontSize;
  },
};
const style = {
  family: "DeterminismProbe",
  weight: 400,
  style: "normal",
  fontSize: 1,
  lineHeight: 1,
};
const reproduction = "วันที่บิลโรงพยาบาลปิด\nรายจ่ายบางก้อนยังเดินต่อ";
const oversized = fitText({
  text: "โรงพยาบาล",
  registry,
  style,
  box: { x: 0, y: 0, width: 3, height: 20 },
  preferredFontSize: 2,
  minimumFontSize: 1,
  maximumLines: 20,
  layerId: "determinism-probe",
});

process.stdout.write(
  `${JSON.stringify({
    policies: {
      typography: TYPOGRAPHY_ALGORITHM_VERSION,
      thaiSegmentation: THAI_SEGMENTATION_POLICY_VERSION,
      lineBreaking: LINE_BREAKING_POLICY_VERSION,
    },
    segments: segmentThaiText("รายจ่ายบางก้อนยังเดินต่อ"),
    reproduction: wrapText(reproduction, 21, style, registry),
    oversized,
  })}\n`,
);
