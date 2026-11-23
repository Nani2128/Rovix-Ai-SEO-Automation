import { ShieldCheck, Wrench } from 'lucide-react';
import type { DetectionRuleDefinition, TechnicalIssue } from '../../types/technicalIssue';
import { StatusBadge } from '../ui/StateViews';
import { severityTone } from './AuditSubNav';

export function IssueRootCausePanel({
  issue,
  rule,
}: {
  issue: TechnicalIssue;
  rule: DetectionRuleDefinition | null;
}) {
  return (
    <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge label={issue.severity} tone={severityTone(issue.severity)} />
        <StatusBadge label={issue.category} tone="indigo" />
        <StatusBadge label={issue.status} tone={issue.status === 'Verified' ? 'success' : 'warning'} />
        <span className="font-mono text-xs text-[var(--text-muted)]">{issue.ruleId}</span>
      </div>

      <h1 className="mt-3 font-display text-xl font-extrabold tracking-tight text-[var(--text-primary)]">
        {issue.title}
      </h1>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Root Cause & Explanation
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-primary)]">
            {issue.explanation}
          </p>
          <div className="mt-2 text-[11px] text-[var(--text-muted)]">
            Root Cause Key:{' '}
            <span className="font-mono text-[var(--text-primary)]">{issue.rootCauseKey}</span>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            SEO Impact & Confidence
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-primary)]">
            {issue.impact}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-muted)] tabular-nums">
            <span>Confidence: {Math.round(issue.confidence * 100)}%</span>
            <span>Owner: {issue.responsibleRole}</span>
            <span>Affected URLs: {issue.affectedUrlCount}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-[#7047EB]/25 bg-[#7047EB]/5 dark:bg-[#7047EB]/12 p-4">
        <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
          <Wrench className="h-4 w-4 text-[#7047EB] dark:text-[#A78BFA]" aria-hidden="true" />
          <span>Recommended Fix</span>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
          {issue.recommendedFix}
        </p>
        {rule?.requiresDualApproval && (
          <div className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#7047EB] dark:text-[#A78BFA]">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              Sensitive Technical Change: Requires Developer + Project/SEO Lead dual approval before rollout.
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
