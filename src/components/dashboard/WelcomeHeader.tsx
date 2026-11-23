import { Calendar, RefreshCw } from 'lucide-react';
import type { DateRangePreset } from '../../types/dashboard';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { useToastStore } from '../../stores/useToastStore';
import { AnimatedDropdown, InteractiveButton } from '../ui/InteractivePrimitives';

const DATE_OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last 90 Days' },
  { value: 'custom', label: 'Custom Range' },
];

export function WelcomeHeader() {
  const user = useAuthStore((s) => s.user);
  const tenant = useAuthStore((s) => s.tenant);
  const pushToast = useToastStore((s) => s.pushToast);
  const {
    overview,
    dateRange,
    setDateRange,
    customStart,
    customEnd,
    setCustomDates,
    loadStatus,
    loadDashboardData,
  } = useDashboardStore();

  const firstName = user?.name?.trim().split(' ')[0] || 'Workspace';
  const activeProject = overview?.project ?? null;
  const workspaceLabel = activeProject?.name ?? tenant?.name ?? 'No Domain Selected';

  const formattedUpdated = overview?.lastUpdated
    ? new Date(overview.lastUpdated).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Awaiting sync';

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="font-display text-2xl sm:text-[28px] font-extrabold tracking-tight text-[var(--text-primary)]">
          Welcome back,{' '}
          <span className="text-[#7047EB] dark:text-[#8B6BFF]">{firstName}</span>
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {activeProject ? (
            <>
              Search &amp; technical performance overview for{' '}
              <span className="font-semibold text-[var(--text-primary)]">
                {workspaceLabel}
              </span>
            </>
          ) : (
            <>
              Workspace <span className="font-semibold text-[var(--text-primary)]">{workspaceLabel}</span>
              {' · '}Add a verified domain project to begin crawls &amp; search syncs
            </>
          )}
          <span className="mx-2" aria-hidden="true">·</span>
          <span className="font-mono text-xs tabular-nums">
            Updated {formattedUpdated}
          </span>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <AnimatedDropdown
          ariaLabel="Select date range"
          value={dateRange}
          options={DATE_OPTIONS}
          onChange={(val) => setDateRange(val)}
          align="right"
          icon={
            <Calendar
              className="h-3.5 w-3.5 text-[#7047EB] dark:text-[#8B6BFF] shrink-0"
              aria-hidden="true"
            />
          }
        />

        {dateRange === 'custom' && (
          <div className="flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs">
            <input
              type="date"
              aria-label="Start date"
              value={customStart}
              onChange={(e) => setCustomDates(e.target.value, customEnd)}
              className="bg-transparent text-xs text-[var(--text-primary)] focus:outline-none"
            />
            <span className="text-[var(--text-muted)]">–</span>
            <input
              type="date"
              aria-label="End date"
              value={customEnd}
              onChange={(e) => setCustomDates(customStart, e.target.value)}
              className="bg-transparent text-xs text-[var(--text-primary)] focus:outline-none"
            />
          </div>
        )}

        <InteractiveButton
          variant="secondary"
          size="md"
          disabled={loadStatus === 'loading'}
          ariaLabel="Refresh dashboard data"
          onClick={() => {
            void loadDashboardData().then(() => {
              pushToast({
                title: 'Workspace refreshed',
                detail: activeProject
                  ? `${activeProject.name} snapshots updated from database.`
                  : 'Workspace overview synchronized.',
                tone: 'success',
              });
            });
          }}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 text-[#7047EB] dark:text-[#8B6BFF] ${
              loadStatus === 'loading' ? 'animate-spin' : ''
            }`}
            aria-hidden="true"
          />
          <span>Refresh</span>
        </InteractiveButton>
      </div>
    </div>
  );
}
