import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  RefreshCw,
  Save,
  ShieldAlert,
  UploadCloud,
} from 'lucide-react';
import type {
  OnPageDraftContentPayload,
  OnPageOptimizationDraftRecord,
  OnPagePageAnalysisRecord,
  OnPageValidationRecord,
} from '../../types/onPage';
import { onPageService } from '../../services/onPageService';
import {
  approvalStatusLabel,
  approvalTextClass,
  formatShortTimestamp,
  lifecycleLabel,
  lifecycleTextClass,
  triggerFileDownload,
} from './onPageUiHelpers';

interface OnPageContentEditorSectionProps {
  projectId: string;
  pages: OnPagePageAnalysisRecord[];
  selectedPage: OnPagePageAnalysisRecord | null;
  drafts: OnPageOptimizationDraftRecord[];
  validations: OnPageValidationRecord[];
  canEdit: boolean;
  canApprove: boolean;
  busyAction: string | null;
  onSelectPage: (pageId: string) => void;
  onSaveDraft: (
    pageAnalysisId: string,
    proposed: OnPageDraftContentPayload,
    changeSummary: string,
  ) => void;
  onApproveDraft: (draftId: string, decision: 'approved' | 'rejected') => void;
  onMarkAppliedExternally: (
    draftId: string,
    channel: string,
    note: string,
  ) => void;
  onVerifyDraft: (draftId: string) => void;
}

export function OnPageContentEditorSection({
  projectId,
  pages,
  selectedPage,
  drafts,
  validations,
  canEdit,
  canApprove,
  busyAction,
  onSelectPage,
  onSaveDraft,
  onApproveDraft,
  onMarkAppliedExternally,
  onVerifyDraft,
}: OnPageContentEditorSectionProps) {
  const pageDrafts = selectedPage
    ? drafts
        .filter((d) => d.pageAnalysisId === selectedPage.id || d.pageUrl === selectedPage.url)
        .sort((a, b) => b.versionNumber - a.versionNumber)
    : [];
  const latestDraft = pageDrafts[0] ?? null;
  const latestValidation = latestDraft
    ? validations.find((v) => v.draftId === latestDraft.id) ?? null
    : null;

  const [proposedTitle, setProposedTitle] = useState('');
  const [proposedMeta, setProposedMeta] = useState('');
  const [proposedH1, setProposedH1] = useState('');
  const [proposedPrimaryKw, setProposedPrimaryKw] = useState('');
  const [proposedSchemaTypesText, setProposedSchemaTypesText] = useState('');
  const [proposedSchemaJsonLd, setProposedSchemaJsonLd] = useState('');
  const [proposedContentNotes, setProposedContentNotes] = useState('');
  const [changeSummary, setChangeSummary] = useState('');
  const [applyChannel, setApplyChannel] = useState('manual_cms_update');
  const [applyNote, setApplyNote] = useState('');
  const [showApplyForm, setShowApplyForm] = useState(false);

  useEffect(() => {
    if (!selectedPage) return;
    if (latestDraft) {
      setProposedTitle(latestDraft.proposed.proposedTitle);
      setProposedMeta(latestDraft.proposed.proposedMetaDescription);
      setProposedH1(latestDraft.proposed.proposedH1);
      setProposedPrimaryKw(latestDraft.proposed.proposedPrimaryKeyword ?? '');
      setProposedSchemaTypesText(latestDraft.proposed.proposedSchemaTypes.join(', '));
      setProposedSchemaJsonLd(latestDraft.proposed.proposedSchemaJsonLd);
      setProposedContentNotes(latestDraft.proposed.proposedContentNotes);
    } else {
      setProposedTitle(selectedPage.title ?? '');
      setProposedMeta(selectedPage.metaDescription ?? '');
      setProposedH1(selectedPage.h1 ?? '');
      setProposedPrimaryKw(
        selectedPage.keywordContext.existingPrimaryKeyword ??
          selectedPage.keywordContext.recommendedPrimaryKeyword ??
          '',
      );
      setProposedSchemaTypesText(
        selectedPage.suggestedSchemaTypes.length > 0
          ? selectedPage.suggestedSchemaTypes.join(', ')
          : selectedPage.htmlExtract.detectedSchemaTypes.join(', '),
      );
      setProposedSchemaJsonLd('');
      setProposedContentNotes(
        selectedPage.suggestedSubtopics.length > 0
          ? `Recommended subtopics to cover: ${selectedPage.suggestedSubtopics.join(', ')}`
          : '',
      );
    }
    setChangeSummary('');
    setShowApplyForm(false);
  }, [selectedPage?.id, latestDraft?.id]);

  if (!selectedPage) {
    return (
      <div className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-8 text-center text-xs text-[var(--text-muted)]">
        Run On-Page Analysis first to edit side-by-side optimization drafts.
      </div>
    );
  }

  const handleSave = () => {
    const schemaTypes = proposedSchemaTypesText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const imageAlts = selectedPage.htmlExtract.images
      .filter((img) => !img.hasAltAttribute || img.isEmptyAlt)
      .slice(0, 10)
      .map((img) => ({
        src: img.src,
        currentAlt: img.alt,
        proposedAlt: img.suggestedAlt || 'Descriptive image alt text',
      }));

    onSaveDraft(
      selectedPage.id,
      {
        proposedTitle,
        proposedMetaDescription: proposedMeta,
        proposedH1,
        proposedHeadings: selectedPage.htmlExtract.headings,
        proposedPrimaryKeyword: proposedPrimaryKw.trim() || null,
        proposedSecondaryKeywords: selectedPage.keywordContext.secondaryKeywords,
        proposedImageAlts: imageAlts,
        proposedSchemaJsonLd,
        proposedSchemaTypes: schemaTypes,
        proposedContentNotes,
        proposedInternalLinks: [],
      },
      changeSummary.trim() || `Updated on-page draft for ${selectedPage.slug}`,
    );
  };

  return (
    <div className="space-y-5">
      {/* Safety Banner + Page Picker */}
      <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <label
              htmlFor="onpage-editor-page-select"
              className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
            >
              Side-by-Side Content Optimization Draft Editor
            </label>
            <select
              id="onpage-editor-page-select"
              value={selectedPage.id}
              onChange={(e) => onSelectPage(e.target.value)}
              className="mt-1 w-full max-w-xl rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
            >
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.slug} — {p.title || '(Missing title)'}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-[11px] text-[var(--text-secondary)] max-w-md">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#7047EB] dark:text-[#22D3EE]" />
            <span>
              Planning draft workspace only — saving or approving a draft never modifies your live website automatically.
            </span>
          </div>
        </div>
      </section>

      {/* Side-by-Side Comparison: Original Page Data | Proposed Optimized Data */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* LEFT: Original Crawled Page Data */}
        <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-3">
            <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
              Original Page Data (Crawled)
            </h3>
            <span className="font-mono text-[11px] text-[var(--text-muted)]">
              Crawl {selectedPage.crawlId}
            </span>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Current Title Tag ({selectedPage.title?.length ?? 0} chars)
            </p>
            <p className="mt-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-2.5 text-xs text-[var(--text-primary)]">
              {selectedPage.title || '(Missing title tag)'}
            </p>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Current Meta Description ({selectedPage.metaDescription?.length ?? 0} chars)
            </p>
            <p className="mt-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-2.5 text-xs text-[var(--text-secondary)]">
              {selectedPage.metaDescription || '(Missing meta description)'}
            </p>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Current Primary H1
            </p>
            <p className="mt-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-2.5 text-xs text-[var(--text-primary)]">
              {selectedPage.h1 || '(Missing H1)'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-2.5">
              <p className="text-[11px] text-[var(--text-muted)]">Detected Schema</p>
              <p className="mt-0.5 font-medium text-[var(--text-primary)]">
                {selectedPage.htmlExtract.detectedSchemaTypes.join(', ') || 'None'}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-2.5">
              <p className="text-[11px] text-[var(--text-muted)]">Missing Image Alts</p>
              <p className="mt-0.5 font-mono font-semibold text-[var(--text-primary)]">
                {selectedPage.htmlExtract.imagesMissingAlt} image(s)
              </p>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Extracted Visible Body Copy Excerpt (
              {selectedPage.htmlExtract.wordCount !== null
                ? `${selectedPage.htmlExtract.wordCount} words`
                : 'HTML snapshot unavailable'}
              )
            </p>
            <p className="mt-1 max-h-40 overflow-y-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-2.5 text-xs leading-relaxed text-[var(--text-secondary)]">
              {selectedPage.htmlExtract.bodyTextExcerpt ||
                'No HTML body snapshot was captured for this crawl record.'}
            </p>
          </div>
        </section>

        {/* RIGHT: Proposed Optimized Data (Editable Draft) */}
        <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 space-y-3.5">
          <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-3">
            <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
              Proposed Optimized Data (Versioned Draft)
            </h3>
            <span className="font-mono text-[11px] text-[#7047EB] dark:text-[#22D3EE]">
              {latestDraft ? `Latest: v${latestDraft.versionNumber}` : 'New Draft (v1)'}
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label
                htmlFor="draft-proposed-title"
                className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
              >
                Proposed Title Tag
              </label>
              <span className="font-mono text-[11px] text-[var(--text-muted)]">
                {proposedTitle.trim().length} / 60 chars
              </span>
            </div>
            <input
              id="draft-proposed-title"
              type="text"
              value={proposedTitle}
              onChange={(e) => setProposedTitle(e.target.value)}
              disabled={!canEdit}
              className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none disabled:opacity-60"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label
                htmlFor="draft-proposed-meta"
                className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
              >
                Proposed Meta Description
              </label>
              <span className="font-mono text-[11px] text-[var(--text-muted)]">
                {proposedMeta.trim().length} / 160 chars
              </span>
            </div>
            <textarea
              id="draft-proposed-meta"
              rows={2}
              value={proposedMeta}
              onChange={(e) => setProposedMeta(e.target.value)}
              disabled={!canEdit}
              className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none disabled:opacity-60"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="draft-proposed-h1"
                className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
              >
                Proposed H1 Heading
              </label>
              <input
                id="draft-proposed-h1"
                type="text"
                value={proposedH1}
                onChange={(e) => setProposedH1(e.target.value)}
                disabled={!canEdit}
                className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="draft-proposed-kw"
                className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
              >
                Target Primary Keyword
              </label>
              <input
                id="draft-proposed-kw"
                type="text"
                value={proposedPrimaryKw}
                onChange={(e) => setProposedPrimaryKw(e.target.value)}
                disabled={!canEdit}
                placeholder="Verified primary keyword"
                className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none disabled:opacity-60"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="draft-schema-types"
              className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
            >
              Proposed Schema Types (comma-separated)
            </label>
            <input
              id="draft-schema-types"
              type="text"
              value={proposedSchemaTypesText}
              onChange={(e) => setProposedSchemaTypesText(e.target.value)}
              disabled={!canEdit}
              placeholder="Organization, Service, BreadcrumbList"
              className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none disabled:opacity-60"
            />
          </div>

          <div>
            <label
              htmlFor="draft-schema-json"
              className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
            >
              Proposed JSON-LD Payload (optional, validated JSON)
            </label>
            <textarea
              id="draft-schema-json"
              rows={2}
              value={proposedSchemaJsonLd}
              onChange={(e) => setProposedSchemaJsonLd(e.target.value)}
              disabled={!canEdit}
              placeholder='{"@context":"https://schema.org","@type":"Service","name":"..."}'
              className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none disabled:opacity-60"
            />
          </div>

          <div>
            <label
              htmlFor="draft-content-notes"
              className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
            >
              Content &amp; Subtopic Optimization Notes
            </label>
            <textarea
              id="draft-content-notes"
              rows={2}
              value={proposedContentNotes}
              onChange={(e) => setProposedContentNotes(e.target.value)}
              disabled={!canEdit}
              className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none disabled:opacity-60"
            />
          </div>

          <div className="flex flex-col gap-2 border-t border-[var(--border-hairline)] pt-3 sm:flex-row sm:items-center">
            <input
              type="text"
              value={changeSummary}
              onChange={(e) => setChangeSummary(e.target.value)}
              disabled={!canEdit}
              placeholder="Change summary for version history…"
              aria-label="Draft change summary"
              className="flex-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none disabled:opacity-60"
            />
            <button
              type="button"
              disabled={!canEdit || busyAction !== null}
              onClick={handleSave}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#7047EB] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5E38D1] cursor-pointer disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              <span>
                {busyAction === 'save-draft'
                  ? 'Saving Version…'
                  : `Save Draft v${(latestDraft?.versionNumber ?? 0) + 1}`}
              </span>
            </button>
          </div>
        </section>
      </div>

      {/* Saved Draft Lifecycle, Approval, External Application & Fresh-Crawl Verification */}
      {latestDraft && (
        <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
                Active Draft v{latestDraft.versionNumber} Lifecycle &amp; Fresh Crawl Verification
              </h3>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                Approval:{' '}
                <span className={approvalTextClass(latestDraft.approvalStatus)}>
                  {approvalStatusLabel(latestDraft.approvalStatus)}
                </span>{' '}
                · Lifecycle:{' '}
                <span className={lifecycleTextClass(latestDraft.lifecycleStatus)}>
                  {lifecycleLabel(latestDraft.lifecycleStatus)}
                </span>{' '}
                · Saved {formatShortTimestamp(latestDraft.updatedAt)} by {latestDraft.updatedBy}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canApprove && latestDraft.approvalStatus === 'pending_review' && (
                <>
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => onApproveDraft(latestDraft.id, 'approved')}
                    className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Approve Draft v{latestDraft.versionNumber}</span>
                  </button>
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => onApproveDraft(latestDraft.id, 'rejected')}
                    className="rounded-xl border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:border-rose-500/45 cursor-pointer disabled:opacity-50"
                  >
                    Reject Draft
                  </button>
                </>
              )}

              {canEdit &&
                latestDraft.approvalStatus === 'approved' &&
                latestDraft.lifecycleStatus !== 'applied_externally' &&
                latestDraft.lifecycleStatus !== 'verified' && (
                  <button
                    type="button"
                    onClick={() => setShowApplyForm((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:border-[#7047EB]/50 cursor-pointer"
                  >
                    <UploadCloud className="h-3.5 w-3.5" />
                    <span>Mark Applied Externally</span>
                  </button>
                )}

              {canEdit && (
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => onVerifyDraft(latestDraft.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-semibold text-[#7047EB] dark:text-[#22D3EE] hover:border-[#7047EB]/50 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>
                    {busyAction === `verify:${latestDraft.id}`
                      ? 'Verifying…'
                      : 'Verify Against Latest Crawl'}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() =>
                  triggerFileDownload(
                    onPageService.getDraftHandoffUrl(
                      projectId,
                      latestDraft.id,
                      'markdown',
                    ),
                    `onpage-draft-v${latestDraft.versionNumber}.md`,
                  )
                }
                className="inline-flex items-center gap-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Handoff MD</span>
              </button>
            </div>
          </div>

          {/* Inline Confirmation Form for Mark Applied Externally */}
          {showApplyForm && (
            <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4 space-y-3">
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                Confirm External Implementation (Live Website Updated Outside Rovix AI)
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <select
                  aria-label="External update channel"
                  value={applyChannel}
                  onChange={(e) => setApplyChannel(e.target.value)}
                  className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)]"
                >
                  <option value="manual_cms_update">Manual CMS Update</option>
                  <option value="engineering_pr">Engineering Pull Request</option>
                  <option value="wordpress_manual">WordPress Editor</option>
                  <option value="webflow_manual">Webflow Designer</option>
                  <option value="shopify_manual">Shopify Admin</option>
                </select>
                <input
                  type="text"
                  value={applyNote}
                  onChange={(e) => setApplyNote(e.target.value)}
                  placeholder="Optional deployment / ticket reference…"
                  aria-label="External application note"
                  className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)]"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => {
                    onMarkAppliedExternally(latestDraft.id, applyChannel, applyNote);
                    setShowApplyForm(false);
                  }}
                  className="rounded-xl bg-[#7047EB] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#5E38D1] cursor-pointer disabled:opacity-50"
                >
                  Confirm Applied Externally
                </button>
                <button
                  type="button"
                  onClick={() => setShowApplyForm(false)}
                  className="rounded-xl border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Field-by-field Verification Diff from Fresh Crawl */}
          {latestValidation && (
            <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold text-[var(--text-primary)]">
                  Latest Crawl Verification: {latestValidation.summary}
                </p>
                <span className="font-mono text-[11px] text-[var(--text-muted)]">
                  {formatShortTimestamp(latestValidation.validatedAt)}
                </span>
              </div>
              <div className="divide-y divide-[var(--border-hairline)]">
                {latestValidation.diffs.map((d) => (
                  <div
                    key={d.field}
                    className="grid grid-cols-1 gap-2 py-2 text-xs md:grid-cols-12"
                  >
                    <div className="md:col-span-2 font-mono font-semibold uppercase text-[var(--text-primary)]">
                      {d.field.replace(/_/g, ' ')}
                    </div>
                    <div className="md:col-span-4 text-[var(--text-secondary)]">
                      Expected: {d.expected}
                    </div>
                    <div className="md:col-span-4 text-[var(--text-muted)]">
                      Observed: {d.observedInCrawl}
                    </div>
                    <div
                      className={`md:col-span-2 font-semibold md:text-right ${
                        d.matched
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {d.matched ? 'Matched' : 'Not Reflected'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
