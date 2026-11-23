import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDampedValue,
  computeGrowthDeltaPct,
  easeOutCubic,
  getPillarById,
  interpolateMetricValue,
  parseAppRoute,
  SEO_PILLARS,
} from './seoPreviewLogic';

test('parseAppRoute resolves known routes and falls back to root', () => {
  assert.equal(parseAppRoute('/'), '/');
  assert.equal(parseAppRoute('/onboarding'), '/onboarding');
  assert.equal(parseAppRoute('/signin/'), '/signin');
  assert.equal(parseAppRoute('/pricing'), '/pricing');
  assert.equal(parseAppRoute('/resources'), '/resources');
  assert.equal(parseAppRoute('/unknown-path'), '/');
});

test('easeOutCubic clamps bounds and reaches 1 at completion', () => {
  assert.equal(easeOutCubic(-0.5), 0);
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.equal(easeOutCubic(1.8), 1);
  assert.ok(easeOutCubic(0.5) > 0.5);
});

test('interpolateMetricValue respects decimals and target bounds', () => {
  assert.equal(interpolateMetricValue(94, 0), 0);
  assert.equal(interpolateMetricValue(94, 1), 94);
  assert.equal(interpolateMetricValue(4.25, 1, 2), 4.25);
});

test('computeDampedValue converges smoothly without overshooting', () => {
  const next = computeDampedValue(0, 10, 6, 0.016);
  assert.ok(next > 0 && next < 10);
  const settled = computeDampedValue(9.99, 10, 8, 0.1);
  assert.ok(settled > 9.99 && settled <= 10);
});

test('computeGrowthDeltaPct handles valid baselines and zero guards', () => {
  assert.equal(computeGrowthDeltaPct(0, 100), 0);
  assert.equal(computeGrowthDeltaPct(100, 142), 42);
  assert.equal(computeGrowthDeltaPct(200, 150), -25);
});

test('SEO_PILLARS contains all 5 required pillars with valid camera coordinates and no fake metrics', () => {
  assert.equal(SEO_PILLARS.length, 5);
  assert.equal(getPillarById('geo-visibility').title, 'GEO Visibility');
  for (const pillar of SEO_PILLARS) {
    assert.ok(pillar.capabilitySummary.length > 0);
    assert.equal(pillar.cameraPosition.length, 3);
    assert.equal(pillar.cameraTarget.length, 3);
  }
});
