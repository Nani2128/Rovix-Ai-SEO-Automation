import { motion, useReducedMotion } from 'motion/react';
import { CheckCircle2, Clock, PauseCircle, Shield } from 'lucide-react';
import { MOTION_EASE } from '../../config/motion';
import type { AutomationJob } from '../../types/dashboard';
import { RovixLogo } from '../RovixLogo';

export function AutomationStatusHero({
  automations,
  lastSuccessfulRun,
  hasProject = true,
}: {
  automations: AutomationJob[];
  lastSuccessfulRun?: string | null;
  hasProject?: boolean;
}) {
  const prefersReducedMotion = useReducedMotion();

  const runningJobs = automations.filter((j) => j.state === 'Running' || j.state === 'Queued');
  const latestAudit = automations.find(
    (j) => j.category === 'Technical Site Audit',
  );
  const latestSync = automations.find((j) => j.category === 'Data Sync Job');
  const nextScheduled =
    runningJobs[0]?.nextScheduledRun ??
    automations[0]?.nextScheduledRun ??
    'Manual trigger';

  const isActive = runningJobs.length > 0;

  return (
    <motion.section
      aria-label="SEO Automation Status"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: MOTION_EASE }}
      className="relative overflow-hidden rounded-[22px] border border-[#7047EB]/20 dark:border-[#8B6BFF]/25 bg-gradient-to-r from-[#F9F8FF] via-[#EFEFFF] to-[#E6ECFF] dark:from-[#12182B] dark:via-[#171C36] dark:to-[#13203A] p-6 sm:px-8 sm:py-6 shadow-[0_18px_40px_-24px_rgba(112,71,235,0.24)]"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 1200 220"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-55 dark:opacity-15"
      >
        <path
          d="M0 155C260 110 490 210 780 140C970 95 1090 145 1200 85V220H0V155Z"
          fill="#FFFFFF"
          fillOpacity="0.45"
        />
      </svg>

      <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <h2 className="font-display text-xl sm:text-[25px] font-extrabold leading-tight tracking-tight text-[var(--text-primary)]">
            {!hasProject ? (
              <>
                Workspace ready for{' '}
                <span className="text-[#7047EB] dark:text-[#8B6BFF]">domain onboarding.</span>
              </>
            ) : isActive ? (
              <>
                Search &amp; crawl pipeline is{' '}
                <span className="text-[#7047EB] dark:text-[#8B6BFF]">actively processing.</span>
              </>
            ) : (
              <>
                SEO Automation pipeline is{' '}
                <span className="text-[#7047EB] dark:text-[#8B6BFF]">on standby.</span>
              </>
            )}
          </h2>

          <ul className="mt-3.5 space-y-1.5 text-[13px] font-medium text-[var(--text-secondary)]">
            <li className="flex items-center gap-2">
              <CheckCircle2
                className="h-4 w-4 shrink-0 text-[#7047EB] dark:text-[#8B6BFF]"
                aria-hidden="true"
              />
              <span>
                Technical crawl:{' '}
                {latestAudit
                  ? `${latestAudit.state} · ${latestAudit.progressLabel}`
                  : 'Waiting for first crawl'}
              </span>
            </li>
            <li className="flex items-center gap-2">
              <Shield
                className="h-4 w-4 shrink-0 text-[#0891B2] dark:text-[#22D3EE]"
                aria-hidden="true"
              />
              <span>
                {runningJobs.length} background job{runningJobs.length === 1 ? '' : 's'} active
              </span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2
                className="h-4 w-4 shrink-0 text-[#0D9488] dark:text-[#2DD4BF]"
                aria-hidden="true"
              />
              <span>
                Data sync:{' '}
                {latestSync
                  ? `${latestSync.state} · ${latestSync.progressLabel}`
                  : 'Connect GSC or GA4 to sync metrics'}
              </span>
            </li>
          </ul>
        </div>

        <div
          aria-hidden="true"
          className="relative hidden md:flex h-28 w-44 items-center justify-center shrink-0"
        >
          <motion.div
            animate={prefersReducedMotion ? undefined : { rotate: 360 }}
            transition={{ duration: 24, repeat: Infinity, ease: 'linear' }}
            className="absolute h-28 w-28 rounded-full border border-dashed border-[#7047EB]/35 dark:border-[#8B6BFF]/35"
          />
          <motion.div
            animate={prefersReducedMotion ? undefined : { y: [0, -5, 0] }}
            transition={{
              duration: 4.5,
              repeat: Infinity,
              repeatType: 'mirror',
              ease: 'easeInOut',
            }}
            className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] shadow-[0_18px_36px_-10px_rgba(112,71,235,0.38)]"
          >
            <RovixLogo showWordmark={false} />
          </motion.div>
        </div>

        <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]/95 px-4 py-3.5 shadow-[0_12px_28px_-12px_rgba(15,23,42,0.16)] shrink-0">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
            {isActive ? (
              <span className="h-2.5 w-2.5 rounded-full bg-[#0D9488]" />
            ) : (
              <PauseCircle className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            )}
            <span>{isActive ? 'Pipeline Active' : 'Pipeline Standby'}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-[var(--text-muted)]">
            <Clock className="h-3.5 w-3.5 text-[#7047EB] dark:text-[#8B6BFF]" aria-hidden="true" />
            <span>Schedule: {nextScheduled}</span>
          </div>
          <div className="mt-1 font-mono text-[10.5px] text-[var(--text-muted)] tabular-nums">
            {lastSuccessfulRun
              ? `Last crawl: ${new Date(lastSuccessfulRun).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                })}`
              : 'No completed crawl yet'}
          </div>
        </div>
      </div>
    </motion.section>
  );
}
