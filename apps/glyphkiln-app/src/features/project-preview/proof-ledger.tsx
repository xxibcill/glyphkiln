import type { DesignDocument, QualityIssue, RenderManifest } from "@glyphkiln/core";
import {
  mapQualityIssuesToAuthoringIssues,
  type CandidateDocumentIssue,
} from "@glyphkiln/core/browser";

import type {
  PreviewCatalog,
  PreviewProblem,
  PreviewResponse,
  PreviewSuccess,
} from "./types";

type ProofLedgerProps = {
  catalog: PreviewCatalog;
  document: DesignDocument;
  response: PreviewResponse | null;
  proof: PreviewSuccess | null;
  hasUnrenderedEdits: boolean;
  validationIsStale: boolean;
};

type LedgerIssue =
  | { kind: "schema"; problem: PreviewProblem }
  | {
      kind: "quality";
      issue?: QualityIssue;
      authoring: CandidateDocumentIssue;
    };

type LedgerIssueCollection = {
  issues: LedgerIssue[];
  qualityIssuesTruncated: boolean;
};

export function ProofLedger({
  catalog,
  document,
  response,
  proof,
  hasUnrenderedEdits,
  validationIsStale,
}: ProofLedgerProps) {
  const issueCollection = collectIssues(response);
  const { issues } = issueCollection;
  const provenanceDocument = proof?.document ?? document;
  const manifest = proof?.outputs.find((output) => output.format === "svg")?.manifest;

  return (
    <aside className="proof-ledger" id="proof-ledger" aria-labelledby="ledger-title">
      <div className="ledger-heading">
        <p className="section-kicker">Inspection ledger</p>
        <h2 id="ledger-title">Contract evidence</h2>
        <p>Validation and provenance stay visible beside the artifact.</p>
      </div>

      <section className="ledger-section issue-section" aria-labelledby="issues-title">
        <div className="ledger-section-heading">
          <h3 id="issues-title">Validation</h3>
          <span>
            {validationIsStale
              ? "STALE"
              : `${issues.length.toString().padStart(2, "0")}${
                  issueCollection.qualityIssuesTruncated ? "+" : ""
                }`}
          </span>
        </div>
        <div aria-live="polite">
          {validationIsStale ? (
            <div className="ledger-stale">
              <span aria-hidden="true">↻</span>
              <div>
                <strong>Validation needs refresh</strong>
                <p>
                  The controls changed after the last inspection. Fire this version
                  before relying on its validation state.
                </p>
              </div>
            </div>
          ) : response === null ? (
            <div className="ledger-empty">
              <span>Preflight pending</span>
              <p>Render once to inspect structural and quality rules.</p>
            </div>
          ) : !response.ok && issues.length === 0 ? (
            <div className="ledger-failed">
              <span aria-hidden="true">!</span>
              <div>
                <strong>Inspection unavailable</strong>
                <p>{response.detail}</p>
              </div>
            </div>
          ) : issues.length === 0 ? (
            <div className="ledger-clean">
              <span aria-hidden="true">✓</span>
              <div>
                <strong>Contract clean</strong>
                <p>Core retained no structural or quality issues.</p>
              </div>
            </div>
          ) : (
            <>
              <ol className="issue-list">
                {issues.map((item, index) => (
                  <IssueItem
                    key={
                      item.kind === "schema"
                        ? `schema-${item.problem.path}-${item.problem.code}-${index.toString()}`
                        : `quality-${item.issue?.layerId ?? item.authoring.layerId ?? "document"}-${item.issue?.code ?? item.authoring.code}-${index.toString()}`
                    }
                    item={item}
                  />
                ))}
              </ol>
              {issueCollection.qualityIssuesTruncated ? (
                <p className="provenance-note">
                  Additional quality issues were omitted by the bounded authoring
                  contract. Review the complete render evidence before approval.
                </p>
              ) : null}
            </>
          )}
        </div>
      </section>

      <section className="ledger-section" aria-labelledby="provenance-title">
        <div className="ledger-section-heading">
          <h3 id="provenance-title">
            {manifest === undefined ? "Input contract" : "Rendered provenance"}
          </h3>
          <span>
            {manifest === undefined
              ? "PREFLIGHT"
              : hasUnrenderedEdits
                ? "STALE"
                : "FIRED"}
          </span>
        </div>
        {manifest === undefined ? (
          <p className="provenance-note">
            These values describe the local input. Render once to produce
            manifest-backed evidence.
          </p>
        ) : hasUnrenderedEdits ? (
          <p className="provenance-note provenance-note-stale">
            The controls have changed. This evidence belongs to the last rendered proof.
          </p>
        ) : (
          <p className="provenance-note">
            Values below are read from the SVG output manifest.
          </p>
        )}
        <dl className="contract-list">
          <div>
            <dt>Schema</dt>
            <dd>{provenanceDocument.schemaVersion}</dd>
          </div>
          {manifest === undefined ? (
            <div>
              <dt>Core catalog</dt>
              <dd>{catalog.coreVersion}</dd>
            </div>
          ) : (
            <div>
              <dt>Manifest</dt>
              <dd>{manifest.manifestVersion}</dd>
            </div>
          )}
          <div>
            <dt>Renderer</dt>
            <dd>
              {manifest?.renderer.name ?? catalog.renderer.name}{" "}
              {manifest?.renderer.version ?? catalog.renderer.version}
            </dd>
          </div>
          <div>
            <dt>Template</dt>
            <dd>
              {manifest?.template.id ?? provenanceDocument.template.id}@
              {manifest?.template.version ?? provenanceDocument.template.version}
            </dd>
          </div>
          <div>
            <dt>
              {manifest !== undefined && manifest.fonts.length !== 1 ? "Fonts" : "Font"}
            </dt>
            <dd
              title={
                manifest?.fonts.map((font) => font.sha256).join(", ") ??
                catalog.developmentFontSha256
              }
            >
              {formatFonts(manifest, catalog.developmentFontSha256)}
            </dd>
          </div>
        </dl>

        <div className="product-claim">
          <span>Rendering claim</span>
          <p>{manifest?.productClaim ?? catalog.productClaim}</p>
        </div>

        <AssetOriginLedger
          assets={manifest?.assets ?? provenanceDocument.assets}
          isManifestBacked={manifest !== undefined}
        />
      </section>

      <section className="ledger-section" aria-labelledby="fingerprint-title">
        <div className="ledger-section-heading">
          <h3 id="fingerprint-title">Fingerprints</h3>
          <span>{proof?.outputs.length ?? 0}</span>
        </div>
        {proof === null ? (
          <div className="ledger-empty">
            <span>No output hashes yet</span>
            <p>Each accepted format receives its own render fingerprint.</p>
          </div>
        ) : (
          <ul className="fingerprint-list">
            {proof.outputs.map((output) => (
              <li key={output.format}>
                <span>{output.format.toUpperCase()}</span>
                <code title={output.fingerprint}>{output.fingerprint}</code>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ledger-section" aria-labelledby="document-title">
        <div className="ledger-section-heading">
          <h3 id="document-title">Document</h3>
          <span>
            {proof === null ? "DRAFT" : hasUnrenderedEdits ? "LAST FIRED" : "FIRED"}
          </span>
        </div>
        <dl className="contract-list">
          <div>
            <dt>ID</dt>
            <dd>{provenanceDocument.id}</dd>
          </div>
          <div>
            <dt>Layers</dt>
            <dd>{provenanceDocument.layers.length}</dd>
          </div>
          <div>
            <dt>Assets</dt>
            <dd>{provenanceDocument.assets.length}</dd>
          </div>
          <div>
            <dt>Seed</dt>
            <dd title={provenanceDocument.seed}>{provenanceDocument.seed}</dd>
          </div>
        </dl>
      </section>
    </aside>
  );
}

function IssueItem({ item }: { item: LedgerIssue }) {
  if (item.kind === "schema") {
    return (
      <li data-severity="error">
        <div className="issue-meta">
          <span>Error</span>
          <code>{item.problem.code}</code>
        </div>
        <strong>{item.problem.path === "$" ? "Document" : item.problem.path}</strong>
        <p>{item.problem.message}</p>
      </li>
    );
  }
  return (
    <li
      data-severity={item.authoring.severity}
      data-authoring-action={item.authoring.action}
    >
      <div className="issue-meta">
        <span>{item.authoring.severity === "error" ? "Error" : "Warning"}</span>
        <code>{item.issue?.code ?? item.authoring.code}</code>
      </div>
      <strong>
        {item.issue?.layerId ?? item.authoring.layerId ?? "Document quality"}
      </strong>
      {item.issue === undefined ? null : <p>{item.issue.message}</p>}
      <p>
        <b>Next action:</b> {item.authoring.message}
      </p>
    </li>
  );
}

type AssetOriginEntry =
  DesignDocument["assets"][number] | RenderManifest["assets"][number];

function AssetOriginLedger({
  assets,
  isManifestBacked,
}: {
  assets: readonly AssetOriginEntry[];
  isManifestBacked: boolean;
}) {
  return (
    <div className="asset-origins">
      <span>
        {isManifestBacked ? "Manifest asset origins" : "Declared asset origins"}
      </span>
      {assets.length === 0 ? (
        <p>No source assets declared. There are no origins to report.</p>
      ) : (
        <ul>
          {assets.map((asset) => (
            <li key={asset.id}>
              <strong>{asset.id}</strong>
              <span>{asset.origin.kind}</span>
              {asset.origin.sourceName === undefined ? null : (
                <span>{asset.origin.sourceName}</span>
              )}
              {asset.origin.sourceReference === undefined ? null : (
                <span>{asset.origin.sourceReference}</span>
              )}
              {asset.origin.generativeImageModel === undefined ? null : (
                <span>Model: {asset.origin.generativeImageModel}</span>
              )}
              <code title={asset.sha256}>SHA-256 {shortHash(asset.sha256)}</code>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatFonts(
  manifest: RenderManifest | undefined,
  developmentFontSha256: string,
): string {
  if (manifest === undefined) {
    return `Inter · ${shortHash(developmentFontSha256)}`;
  }
  if (manifest.fonts.length === 0) return "No fonts recorded";
  return manifest.fonts
    .map(
      (font) => `${font.family} ${font.weight.toString()} · ${shortHash(font.sha256)}`,
    )
    .join(", ");
}

function collectIssues(response: PreviewResponse | null): LedgerIssueCollection {
  if (response === null) {
    return { issues: [], qualityIssuesTruncated: false };
  }
  const qualityIssues = response.ok
    ? response.qualityIssues
    : (response.qualityIssues ?? []);
  const mappedQualityIssues = mapQualityIssuesToAuthoringIssues(qualityIssues);
  const schemaIssues = response.ok
    ? []
    : (response.problems ?? []).map((problem): LedgerIssue => ({
        kind: "schema",
        problem,
      }));
  const qualityLedgerIssues: LedgerIssue[] = [];
  for (let index = 0; index < mappedQualityIssues.issues.length; index += 1) {
    const issue = qualityIssues.at(index);
    const authoring = mappedQualityIssues.issues.at(index);
    if (authoring === undefined) continue;
    qualityLedgerIssues.push({
      kind: "quality",
      authoring,
      ...(issue === undefined ? {} : { issue }),
    });
  }
  return {
    issues: [...schemaIssues, ...qualityLedgerIssues],
    qualityIssuesTruncated: mappedQualityIssues.truncated,
  };
}

function shortHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}
