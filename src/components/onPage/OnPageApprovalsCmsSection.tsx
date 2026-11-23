import { useState } from 'react';
import { Lock, Trash2 } from 'lucide-react';
import type {
  CmsConnectionRecord,
  CmsPlatform,
  CmsPlatformDescriptor,
  OnPageApprovalRecord,
  OnPageValidationRecord,
} from '../../types/onPage';
import {
  approvalStatusLabel,
  approvalTextClass,
  cmsStatusLabel,
  formatShortTimestamp,
} from './onPageUiHelpers';

interface OnPageApprovalsCmsSectionProps {
  projectWebsite: string;
  approvals: OnPageApprovalRecord[];
  validations: OnPageValidationRecord[];
  cmsConnections: CmsConnectionRecord[];
  cmsPlatforms: CmsPlatformDescriptor[];
  canManageCms: boolean;
  busyAction: string | null;
  onConfigureCms: (
    platform: CmsPlatform,
    siteUrl: string,
    credentials: Record<string, string>,
  ) => void;
  onRemoveCms: (platform: CmsPlatform) => void;
}

export function OnPageApprovalsCmsSection({
  projectWebsite,
  approvals,
  validations,
  cmsConnections,
  cmsPlatforms,
  canManageCms,
  busyAction,
  onConfigureCms,
  onRemoveCms,
}: OnPageApprovalsCmsSectionProps) {
  const [editingPlatform, setEditingPlatform] = useState<CmsPlatform | null>(
    null,
  );
  const [siteUrl, setSiteUrl] = useState(projectWebsite);
  const [credValues, setCredValues] = useState<Record<string, string>>({});

  const openConfigForm = (platform: CmsPlatform, existing?: CmsConnectionRecord) => {
    setEditingPlatform(platform);
    setSiteUrl(existing?.siteUrl || projectWebsite);
    setCredValues({});
  };

  return (
    <div className="space-y-5">
      {/* Extensible CMS Adapter Readiness (Honest Status, AES-256-GCM Encrypted Vault, Zero Simulated Publishing) */}
      <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 space-y-4">
        <div>
          <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
            CMS Integration Readiness (WordPress, Webflow, Shopify)
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Credentials are encrypted at rest with AES-256-GCM and SSRF-validated. Auto-publishing is permanently disabled; all live updates require explicit human approval or manual handoff export.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {cmsPlatforms.map((desc) => {
            const conn =
              cmsConnections.find((c) => c.platform === desc.platform) ?? null;
            const status = conn?.status ?? 'not_configured';
            const isEditing = editingPlatform === desc.platform;

            return (
              <div
                key={desc.platform}
                className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)]/55 p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold text-[var(--text-primary)]">
                      {desc.label}
                    </h3>
                    <p
                      className={`mt-0.5 font-mono text-[11px] font-semibold ${
                        status === 'connected'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : status === 'configured_unverified'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {cmsStatusLabel(status)}
                    </p>
                  </div>
                  <Lock
                    className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]"
                    aria-hidden="true"
                  />
                </div>

                {conn && (
                  <p className="truncate font-mono text-[11px] text-[var(--text-secondary)]">
                    Site: {conn.siteUrl}
                  </p>
                )}

                <ul className="space-y-1 text-[11px] text-[var(--text-muted)]">
                  {desc.capabilities.map((cap, idx) => (
                    <li key={idx}>• {cap}</li>
                  ))}
                </ul>

                {isEditing ? (
                  <div className="space-y-2 border-t border-[var(--border-hairline)] pt-3">
                    <input
                      type="url"
                      value={siteUrl}
                      onChange={(e) => setSiteUrl(e.target.value)}
                      placeholder="https://example.com"
                      aria-label={`${desc.platform} site URL`}
                      className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                    />
                    {desc.credentialFields.map((field) => (
                      <input
                        key={field.key}
                        type={field.secret ? 'password' : 'text'}
                        value={credValues[field.key] ?? ''}
                        onChange={(e) =>
                          setCredValues((prev) => ({
                            ...prev,
                            [field.key]: e.target.value,
                          }))
                        }
                        placeholder={field.label}
                        aria-label={field.label}
                        className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                      />
                    ))}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={busyAction !== null}
                        onClick={() => {
                          onConfigureCms(desc.platform, siteUrl, credValues);
                          setEditingPlatform(null);
                        }}
                        className="rounded-lg bg-[#7047EB] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#5E38D1] cursor-pointer disabled:opacity-50"
                      >
                        Save Encrypted
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingPlatform(null)}
                        className="rounded-lg border border-[var(--border-hairline)] px-2.5 py-1.5 text-[11px] text-[var(--text-muted)] cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 border-t border-[var(--border-hairline)] pt-3">
                    <button
                      type="button"
                      disabled={!canManageCms || busyAction !== null}
                      onClick={() => openConfigForm(desc.platform, conn ?? undefined)}
                      className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-primary)] hover:border-[#7047EB]/45 cursor-pointer disabled:opacity-50"
                    >
                      {conn ? 'Update Credentials' : 'Configure Adapter'}
                    </button>
                    {conn && canManageCms && (
                      <button
                        type="button"
                        disabled={busyAction !== null}
                        onClick={() => onRemoveCms(desc.platform)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-2.5 py-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:border-rose-500/45 cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Immutable Approval Audit Log + Fresh-Crawl Verification History */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
          <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
            Approval Audit History ({approvals.length})
          </h3>
          {approvals.length === 0 ? (
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              No approval decisions recorded yet.
            </p>
          ) : (
            <div className="mt-3 divide-y divide-[var(--border-hairline)]">
              {approvals.slice(0, 40).map((apr) => (
                <div key={apr.id} className="py-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--text-primary)]">
                      {apr.entityLabel}
                    </span>
                    <span className={approvalTextClass(apr.newStatus)}>
                      {approvalStatusLabel(apr.newStatus)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--text-muted)]">
                    {apr.pageUrl}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                    {apr.actorName} ({apr.actorRole}) · {formatShortTimestamp(apr.timestamp)}
                    {apr.comment ? ` — "${apr.comment}"` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
          <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
            Fresh-Crawl Verification History ({validations.length})
          </h3>
          {validations.length === 0 ? (
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              No crawl verifications run yet. Save &amp; approve a draft, then click Verify Against Latest Crawl.
            </p>
          ) : (
            <div className="mt-3 divide-y divide-[var(--border-hairline)]">
              {validations.slice(0, 40).map((val) => (
                <div key={val.id} className="py-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[11px] font-medium text-[var(--text-primary)]">
                      {val.pageUrl}
                    </span>
                    <span
                      className={`shrink-0 font-mono text-[11px] font-semibold ${
                        val.verificationStatus === 'verified'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {val.matchedChecksCount}/{val.totalChecksCount} matched
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                    {val.summary}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                    Validated by {val.validatedBy} · {formatShortTimestamp(val.validatedAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
