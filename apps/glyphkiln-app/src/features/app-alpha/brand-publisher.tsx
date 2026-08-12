"use client";

import { useState } from "react";
import type { SyntheticEvent } from "react";

import type { BrandSnapshotDraft } from "@/server/app-workflow";
import type {
  BrandTypographyFormState,
  EditorSelectableResource,
  PreviewFormState,
} from "@/features/project-preview/types";

import { buildBrandSnapshotDraft } from "./manual-state";

export type BrandPublishInput = {
  name: string;
  snapshot: BrandSnapshotDraft;
};

type BrandPublisherProps = {
  initialState: PreviewFormState;
  fixedName?: string;
  nextVersion?: string;
  isPublishing: boolean;
  resources?: readonly EditorSelectableResource[];
  onCancel?: () => void;
  onPublish: (input: BrandPublishInput) => Promise<void>;
};

export function BrandPublisher({
  initialState,
  fixedName,
  nextVersion,
  isPublishing,
  resources = [],
  onCancel,
  onPublish,
}: BrandPublisherProps) {
  const [draft, setDraft] = useState(initialState);
  const fontFaces = resources.filter(
    (resource): resource is Extract<EditorSelectableResource, { kind: "font" }> =>
      resource.kind === "font",
  );
  const fontFamilies = uniqueSortedStrings([
    "Inter",
    draft.brand.typography.headlineFamily,
    draft.brand.typography.bodyFamily,
    draft.brand.typography.monospaceFamily,
    ...fontFaces.map((font) => font.family),
  ]);

  function updateBrand(update: Partial<PreviewFormState["brand"]>): void {
    setDraft((current) => ({
      ...current,
      brand: { ...current.brand, ...update },
    }));
  }

  function updateProcedure(
    proceduralStyle: PreviewFormState["composition"]["proceduralStyle"],
  ): void {
    setDraft((current) => ({
      ...current,
      composition: { ...current.composition, proceduralStyle },
    }));
  }

  function updateTypography(update: Partial<BrandTypographyFormState>): void {
    setDraft((current) => ({
      ...current,
      brand: {
        ...current.brand,
        typography: { ...current.brand.typography, ...update },
      },
    }));
  }

  function updateTypographyRole(
    role: "display" | "body" | "label",
    update: Partial<BrandTypographyFormState["display"]>,
  ): void {
    setDraft((current) => ({
      ...current,
      brand: {
        ...current.brand,
        typography: {
          ...current.brand.typography,
          [role]: { ...current.brand.typography[role], ...update },
        },
      },
    }));
  }

  function submit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    void onPublish({
      name: fixedName ?? draft.brand.name.trim(),
      snapshot: buildBrandSnapshotDraft(draft),
    });
  }

  return (
    <section className="brand-station" aria-labelledby="brand-station-title">
      <header className="brand-station-heading">
        <div>
          <p className="section-kicker">Brand press</p>
          <h2 id="brand-station-title">
            {fixedName === undefined
              ? "Publish the first immutable snapshot"
              : "Publish a new immutable version"}
          </h2>
        </div>
        <span>{nextVersion ?? "VERSION / SERVER ASSIGNED"}</span>
      </header>
      <p className="brand-station-intro">
        A published snapshot is append-only. Existing revisions continue to resolve the
        exact values they were saved with.
      </p>

      <form className="brand-publish-form" onSubmit={submit}>
        <div className="brand-form-lead">
          <div className="field">
            <label htmlFor="published-brand-name">Brand kit name</label>
            <input
              id="published-brand-name"
              value={fixedName ?? draft.brand.name}
              readOnly={fixedName !== undefined}
              required
              maxLength={120}
              autoComplete="organization"
              onChange={(event) => {
                updateBrand({ name: event.currentTarget.value });
              }}
            />
            <span className="field-hint">
              {fixedName === undefined
                ? "The kit keeps this name across later snapshot versions."
                : "The existing kit name remains fixed."}
            </span>
          </div>

          <fieldset className="color-fieldset">
            <legend>Core palette</legend>
            <div className="color-grid">
              <BrandColor
                id="publish-primary"
                label="Primary"
                value={draft.brand.primary}
                onChange={(primary) => {
                  updateBrand({ primary });
                }}
              />
              <BrandColor
                id="publish-secondary"
                label="Secondary"
                value={draft.brand.secondary}
                onChange={(secondary) => {
                  updateBrand({ secondary });
                }}
              />
              <BrandColor
                id="publish-accent"
                label="Accent"
                value={draft.brand.accent}
                onChange={(accent) => {
                  updateBrand({ accent });
                }}
              />
            </div>
          </fieldset>
        </div>

        <details className="advanced-disclosure brand-advanced">
          <summary>Typography, surfaces, density, and safe area</summary>
          <div className="brand-advanced-grid">
            <fieldset className="brand-typography-fieldset">
              <legend>Immutable typography contract</legend>
              <p className="field-hint">
                Families come from admitted font metadata. Select the matching font
                faces on each design so Core receives their exact bytes.
              </p>
              <div className="field-pair">
                <BrandFontFamily
                  id="publish-headline-family"
                  label="Headline family"
                  value={draft.brand.typography.headlineFamily}
                  families={fontFamilies}
                  onChange={(headlineFamily) => {
                    updateTypography({ headlineFamily });
                  }}
                />
                <BrandFontFamily
                  id="publish-body-family"
                  label="Body family"
                  value={draft.brand.typography.bodyFamily}
                  families={fontFamilies}
                  onChange={(bodyFamily) => {
                    updateTypography({ bodyFamily });
                  }}
                />
              </div>
              <BrandFontFamily
                id="publish-monospace-family"
                label="Monospace family"
                value={draft.brand.typography.monospaceFamily}
                families={fontFamilies}
                onChange={(monospaceFamily) => {
                  updateTypography({ monospaceFamily });
                }}
              />
              <label className="brand-role-toggle">
                <input
                  type="checkbox"
                  checked={draft.brand.typography.rolesEnabled}
                  onChange={(event) => {
                    updateTypography({ rolesEnabled: event.currentTarget.checked });
                  }}
                />
                <span>
                  <strong>Publish bounded typography roles</strong>
                  <small>
                    Display, body, and label values stay inside Core schema limits.
                  </small>
                </span>
              </label>
              {draft.brand.typography.rolesEnabled ? (
                <div className="typography-role-grid">
                  <TypographyRoleControls
                    id="display"
                    label="Display"
                    role={draft.brand.typography.display}
                    weights={fontWeights(
                      fontFaces,
                      draft.brand.typography.headlineFamily,
                      draft.brand.typography.display.weight,
                    )}
                    onChange={(update) => {
                      updateTypographyRole("display", update);
                    }}
                  />
                  <TypographyRoleControls
                    id="body"
                    label="Body"
                    role={draft.brand.typography.body}
                    weights={fontWeights(
                      fontFaces,
                      draft.brand.typography.bodyFamily,
                      draft.brand.typography.body.weight,
                    )}
                    onChange={(update) => {
                      updateTypographyRole("body", update);
                    }}
                  />
                  <TypographyRoleControls
                    id="label"
                    label="Label"
                    role={draft.brand.typography.label}
                    weights={fontWeights(
                      fontFaces,
                      draft.brand.typography.bodyFamily,
                      draft.brand.typography.label.weight,
                    )}
                    onChange={(update) => {
                      updateTypographyRole("label", update);
                    }}
                  />
                </div>
              ) : null}
            </fieldset>
            <fieldset className="color-fieldset">
              <legend>Light theme</legend>
              <div className="color-grid color-grid-wide">
                <BrandColor
                  id="publish-paper"
                  label="Background"
                  value={draft.brand.paper}
                  onChange={(paper) => {
                    updateBrand({ paper });
                  }}
                />
                <BrandColor
                  id="publish-surface"
                  label="Surface"
                  value={draft.brand.surface}
                  onChange={(surface) => {
                    updateBrand({ surface });
                  }}
                />
                <BrandColor
                  id="publish-ink"
                  label="Text"
                  value={draft.brand.ink}
                  onChange={(ink) => {
                    updateBrand({ ink });
                  }}
                />
                <BrandColor
                  id="publish-muted-ink"
                  label="Muted text"
                  value={draft.brand.mutedInk}
                  onChange={(mutedInk) => {
                    updateBrand({ mutedInk });
                  }}
                />
              </div>
            </fieldset>

            <fieldset className="color-fieldset">
              <legend>Dark theme</legend>
              <div className="color-grid color-grid-wide">
                <BrandColor
                  id="publish-dark-background"
                  label="Background"
                  value={draft.brand.darkBackground}
                  onChange={(darkBackground) => {
                    updateBrand({ darkBackground });
                  }}
                />
                <BrandColor
                  id="publish-dark-surface"
                  label="Surface"
                  value={draft.brand.darkSurface}
                  onChange={(darkSurface) => {
                    updateBrand({ darkSurface });
                  }}
                />
                <BrandColor
                  id="publish-dark-text"
                  label="Text"
                  value={draft.brand.darkText}
                  onChange={(darkText) => {
                    updateBrand({ darkText });
                  }}
                />
                <BrandColor
                  id="publish-dark-muted"
                  label="Muted text"
                  value={draft.brand.darkMutedText}
                  onChange={(darkMutedText) => {
                    updateBrand({ darkMutedText });
                  }}
                />
              </div>
            </fieldset>

            <div className="field-pair">
              <div className="field">
                <label htmlFor="publish-density">Visual density</label>
                <select
                  id="publish-density"
                  value={draft.brand.visualDensity}
                  onChange={(event) => {
                    updateBrand({
                      visualDensity: event.currentTarget
                        .value as PreviewFormState["brand"]["visualDensity"],
                    });
                  }}
                >
                  <option value="quiet">Quiet</option>
                  <option value="balanced">Balanced</option>
                  <option value="dense">Dense</option>
                </select>
              </div>
              <div className="range-field">
                <div className="range-label">
                  <label htmlFor="publish-safe-area">Safe-area inset</label>
                  <output>{draft.brand.safeArea.toFixed(2)}</output>
                </div>
                <input
                  id="publish-safe-area"
                  type="range"
                  min={0}
                  max={0.2}
                  step={0.01}
                  value={draft.brand.safeArea}
                  onChange={(event) => {
                    updateBrand({ safeArea: Number(event.currentTarget.value) });
                  }}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="publish-procedure">Preferred procedural style</label>
              <select
                id="publish-procedure"
                value={draft.composition.proceduralStyle}
                onChange={(event) => {
                  updateProcedure(
                    event.currentTarget
                      .value as PreviewFormState["composition"]["proceduralStyle"],
                  );
                }}
              >
                <option value="flow-field">Flow field</option>
                <option value="layered-waves">Layered waves</option>
                <option value="topographic-contours">Topographic contours</option>
                <option value="recursive-subdivision">Recursive subdivision</option>
              </select>
            </div>
          </div>
        </details>

        <div className="brand-publish-actions">
          <div>
            <strong>Publication is permanent</strong>
            <span>
              Snapshot identity, version, and hash are assigned after validation.
            </span>
          </div>
          {onCancel === undefined ? null : (
            <button
              className="quiet-action"
              type="button"
              disabled={isPublishing}
              onClick={onCancel}
            >
              Keep current snapshot
            </button>
          )}
          <button className="primary-action" type="submit" disabled={isPublishing}>
            {isPublishing ? "Publishing snapshot…" : "Publish immutable snapshot"}
          </button>
        </div>
      </form>
    </section>
  );
}

function BrandFontFamily({
  id,
  label,
  value,
  families,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  families: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
      >
        {families.map((family) => (
          <option key={family} value={family}>
            {family}
          </option>
        ))}
      </select>
    </div>
  );
}

function TypographyRoleControls({
  id,
  label,
  role,
  weights,
  onChange,
}: {
  id: string;
  label: string;
  role: BrandTypographyFormState["display"];
  weights: readonly number[];
  onChange: (update: Partial<BrandTypographyFormState["display"]>) => void;
}) {
  return (
    <fieldset>
      <legend>{label}</legend>
      <div className="field">
        <label htmlFor={`publish-${id}-weight`}>Weight</label>
        <select
          id={`publish-${id}-weight`}
          value={role.weight}
          onChange={(event) => {
            onChange({ weight: Number(event.currentTarget.value) });
          }}
        >
          {weights.map((weight) => (
            <option key={weight} value={weight}>
              {weight}
            </option>
          ))}
        </select>
      </div>
      <BrandNumberRange
        id={`publish-${id}-line-height`}
        label="Line height"
        value={role.lineHeight}
        minimum={0.85}
        maximum={1.8}
        step={0.01}
        onChange={(lineHeight) => {
          onChange({ lineHeight });
        }}
      />
      <BrandNumberRange
        id={`publish-${id}-tracking`}
        label="Tracking"
        value={role.tracking}
        minimum={-0.05}
        maximum={0.2}
        step={0.005}
        onChange={(tracking) => {
          onChange({ tracking });
        }}
      />
    </fieldset>
  );
}

function BrandNumberRange({
  id,
  label,
  value,
  minimum,
  maximum,
  step,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="range-field">
      <div className="range-label">
        <label htmlFor={id}>{label}</label>
        <output>{value.toFixed(3)}</output>
      </div>
      <input
        id={id}
        type="range"
        min={minimum}
        max={maximum}
        step={step}
        value={value}
        onChange={(event) => {
          onChange(Number(event.currentTarget.value));
        }}
      />
    </div>
  );
}

function fontWeights(
  fonts: readonly Extract<EditorSelectableResource, { kind: "font" }>[],
  family: string,
  selectedWeight: number,
): number[] {
  return [
    ...new Set([
      selectedWeight,
      ...(family === "Inter" ? [400, 500, 600, 700, 800] : []),
      ...fonts.filter((font) => font.family === family).map((font) => font.weight),
    ]),
  ].sort((left, right) => left - right);
}

function uniqueSortedStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
}

function BrandColor({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="color-field">
      <label htmlFor={id}>{label}</label>
      <div className="color-input-wrap">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(event) => {
            onChange(event.currentTarget.value.toUpperCase());
          }}
        />
        <output>{value}</output>
      </div>
    </div>
  );
}
