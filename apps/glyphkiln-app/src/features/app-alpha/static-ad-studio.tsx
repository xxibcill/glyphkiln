"use client";

import { useState } from "react";
import type { SyntheticEvent } from "react";
import { STATIC_AD_FORMATS, STATIC_AD_TEMPLATE_IDS } from "@glyphkiln/core/browser";
import type { StaticAdFormat, StaticAdTemplateId } from "@glyphkiln/core/browser";
import type { CampaignSummary } from "@/server/app-workflow";
import type {
  PreviewCatalog,
  PreviewFormState,
} from "@/features/project-preview/types";
import type { AppAlphaApi } from "./api-client";
import {
  STATIC_AD_BRIEF_FIELDS,
  STATIC_AD_LABELS,
  buildStaticAdCampaignDrafts,
  staticAdBriefFromForm,
  formText,
} from "./static-ad-brief";
import { StaticAdReviewBoard } from "./static-ad-review-board";

export function StaticAdStudio({
  api,
  workspaceId,
  brandSnapshotId,
  campaigns,
  formState,
  catalog,
  canEdit,
  canApprove,
  onChanged,
  onOpenDesign,
}: {
  api: AppAlphaApi;
  workspaceId: string;
  brandSnapshotId: string;
  campaigns: CampaignSummary[];
  formState: PreviewFormState;
  catalog: PreviewCatalog;
  canEdit: boolean;
  canApprove: boolean;
  onChanged: () => Promise<void>;
  onOpenDesign: (designId: string, revisionId?: string) => Promise<void>;
}) {
  const [families, setFamilies] = useState<StaticAdTemplateId[]>([
    "product-announcement",
    "benefit-proof",
  ]);
  const [formats, setFormats] = useState<StaticAdFormat[]>([
    "instagram-square",
    "instagram-portrait",
  ]);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const staticCampaigns = campaigns.filter(
    (campaign) => campaign.familyId === "static-ads",
  );
  const campaignId = selectedId || staticCampaigns[0]?.id;

  async function create(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy || !canEdit) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api.createStaticAdCampaign({
        workspaceId,
        brandSnapshotId,
        name: formText(form, "campaignName"),
        brief: formText(form, "brief"),
        campaignSeed: formText(form, "campaignName"),
        drafts: buildStaticAdCampaignDrafts(
          staticAdBriefFromForm(form),
          families,
          formats,
          formState,
          catalog,
        ),
      });
      if (!result.ok) throw new Error(result.error.detail);
      setSelectedId(result.value.id);
      setMessage(
        `Saved ${(families.length * formats.length).toString()} ads. Open the review board to check each size.`,
      );
      await onChanged();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not create the campaign.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="static-ad-studio" aria-label="Static ad campaigns">
      <header>
        <span className="eyebrow">STATIC ADS</span>
        <h2>One brief. A complete ad set.</h2>
        <p>
          Reuse the current saved brand and selected product, portrait, logo, and fonts.
          Enter verified copy below; each family keeps its own message structure.
        </p>
      </header>
      {canEdit && (
        <details>
          <summary>Create a static ad campaign</summary>
          <form
            onSubmit={(event) => {
              void create(event);
            }}
          >
            <fieldset disabled={busy}>
              <div className="static-ad-fields">
                <label>
                  Campaign name
                  <input name="campaignName" required maxLength={120} />
                </label>
                <label>
                  Campaign brief
                  <textarea
                    name="brief"
                    required
                    maxLength={4000}
                    placeholder="Audience, objective, product, and the promise you want to test"
                  />
                </label>
              </div>
              <fieldset>
                <legend>Ad families</legend>
                <div className="static-ad-options">
                  {STATIC_AD_TEMPLATE_IDS.map((id) => (
                    <label key={id}>
                      <input
                        type="checkbox"
                        checked={families.includes(id)}
                        onChange={(event) => {
                          setFamilies(
                            event.target.checked
                              ? [...families, id]
                              : families.filter((value) => value !== id),
                          );
                        }}
                      />
                      {STATIC_AD_LABELS[id]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>Sizes</legend>
                <div className="static-ad-options">
                  {STATIC_AD_FORMATS.map((id) => (
                    <label key={id}>
                      <input
                        type="checkbox"
                        checked={formats.includes(id)}
                        onChange={(event) => {
                          setFormats(
                            event.target.checked
                              ? [...formats, id]
                              : formats.filter((value) => value !== id),
                          );
                        }}
                      />
                      {catalog.formats.find((format) => format.id === id)?.label ?? id}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="static-ad-fields">
                {STATIC_AD_BRIEF_FIELDS.filter(([key]) => {
                  if (["quote", "customer"].includes(key))
                    return families.includes("testimonial-evidence");
                  if (
                    [
                      "leftLabel",
                      "rightLabel",
                      "comparisonLabel",
                      "leftValue",
                      "rightValue",
                    ].includes(key)
                  )
                    return families.includes("comparison");
                  if (["problem", "solution"].includes(key))
                    return families.includes("problem-solution");
                  if (key === "benefits") return families.includes("benefit-proof");
                  if (key === "deadline") return families.includes("offer-urgency");
                  return true;
                }).map(([key, label, maximum]) => (
                  <label key={key}>
                    {label}
                    <textarea
                      name={key}
                      maxLength={maximum}
                      required={key === "headline"}
                    />
                  </label>
                ))}
              </div>
              <p>
                Testimonials, comparisons, and offers need real evidence and terms. No
                endorsements, discounts, or deadlines are invented.
              </p>
              <button
                className="primary-action"
                disabled={families.length === 0 || formats.length === 0}
              >
                {busy
                  ? "Saving ad set…"
                  : `Create ${(families.length * formats.length).toString()} ads`}
              </button>
            </fieldset>
          </form>
        </details>
      )}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      <label>
        Review campaign
        <select
          value={campaignId}
          onChange={(event) => {
            setSelectedId(event.target.value);
          }}
        >
          <option value="">Choose a campaign</option>
          {staticCampaigns.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>
              {campaign.name}
            </option>
          ))}
        </select>
      </label>
      {campaignId && (
        <StaticAdReviewBoard
          key={`${workspaceId}:${campaignId}`}
          api={api}
          workspaceId={workspaceId}
          campaignId={campaignId}
          canEdit={canEdit}
          canApprove={canApprove}
          onOpenDesign={onOpenDesign}
        />
      )}
    </section>
  );
}
