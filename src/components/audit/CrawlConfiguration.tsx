import { useState } from 'react';
import {
  CheckCircle2,
  Lock,
  Play,
  Save,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import type {
  CrawlConfigurationData,
  ProjectDomainVerification,
  VerificationMethod,
} from '../../types/crawl';
import { AnimatedCard, SuccessTransition } from '../animation/MotionPrimitives';
import { InteractiveButton } from '../ui/InteractivePrimitives';
import { StatusBadge } from '../ui/StateViews';

export function CrawlConfiguration({
  verification,
  configuration,
  rendererAvailable,
  policySummary,
  estimatedScope,
  canOperate,
  busy,
  onVerifyDomain,
  onSaveConfig,
  onStartCrawl,
}: {
  verification: ProjectDomainVerification;
  configuration: CrawlConfigurationData;
  rendererAvailable: boolean;
  policySummary: string[];
  estimatedScope: { estimatedMaxUrls: number; note: string };
  canOperate: boolean;
  busy: boolean;
  onVerifyDomain: (payload: {
    canonicalDomain: string;
    verificationMethod: VerificationMethod;
    crawlPolicyApproved: boolean;
  }) => Promise<void>;
  onSaveConfig: (next: CrawlConfigurationData) => Promise<void>;
  onStartCrawl: (next: CrawlConfigurationData) => Promise<void>;
}) {
  const [form, setForm] = useState<CrawlConfigurationData>(configuration);
  const [domainInput, setDomainInput] = useState(verification.canonicalDomain);
  const [verifyMethod, setVerifyMethod] = useState<VerificationMethod>(
    verification.verificationMethod,
  );
  const [policyAccepted, setPolicyAccepted] = useState(
    verification.crawlPolicyApproved,
  );
  const [includeText, setIncludeText] = useState(
    configuration.includePatterns.join(', '),
  );
  const [excludeText, setExcludeText] = useState(
    configuration.excludePatterns.join(', '),
  );
  const [allowlistText, setAllowlistText] = useState(
    configuration.queryAllowlist.join(', '),
  );

  const buildPayload = (): CrawlConfigurationData => ({
    ...form,
    includePatterns: includeText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    excludePatterns: excludeText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    queryAllowlist: allowlistText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  });

  const isVerifiedAndReady =
    verification.verified && verification.crawlPolicyApproved;

  const inputClass =
    'mt-1.5 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3.5 py-2 text-xs sm:text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#7047EB] focus:bg-[var(--bg-surface)] focus:outline-none transition-colors';

  return (
    <div className="space-y-6">
      <AnimatedCard
        className={`rounded-[20px] border p-6 transition-colors ${
          isVerifiedAndReady
            ? 'border-emerald-200 dark:border-emerald-800/70 bg-[var(--bg-surface)] shadow-[0_8px_24px_-16px_rgba(13,148,136,0.2)]'
            : 'border-[var(--border-hairline)] bg-[var(--bg-surface)]'
        }`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            {isVerifiedAndReady ? (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/50">
                <SuccessTransition size={22} />
              </span>
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
                <ShieldAlert className="h-5 w-5" aria-hidden="true" />
              </span>
            )}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                  Domain Ownership &amp; Crawl Policy Gate
                </h2>
                <StatusBadge
                  label={
                    isVerifiedAndReady
                      ? 'Verified & Policy Approved'
                      : 'Verification Required'
                  }
                  tone={isVerifiedAndReady ? 'success' : 'warning'}
                />
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Only verified project domains with approved crawl policy may be
                crawled. SSRF, loopback, private IP, and metadata routes are
                blocked on every hop.
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-[11px] font-mono text-[var(--text-secondary)]">
            <ShieldCheck
              className="h-3.5 w-3.5 text-[#7047EB] dark:text-[#8B6BFF] shrink-0"
              aria-hidden="true"
            />
            <span>Token: {verification.verificationToken}</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label
              htmlFor="verify-domain-input"
              className="block text-xs font-semibold text-[var(--text-primary)]"
            >
              Canonical Target Domain
            </label>
            <input
              id="verify-domain-input"
              type="text"
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              disabled={!canOperate || busy}
              placeholder="example.com"
              className={inputClass}
            />
          </div>

          <div>
            <label
              htmlFor="verify-method-select"
              className="block text-xs font-semibold text-[var(--text-primary)]"
            >
              Verification Method
            </label>
            <select
              id="verify-method-select"
              value={verifyMethod}
              onChange={(e) =>
                setVerifyMethod(e.target.value as VerificationMethod)
              }
              disabled={!canOperate || busy}
              className={`${inputClass} cursor-pointer`}
            >
              <option value="DNS_TXT">DNS TXT Record</option>
              <option value="HTML_FILE">HTML Verification File</option>
              <option value="GSC_OAUTH">Google Search Console Property</option>
            </select>
          </div>

          <div className="flex flex-col justify-end gap-2">
            <label className="inline-flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={policyAccepted}
                onChange={(e) => setPolicyAccepted(e.target.checked)}
                disabled={!canOperate || busy}
                className="h-4 w-4 rounded border-[var(--border-hairline)] accent-[#7047EB] cursor-pointer"
              />
              <span>Approve authorized crawl rate &amp; scope policy</span>
            </label>
            <InteractiveButton
              variant="subtle"
              size="md"
              disabled={!canOperate || busy || !policyAccepted}
              onClick={() =>
                void onVerifyDomain({
                  canonicalDomain: domainInput,
                  verificationMethod: verifyMethod,
                  crawlPolicyApproved: policyAccepted,
                })
              }
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {isVerifiedAndReady ? 'Re-verify Ownership' : 'Verify Domain Ownership'}
              </span>
            </InteractiveButton>
          </div>
        </div>
      </AnimatedCard>

      <AnimatedCard
        delay={0.05}
        className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6"
      >
        <div className="flex flex-col gap-2 border-b border-[var(--border-hairline)] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
              Crawl Configuration &amp; Guardrails
            </h2>
            <p className="text-xs text-[var(--text-muted)]">{estimatedScope.note}</p>
          </div>
          <StatusBadge
            label={
              rendererAvailable
                ? 'JS Headless Chromium Ready'
                : 'JS Renderer Unavailable (Raw HTML)'
            }
            tone={rendererAvailable ? 'indigo' : 'warning'}
          />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <label
              htmlFor="crawl-start-url"
              className="block text-xs font-semibold text-[var(--text-primary)]"
            >
              Starting Seed URL
            </label>
            <input
              id="crawl-start-url"
              type="url"
              value={form.startingUrl}
              onChange={(e) => setForm({ ...form, startingUrl: e.target.value })}
              disabled={!canOperate || busy}
              placeholder="https://example.com/"
              className={inputClass}
            />
          </div>

          <div>
            <label
              htmlFor="crawl-max-pages"
              className="block text-xs font-semibold text-[var(--text-primary)]"
            >
              Max Pages (1 – 500)
            </label>
            <input
              id="crawl-max-pages"
              type="number"
              min={1}
              max={500}
              value={form.maxPages}
              onChange={(e) =>
                setForm({ ...form, maxPages: Number(e.target.value) || 1 })
              }
              disabled={!canOperate || busy}
              className={`${inputClass} tabular-nums`}
            />
          </div>

          <div>
            <label
              htmlFor="crawl-max-depth"
              className="block text-xs font-semibold text-[var(--text-primary)]"
            >
              Max Depth (0 – 10)
            </label>
            <input
              id="crawl-max-depth"
              type="number"
              min={0}
              max={10}
              value={form.maxDepth}
              onChange={(e) =>
                setForm({ ...form, maxDepth: Number(e.target.value) || 0 })
              }
              disabled={!canOperate || busy}
              className={`${inputClass} tabular-nums`}
            />
          </div>

          <div>
            <label
              htmlFor="crawl-concurrency"
              className="block text-xs font-semibold text-[var(--text-primary)]"
            >
              Concurrency Limit (1 – 6 workers)
            </label>
            <input
              id="crawl-concurrency"
              type="number"
              min={1}
              max={6}
              value={form.maxConcurrency}
              onChange={(e) =>
                setForm({
                  ...form,
                  maxConcurrency: Number(e.target.value) || 1,
                })
              }
              disabled={!canOperate || busy}
              className={`${inputClass} tabular-nums`}
            />
          </div>

          <div>
            <label
              htmlFor="crawl-delay"
              className="block text-xs font-semibold text-[var(--text-primary)]"
            >
              Request Delay (ms)
            </label>
            <input
              id="crawl-delay"
              type="number"
              min={0}
              max={5000}
              value={form.requestDelayMs}
              onChange={(e) =>
                setForm({
                  ...form,
                  requestDelayMs: Number(e.target.value) || 0,
                })
              }
              disabled={!canOperate || busy}
              className={`${inputClass} tabular-nums`}
            />
          </div>

          <div>
            <label
              htmlFor="crawl-include"
              className="block text-xs font-semibold text-[var(--text-primary)]"
            >
              Include Path Patterns (comma-separated)
            </label>
            <input
              id="crawl-include"
              type="text"
              value={includeText}
              onChange={(e) => setIncludeText(e.target.value)}
              disabled={!canOperate || busy}
              placeholder="/blog, /solutions"
              className={inputClass}
            />
          </div>

          <div>
            <label
              htmlFor="crawl-exclude"
              className="block text-xs font-semibold text-[var(--text-primary)]"
            >
              Exclude Path Patterns (comma-separated)
            </label>
            <input
              id="crawl-exclude"
              type="text"
              value={excludeText}
              onChange={(e) => setExcludeText(e.target.value)}
              disabled={!canOperate || busy}
              placeholder="/wp-admin, /logout"
              className={inputClass}
            />
          </div>

          <div>
            <label
              htmlFor="crawl-query-policy"
              className="block text-xs font-semibold text-[var(--text-primary)]"
            >
              Query Parameter Handling
            </label>
            <select
              id="crawl-query-policy"
              value={form.queryParamPolicy}
              onChange={(e) =>
                setForm({
                  ...form,
                  queryParamPolicy: e.target
                    .value as CrawlConfigurationData['queryParamPolicy'],
                })
              }
              disabled={!canOperate || busy}
              className={`${inputClass} cursor-pointer`}
            >
              <option value="ignore_all">Ignore all query parameters</option>
              <option value="keep_all">Keep all query parameters</option>
              <option value="allowlist">Allowlist specific parameters</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="crawl-scope-mode"
              className="block text-xs font-semibold text-[var(--text-primary)]"
            >
              Domain Scope Mode
            </label>
            <select
              id="crawl-scope-mode"
              value={form.scopeMode}
              onChange={(e) =>
                setForm({
                  ...form,
                  scopeMode: e.target
                    .value as CrawlConfigurationData['scopeMode'],
                })
              }
              disabled={!canOperate || busy}
              className={`${inputClass} cursor-pointer`}
            >
              <option value="internal_only">Internal domain only</option>
              <option value="authorized_subdomains">
                Include authorized subdomains
              </option>
            </select>
          </div>

          {form.queryParamPolicy === 'allowlist' && (
            <div className="md:col-span-2">
              <label
                htmlFor="crawl-query-allowlist"
                className="block text-xs font-semibold text-[var(--text-primary)]"
              >
                Query Parameter Allowlist (comma-separated)
              </label>
              <input
                id="crawl-query-allowlist"
                type="text"
                value={allowlistText}
                onChange={(e) => setAllowlistText(e.target.value)}
                disabled={!canOperate || busy}
                placeholder="page, category, lang"
                className={inputClass}
              />
            </div>
          )}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            {
              label: 'Discover XML Sitemaps',
              checked: form.discoverSitemaps,
              toggle: (v: boolean) => setForm({ ...form, discoverSitemaps: v }),
            },
            {
              label: 'Respect robots.txt Directives',
              checked: form.respectRobotsTxt,
              toggle: (v: boolean) => setForm({ ...form, respectRobotsTxt: v }),
            },
            {
              label: 'Enable JS DOM Rendering',
              checked: form.enableJsRendering,
              toggle: (v: boolean) => setForm({ ...form, enableJsRendering: v }),
            },
          ].map((chk) => (
            <label
              key={chk.label}
              className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs font-medium cursor-pointer transition-colors ${
                chk.checked
                  ? 'border-[#7047EB]/35 bg-[#7047EB]/8 text-[var(--text-primary)]'
                  : 'border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:border-[#7047EB]/25'
              }`}
            >
              <input
                type="checkbox"
                checked={chk.checked}
                onChange={(e) => chk.toggle(e.target.checked)}
                disabled={!canOperate || busy}
                className="h-4 w-4 rounded border-[var(--border-hairline)] accent-[#7047EB] cursor-pointer"
              />
              <span>{chk.label}</span>
            </label>
          ))}
        </div>

        <div className="mt-5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Security &amp; Policy Guardrails
          </div>
          <ul className="mt-1.5 space-y-1 text-xs text-[var(--text-secondary)]">
            {policySummary.map((line) => (
              <li key={line}>• {line}</li>
            ))}
          </ul>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-hairline)] pt-4">
          <div className="text-xs text-[var(--text-muted)]">
            {!canOperate ? (
              <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-medium">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                Current role is read-only for crawl launches.
              </span>
            ) : !isVerifiedAndReady ? (
              <span className="text-amber-700 dark:text-amber-400 font-medium">
                Verify domain ownership &amp; approve crawl policy above to unlock
                crawling.
              </span>
            ) : (
              <span>
                Ready to crawl {verification.canonicalDomain} (up to{' '}
                {form.maxPages} pages).
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <InteractiveButton
              variant="secondary"
              size="md"
              disabled={!canOperate || busy}
              onClick={() => void onSaveConfig(buildPayload())}
            >
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Save Configuration</span>
            </InteractiveButton>
            <InteractiveButton
              variant="primary"
              size="md"
              loading={busy}
              disabled={!canOperate || busy || !isVerifiedAndReady}
              onClick={() => void onStartCrawl(buildPayload())}
              className="px-5"
            >
              {!busy && <Play className="h-3.5 w-3.5" aria-hidden="true" />}
              <span>{busy ? 'Starting Crawl...' : 'Start Technical Crawl'}</span>
            </InteractiveButton>
          </div>
        </div>
      </AnimatedCard>
    </div>
  );
}
