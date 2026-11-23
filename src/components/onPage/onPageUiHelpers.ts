import type {
  CmsConnectionStatus,
  OnPageApprovalStatus,
  OnPageIssueSeverity,
  OnPageLifecycleStatus,
  OnPageRecommendationTarget,
} from '../../types/onPage';

export function severityTextClass(severity: OnPageIssueSeverity): string {
  switch (severity) {
    case 'Critical':
      return 'text-rose-600 dark:text-rose-400 font-semibold';
    case 'High':
      return 'text-amber-600 dark:text-amber-400 font-semibold';
    case 'Medium':
      return 'text-sky-600 dark:text-sky-400 font-medium';
    default:
      return 'text-[var(--text-muted)] font-medium';
  }
}

export function scoreTextClass(score: number | null): string {
  if (score === null) return 'text-[var(--text-muted)]';
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 60) return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

export function approvalStatusLabel(status: OnPageApprovalStatus): string {
  switch (status) {
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'archived':
      return 'Archived';
    default:
      return 'Pending Review';
  }
}

export function approvalTextClass(status: OnPageApprovalStatus): string {
  switch (status) {
    case 'approved':
      return 'text-emerald-600 dark:text-emerald-400 font-semibold';
    case 'rejected':
      return 'text-rose-600 dark:text-rose-400 font-semibold';
    case 'archived':
      return 'text-[var(--text-muted)]';
    default:
      return 'text-amber-600 dark:text-amber-400 font-medium';
  }
}

export function lifecycleLabel(status: OnPageLifecycleStatus): string {
  switch (status) {
    case 'detected':
      return 'Detected';
    case 'recommendation_generated':
      return 'Recommendations Ready';
    case 'awaiting_approval':
      return 'Awaiting Approval';
    case 'approved':
      return 'Approved';
    case 'draft_ready':
      return 'Draft Ready';
    case 'applied_externally':
      return 'Applied Externally';
    case 'recrawled':
      return 'Recrawled (Diff Open)';
    case 'verified':
      return 'Verified in Crawl';
    case 'rejected':
      return 'Rejected';
  }
}

export function lifecycleTextClass(status: OnPageLifecycleStatus): string {
  switch (status) {
    case 'verified':
      return 'text-emerald-600 dark:text-emerald-400 font-semibold';
    case 'applied_externally':
    case 'approved':
      return 'text-[#7047EB] dark:text-[#22D3EE] font-semibold';
    case 'draft_ready':
    case 'awaiting_approval':
    case 'recrawled':
      return 'text-amber-600 dark:text-amber-400 font-medium';
    case 'rejected':
      return 'text-rose-600 dark:text-rose-400 font-medium';
    default:
      return 'text-[var(--text-secondary)] font-medium';
  }
}

export function cmsStatusLabel(status: CmsConnectionStatus): string {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'configured_unverified':
      return 'Configured (Unverified)';
    case 'error':
      return 'Connection Error';
    default:
      return 'Not Configured';
  }
}

export function targetFieldLabel(target: OnPageRecommendationTarget): string {
  switch (target) {
    case 'title':
      return 'Title Tag';
    case 'meta_description':
      return 'Meta Description';
    case 'h1':
      return 'Primary H1';
    case 'headings':
      return 'Heading Hierarchy';
    case 'content_structure':
      return 'Content Structure';
    case 'keyword_placement':
      return 'Keyword Placement';
    case 'supporting_subtopics':
      return 'Supporting Subtopics';
    case 'image_alt':
      return 'Image Alt Text';
    case 'schema':
      return 'Structured Data';
    case 'internal_link':
      return 'Internal Linking';
  }
}

export function formatShortTimestamp(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function triggerFileDownload(url: string, fallbackName: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = fallbackName;
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
