import type { IssueLifecycleStatus, VerificationRun } from '../types/technicalIssue';
import { easeOutCubic } from './seoPreviewLogic';

export function interpolateFromTo(
  from: number,
  to: number,
  progress: number,
  decimals = 0,
): number {
  const eased = easeOutCubic(progress);
  const raw = from + (to - from) * eased;
  const factor = Math.pow(10, decimals);
  return Math.round(raw * factor) / factor;
}

export function nextCommandIndex(
  currentIndex: number,
  total: number,
  direction: 'up' | 'down',
): number {
  if (total <= 0) return -1;
  const safeCurrent =
    currentIndex >= 0 && currentIndex < total ? currentIndex : 0;
  if (direction === 'down') {
    return (safeCurrent + 1) % total;
  }
  return (safeCurrent - 1 + total) % total;
}

export type ReverificationLifecycleStage =
  | 'idle'
  | 'awaiting_verification'
  | 'recrawling'
  | 'verified'
  | 'failed';

export function deriveReverificationStage(params: {
  running: boolean;
  issueStatus: IssueLifecycleStatus | string;
  latestResult?: VerificationRun['result'] | null;
}): ReverificationLifecycleStage {
  if (params.running) return 'recrawling';
  if (params.issueStatus === 'Verified' && params.latestResult === 'Verified') {
    return 'verified';
  }
  if (
    params.latestResult === 'Unresolved' ||
    params.latestResult === 'Changed'
  ) {
    return 'failed';
  }
  if (params.issueStatus === 'Awaiting verification') {
    return 'awaiting_verification';
  }
  if (params.issueStatus === 'Verified') {
    return 'verified';
  }
  return 'idle';
}

export function clampProgressPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
