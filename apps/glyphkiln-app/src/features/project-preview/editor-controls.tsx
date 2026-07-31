import { useEffect, useRef } from "react";
import type { ChangeEvent, ReactNode, RefObject, SyntheticEvent } from "react";

import type {
  BrandFormState,
  CompositionFormState,
  CopyFormState,
  PreviewCatalog,
  PreviewFailure,
  PreviewFormState,
  PreviewResponse,
} from "./types";

type EditorControlsProps = {
  catalog: PreviewCatalog;
  state: PreviewFormState;
  response: PreviewResponse | null;
  isRendering: boolean;
  hasUnrenderedEdits: boolean;
  validationIsStale: boolean;
  brandControls?: "editable" | "sealed";
  submitLabel?: string;
  isReadOnly?: boolean;
  onStateChange: (state: PreviewFormState) => void;
  onRender: () => void;
};

type FieldShellProps = {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
};

type TextFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  maxLength?: number;
  pattern?: string;
  title?: string;
  hint?: string;
  autoComplete?: string;
  error?: string;
};

type TextAreaFieldProps = Omit<TextFieldProps, "pattern" | "title" | "autoComplete"> & {
  rows?: number;
};

type RangeFieldProps = {
  id: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  hint?: string;
};

type ColorFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
};

const IDENTIFIER_PATTERN = "[A-Za-z0-9][A-Za-z0-9._:-]*";
const SEMANTIC_VERSION_PATTERN = "(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)";

export function EditorControls({
  catalog,
  state,
  response,
  isRendering,
  hasUnrenderedEdits,
  validationIsStale,
  brandControls = "editable",
  submitLabel = "Render deterministic proof",
  isReadOnly = false,
  onStateChange,
  onRender,
}: EditorControlsProps) {
  const template = catalog.templates.find(
    (candidate) => candidate.id === state.composition.templateId,
  );
  const supportedFormats = catalog.formats.filter((format) =>
    template?.supportedFormats.includes(format.id),
  );
  const failure = !validationIsStale && response?.ok === false ? response : null;
  const failureSummaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (failure !== null) failureSummaryRef.current?.focus();
  }, [failure]);

  function updateBrand(update: Partial<BrandFormState>): void {
    onStateChange({
      ...state,
      brand: { ...state.brand, ...update },
    });
  }

  function updateComposition(update: Partial<CompositionFormState>): void {
    onStateChange({
      ...state,
      composition: { ...state.composition, ...update },
    });
  }

  function updateCopy(update: Partial<CopyFormState>): void {
    onStateChange({
      ...state,
      copy: { ...state.copy, ...update },
    });
  }

  function handleTemplateChange(templateId: CompositionFormState["templateId"]): void {
    const nextTemplate = catalog.templates.find(
      (candidate) => candidate.id === templateId,
    );
    if (nextTemplate === undefined) return;
    const formatId = nextTemplate.supportedFormats.includes(state.composition.formatId)
      ? state.composition.formatId
      : (nextTemplate.supportedFormats[0] ?? state.composition.formatId);
    updateComposition({ templateId, formatId });
  }

  function updateQuietRegion(
    key: keyof CompositionFormState["quietRegion"],
    value: number,
  ): void {
    const quietRegion = { ...state.composition.quietRegion, [key]: value };
    if (key === "x") quietRegion.width = Math.min(quietRegion.width, 1 - value);
    if (key === "y") quietRegion.height = Math.min(quietRegion.height, 1 - value);
    if (key === "width") quietRegion.width = Math.min(value, 1 - quietRegion.x);
    if (key === "height") quietRegion.height = Math.min(value, 1 - quietRegion.y);
    updateComposition({ quietRegion });
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    onRender();
  }

  return (
    <aside className="editor-rail" aria-labelledby="controls-title">
      <div className="rail-heading">
        <p className="section-kicker">Control bench</p>
        <h2 id="controls-title">Build the document</h2>
        <p>Every control becomes bounded data. Nothing here writes rendering code.</p>
      </div>

      <form
        className="project-form"
        onSubmit={handleSubmit}
        inert={isReadOnly}
        aria-disabled={isReadOnly}
      >
        {failure === null ? null : (
          <FormFailureSummary failure={failure} summaryRef={failureSummaryRef} />
        )}

        <section className="form-section" aria-labelledby="composition-title">
          <SectionHeading
            number="01"
            title="Composition"
            id="composition-title"
            note={template === undefined ? undefined : `Template ${template.version}`}
          />
          <div className="field-stack">
            <FieldShell id="template" label="Template">
              <select
                id="template"
                value={state.composition.templateId}
                onChange={(event) => {
                  handleTemplateChange(
                    event.currentTarget.value as CompositionFormState["templateId"],
                  );
                }}
              >
                {catalog.templates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.label}
                  </option>
                ))}
              </select>
            </FieldShell>

            <div className="field-pair">
              <FieldShell id="format" label="Output format">
                <select
                  id="format"
                  value={state.composition.formatId}
                  onChange={(event) => {
                    updateComposition({
                      formatId: event.currentTarget
                        .value as CompositionFormState["formatId"],
                    });
                  }}
                >
                  {supportedFormats.map((format) => (
                    <option key={format.id} value={format.id}>
                      {format.label} · {format.width}×{format.height}
                    </option>
                  ))}
                </select>
              </FieldShell>

              <FieldShell id="mode" label="Theme">
                <select
                  id="mode"
                  value={state.brand.mode}
                  onChange={(event) => {
                    updateBrand({
                      mode: event.currentTarget.value as BrandFormState["mode"],
                    });
                  }}
                >
                  <option value="light">Light proof</option>
                  <option value="dark">Dark proof</option>
                </select>
              </FieldShell>
            </div>

            <TextField
              id="seed"
              label="Seed"
              value={state.composition.seed}
              onChange={(seed) => {
                updateComposition({ seed });
              }}
              required
              maxLength={256}
              hint="Keep this value to reproduce the same procedure."
              error={problemMessage(failure, "seed")}
            />
          </div>
        </section>

        <section className="form-section" aria-labelledby="copy-title">
          <SectionHeading
            number="02"
            title="Content"
            id="copy-title"
            note="Structured copy only"
          />
          <TemplateCopyFields state={state} failure={failure} updateCopy={updateCopy} />
        </section>

        <section className="form-section" aria-labelledby="brand-title">
          <SectionHeading
            number="03"
            title="Brand snapshot"
            id="brand-title"
            note="Embedded immutably"
          />
          {brandControls === "sealed" ? (
            <div className="sealed-brand-contract">
              <span className="sealed-brand-mark" aria-hidden="true">
                S
              </span>
              <div>
                <strong>{state.brand.name}</strong>
                <span>
                  Snapshot {state.brand.version} · identity assigned by the server
                </span>
                <code title={state.brand.snapshotId}>
                  {shortHash(state.brand.snapshotId)}
                </code>
              </div>
              <p>
                These brand values are sealed. Publish another snapshot to change them
                without rewriting existing designs.
              </p>
            </div>
          ) : (
            <div className="field-stack">
              <TextField
                id="brand-name"
                label="Brand name"
                value={state.brand.name}
                onChange={(name) => {
                  updateBrand({ name });
                }}
                required
                maxLength={120}
                autoComplete="organization"
                error={problemMessage(failure, "brand.name")}
              />
              <div className="field-pair">
                <TextField
                  id="snapshot-id"
                  label="Snapshot ID"
                  value={state.brand.snapshotId}
                  onChange={(snapshotId) => {
                    updateBrand({ snapshotId });
                  }}
                  required
                  maxLength={128}
                  pattern={IDENTIFIER_PATTERN}
                  title="Use letters, numbers, periods, underscores, colons, or hyphens."
                  error={problemMessage(failure, "brand.snapshotId")}
                />
                <TextField
                  id="snapshot-version"
                  label="Version"
                  value={state.brand.version}
                  onChange={(version) => {
                    updateBrand({ version });
                  }}
                  required
                  pattern={SEMANTIC_VERSION_PATTERN}
                  title="Use a semantic version such as 1.0.0."
                  error={problemMessage(failure, "brand.version")}
                />
              </div>

              <fieldset className="color-fieldset">
                <legend>Core palette</legend>
                <div className="color-grid">
                  <ColorField
                    id="primary"
                    label="Primary"
                    value={state.brand.primary}
                    onChange={(primary) => {
                      updateBrand({ primary });
                    }}
                  />
                  <ColorField
                    id="secondary"
                    label="Secondary"
                    value={state.brand.secondary}
                    onChange={(secondary) => {
                      updateBrand({ secondary });
                    }}
                  />
                  <ColorField
                    id="accent"
                    label="Accent"
                    value={state.brand.accent}
                    onChange={(accent) => {
                      updateBrand({ accent });
                    }}
                  />
                </div>
              </fieldset>

              <details className="advanced-disclosure">
                <summary>Theme surfaces and constraints</summary>
                <div className="disclosure-body">
                  <fieldset className="color-fieldset">
                    <legend>Light theme</legend>
                    <div className="color-grid color-grid-wide">
                      <ColorField
                        id="paper"
                        label="Background"
                        value={state.brand.paper}
                        onChange={(paper) => {
                          updateBrand({ paper });
                        }}
                      />
                      <ColorField
                        id="surface"
                        label="Surface"
                        value={state.brand.surface}
                        onChange={(surface) => {
                          updateBrand({ surface });
                        }}
                      />
                      <ColorField
                        id="ink"
                        label="Text"
                        value={state.brand.ink}
                        onChange={(ink) => {
                          updateBrand({ ink });
                        }}
                      />
                      <ColorField
                        id="muted-ink"
                        label="Muted text"
                        value={state.brand.mutedInk}
                        onChange={(mutedInk) => {
                          updateBrand({ mutedInk });
                        }}
                      />
                    </div>
                  </fieldset>

                  <fieldset className="color-fieldset">
                    <legend>Dark theme</legend>
                    <div className="color-grid color-grid-wide">
                      <ColorField
                        id="dark-background"
                        label="Background"
                        value={state.brand.darkBackground}
                        onChange={(darkBackground) => {
                          updateBrand({ darkBackground });
                        }}
                      />
                      <ColorField
                        id="dark-surface"
                        label="Surface"
                        value={state.brand.darkSurface}
                        onChange={(darkSurface) => {
                          updateBrand({ darkSurface });
                        }}
                      />
                      <ColorField
                        id="dark-text"
                        label="Text"
                        value={state.brand.darkText}
                        onChange={(darkText) => {
                          updateBrand({ darkText });
                        }}
                      />
                      <ColorField
                        id="dark-muted-text"
                        label="Muted text"
                        value={state.brand.darkMutedText}
                        onChange={(darkMutedText) => {
                          updateBrand({ darkMutedText });
                        }}
                      />
                    </div>
                  </fieldset>

                  <FieldShell id="visual-density" label="Visual density">
                    <select
                      id="visual-density"
                      value={state.brand.visualDensity}
                      onChange={(event) => {
                        updateBrand({
                          visualDensity: event.currentTarget
                            .value as BrandFormState["visualDensity"],
                        });
                      }}
                    >
                      <option value="quiet">Quiet</option>
                      <option value="balanced">Balanced</option>
                      <option value="dense">Dense</option>
                    </select>
                  </FieldShell>
                  <RangeField
                    id="safe-area"
                    label="Safe-area inset"
                    value={state.brand.safeArea}
                    min={0}
                    max={0.2}
                    step={0.01}
                    onChange={(safeArea) => {
                      updateBrand({ safeArea });
                    }}
                    hint="Applied equally to all four canvas edges."
                  />
                </div>
              </details>

              <div className="fixed-contract">
                <span className="fixed-contract-mark" aria-hidden="true">
                  F
                </span>
                <div>
                  <strong>Inter Variable · registered</strong>
                  <span title={catalog.developmentFontSha256}>
                    SHA-256 {shortHash(catalog.developmentFontSha256)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="form-section" aria-labelledby="procedure-title">
          <SectionHeading
            number="04"
            title="Procedure"
            id="procedure-title"
            note={
              catalog.proceduralStyles.find(
                (style) => style.id === state.composition.proceduralStyle,
              )?.version
            }
          />
          <div className="field-stack">
            <FieldShell id="procedural-style" label="Procedural style">
              <select
                id="procedural-style"
                value={state.composition.proceduralStyle}
                onChange={(event) => {
                  updateComposition({
                    proceduralStyle: event.currentTarget
                      .value as CompositionFormState["proceduralStyle"],
                  });
                }}
              >
                {catalog.proceduralStyles.map((style) => (
                  <option key={style.id} value={style.id}>
                    {style.label}
                  </option>
                ))}
              </select>
            </FieldShell>

            <RangeField
              id="intensity"
              label="Intensity"
              value={state.composition.intensity}
              onChange={(intensity) => {
                updateComposition({ intensity });
              }}
            />
            <RangeField
              id="density"
              label="Density"
              value={state.composition.density}
              onChange={(density) => {
                updateComposition({ density });
              }}
            />
            <RangeField
              id="complexity"
              label="Complexity"
              value={state.composition.complexity}
              onChange={(complexity) => {
                updateComposition({ complexity });
              }}
            />
            <RangeField
              id="contrast"
              label="Contrast"
              value={state.composition.contrast}
              onChange={(contrast) => {
                updateComposition({ contrast });
              }}
            />

            <details className="advanced-disclosure">
              <summary>Quiet-region geometry</summary>
              <div className="disclosure-body quiet-region-grid">
                <RangeField
                  id="quiet-x"
                  label="Left"
                  value={state.composition.quietRegion.x}
                  max={0.8}
                  onChange={(value) => {
                    updateQuietRegion("x", value);
                  }}
                />
                <RangeField
                  id="quiet-y"
                  label="Top"
                  value={state.composition.quietRegion.y}
                  max={0.8}
                  onChange={(value) => {
                    updateQuietRegion("y", value);
                  }}
                />
                <RangeField
                  id="quiet-width"
                  label="Width"
                  value={state.composition.quietRegion.width}
                  min={0.1}
                  max={1 - state.composition.quietRegion.x}
                  onChange={(value) => {
                    updateQuietRegion("width", value);
                  }}
                />
                <RangeField
                  id="quiet-height"
                  label="Height"
                  value={state.composition.quietRegion.height}
                  min={0.1}
                  max={1 - state.composition.quietRegion.y}
                  onChange={(value) => {
                    updateQuietRegion("height", value);
                  }}
                />
              </div>
            </details>
          </div>
        </section>

        <div className="render-dock">
          <div className="render-state" aria-live="polite">
            <span
              className={
                isRendering ? "firing-indicator is-active" : "firing-indicator"
              }
              aria-hidden="true"
            />
            <span>
              {isRendering
                ? "Firing SVG and PNG…"
                : isReadOnly
                  ? "This workspace role can inspect saved documents but cannot preview or save changes."
                  : hasUnrenderedEdits
                    ? "Controls changed. Fire again to update the proof."
                    : validationIsStale
                      ? "Controls changed. Inspect this version again."
                      : response?.ok === true
                        ? "Proof ready. Edits remain local until fired again."
                        : "Preview does not save this document."}
            </span>
          </div>
          <button
            className="primary-action"
            type="submit"
            disabled={isRendering || isReadOnly}
          >
            {isRendering ? "Firing proof…" : submitLabel}
          </button>
        </div>
      </form>
    </aside>
  );
}

function TemplateCopyFields({
  state,
  failure,
  updateCopy,
}: {
  state: PreviewFormState;
  failure: PreviewFailure | null;
  updateCopy: (update: Partial<CopyFormState>) => void;
}) {
  switch (state.composition.templateId) {
    case "product-announcement": {
      const copy = state.copy.productAnnouncement;
      const update = (next: Partial<CopyFormState["productAnnouncement"]>): void => {
        updateCopy({ productAnnouncement: { ...copy, ...next } });
      };
      return (
        <div className="field-stack">
          <TextField
            id="product-eyebrow"
            label="Eyebrow"
            value={copy.eyebrow}
            onChange={(eyebrow) => {
              update({ eyebrow });
            }}
            maxLength={2_000}
            error={copyIssueMessage(failure, "eyebrow", "text", copy.eyebrow)}
          />
          <TextAreaField
            id="product-headline"
            label="Headline"
            value={copy.headline}
            onChange={(headline) => {
              update({ headline });
            }}
            required
            maxLength={2_000}
            rows={3}
            error={copyIssueMessage(failure, "headline", "text", copy.headline)}
          />
          <TextAreaField
            id="product-subtitle"
            label="Subtitle"
            value={copy.subtitle}
            onChange={(subtitle) => {
              update({ subtitle });
            }}
            maxLength={2_000}
            rows={3}
            error={copyIssueMessage(failure, "subtitle", "text", copy.subtitle)}
          />
          <TextField
            id="product-cta"
            label="Call to action"
            value={copy.cta}
            onChange={(cta) => {
              update({ cta });
            }}
            maxLength={2_000}
            error={copyIssueMessage(failure, "cta", "text", copy.cta)}
          />
        </div>
      );
    }
    case "statistic-card": {
      const copy = state.copy.statisticCard;
      const update = (next: Partial<CopyFormState["statisticCard"]>): void => {
        updateCopy({ statisticCard: { ...copy, ...next } });
      };
      return (
        <div className="field-stack">
          <TextField
            id="statistic-headline"
            label="Headline"
            value={copy.headline}
            onChange={(headline) => {
              update({ headline });
            }}
            maxLength={2_000}
            error={copyIssueMessage(failure, "headline", "text", copy.headline)}
          />
          <div className="field-pair field-pair-statistic">
            <TextField
              id="statistic-value"
              label="Value"
              value={copy.value}
              onChange={(value) => {
                update({ value });
              }}
              required
              maxLength={80}
              error={copyIssueMessage(failure, "statistic", "value", copy.value)}
            />
            <TextField
              id="statistic-trend"
              label="Trend"
              value={copy.trend}
              onChange={(trend) => {
                update({ trend });
              }}
              maxLength={80}
              error={copyIssueMessage(failure, "statistic", "trend", copy.trend)}
            />
          </div>
          <TextAreaField
            id="statistic-label"
            label="Supporting label"
            value={copy.label}
            onChange={(label) => {
              update({ label });
            }}
            required
            maxLength={240}
            rows={3}
            error={copyIssueMessage(failure, "statistic", "label", copy.label)}
          />
        </div>
      );
    }
    case "quote-card": {
      const copy = state.copy.quoteCard;
      const update = (next: Partial<CopyFormState["quoteCard"]>): void => {
        updateCopy({ quoteCard: { ...copy, ...next } });
      };
      return (
        <div className="field-stack">
          <TextAreaField
            id="quote-copy"
            label="Quotation"
            value={copy.quote}
            onChange={(quote) => {
              update({ quote });
            }}
            required
            maxLength={2_000}
            rows={5}
            error={copyIssueMessage(failure, "quote", "text", copy.quote)}
          />
          <TextField
            id="quote-attribution"
            label="Attribution"
            value={copy.attribution}
            onChange={(attribution) => {
              update({ attribution });
            }}
            required
            maxLength={2_000}
            error={copyIssueMessage(failure, "attribution", "text", copy.attribution)}
          />
        </div>
      );
    }
    case "article-cover": {
      const copy = state.copy.articleCover;
      const update = (next: Partial<CopyFormState["articleCover"]>): void => {
        updateCopy({ articleCover: { ...copy, ...next } });
      };
      return (
        <div className="field-stack">
          <TextField
            id="article-eyebrow"
            label="Category"
            value={copy.eyebrow}
            onChange={(eyebrow) => {
              update({ eyebrow });
            }}
            maxLength={2_000}
            error={copyIssueMessage(failure, "eyebrow", "text", copy.eyebrow)}
          />
          <TextAreaField
            id="article-headline"
            label="Headline"
            value={copy.headline}
            onChange={(headline) => {
              update({ headline });
            }}
            required
            maxLength={2_000}
            rows={4}
            error={copyIssueMessage(failure, "headline", "text", copy.headline)}
          />
          <TextField
            id="article-attribution"
            label="Byline"
            value={copy.attribution}
            onChange={(attribution) => {
              update({ attribution });
            }}
            maxLength={2_000}
            error={copyIssueMessage(failure, "attribution", "text", copy.attribution)}
          />
        </div>
      );
    }
    case "tiktok-carousel-slide": {
      const copy = state.copy.tiktokCarouselSlide;
      const update = (next: Partial<CopyFormState["tiktokCarouselSlide"]>): void => {
        updateCopy({ tiktokCarouselSlide: { ...copy, ...next } });
      };
      return (
        <div className="field-stack">
          <FieldShell
            id="tiktok-slide-mode"
            label="Slide mode"
            hint="Use narrative for an argument or metric for one proof point."
          >
            <select
              id="tiktok-slide-mode"
              value={copy.mode}
              aria-describedby="tiktok-slide-mode-hint"
              onChange={(event) => {
                update({
                  mode: event.currentTarget
                    .value as CopyFormState["tiktokCarouselSlide"]["mode"],
                });
              }}
            >
              <option value="narrative">Narrative slide</option>
              <option value="metric">Metric slide</option>
            </select>
          </FieldShell>
          <div className="field-pair">
            <TextField
              id="tiktok-slide-number"
              label="Slide number"
              value={copy.slideNumber}
              onChange={(slideNumber) => {
                update({ slideNumber });
              }}
              maxLength={80}
              hint="Visible copy, for example 01 / 06."
              error={copyIssueMessage(
                failure,
                "slide-number",
                "text",
                copy.slideNumber,
              )}
            />
            <TextField
              id="tiktok-eyebrow"
              label="Series label"
              value={copy.eyebrow}
              onChange={(eyebrow) => {
                update({ eyebrow });
              }}
              maxLength={2_000}
              error={copyIssueMessage(failure, "eyebrow", "text", copy.eyebrow)}
            />
          </div>
          <TextAreaField
            id="tiktok-headline"
            label="Hook"
            value={copy.headline}
            onChange={(headline) => {
              update({ headline });
            }}
            required
            maxLength={2_000}
            rows={4}
            error={copyIssueMessage(failure, "headline", "text", copy.headline)}
          />
          {copy.mode === "narrative" ? (
            <TextAreaField
              id="tiktok-subtitle"
              label="Supporting copy"
              value={copy.subtitle}
              onChange={(subtitle) => {
                update({ subtitle });
              }}
              maxLength={2_000}
              rows={4}
              error={copyIssueMessage(failure, "subtitle", "text", copy.subtitle)}
            />
          ) : (
            <>
              <div className="field-pair field-pair-statistic">
                <TextField
                  id="tiktok-statistic-value"
                  label="Value"
                  value={copy.value}
                  onChange={(value) => {
                    update({ value });
                  }}
                  required
                  maxLength={80}
                  error={copyIssueMessage(
                    failure,
                    "carousel-statistic",
                    "value",
                    copy.value,
                  )}
                />
                <TextField
                  id="tiktok-statistic-trend"
                  label="Proof note"
                  value={copy.trend}
                  onChange={(trend) => {
                    update({ trend });
                  }}
                  maxLength={80}
                  error={copyIssueMessage(
                    failure,
                    "carousel-statistic",
                    "trend",
                    copy.trend,
                  )}
                />
              </div>
              <TextAreaField
                id="tiktok-statistic-label"
                label="Metric label"
                value={copy.label}
                onChange={(label) => {
                  update({ label });
                }}
                required
                maxLength={240}
                rows={3}
                error={copyIssueMessage(
                  failure,
                  "carousel-statistic",
                  "label",
                  copy.label,
                )}
              />
            </>
          )}
          <TextField
            id="tiktok-cta"
            label="Swipe cue or action"
            value={copy.cta}
            onChange={(cta) => {
              update({ cta });
            }}
            maxLength={2_000}
            error={copyIssueMessage(failure, "cta", "text", copy.cta)}
          />
          <TextField
            id="tiktok-footer"
            label="Footer"
            value={copy.footer}
            onChange={(footer) => {
              update({ footer });
            }}
            maxLength={2_000}
            error={copyIssueMessage(failure, "footer", "text", copy.footer)}
          />
        </div>
      );
    }
  }
}

function SectionHeading({
  number,
  title,
  id,
  note,
}: {
  number: string;
  title: string;
  id: string;
  note?: string;
}) {
  return (
    <div className="form-section-heading">
      <span aria-hidden="true">{number}</span>
      <h3 id={id}>{title}</h3>
      {note === undefined ? null : <small>{note}</small>}
    </div>
  );
}

function FieldShell({ id, label, hint, children }: FieldShellProps) {
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint === undefined ? null : (
        <small id={hintId} className="field-hint">
          {hint}
        </small>
      )}
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  required = false,
  maxLength,
  pattern,
  title,
  hint,
  autoComplete,
  error,
}: TextFieldProps) {
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  const errorId = error === undefined ? undefined : `${id}-error`;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required ? (
          <span className="required-mark" aria-hidden="true">
            required
          </span>
        ) : null}
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
        required={required}
        maxLength={maxLength}
        pattern={pattern}
        title={title}
        aria-describedby={describedBy}
        aria-invalid={error === undefined ? undefined : true}
        autoComplete={autoComplete}
      />
      {hint === undefined ? null : (
        <small id={hintId} className="field-hint">
          {hint}
        </small>
      )}
      {error === undefined ? null : (
        <small id={errorId} className="field-error">
          {error}
        </small>
      )}
    </div>
  );
}

function TextAreaField({
  id,
  label,
  value,
  onChange,
  required = false,
  maxLength,
  hint,
  rows = 3,
  error,
}: TextAreaFieldProps) {
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  const errorId = error === undefined ? undefined : `${id}-error`;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required ? (
          <span className="required-mark" aria-hidden="true">
            required
          </span>
        ) : null}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
        required={required}
        maxLength={maxLength}
        aria-describedby={describedBy}
        aria-invalid={error === undefined ? undefined : true}
        rows={rows}
      />
      {hint === undefined ? null : (
        <small id={hintId} className="field-hint">
          {hint}
        </small>
      )}
      {error === undefined ? null : (
        <small id={errorId} className="field-error">
          {error}
        </small>
      )}
    </div>
  );
}

function RangeField({
  id,
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  hint,
}: RangeFieldProps) {
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  return (
    <div className="range-field">
      <div className="range-label">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{value.toFixed(2)}</output>
      </div>
      <input
        id={id}
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          onChange(Number(event.currentTarget.value));
        }}
        aria-describedby={hintId}
      />
      {hint === undefined ? null : (
        <small id={hintId} className="field-hint">
          {hint}
        </small>
      )}
    </div>
  );
}

function ColorField({ id, label, value, onChange }: ColorFieldProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    onChange(event.currentTarget.value.toUpperCase());
  }

  return (
    <div className="color-field">
      <label htmlFor={id}>{label}</label>
      <div className="color-input-wrap">
        <input
          id={id}
          type="color"
          value={value}
          onChange={handleChange}
          aria-describedby={`${id}-value`}
        />
        <output id={`${id}-value`} htmlFor={id}>
          {value.toUpperCase()}
        </output>
      </div>
    </div>
  );
}

function FormFailureSummary({
  failure,
  summaryRef,
}: {
  failure: PreviewFailure;
  summaryRef: RefObject<HTMLDivElement | null>;
}) {
  const count = (failure.problems?.length ?? 0) + (failure.qualityIssues?.length ?? 0);
  return (
    <div
      className="form-failure-summary"
      id="preview-error-summary"
      role="alert"
      tabIndex={-1}
      ref={summaryRef}
    >
      <span>{failure.code}</span>
      <strong>{failure.title}</strong>
      <p>{failure.detail}</p>
      {count === 0 ? null : (
        <a href="#proof-ledger">
          Review {count} {count === 1 ? "issue" : "issues"} in the proof ledger
        </a>
      )}
    </div>
  );
}

function problemMessage(
  failure: PreviewFailure | null,
  path: string,
): string | undefined {
  return failure?.problems?.find(
    (problem) => problem.path === path || problem.path.startsWith(`${path}.`),
  )?.message;
}

function copyIssueMessage(
  failure: PreviewFailure | null,
  layerId: string,
  fieldName: string,
  value: string,
): string | undefined {
  const qualityIssue = failure?.qualityIssues?.find(
    (issue) => issue.layerId === layerId,
  );
  if (qualityIssue !== undefined) return qualityIssue.message;
  if (value.trim() !== "") return undefined;
  return failure?.problems?.find((problem) => problem.path.endsWith(`.${fieldName}`))
    ?.message;
}

function shortHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-8)}`;
}
