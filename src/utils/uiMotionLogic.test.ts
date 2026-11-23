import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampProgressPct,
  deriveReverificationStage,
  interpolateFromTo,
  nextCommandIndex,
} from './uiMotionLogic';

test('interpolateFromTo interpolates smoothly between previous and next values', () => {
  assert.equal(interpolateFromTo(100, 200, 0), 100);
  assert.equal(interpolateFromTo(100, 200, 1), 200);
  const mid = interpolateFromTo(100, 200, 0.5);
  assert.ok(mid > 150 && mid < 200);
  assert.equal(interpolateFromTo(24.5, 29.5, 1, 1), 29.5);
});

test('nextCommandIndex wraps cleanly on ArrowUp and ArrowDown', () => {
  assert.equal(nextCommandIndex(0, 0, 'down'), -1);
  assert.equal(nextCommandIndex(0, 5, 'down'), 1);
  assert.equal(nextCommandIndex(4, 5, 'down'), 0);
  assert.equal(nextCommandIndex(0, 5, 'up'), 4);
  assert.equal(nextCommandIndex(2, 5, 'up'), 1);
});

test('deriveReverificationStage strictly reflects real backend verification state', () => {
  assert.equal(
    deriveReverificationStage({ running: true, issueStatus: 'Open', latestResult: null }),
    'recrawling',
  );
  assert.equal(
    deriveReverificationStage({
      running: false,
      issueStatus: 'Verified',
      latestResult: 'Verified',
    }),
    'verified',
  );
  assert.equal(
    deriveReverificationStage({
      running: false,
      issueStatus: 'Awaiting verification',
      latestResult: 'Unresolved',
    }),
    'failed',
  );
  assert.equal(
    deriveReverificationStage({
      running: false,
      issueStatus: 'Awaiting verification',
      latestResult: null,
    }),
    'awaiting_verification',
  );
  assert.equal(
    deriveReverificationStage({
      running: false,
      issueStatus: 'Open',
      latestResult: null,
    }),
    'idle',
  );
});

test('clampProgressPct keeps progress within 0-100', () => {
  assert.equal(clampProgressPct(-12), 0);
  assert.equal(clampProgressPct(48.6), 49);
  assert.equal(clampProgressPct(140), 100);
  assert.equal(clampProgressPct(Number.NaN), 0);
});
