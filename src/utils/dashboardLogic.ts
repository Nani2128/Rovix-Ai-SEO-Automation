import type { RolePermissions, UserRole } from '../types/auth';
import type {
  KeywordIntent,
  KeywordOpportunity,
  OpportunityTier,
  Project,
  SeoHealthCategory,
} from '../types/dashboard';

export function getRolePermissions(role: UserRole): RolePermissions {
  switch (role) {
    case 'Platform Admin':
    case 'Agency Owner':
      return {
        canApproveKeywords: true,
        canRunAutomations: true,
        canManageProjects: true,
        canManageIntegrations: true,
        canManageSettings: true,
        canPublishContent: true,
        canViewAnalytics: true,
      };
    case 'SEO Strategist':
      return {
        canApproveKeywords: true,
        canRunAutomations: true,
        canManageProjects: true,
        canManageIntegrations: true,
        canManageSettings: false,
        canPublishContent: false,
        canViewAnalytics: true,
      };
    case 'Business Owner':
      return {
        canApproveKeywords: true,
        canRunAutomations: false,
        canManageProjects: false,
        canManageIntegrations: false,
        canManageSettings: true,
        canPublishContent: false,
        canViewAnalytics: true,
      };
    case 'Project Manager':
      return {
        canApproveKeywords: true,
        canRunAutomations: true,
        canManageProjects: true,
        canManageIntegrations: true,
        canManageSettings: false,
        canPublishContent: false,
        canViewAnalytics: true,
      };
    case 'Editor':
      return {
        canApproveKeywords: false,
        canRunAutomations: false,
        canManageProjects: false,
        canManageIntegrations: false,
        canManageSettings: false,
        canPublishContent: true,
        canViewAnalytics: true,
      };
    case 'Publisher':
      return {
        canApproveKeywords: false,
        canRunAutomations: false,
        canManageProjects: false,
        canManageIntegrations: false,
        canManageSettings: false,
        canPublishContent: true,
        canViewAnalytics: false,
      };
    case 'Developer':
      return {
        canApproveKeywords: false,
        canRunAutomations: true,
        canManageProjects: false,
        canManageIntegrations: true,
        canManageSettings: true,
        canPublishContent: false,
        canViewAnalytics: true,
      };
    case 'Outreach Lead':
      return {
        canApproveKeywords: false,
        canRunAutomations: true,
        canManageProjects: false,
        canManageIntegrations: false,
        canManageSettings: false,
        canPublishContent: false,
        canViewAnalytics: true,
      };
    case 'QA':
      return {
        canApproveKeywords: false,
        canRunAutomations: false,
        canManageProjects: false,
        canManageIntegrations: false,
        canManageSettings: false,
        canPublishContent: false,
        canViewAnalytics: true,
      };
  }
}

export function canAccessNavItem(
  userRole: UserRole,
  requiredRoles?: UserRole[],
): boolean {
  if (!requiredRoles || requiredRoles.length === 0) return true;
  return requiredRoles.includes(userRole);
}

/**
 * PRD Rule: Verified task weights / approved scoped task weights.
 * Progress represents operational work completion, never SEO ranking success.
 */
export function calculatePrdProjectProgress(
  verifiedTaskWeight: number,
  approvedScopedTaskWeight: number,
): number {
  if (approvedScopedTaskWeight <= 0) return 0;
  const clampedVerified = Math.max(
    0,
    Math.min(verifiedTaskWeight, approvedScopedTaskWeight),
  );
  return Math.round((clampedVerified / approvedScopedTaskWeight) * 100);
}

/**
 * Computes SEO Health Score strictly from weighted documented rule categories.
 */
export function calculateWeightedSeoHealth(
  categories: readonly SeoHealthCategory[],
): number {
  if (categories.length === 0) return 0;
  const totalWeight = categories.reduce((sum, c) => sum + Math.max(0, c.weight), 0);
  if (totalWeight <= 0) return 0;
  const weightedSum = categories.reduce(
    (sum, c) => sum + Math.max(0, Math.min(100, c.score)) * Math.max(0, c.weight),
    0,
  );
  return Math.round(weightedSum / totalWeight);
}

export function formatSearchVolume(volume: number | null | undefined): string {
  if (volume === null || volume === undefined || Number.isNaN(volume)) {
    return 'Not Available';
  }
  return volume.toLocaleString();
}

export interface KeywordFilterOptions {
  search: string;
  intent: KeywordIntent | 'All';
  opportunity: OpportunityTier | 'All';
  sortBy: 'keyword' | 'searchVolume' | 'opportunity';
  sortDir: 'asc' | 'desc';
}

const OPPORTUNITY_RANK: Record<OpportunityTier, number> = {
  High: 3,
  Medium: 2,
  Low: 1,
};

export function filterAndSortKeywords(
  items: readonly KeywordOpportunity[],
  opts: KeywordFilterOptions,
): KeywordOpportunity[] {
  const q = opts.search.trim().toLowerCase();
  const filtered = items.filter((item) => {
    if (
      q &&
      !item.keyword.toLowerCase().includes(q) &&
      !item.targetUrl.toLowerCase().includes(q) &&
      !item.targetMarket.toLowerCase().includes(q)
    ) {
      return false;
    }
    if (opts.intent !== 'All' && item.intent !== opts.intent) return false;
    if (opts.opportunity !== 'All' && item.opportunity !== opts.opportunity) {
      return false;
    }
    return true;
  });

  return [...filtered].sort((a, b) => {
    let cmp = 0;
    if (opts.sortBy === 'keyword') {
      cmp = a.keyword.localeCompare(b.keyword);
    } else if (opts.sortBy === 'searchVolume') {
      const av = a.searchVolume ?? -1;
      const bv = b.searchVolume ?? -1;
      cmp = av - bv;
    } else {
      cmp = OPPORTUNITY_RANK[a.opportunity] - OPPORTUNITY_RANK[b.opportunity];
    }
    return opts.sortDir === 'asc' ? cmp : -cmp;
  });
}

export function filterProjectsByStatus(
  projects: readonly Project[],
  filter: 'All Projects' | 'Active' | 'Blocked' | 'Needs Attention',
): Project[] {
  if (filter === 'All Projects') return [...projects];
  return projects.filter((p) => p.status === filter);
}

export function validateEmailFormat(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return 'Email address is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return 'Enter a valid work email address.';
  }
  return null;
}

export function validatePasswordInput(password: string): string | null {
  if (!password) return 'Password is required.';
  if (password.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  return null;
}
