import { Link, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  Activity,
  AlertOctagon,
  CheckCircle2,
  GitCompare,
  Globe,
  LayoutGrid,
  Play,
  ShieldCheck,
} from 'lucide-react';
import { SPRING_PILL } from '../../config/motion';
import type { BadgeTone } from '../ui/StateViews';
import type { CrawlJobState } from '../../types/crawl';
import type { IssueSeverity } from '../../types/technicalIssue';

export function crawlStatusTone(status: CrawlJobState): BadgeTone {
  switch (status) {
    case 'Succeeded':
      return 'success';
    case 'Running':
    case 'Queued':
      return 'indigo';
    case 'Retrying':
    case 'Partial':
      return 'warning';
    case 'Failed':
      return 'danger';
    case 'Cancelled':
      return 'neutral';
  }
}

export function severityTone(severity: IssueSeverity): BadgeTone {
  switch (severity) {
    case 'Critical':
      return 'danger';
    case 'High':
      return 'warning';
    case 'Medium':
      return 'indigo';
    case 'Low':
      return 'info';
    case 'Informational':
      return 'neutral';
  }
}

export function AuditSubNav({
  latestCrawlId,
  activeProjectName,
}: {
  latestCrawlId?: string | null;
  activeProjectName?: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  const { pathname } = useLocation();

  const tabs = [
    {
      label: 'Overview',
      to: '/audit',
      icon: LayoutGrid,
      active: pathname === '/audit',
    },
    {
      label: 'New Crawl',
      to: '/audit/new',
      icon: Play,
      active: pathname.startsWith('/audit/new'),
    },
    {
      label: 'Live Crawl',
      to: latestCrawlId ? `/audit/live/${latestCrawlId}` : '/audit/live',
      icon: Activity,
      active: pathname.startsWith('/audit/live'),
    },
    {
      label: 'URL Explorer',
      to: latestCrawlId ? `/audit/urls/${latestCrawlId}` : '/audit/urls',
      icon: Globe,
      active: pathname.startsWith('/audit/urls'),
    },
    {
      label: 'Issues',
      to: '/audit/issues',
      icon: AlertOctagon,
      active: pathname.startsWith('/audit/issues'),
    },
    {
      label: 'History & Compare',
      to: '/audit/history',
      icon: GitCompare,
      active: pathname.startsWith('/audit/history'),
    },
    {
      label: 'Reverification',
      to: '/audit/reverify',
      icon: CheckCircle2,
      active: pathname.startsWith('/audit/reverify'),
    },
  ];

  return (
    <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] pb-4 sm:flex-row sm:items-center sm:justify-between">
      <nav
        aria-label="Technical Audit Navigation"
        className="flex flex-wrap items-center gap-1.5"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Link
              key={tab.label}
              to={tab.to}
              aria-current={tab.active ? 'page' : undefined}
              className={`relative inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7047EB] ${
                tab.active
                  ? 'text-white'
                  : 'border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[#7047EB]/35 hover:text-[var(--text-primary)]'
              }`}
            >
              {tab.active && (
                <motion.span
                  layoutId="audit-subnav-active"
                  transition={prefersReducedMotion ? { duration: 0 } : SPRING_PILL}
                  className="absolute inset-0 rounded-xl bg-[#7047EB] shadow-[0_6px_14px_-4px_rgba(112,71,235,0.45)]"
                />
              )}
              <Icon className="relative z-10 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="relative z-10">{tab.label}</span>
            </Link>
          );
        })}
      </nav>

      {activeProjectName && (
        <div className="inline-flex items-center gap-1.5 self-start rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] sm:self-auto">
          <ShieldCheck
            className="h-3.5 w-3.5 text-[#0D9488] dark:text-[#2DD4BF]"
            aria-hidden="true"
          />
          <span>Domain: {activeProjectName}</span>
        </div>
      )}
    </div>
  );
}
