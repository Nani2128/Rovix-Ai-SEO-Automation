import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePrdProjectProgress,
  calculateWeightedSeoHealth,
  canAccessNavItem,
  filterAndSortKeywords,
  filterProjectsByStatus,
  formatSearchVolume,
  getRolePermissions,
  validateEmailFormat,
  validatePasswordInput,
} from './dashboardLogic';
import type { KeywordOpportunity, Project, SeoHealthCategory } from '../types/dashboard';

test('calculatePrdProjectProgress computes verified/approved scoped weight ratio', () => {
  assert.equal(calculatePrdProjectProgress(0, 0), 0);
  assert.equal(calculatePrdProjectProgress(75, 100), 75);
  assert.equal(calculatePrdProjectProgress(120, 100), 100);
  assert.equal(calculatePrdProjectProgress(18, 24), 75);
});

test('calculateWeightedSeoHealth computes documented weighted score', () => {
  const categories: SeoHealthCategory[] = [
    { id: 'technical', label: 'Technical SEO', score: 96, weight: 0.25, issueCount: 1, evidenceSummary: '', rulesApplied: '' },
    { id: 'on-page', label: 'On-Page SEO', score: 91, weight: 0.2, issueCount: 3, evidenceSummary: '', rulesApplied: '' },
    { id: 'content', label: 'Content Quality', score: 90, weight: 0.2, issueCount: 2, evidenceSummary: '', rulesApplied: '' },
    { id: 'performance', label: 'Website Performance', score: 94, weight: 0.2, issueCount: 1, evidenceSummary: '', rulesApplied: '' },
    { id: 'indexability', label: 'Indexability', score: 89, weight: 0.15, issueCount: 2, evidenceSummary: '', rulesApplied: '' },
  ];
  assert.equal(calculateWeightedSeoHealth(categories), 92);
  assert.equal(calculateWeightedSeoHealth([]), 0);
});

test('formatSearchVolume returns Not Available for null or undefined', () => {
  assert.equal(formatSearchVolume(null), 'Not Available');
  assert.equal(formatSearchVolume(undefined), 'Not Available');
  assert.equal(formatSearchVolume(14800), '14,800');
});

test('RBAC role permissions and nav visibility respect PRD roles', () => {
  assert.equal(getRolePermissions('Agency Owner').canApproveKeywords, true);
  assert.equal(getRolePermissions('QA').canApproveKeywords, false);
  assert.equal(getRolePermissions('Publisher').canManageSettings, false);
  assert.equal(canAccessNavItem('QA', ['Platform Admin', 'Agency Owner']), false);
  assert.equal(canAccessNavItem('Agency Owner', ['Platform Admin', 'Agency Owner']), true);
});

test('filterAndSortKeywords filters by query, intent, and sorts volume with nulls last/first', () => {
  const sample: KeywordOpportunity[] = [
    {
      id: 'k1',
      keyword: 'ai consulting services',
      intent: 'Commercial',
      targetMarket: 'US',
      searchVolume: 14800,
      targetUrl: '/services/ai-consulting',
      opportunity: 'High',
      approvalStatus: 'Approved',
      difficulty: 41,
      currentPosition: 6,
      rationale: 'Strong commercial fit',
    },
    {
      id: 'k2',
      keyword: 'enterprise geo tracking',
      intent: 'Informational',
      targetMarket: 'UK',
      searchVolume: null,
      targetUrl: '/guides/geo',
      opportunity: 'Medium',
      approvalStatus: 'Pending',
      difficulty: 32,
      currentPosition: null,
      rationale: 'Emerging query',
    },
  ];

  const byVolumeDesc = filterAndSortKeywords(sample, {
    search: '',
    intent: 'All',
    opportunity: 'All',
    sortBy: 'searchVolume',
    sortDir: 'desc',
  });
  assert.equal(byVolumeDesc[0].id, 'k1');

  const onlyGeo = filterAndSortKeywords(sample, {
    search: 'geo',
    intent: 'Informational',
    opportunity: 'All',
    sortBy: 'keyword',
    sortDir: 'asc',
  });
  assert.equal(onlyGeo.length, 1);
  assert.equal(onlyGeo[0].id, 'k2');
});

test('filterProjectsByStatus filters Active, Blocked, Needs Attention cleanly', () => {
  const projects = [
    { id: 'p1', status: 'Active' },
    { id: 'p2', status: 'Blocked' },
  ] as Project[];
  assert.equal(filterProjectsByStatus(projects, 'All Projects').length, 2);
  assert.equal(filterProjectsByStatus(projects, 'Blocked').length, 1);
});

test('form validation helpers catch empty and malformed inputs', () => {
  assert.ok(validateEmailFormat(''));
  assert.ok(validateEmailFormat('not-an-email'));
  assert.equal(validateEmailFormat('simon@rovix.ai'), null);
  assert.ok(validatePasswordInput('short'));
  assert.equal(validatePasswordInput('rovix-dev-2026'), null);
});
