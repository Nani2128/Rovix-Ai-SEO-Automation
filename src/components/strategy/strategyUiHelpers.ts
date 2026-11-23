import type {
  ArchitecturePageStatus,
  ArchitecturePageType,
  InternalLinkCategory,
  RoadmapPriority,
  StrategyApprovalStatus,
  StrategyConfidence,
  StrategyEntityKind,
  TopicalCoverageClassification,
} from '../../types/strategy';

export const PAGE_TYPE_LABELS: Record<ArchitecturePageType, string> = {
  homepage: 'Homepage',
  service: 'Service',
  product: 'Product',
  category: 'Category Hub',
  location: 'Location',
  blog: 'Blog Article',
  resource: 'Resource Guide',
  case_study: 'Case Study',
  about: 'About',
  contact: 'Contact',
};

export const PAGE_STATUS_LABELS: Record<ArchitecturePageStatus, string> = {
  existing: 'Existing (Crawl)',
  optimize: 'Optimize Existing',
  proposed: 'Proposed New',
  archived: 'Archived',
};

export const LINK_CATEGORY_LABELS: Record<InternalLinkCategory, string> = {
  orphan_rescue: 'Orphan Rescue',
  authority_hub: 'Authority Hub',
  parent_child: 'Parent-Child Hierarchy',
  topical_crosslink: 'Topical Crosslink',
  weak_link_fix: 'Dead-End / Weak Link Fix',
};

export const COVERAGE_LABELS: Record<TopicalCoverageClassification, string> = {
  verified_existing: 'Verified Existing Coverage',
  recommended_opportunity: 'Recommended Opportunity',
  ai_suggestion: 'AI Suggestion',
  unavailable_evidence: 'Unavailable Evidence',
};

export const ENTITY_KIND_LABELS: Record<StrategyEntityKind, string> = {
  strategy_version: 'Strategy Version',
  objective: 'SEO Objective',
  architecture_page: 'Architecture Page',
  keyword_mapping: 'Keyword Mapping',
  internal_link: 'Internal Link',
  topical_cluster: 'Topical Cluster',
  roadmap_item: 'Roadmap Item',
};

export function approvalLabel(status: StrategyApprovalStatus): string {
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

export function approvalToneClass(status: StrategyApprovalStatus): string {
  switch (status) {
    case 'approved':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'rejected':
      return 'text-rose-600 dark:text-rose-400';
    case 'archived':
      return 'text-[var(--text-muted)]';
    default:
      return 'text-amber-600 dark:text-amber-400';
  }
}

export function confidenceToneClass(confidence: StrategyConfidence): string {
  switch (confidence) {
    case 'High':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'Medium':
      return 'text-sky-600 dark:text-sky-400';
    case 'Low':
      return 'text-amber-600 dark:text-amber-400';
    default:
      return 'text-rose-600 dark:text-rose-400';
  }
}

export function priorityToneClass(priority: RoadmapPriority): string {
  switch (priority) {
    case 'Critical':
      return 'text-rose-600 dark:text-rose-400';
    case 'High':
      return 'text-amber-600 dark:text-amber-400';
    case 'Medium':
      return 'text-sky-600 dark:text-sky-400';
    case 'Low':
      return 'text-[var(--text-secondary)]';
    default:
      return 'text-rose-600 dark:text-rose-400';
  }
}

export function coverageToneClass(
  classification: TopicalCoverageClassification,
): string {
  switch (classification) {
    case 'verified_existing':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'recommended_opportunity':
      return 'text-[#7047EB] dark:text-[#22D3EE]';
    case 'ai_suggestion':
      return 'text-amber-600 dark:text-amber-400';
    default:
      return 'text-rose-600 dark:text-rose-400';
  }
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return 'Not available';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
