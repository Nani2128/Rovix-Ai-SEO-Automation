import type { MeasurementStatus } from '../../types/dashboard';

export function formatCollectionDate(iso: string | null): string {
  if (!iso) return 'Not collected';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return 'Not collected';
  return new Date(ts).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATUS_META: Record<
  MeasurementStatus,
  { label: string; className: string }
> = {
  measured: {
    label: 'Measured',
    className:
      'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/70',
  },
  estimated: {
    label: 'Estimated',
    className:
      'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200/80 dark:border-amber-800/70',
  },
  unavailable: {
    label: 'Unavailable',
    className:
      'bg-slate-100 dark:bg-slate-800/80 text-[var(--text-muted)] border-[var(--border-hairline)]',
  },
};

export function MeasurementStatusTag({ status }: { status: MeasurementStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

export function DataProvenanceStrip({
  source,
  collectedAt,
  reportingPeriod,
  measurementStatus,
  compact = false,
}: {
  source: string;
  collectedAt: string | null;
  reportingPeriod: string;
  measurementStatus: MeasurementStatus;
  compact?: boolean;
}) {
  const collectedLabel = formatCollectionDate(collectedAt);

  if (compact) {
    return (
      <div className="mt-3 w-full border-t border-[var(--border-hairline)] pt-2.5 text-[10.5px] leading-snug text-[var(--text-muted)]">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate">
            <strong className="font-semibold text-[var(--text-secondary)]">Period:</strong>{' '}
            {reportingPeriod}
          </span>
          <MeasurementStatusTag status={measurementStatus} />
        </div>
        <div className="mt-1 truncate font-mono text-[10px] tabular-nums">
          Collected: {collectedLabel}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[11px] text-[var(--text-muted)]">
      <MeasurementStatusTag status={measurementStatus} />
      <span>
        <strong className="font-semibold text-[var(--text-secondary)]">Source:</strong>{' '}
        {source}
      </span>
      <span>
        <strong className="font-semibold text-[var(--text-secondary)]">Period:</strong>{' '}
        {reportingPeriod}
      </span>
      <span className="font-mono text-[10.5px] tabular-nums">
        <strong className="font-sans font-semibold text-[var(--text-secondary)]">
          Collected:
        </strong>{' '}
        {collectedLabel}
      </span>
    </div>
  );
}
