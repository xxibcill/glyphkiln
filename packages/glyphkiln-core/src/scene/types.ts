import type { AssetDeclaration } from "../schema/design-document.js";

export const SCENE_DOCUMENT_VERSION = "1.0.0" as const;

export type ScenePaint = "none" | "transparent" | `#${string}`;

export type ScenePoint = {
  x: number;
  y: number;
};

export type SceneBounds = ScenePoint & {
  width: number;
  height: number;
};

export type SceneSemantic = {
  role: "content" | "annotation" | "connector" | "decoration";
  conceptId?: string;
  label?: string;
  description?: string;
};

type SceneElementBase = {
  id: string;
  opacity?: number;
  semantic?: SceneSemantic;
};

type SceneStroke = {
  stroke?: ScenePaint;
  strokeWidth?: number;
};

export type SceneRectElement = SceneElementBase &
  SceneStroke & {
    type: "rect";
    x: number;
    y: number;
    width: number;
    height: number;
    fill: ScenePaint;
    radius?: number;
  };

export type SceneCircleElement = SceneElementBase &
  SceneStroke & {
    type: "circle";
    cx: number;
    cy: number;
    radius: number;
    fill: ScenePaint;
  };

export type ScenePathElement = SceneElementBase &
  SceneStroke & {
    type: "path";
    data: string;
    fill: ScenePaint;
    lineCap?: "round" | "square" | "butt";
    lineJoin?: "round" | "bevel" | "miter";
  };

export type SceneImageElement = SceneElementBase & {
  type: "image";
  assetId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fit: "contain" | "cover";
};

export type SceneTextElement = SceneElementBase & {
  type: "text";
  text: string;
  box: SceneBounds;
  font: {
    family: string;
    weight: number;
    style: "normal" | "italic";
  };
  fit: {
    preferredFontSize: number;
    minimumFontSize: number;
    maximumLines: number;
    lineHeight: number;
    align: "left" | "center" | "right";
    verticalAlign?: "top" | "middle" | "bottom";
    letterSpacing?: number;
    keepTogether?: string[];
  };
  fill: ScenePaint;
  textMode: "outline" | "outline-with-selectable-text";
};

export type SceneTransform =
  | {
      type: "translate";
      x: number;
      y: number;
    }
  | {
      type: "scale";
      x: number;
      y: number;
    }
  | {
      type: "rotate";
      degrees: number;
      cx?: number;
      cy?: number;
    };

export type SceneClip =
  | {
      type: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      radius?: number;
    }
  | {
      type: "circle";
      cx: number;
      cy: number;
      radius: number;
    }
  | {
      type: "path";
      data: string;
    };

export type SceneGroupElement = SceneElementBase & {
  type: "group";
  elements: SceneElement[];
  transforms?: SceneTransform[];
  clip?: SceneClip;
};

export type SceneConnectorElement = SceneElementBase & {
  type: "connector";
  fromId: string;
  toId: string;
  points: ScenePoint[];
  stroke: ScenePaint;
  strokeWidth: number;
  markers: {
    start: "none" | "arrow";
    end: "none" | "arrow";
  };
  lineCap?: "round" | "square" | "butt";
  lineJoin?: "round" | "bevel" | "miter";
};

export type SceneElement =
  | SceneRectElement
  | SceneCircleElement
  | ScenePathElement
  | SceneImageElement
  | SceneTextElement
  | SceneGroupElement
  | SceneConnectorElement;

export type SceneFontDeclaration = {
  family: string;
  weight: number;
  style: "normal" | "italic";
  sha256: string;
};

export type SceneDocument = {
  schemaVersion: typeof SCENE_DOCUMENT_VERSION;
  id: string;
  seed: string;
  dimensions: {
    width: number;
    height: number;
  };
  title: string;
  description: string;
  backgroundColor: `#${string}`;
  assets: AssetDeclaration[];
  fonts: SceneFontDeclaration[];
  elements: SceneElement[];
  readingOrder: string[];
  metadata?: Record<string, unknown>;
};

export type SceneValidationProblem = {
  path: string;
  code: string;
  message: string;
};

export type SceneValidationResult =
  | { success: true; data: SceneDocument; problems: [] }
  | { success: false; problems: SceneValidationProblem[] };
