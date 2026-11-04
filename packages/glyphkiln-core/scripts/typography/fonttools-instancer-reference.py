"""Offline variable-font instancer reference (typography plan M0, scope item 5).

Development only. Generates tests/typography/oracles/instancer-reference.json.gz (compact
JSON, gzip with mtime 0 so the bytes are reproducible),
which the harness compares fontkit and HarfBuzz outlines against without any
network or Python at test time. Run it only to regenerate the reference:

    python3 -m venv .venv && .venv/bin/pip install fonttools==4.60.1
    .venv/bin/python -I scripts/typography/fonttools-instancer-reference.py

For every fvar axis at min, the min-default midpoint, default, the
default-max midpoint and max (other axes at default) it records each sampled
glyph's outline twice:
  - "float": the glyph set at that location (gvar deltas unrounded);
  - "rounded": fontTools.varLib.instancer output (TrueType integer points).
"""

import gzip
import hashlib
import json
import pathlib
import sys

import fontTools
from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = pathlib.Path(__file__).resolve().parents[2]
FONTS = {
    "Inter-Variable.ttf": (ROOT / "assets/fonts/Inter-Variable.ttf", "AaHOgnx&0"),
    "NotoSansThai.ttf": (
        ROOT / "fixtures/scene-thai/font/NotoSansThai.ttf",
        "Axกนบปฟมสอ",
    ),
}
OUTPUT = ROOT / "tests/typography/oracles/instancer-reference.json.gz"

# Typography M1 (T03): every variable file of the bundled OFL library, plus
# Inter. Run with --m1 to write the separate M1 reference; the M0 reference
# above is unchanged.
FONTS_DIR = ROOT / "assets/fonts"
M1_FONTS = {
    "Inter-Variable.ttf": (FONTS_DIR / "Inter-Variable.ttf", "AaHOgnx&0"),
    "NotoSansThai[wdth,wght].ttf": (
        FONTS_DIR / "notosansthai/NotoSansThai[wdth,wght].ttf",
        "Axกนบปฟมสอ",
    ),
    "NotoSerifThai[wdth,wght].ttf": (
        FONTS_DIR / "notoserifthai/NotoSerifThai[wdth,wght].ttf",
        "Axกนบปฟมสอ",
    ),
    "IBMPlexSans[wdth,wght].ttf": (FONTS_DIR / "ibmplexsans/IBMPlexSans[wdth,wght].ttf", "AaHOgnx&0"),
    "IBMPlexSans-Italic[wdth,wght].ttf": (
        FONTS_DIR / "ibmplexsans/IBMPlexSans-Italic[wdth,wght].ttf",
        "AaHOgnx&0",
    ),
    "SchibstedGrotesk[wght].ttf": (FONTS_DIR / "schibstedgrotesk/SchibstedGrotesk[wght].ttf", "AaHOgnx&0"),
    "SchibstedGrotesk-Italic[wght].ttf": (
        FONTS_DIR / "schibstedgrotesk/SchibstedGrotesk-Italic[wght].ttf",
        "AaHOgnx&0",
    ),
    "SourceSerif4[opsz,wght].ttf": (FONTS_DIR / "sourceserif4/SourceSerif4[opsz,wght].ttf", "AaHOgnx&0"),
    "SourceSerif4-Italic[opsz,wght].ttf": (
        FONTS_DIR / "sourceserif4/SourceSerif4-Italic[opsz,wght].ttf",
        "AaHOgnx&0",
    ),
}
M1_OUTPUT = ROOT / "tests/typography/oracles/instancer-reference-m1.json.gz"


class RecordingQuadPen(BasePen):
    """Records moveTo/lineTo/quadraticCurveTo/bezierCurveTo/closePath like fontkit."""

    def __init__(self, glyph_set):
        super().__init__(glyph_set)
        self.commands = []

    def _moveTo(self, pt):
        self.commands.append(["moveTo", list(pt)])

    def _lineTo(self, pt):
        self.commands.append(["lineTo", list(pt)])

    def _qCurveToOne(self, pt1, pt2):
        self.commands.append(["quadraticCurveTo", [*pt1, *pt2]])

    def _curveToOne(self, pt1, pt2, pt3):
        self.commands.append(["bezierCurveTo", [*pt1, *pt2, *pt3]])

    def _closePath(self):
        self.commands.append(["closePath", []])


def number(value):
    rounded = round(float(value), 4)
    return int(rounded) if rounded == int(rounded) else rounded


def record(glyph_set, name):
    pen = RecordingQuadPen(glyph_set)
    glyph_set[name].draw(pen)
    return [[command, [number(value) for value in args]] for command, args in pen.commands]


def positions(axis):
    values = [
        ("min", axis.minValue),
        ("min-default midpoint", (axis.minValue + axis.defaultValue) / 2),
        ("default", axis.defaultValue),
        ("default-max midpoint", (axis.defaultValue + axis.maxValue) / 2),
        ("max", axis.maxValue),
    ]
    seen = []
    for label, value in values:
        if "midpoint" in label and value == axis.defaultValue:
            continue
        seen.append((label, value))
    return seen


def main():
    m1 = "--m1" in sys.argv[1:]
    fonts = M1_FONTS if m1 else FONTS
    output = M1_OUTPUT if m1 else OUTPUT
    report = {
        "generator": "scripts/typography/fonttools-instancer-reference.py",
        "fontTools": fontTools.version,
        "python": sys.version.split()[0],
        "fonts": {},
    }
    for file_name, (path, sample) in fonts.items():
        data = path.read_bytes()
        font = TTFont(path)
        cmap = font.getBestCmap()
        names = sorted({cmap[ord(character)] for character in sample})
        axes = font["fvar"].axes
        rows = []
        for axis in axes:
            for label, value in positions(axis):
                location = {axis.axisTag: value}
                float_set = font.getGlyphSet(location=location)
                instance = instancer.instantiateVariableFont(
                    TTFont(path), location, inplace=False
                )
                rounded_set = instance.getGlyphSet()
                rows.append(
                    {
                        "axis": axis.axisTag,
                        "position": label,
                        "value": number(value),
                        "glyphs": {
                            name: {
                                "float": record(float_set, name),
                                "rounded": record(rounded_set, name),
                            }
                            for name in names
                        },
                    }
                )
        report["fonts"][file_name] = {
            "sha256": hashlib.sha256(data).hexdigest(),
            "unitsPerEm": font["head"].unitsPerEm,
            "sample": sample,
            "glyphNames": names,
            "rows": rows,
        }
    output.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(report, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    output.write_bytes(gzip.compress(payload.encode("utf-8") + b"\n", 9, mtime=0))
    print(f"Wrote {output.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
