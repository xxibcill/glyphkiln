"use client";

import { useState } from "react";

import type { DesignDocument, RenderEvidence } from "@glyphkiln/core";

import type {
  PreviewCatalog,
  PreviewCatalogFormat,
  PreviewOutput,
  PreviewSuccess,
} from "./types";

type PreviewStageProps = {
  catalog: PreviewCatalog;
  document: DesignDocument;
  proof: PreviewSuccess | null;
  isRendering: boolean;
  hasUnrenderedEdits: boolean;
};

export function PreviewStage({
  catalog,
  document,
  proof,
  isRendering,
  hasUnrenderedEdits,
}: PreviewStageProps) {
  const [showEvidence, setShowEvidence] = useState(true);
  const previewOutput =
    proof?.outputs.find((output) => output.format === "svg") ??
    proof?.outputs.find((output) => output.format === "png");
  const previewDocument = proof?.document ?? document;
  const format = catalog.formats.find(
    (candidate) => candidate.id === previewDocument.format,
  );
  const template = catalog.templates.find(
    (candidate) => candidate.id === previewDocument.template.id,
  );

  return (
    <section className="preview-column" aria-labelledby="canvas-title">
      <header className="preview-heading">
        <div>
          <p className="section-kicker">Proofing table</p>
          <h2 id="canvas-title">Rendered artifact</h2>
        </div>
        <div className="preview-heading-actions">
          {proof === null ? null : (
            <button
              className="evidence-toggle"
              type="button"
              aria-pressed={showEvidence}
              onClick={() => {
                setShowEvidence((current) => !current);
              }}
            >
              {showEvidence ? "Hide Core evidence" : "Show Core evidence"}
            </button>
          )}
          <ProofStatus
            hasProof={proof !== null}
            isRendering={isRendering}
            hasUnrenderedEdits={hasUnrenderedEdits}
          />
        </div>
      </header>

      <div className="proof-registration" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>

      <div
        className={isRendering ? "canvas-bench is-rendering" : "canvas-bench"}
        aria-busy={isRendering}
      >
        {previewOutput === undefined ? (
          <EmptyProof
            document={document}
            format={format}
            templateLabel={template?.label ?? document.template.id}
          />
        ) : (
          <RenderedProof
            document={previewDocument}
            format={format}
            output={previewOutput}
            templateLabel={template?.label ?? previewDocument.template.id}
            isStale={hasUnrenderedEdits}
            evidence={proof?.evidence}
            showEvidence={showEvidence}
          />
        )}

        {isRendering ? (
          <div className="rendering-veil" role="status">
            <span className="kiln-loader" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <strong>Firing deterministic outputs</strong>
            <small>Core is validating, outlining, and rasterizing the proof.</small>
          </div>
        ) : null}
      </div>

      <div className="proof-caption">
        <div>
          <span>{template?.label ?? previewDocument.template.id}</span>
          <strong>{format?.label ?? previewDocument.format}</strong>
        </div>
        <div>
          <span>Canvas</span>
          <strong>
            {format === undefined
              ? "Registered format"
              : `${format.width.toString()} × ${format.height.toString()}`}
          </strong>
        </div>
        <div>
          <span>Seed</span>
          <strong title={previewDocument.seed}>{previewDocument.seed}</strong>
        </div>
      </div>

      {proof === null ? (
        <div className="export-empty">
          <span>Exports appear after Core accepts the document.</span>
          <span>SVG · PNG · manifests · design document</span>
        </div>
      ) : (
        <ExportBench proof={proof} isStale={hasUnrenderedEdits} />
      )}
    </section>
  );
}

function RenderedProof({
  document,
  format,
  output,
  templateLabel,
  isStale,
  evidence,
  showEvidence,
}: {
  document: DesignDocument;
  format: PreviewCatalogFormat | undefined;
  output: PreviewOutput;
  templateLabel: string;
  isStale: boolean;
  evidence: RenderEvidence | undefined;
  showEvidence: boolean;
}) {
  const source = `data:${output.mimeType};base64,${output.base64}`;
  const dimensions = output.manifest.dimensions;
  const aspectRatio = `${dimensions.width.toString()} / ${dimensions.height.toString()}`;
  const maximumWidthInViewportHeight = (72 * dimensions.width) / dimensions.height;
  return (
    <figure className="rendered-proof">
      <div
        className="proof-artifact-frame"
        style={{
          aspectRatio,
          width: `min(100%, ${maximumWidthInViewportHeight.toFixed(3)}vh)`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Core SVG must remain a data URL and never enter the DOM as markup. */}
        <img
          src={source}
          alt={`${templateLabel} proof in ${format?.label ?? document.format} format`}
        />
        {showEvidence && evidence !== undefined ? (
          <EvidenceOverlay evidence={evidence} dimensions={dimensions} />
        ) : null}
      </div>
      {showEvidence && evidence !== undefined ? (
        <ul className="proof-overlay-legend" aria-label="Core render evidence legend">
          <li data-evidence="safe-area">Safe area</li>
          <li data-evidence="text">Text bounds</li>
          <li data-evidence="crop">Crop destination</li>
          <li data-evidence="contrast">Contrast samples</li>
        </ul>
      ) : null}
      <figcaption>
        <span>
          {isStale ? "Last rendered " : ""}
          {output.format.toUpperCase()} preview
        </span>
        <span title={output.fingerprint}>{shortHash(output.fingerprint)}</span>
      </figcaption>
    </figure>
  );
}

function EvidenceOverlay({
  evidence,
  dimensions,
}: {
  evidence: RenderEvidence;
  dimensions: { width: number; height: number };
}) {
  return (
    <svg
      className="proof-evidence-overlay"
      viewBox={`0 0 ${dimensions.width.toString()} ${dimensions.height.toString()}`}
      aria-hidden="true"
    >
      <rect
        className="evidence-safe-area"
        x={evidence.safeArea.x}
        y={evidence.safeArea.y}
        width={evidence.safeArea.width}
        height={evidence.safeArea.height}
      />
      {evidence.crops.map((crop) => (
        <rect
          className="evidence-crop-bounds"
          key={`crop-${crop.layerId}`}
          x={crop.destinationBounds.x}
          y={crop.destinationBounds.y}
          width={crop.destinationBounds.width}
          height={crop.destinationBounds.height}
        />
      ))}
      {evidence.text.map((text) => (
        <g key={`text-${text.layerId}`}>
          <rect
            className={
              text.overflow
                ? "evidence-text-bounds has-overflow"
                : "evidence-text-bounds"
            }
            x={text.bounds.x}
            y={text.bounds.y}
            width={text.bounds.width}
            height={text.bounds.height}
          />
          <text x={text.bounds.x + 4} y={text.bounds.y + 14}>
            {text.layerId}
          </text>
        </g>
      ))}
      {evidence.contrast.flatMap((contrast) =>
        contrast.samples.map((sample, index) => (
          <circle
            className={
              sample.ratio < contrast.minimumRequired
                ? "evidence-contrast-sample is-low"
                : "evidence-contrast-sample"
            }
            key={`contrast-${contrast.layerId}-${index.toString()}`}
            cx={sample.canvasPoint.x}
            cy={sample.canvasPoint.y}
            r={Math.max(3, Math.min(dimensions.width, dimensions.height) * 0.004)}
          />
        )),
      )}
    </svg>
  );
}

function EmptyProof({
  document,
  format,
  templateLabel,
}: {
  document: DesignDocument;
  format: PreviewCatalogFormat | undefined;
  templateLabel: string;
}) {
  const aspectRatio =
    format === undefined
      ? undefined
      : `${format.width.toString()} / ${format.height.toString()}`;
  return (
    <div className="empty-proof" style={{ aspectRatio }}>
      <span className="empty-proof-index">UNFIRED / 001</span>
      <div className="empty-proof-copy">
        <span>Awaiting Core render</span>
        <strong>{templateLabel}</strong>
        <p>
          The canvas remains a blueprint until the document passes structural and
          quality checks.
        </p>
      </div>
      <dl>
        <div>
          <dt>Format</dt>
          <dd>{format?.label ?? document.format}</dd>
        </div>
        <div>
          <dt>Schema</dt>
          <dd>{document.schemaVersion}</dd>
        </div>
        <div>
          <dt>Assets</dt>
          <dd>{document.assets.length}</dd>
        </div>
      </dl>
    </div>
  );
}

function ProofStatus({
  hasProof,
  isRendering,
  hasUnrenderedEdits,
}: {
  hasProof: boolean;
  isRendering: boolean;
  hasUnrenderedEdits: boolean;
}) {
  let label = "Unfired";
  let status = "idle";
  if (isRendering) {
    label = "Rendering";
    status = "working";
  } else if (hasProof && hasUnrenderedEdits) {
    label = "Edits not rendered";
    status = "stale";
  } else if (hasProof) {
    label = "Proof current";
    status = "ready";
  }
  return (
    <span className="proof-status" data-status={status}>
      <i aria-hidden="true" />
      {label}
    </span>
  );
}

function ExportBench({ proof, isStale }: { proof: PreviewSuccess; isStale: boolean }) {
  return (
    <section className="export-bench" aria-labelledby="export-title">
      <div className="export-heading">
        <div>
          <p className="section-kicker">Output drawer</p>
          <h3 id="export-title">
            {isStale ? "Last rendered downloads" : "Deliberate downloads"}
          </h3>
        </div>
        <JsonDownloadLink
          value={proof.document}
          filename={`${proof.document.id}.design.json`}
          label={isStale ? "Download last rendered document" : "Download document"}
          kind="document"
        />
      </div>
      {isStale ? (
        <p className="export-stale-note">
          These files belong to the last proof, before the current control changes.
        </p>
      ) : null}
      <ul className="output-list">
        {proof.outputs.map((output) => (
          <li key={output.format}>
            <div className="output-identity">
              <span>{output.format.toUpperCase()}</span>
              <div>
                <strong>{output.filename}</strong>
                <small>
                  {formatBytes(output.byteSize)} · {shortHash(output.fingerprint)}
                </small>
              </div>
            </div>
            <div className="output-actions">
              <a
                href={`data:${output.mimeType};base64,${output.base64}`}
                download={output.filename}
                className="download-link download-link-primary"
              >
                Download {isStale ? "last " : ""}
                {output.format.toUpperCase()}
              </a>
              <JsonDownloadLink
                value={output.manifest}
                filename={`${output.filename}.manifest.json`}
                label={`${isStale ? "Last " : ""}${output.format.toUpperCase()} manifest`}
                kind="manifest"
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function JsonDownloadLink({
  value,
  filename,
  label,
  kind,
}: {
  value: unknown;
  filename: string;
  label: string;
  kind: "manifest" | "document";
}) {
  const json = JSON.stringify(value, null, 2);
  const href = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
  return (
    <a className="download-link" data-kind={kind} href={href} download={filename}>
      {label}
    </a>
  );
}

function formatBytes(byteSize: number): string {
  if (byteSize < 1_024) return `${byteSize.toString()} B`;
  const kibibytes = byteSize / 1_024;
  if (kibibytes < 1_024) return `${kibibytes.toFixed(1)} KB`;
  return `${(kibibytes / 1_024).toFixed(1)} MB`;
}

function shortHash(hash: string): string {
  if (hash.length <= 18) return hash;
  return `${hash.slice(0, 9)}…${hash.slice(-7)}`;
}
