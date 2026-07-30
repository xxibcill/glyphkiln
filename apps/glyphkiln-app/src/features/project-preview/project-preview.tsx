"use client";

import { useMemo, useState } from "react";

import { buildPreviewDocument, createInitialPreviewForm } from "./document-builder";
import { EditorControls } from "./editor-controls";
import { PreviewStage } from "./preview-stage";
import { ProofLedger } from "./proof-ledger";
import { parsePreviewResponse, verifyPreviewIntegrity } from "./response-parser";
import type {
  PreviewCatalog,
  PreviewFormState,
  PreviewResponse,
  PreviewSuccess,
} from "./types";

const PREVIEW_REQUEST_TIMEOUT_MS = 20_000;

export type ProjectPreviewProps = {
  catalog: PreviewCatalog;
};

export function ProjectPreview({ catalog }: ProjectPreviewProps) {
  const [formState, setFormState] = useState<PreviewFormState>(() =>
    createInitialPreviewForm(catalog),
  );
  const [response, setResponse] = useState<PreviewResponse | null>(null);
  const [lastProof, setLastProof] = useState<PreviewSuccess | null>(null);
  const [lastRenderedInput, setLastRenderedInput] = useState<string | null>(null);
  const [lastInspectedInput, setLastInspectedInput] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const document = useMemo(
    () => buildPreviewDocument(formState, catalog),
    [catalog, formState],
  );
  const documentPayload = useMemo(() => JSON.stringify(document), [document]);
  const hasUnrenderedEdits =
    lastProof !== null &&
    lastRenderedInput !== null &&
    documentPayload !== lastRenderedInput;
  const validationIsStale =
    response !== null &&
    lastInspectedInput !== null &&
    documentPayload !== lastInspectedInput;

  async function renderProof(): Promise<void> {
    if (isRendering) return;
    const submittedPayload = documentPayload;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      controller.abort();
    }, PREVIEW_REQUEST_TIMEOUT_MS);
    setIsRendering(true);
    try {
      const httpResponse = await fetch("/api/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: submittedPayload,
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = (await httpResponse.json()) as unknown;
      const parsed = parsePreviewResponse(payload, httpResponse.status);
      const integrityFailure = parsed.ok
        ? await verifyPreviewIntegrity(parsed, catalog)
        : null;
      const inspectedResponse = integrityFailure ?? parsed;
      setResponse(inspectedResponse);
      setLastInspectedInput(submittedPayload);
      if (inspectedResponse.ok) {
        setLastProof(inspectedResponse);
        setLastRenderedInput(submittedPayload);
      }
    } catch (error: unknown) {
      const requestTimedOut =
        error instanceof DOMException && error.name === "AbortError";
      setResponse({
        ok: false,
        status: 0,
        title: requestTimedOut
          ? "Preview request timed out"
          : "Preview service unavailable",
        code: requestTimedOut ? "PREVIEW_REQUEST_TIMEOUT" : "PREVIEW_REQUEST_FAILED",
        detail: requestTimedOut
          ? "The local preview did not respond within 20 seconds. Wait for the renderer to settle and try again."
          : "The local preview could not be reached. Check the server and try again.",
      });
      setLastInspectedInput(submittedPayload);
    } finally {
      window.clearTimeout(timeout);
      setIsRendering(false);
    }
  }

  return (
    <div className="project-preview-shell">
      <a className="skip-link" href="#preview-workspace">
        Skip to project workspace
      </a>

      <header className="app-masthead">
        <div className="brand-lockup">
          <span className="kiln-stamp" aria-hidden="true">
            <i>G</i>
            <i>K</i>
          </span>
          <div>
            <p>Glyphkiln</p>
            <span>Local project proof</span>
          </div>
        </div>

        <div className="masthead-title">
          <span>Workshop / read-only preview</span>
          <h1>Shape the contract. Fire the proof.</h1>
        </div>

        <dl className="runtime-register">
          <div>
            <dt>Core</dt>
            <dd>{catalog.coreVersion}</dd>
          </div>
          <div>
            <dt>Renderer</dt>
            <dd>{catalog.renderer.version}</dd>
          </div>
          <div>
            <dt>Persistence</dt>
            <dd>Off</dd>
          </div>
        </dl>
      </header>

      <main className="workshop-grid" id="preview-workspace">
        <EditorControls
          catalog={catalog}
          state={formState}
          response={response}
          isRendering={isRendering}
          hasUnrenderedEdits={hasUnrenderedEdits}
          validationIsStale={validationIsStale}
          onStateChange={setFormState}
          onRender={() => {
            void renderProof();
          }}
        />
        <PreviewStage
          catalog={catalog}
          document={document}
          proof={lastProof}
          isRendering={isRendering}
          hasUnrenderedEdits={hasUnrenderedEdits}
        />
        <ProofLedger
          catalog={catalog}
          document={document}
          response={response}
          proof={lastProof}
          hasUnrenderedEdits={hasUnrenderedEdits}
          validationIsStale={validationIsStale}
        />
      </main>

      <footer className="workshop-footer">
        <span>Structured input → Core validation → versioned render → provenance</span>
        <span>Nothing is saved in this milestone.</span>
      </footer>
    </div>
  );
}
