import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { TechnicalIssue } from '../../types/technicalIssue';
import { StatusBadge } from '../ui/StateViews';
import { severityTone } from './AuditSubNav';

export function TechnicalIssueTable({
  issues,
}: {
  issues: TechnicalIssue[];
}) {
  const statusTone = (status: TechnicalIssue['status']) => {
    switch (status) {
      case 'Verified':
        return 'success';
      case 'Awaiting verification':
      case 'In progress':
        return 'indigo';
      case 'Awaiting approval':
        return 'warning';
      case 'Rejected':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  return (
    <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              <th className="py-2.5 pr-3">Technical Issue (Grouped Root Cause)</th>
              <th className="py-2.5 px-3">Category</th>
              <th className="py-2.5 px-3">Severity</th>
              <th className="py-2.5 px-3">Affected URLs</th>
              <th className="py-2.5 px-3">Owner Role</th>
              <th className="py-2.5 px-3">Lifecycle</th>
              <th className="py-2.5 pl-3 text-right">Inspect</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-hairline)]">
            {issues.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-xs text-[var(--text-muted)]">
                  No technical issues match the selected filters.
                </td>
              </tr>
            ) : (
              issues.map((issue) => (
                <tr
                  key={issue.id}
                  className="group hover:bg-[var(--bg-subtle)] transition-colors duration-150"
                >
                  <td className="py-3.5 pr-3 max-w-[320px]">
                    <Link
                      to={`/audit/issues/${issue.id}`}
                      className="font-display text-[13px] font-bold text-[var(--text-primary)] group-hover:text-[#7047EB] dark:group-hover:text-[#A78BFA] transition-colors"
                    >
                      {issue.title}
                    </Link>
                    <div className="mt-0.5 text-[11px] text-[var(--text-muted)] truncate tabular-nums">
                      {issue.ruleId} · Confidence {Math.round(issue.confidence * 100)}%
                    </div>
                  </td>
                  <td className="py-3.5 px-3 font-medium text-[var(--text-secondary)]">
                    {issue.category}
                  </td>
                  <td className="py-3.5 px-3">
                    <StatusBadge
                      label={issue.severity}
                      tone={severityTone(issue.severity)}
                    />
                  </td>
                  <td className="py-3.5 px-3 font-mono font-semibold tabular-nums text-[var(--text-primary)]">
                    {issue.affectedUrlCount}
                  </td>
                  <td className="py-3.5 px-3 text-[var(--text-secondary)]">
                    {issue.responsibleRole}
                  </td>
                  <td className="py-3.5 px-3">
                    <StatusBadge
                      label={issue.status}
                      tone={statusTone(issue.status)}
                    />
                  </td>
                  <td className="py-3.5 pl-3 text-right">
                    <Link
                      to={`/audit/issues/${issue.id}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-[11px] font-semibold text-[#7047EB] dark:text-[#A78BFA] transition-all group-hover:border-[#7047EB]/40 group-hover:bg-[#7047EB]/8"
                    >
                      <span>Details</span>
                      <ArrowRight
                        className="h-3 w-3 transition-transform duration-150 group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
