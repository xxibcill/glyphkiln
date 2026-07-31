import type { AssetOrigin } from "@glyphkiln/core";

export type ResourceKind = "raster-asset" | "font";
export type RasterMediaType = "image/png" | "image/jpeg";
export type FontMediaType = "font/ttf" | "font/otf";
export type ResourceMediaType = RasterMediaType | FontMediaType;
export type FontStyle = "normal" | "italic";

export type ResourceLicense = {
  status: "owned" | "licensed" | "public-domain" | "unknown";
  identifier?: string | undefined;
  name?: string | undefined;
  reference?: string | undefined;
  notes?: string | undefined;
};

export type CleanScanReceipt = {
  status: "clean";
  scannerName: string;
  scannerVersion: string;
  scannedAt: Date;
  reference?: string | undefined;
};

export type ResourceVersionBase = {
  id: string;
  workspaceId: string;
  kind: ResourceKind;
  contentHash: string;
  storageKey: string;
  mediaType: ResourceMediaType;
  byteSize: number;
  origin: AssetOrigin;
  license: ResourceLicense;
  scan: CleanScanReceipt;
  createdBy: string;
  createdAt: Date;
};

export type RasterResourceVersion = ResourceVersionBase & {
  kind: "raster-asset";
  mediaType: RasterMediaType;
  width: number;
  height: number;
};

export type FontResourceVersion = ResourceVersionBase & {
  kind: "font";
  mediaType: FontMediaType;
  family: string;
  weight: number;
  style: FontStyle;
};

export type ResourceVersion = RasterResourceVersion | FontResourceVersion;

export type ResourceAdmission = {
  resource: ResourceVersion;
  duplicate: boolean;
  ingestionId: string;
};

export type ResourceWithBytes = {
  resource: ResourceVersion;
  bytes: Uint8Array;
};

export type RasterIngestionInput = {
  workspaceId: string;
  actorUserId: string;
  declaredMediaType: RasterMediaType;
  bytes: Uint8Array;
  originalFilename?: string | undefined;
  origin: AssetOrigin;
  license: ResourceLicense;
};

export type FontIngestionInput = {
  workspaceId: string;
  actorUserId: string;
  declaredMediaType: FontMediaType;
  bytes: Uint8Array;
  originalFilename?: string | undefined;
  origin: AssetOrigin;
  license: ResourceLicense;
  family: string;
  weight: number;
  style: FontStyle;
};

export type AdmittedRasterResource = {
  id: string;
  ingestionId: string;
  workspaceId: string;
  actorUserId: string;
  kind: "raster-asset";
  contentHash: string;
  mediaType: RasterMediaType;
  bytes: Uint8Array;
  originalFilename?: string | undefined;
  origin: AssetOrigin;
  license: ResourceLicense;
  scan: CleanScanReceipt;
  width: number;
  height: number;
};

export type AdmittedFontResource = {
  id: string;
  ingestionId: string;
  workspaceId: string;
  actorUserId: string;
  kind: "font";
  contentHash: string;
  mediaType: FontMediaType;
  bytes: Uint8Array;
  originalFilename?: string | undefined;
  origin: AssetOrigin;
  license: ResourceLicense;
  scan: CleanScanReceipt;
  family: string;
  weight: number;
  style: FontStyle;
};

export type AdmittedResource = AdmittedRasterResource | AdmittedFontResource;
