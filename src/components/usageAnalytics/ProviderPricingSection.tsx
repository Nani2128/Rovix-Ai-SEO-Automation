import { useState, type FormEvent } from 'react';
import { formatMicroUsd, usdToMicros } from '../../lib/usageCostEngine';
import { usageIntelligenceService } from '../../services/usageIntelligenceService';
import type {
  PricingSourceType,
  ProviderPricingVersionRecord,
  UsageAnalyticsDashboardPayload,
} from '../../types/usageIntelligence';

const PROVIDER_CATEGORY_LABELS: Record<
  'llm' | 'external_seo_api' | 'internal_engine',
  string
> = {
  llm: 'LLM Provider',
  external_seo_api: 'External SEO API',
  internal_engine: 'Internal Engine',
};

const SOURCE_TYPE_LABELS: Record<PricingSourceType, string> = {
  official_provider_pricing: 'Official Provider Schedule',
  workspace_configured: 'Workspace Configured',
  internal_non_billed: 'Internal Non-Billed',
  unconfigured: 'Unconfigured',
};

const SUGGESTED_MODELS: Record<string, string[]> = {
  google_gemini: [
    'gemini-4-hydrogen',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
  ],
  pagespeed: ['lighthouse-v5'],
  gsc: ['searchanalytics-v3'],
  ga4: ['data-api-v1beta'],
};

function formatRatePer1m(micros: number | null): string {
  if (micros === null) return 'Unconfigured';
  return `${formatMicroUsd(micros)} / 1M`;
}

function formatMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return 'Unavailable';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function parseOptionalUsdPer1m(raw: string): number | null | 'invalid' {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return 'invalid';
  return usdToMicros(parsed);
}

export function ProviderPricingSection({
  projectId,
  dashboard,
  onPricingUpdated,
}: {
  projectId: string;
  dashboard: UsageAnalyticsDashboardPayload;
  onPricingUpdated: () => Promise<void>;
}) {
  const [showHistorical, setShowHistorical] = useState(false);
  const [provider, setProvider] = useState('google_gemini');
  const [model, setModel] = useState('gemini-4-hydrogen');
  const [inputUsdPer1m, setInputUsdPer1m] = useState('');
  const [outputUsdPer1m, setOutputUsdPer1m] = useState('');
  const [cachedUsdPer1m, setCachedUsdPer1m] = useState('');
  const [sourceOfPricing, setSourceOfPricing] = useState(
    'Workspace negotiated / published rate card',
  );
  const [pricingVersion, setPricingVersion] = useState('');
  const [auditNote, setAuditNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const visibleVersions: ProviderPricingVersionRecord[] = showHistorical
    ? dashboard.pricingVersions
    : dashboard.pricingVersions.filter((v) => v.isActive);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const trimmedProvider = provider.trim().toLowerCase();
    const trimmedModel = model.trim();
    const trimmedSource = sourceOfPricing.trim();

    if (!trimmedProvider || !trimmedModel) {
      setFormError('Provider and model identifier are required.');
      return;
    }
    if (!trimmedSource) {
      setFormError('Source of pricing is required for financial audit provenance.');
      return;
    }

    const inputMicros = parseOptionalUsdPer1m(inputUsdPer1m);
    const outputMicros = parseOptionalUsdPer1m(outputUsdPer1m);
    const cachedMicros = parseOptionalUsdPer1m(cachedUsdPer1m);

    if (
      inputMicros === 'invalid' ||
      outputMicros === 'invalid' ||
      cachedMicros === 'invalid'
    ) {
      setFormError('All per-1M USD prices must be valid non-negative numbers.');
      return;
    }

    if (inputMicros === null || outputMicros === null) {
      setFormError(
        'Enter both Input USD / 1M tokens and Output USD / 1M tokens to activate a priced schedule.',
      );
      return;
    }

    setSubmitting(true);
    try {
      const created = await usageIntelligenceService.createPricingVersion(
        projectId,
        {
          provider: trimmedProvider,
          model: trimmedModel,
          inputPricePer1mMicros: inputMicros,
          outputPricePer1mMicros: outputMicros,
          cachedInputPricePer1mMicros: cachedMicros,
          currency: 'USD',
          sourceOfPricing: trimmedSource,
          sourceType: 'workspace_configured',
          pricingVersion: pricingVersion.trim() || undefined,
          auditNote: auditNote.trim() || undefined,
        },
      );
      setFormSuccess(
        `Saved active pricing version ${created.pricingVersion} for ${created.provider} / ${created.model}. Previous versions remain preserved for historical audit.`,
      );
      setInputUsdPer1m('');
      setOutputUsdPer1m('');
      setCachedUsdPer1m('');
      setPricingVersion('');
      setAuditNote('');
      await onPricingUpdated();
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'Failed to save pricing version.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Integrated Providers Breakdown */}
      <section className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
              Integrated Providers &amp; Runtime Consumption
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Real connection status, metered token volume, error/quota rates, and measured API cost per provider
            </p>
          </div>
          <span className="font-mono text-xs text-[var(--text-muted)] tabular-nums">
            {dashboard.providers.length} providers
          </span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[780px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                <th className="py-2.5 pr-4">Provider</th>
                <th className="py-2.5 pr-4">Status</th>
                <th className="py-2.5 pr-4 text-right">Requests</th>
                <th className="py-2.5 pr-4 text-right">Tokens</th>
                <th className="py-2.5 pr-4 text-right">Measured Cost</th>
                <th className="py-2.5 pr-4 text-right">Error / Quota</th>
                <th className="py-2.5 text-right">Avg Latency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {dashboard.providers.map((prov) => {
                const statusColor =
                  prov.connectionStatus === 'connected'
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : prov.connectionStatus === 'partial'
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-[var(--text-muted)]';
                const statusLabel =
                  prov.connectionStatus === 'connected'
                    ? 'Connected'
                    : prov.connectionStatus === 'partial'
                      ? 'Partial'
                      : 'Unconfigured';

                return (
                  <tr
                    key={prov.provider}
                    className="align-top transition-colors hover:bg-[var(--bg-subtle)]/70"
                  >
                    <td className="py-3 pr-4">
                      <div className="font-semibold text-[var(--text-primary)]">
                        {prov.displayName}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                        {PROVIDER_CATEGORY_LABELS[prov.category]} ·{' '}
                        <span className="font-mono">{prov.provider}</span>
                      </div>
                      {prov.models.length > 0 && (
                        <div className="mt-1.5 space-y-0.5 text-[11px] text-[var(--text-secondary)] font-mono">
                          {prov.models.map((m) => (
                            <div key={m.model}>
                              {m.model} · {m.requests} req ·{' '}
                              {m.totalTokens.toLocaleString()} tok ·{' '}
                              {m.activePricingVersion ?? 'Unpriced'}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <div className={`font-semibold ${statusColor}`}>
                        {statusLabel}
                      </div>
                      <div className="mt-0.5 max-w-[220px] text-[11px] text-[var(--text-muted)]">
                        {prov.statusNote}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular-nums text-[var(--text-primary)]">
                      {prov.requests.toLocaleString()}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular-nums text-[var(--text-primary)]">
                      {prov.totalTokens > 0
                        ? prov.totalTokens.toLocaleString()
                        : '—'}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular-nums">
                      <div className="font-semibold text-[var(--text-primary)]">
                        {prov.requests > 0 &&
                        prov.unavailableCostCount === prov.requests
                          ? 'Unavailable'
                          : formatMicroUsd(prov.measuredCostMicros)}
                      </div>
                      {prov.unavailableCostCount > 0 && (
                        <div className="text-[10.5px] text-amber-700 dark:text-amber-400">
                          {prov.unavailableCostCount} unpriced
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {prov.errorRatePct !== null
                        ? `${prov.errorRatePct.toFixed(1)}%`
                        : '—'}{' '}
                      · {prov.quotaErrors} quota
                    </td>
                    <td className="py-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {formatMs(prov.avgLatencyMs)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Versioned Pricing Registry Table */}
      <section className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
              Versioned Provider Pricing Registry
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Append-only rate history in micro-USD per 1M tokens. Historical ledger costs never mutate when new rates are added.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showHistorical}
              onChange={(e) => setShowHistorical(e.target.checked)}
              className="h-3.5 w-3.5 accent-[#7047EB] cursor-pointer"
            />
            <span>Show superseded versions</span>
          </label>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                <th className="py-2.5 pr-4">Provider / Model</th>
                <th className="py-2.5 pr-4 text-right">Input Rate</th>
                <th className="py-2.5 pr-4 text-right">Output Rate</th>
                <th className="py-2.5 pr-4 text-right">Cached Input</th>
                <th className="py-2.5 pr-4">Version &amp; Effective</th>
                <th className="py-2.5">Pricing Provenance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {visibleVersions.map((ver) => (
                <tr
                  key={ver.id}
                  className="align-top transition-colors hover:bg-[var(--bg-subtle)]/70"
                >
                  <td className="py-3 pr-4">
                    <div className="font-mono font-semibold text-[var(--text-primary)]">
                      {ver.provider} / {ver.model}
                    </div>
                    <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                      {ver.isActive ? 'Active' : 'Historical'} ·{' '}
                      {ver.tenantId ? 'Workspace Override' : 'Global Registry'}
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums text-[var(--text-primary)]">
                    {ver.sourceType === 'internal_non_billed'
                      ? '$0.00 (Internal)'
                      : formatRatePer1m(ver.inputPricePer1mMicros)}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums text-[var(--text-primary)]">
                    {ver.sourceType === 'internal_non_billed'
                      ? '$0.00 (Internal)'
                      : formatRatePer1m(ver.outputPricePer1mMicros)}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                    {ver.cachedInputPricePer1mMicros !== null
                      ? formatRatePer1m(ver.cachedInputPricePer1mMicros)
                      : 'N/A'}
                  </td>
                  <td className="py-3 pr-4 font-mono tabular-nums">
                    <div className="text-[var(--text-primary)]">
                      {ver.pricingVersion}
                    </div>
                    <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                      {ver.effectiveDate.slice(0, 10)} · {ver.currency}
                    </div>
                  </td>
                  <td className="py-3">
                    <div className="font-medium text-[var(--text-primary)]">
                      {SOURCE_TYPE_LABELS[ver.sourceType]}
                    </div>
                    <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                      {ver.sourceOfPricing}
                    </div>
                    {ver.auditNote && (
                      <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                        Note: {ver.auditNote}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* RBAC-Gated Add Pricing Version Form */}
      <section className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
              Add Workspace Pricing Version
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Configure negotiated or verified token rates for unpriced models without overwriting historical cost records
            </p>
          </div>
          {!dashboard.canManagePricingAndBudgets && (
            <span className="text-xs font-medium text-[var(--text-muted)]">
              Read-only · Requires Platform Admin, Agency Owner, or Business Owner role
            </span>
          )}
        </div>

        {dashboard.canManagePricingAndBudgets ? (
          <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block space-y-1.5 text-xs">
                <span className="font-medium text-[var(--text-secondary)]">
                  Provider
                </span>
                <select
                  value={provider}
                  onChange={(e) => {
                    const nextProv = e.target.value;
                    setProvider(nextProv);
                    const firstModel = SUGGESTED_MODELS[nextProv]?.[0];
                    if (firstModel) setModel(firstModel);
                  }}
                  className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[#7047EB]"
                >
                  <option value="google_gemini">google_gemini (Google Gemini API)</option>
                  <option value="pagespeed">pagespeed (Google PageSpeed)</option>
                  <option value="gsc">gsc (Google Search Console)</option>
                  <option value="ga4">ga4 (Google Analytics 4)</option>
                </select>
              </label>

              <label className="block space-y-1.5 text-xs">
                <span className="font-medium text-[var(--text-secondary)]">
                  Model Identifier
                </span>
                <input
                  type="text"
                  list="rovix-pricing-models"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. gemini-4-hydrogen"
                  required
                  className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[#7047EB]"
                />
                <datalist id="rovix-pricing-models">
                  {(SUGGESTED_MODELS[provider] ?? []).map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </label>

              <label className="block space-y-1.5 text-xs">
                <span className="font-medium text-[var(--text-secondary)]">
                  Version Label (optional)
                </span>
                <input
                  type="text"
                  value={pricingVersion}
                  onChange={(e) => setPricingVersion(e.target.value)}
                  placeholder="e.g. 2026-q4-contract"
                  className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[#7047EB]"
                />
              </label>

              <label className="block space-y-1.5 text-xs">
                <span className="font-medium text-[var(--text-secondary)]">
                  Input Price (USD / 1M tokens)
                </span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={inputUsdPer1m}
                  onChange={(e) => setInputUsdPer1m(e.target.value)}
                  placeholder="0.30"
                  required
                  className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] tabular-nums outline-none focus:border-[#7047EB]"
                />
              </label>

              <label className="block space-y-1.5 text-xs">
                <span className="font-medium text-[var(--text-secondary)]">
                  Output Price (USD / 1M tokens)
                </span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={outputUsdPer1m}
                  onChange={(e) => setOutputUsdPer1m(e.target.value)}
                  placeholder="2.50"
                  required
                  className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] tabular-nums outline-none focus:border-[#7047EB]"
                />
              </label>

              <label className="block space-y-1.5 text-xs">
                <span className="font-medium text-[var(--text-secondary)]">
                  Cached Input Price (USD / 1M, optional)
                </span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={cachedUsdPer1m}
                  onChange={(e) => setCachedUsdPer1m(e.target.value)}
                  placeholder="0.03"
                  className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] tabular-nums outline-none focus:border-[#7047EB]"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5 text-xs">
                <span className="font-medium text-[var(--text-secondary)]">
                  Source of Pricing (Audit Provenance)
                </span>
                <input
                  type="text"
                  value={sourceOfPricing}
                  onChange={(e) => setSourceOfPricing(e.target.value)}
                  required
                  className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[#7047EB]"
                />
              </label>

              <label className="block space-y-1.5 text-xs">
                <span className="font-medium text-[var(--text-secondary)]">
                  Audit Note (optional)
                </span>
                <input
                  type="text"
                  value={auditNote}
                  onChange={(e) => setAuditNote(e.target.value)}
                  placeholder="Reason for rate update or billing reference"
                  className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[#7047EB]"
                />
              </label>
            </div>

            {formError && (
              <div
                role="alert"
                className="rounded-xl border border-red-300/70 bg-red-50/70 px-3.5 py-2.5 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-300"
              >
                {formError}
              </div>
            )}

            {formSuccess && (
              <div
                role="status"
                className="rounded-xl border border-emerald-300/70 bg-emerald-50/70 px-3.5 py-2.5 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/35 dark:text-emerald-300"
              >
                {formSuccess}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-[#7047EB] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5E38D1] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                {submitting ? 'Saving Pricing Version…' : 'Save Active Pricing Version'}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-4 py-3 text-xs text-[var(--text-secondary)]">
            Your current role has read-only access to the pricing registry. Contact a
            Platform Admin, Agency Owner, or Business Owner to publish new rate versions.
          </div>
        )}
      </section>
    </div>
  );
}
