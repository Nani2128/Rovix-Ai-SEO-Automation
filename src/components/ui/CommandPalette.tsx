import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  CheckSquare,
  Compass,
  CornerDownLeft,
  FolderKanban,
  Loader2,
  ScanSearch,
  Search,
  X,
} from 'lucide-react';
import { SPRING_PILL } from '../../config/motion';
import { SIDEBAR_NAV_GROUPS } from '../../config/navigation';
import { dashboardService } from '../../services/dashboardService';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDashboardStore } from '../../stores/useDashboardStore';
import type { GlobalSearchResponse } from '../../types/dashboard';
import { canAccessNavItem } from '../../utils/dashboardLogic';
import { nextCommandIndex } from '../../utils/uiMotionLogic';
import { SmoothModal } from '../animation/MotionPrimitives';
import { StatusBadge, type BadgeTone } from './StateViews';

type SearchScope = 'all' | 'pages' | 'issues' | 'projects';

interface PaletteItem {
  id: string;
  title: string;
  subtitle: string;
  group: string;
  kind: 'page' | 'issue' | 'crawl' | 'task' | 'project';
  badgeLabel?: string;
  badgeTone?: BadgeTone;
  action: () => void;
}

const SEVERITY_TONE: Record<string, BadgeTone> = {
  Critical: 'danger',
  High: 'warning',
  Medium: 'indigo',
  Low: 'info',
  Informational: 'neutral',
  Info: 'neutral',
};

export function CommandPalette() {
  const prefersReducedMotion = useReducedMotion();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    projects,
    selectedProjectId,
    setSelectedProjectId,
  } = useDashboardStore();

  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<SearchScope>('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<GlobalSearchResponse | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  useEffect(() => {
    if (!commandPaletteOpen) {
      setQuery('');
      setScope('all');
      setActiveIndex(0);
      setSearchResults(null);
      setSearching(false);
      return;
    }
    setActiveIndex(0);
  }, [commandPaletteOpen]);

  // Fetch tenant-scoped crawl issues, crawl runs, and tasks when palette opens or query changes
  useEffect(() => {
    if (!commandPaletteOpen) return;

    const controller = new AbortController();
    const delayMs = query.trim() ? 140 : 0;

    const timer = window.setTimeout(() => {
      setSearching(true);
      void dashboardService
        .globalSearch({
          query,
          projectId: selectedProjectId,
          signal: controller.signal,
        })
        .then((res) => {
          setSearchResults(res);
          setSearching(false);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setSearching(false);
          }
        });
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [commandPaletteOpen, query, selectedProjectId]);

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();
    const role = user?.role ?? 'QA';

    const navResults: PaletteItem[] = SIDEBAR_NAV_GROUPS.flatMap((g) =>
      g.items
        .filter((item) => canAccessNavItem(role, item.requiredRoles))
        .map((item) => ({
          id: `nav-${item.path}`,
          title: item.label,
          subtitle: `${g.title} · ${item.path}`,
          group: 'PAGES',
          kind: 'page' as const,
          action: () => {
            navigate(item.path);
            setCommandPaletteOpen(false);
          },
        })),
    );

    const auditQuickLinks: PaletteItem[] = [
      { label: 'New Technical Crawl', path: '/audit/new' },
      { label: 'Live Crawl Monitor', path: '/audit/live' },
      { label: 'URL Inventory Explorer', path: '/audit/urls' },
      { label: 'Technical SEO Issues', path: '/audit/issues' },
      { label: 'Crawl History & Comparison', path: '/audit/history' },
      { label: 'Fix Reverification Queue', path: '/audit/reverify' },
    ].map((a) => ({
      id: `audit-${a.path}`,
      title: a.label,
      subtitle: `TECHNICAL SEO AUDIT · ${a.path}`,
      group: 'PAGES',
      kind: 'page' as const,
      action: () => {
        navigate(a.path);
        setCommandPaletteOpen(false);
      },
    }));

    const filteredPages = [...navResults, ...auditQuickLinks].filter((c) => {
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        c.subtitle.toLowerCase().includes(q) ||
        c.group.toLowerCase().includes(q)
      );
    });

    const issueResults: PaletteItem[] = (searchResults?.issues ?? []).map((issue) => ({
      id: `issue-${issue.id}`,
      title: `[${issue.ruleId}] ${issue.title}`,
      subtitle: `${issue.projectName} · ${issue.category} · ${issue.affectedUrlCount} URL${
        issue.affectedUrlCount === 1 ? '' : 's'
      } (${issue.status})`,
      group: 'CRAWL ISSUES',
      kind: 'issue' as const,
      badgeLabel: issue.severity,
      badgeTone: SEVERITY_TONE[issue.severity] ?? 'neutral',
      action: () => {
        setSelectedProjectId(issue.projectId);
        navigate(`/audit/issues/${issue.id}`);
        setCommandPaletteOpen(false);
      },
    }));

    const crawlResults: PaletteItem[] = (searchResults?.crawls ?? []).map((crawl) => ({
      id: `crawl-${crawl.id}`,
      title: `Crawl ${crawl.id} · ${crawl.projectName}`,
      subtitle: `${crawl.crawlType} crawl · ${crawl.processedCount}/${Math.max(
        crawl.processedCount,
        crawl.discoveredCount,
      )} URLs · Health ${crawl.healthScore}/100`,
      group: 'RECENT CRAWLS',
      kind: 'crawl' as const,
      badgeLabel: crawl.status,
      badgeTone:
        crawl.status === 'Failed'
          ? 'danger'
          : crawl.status === 'Partial'
            ? 'warning'
            : crawl.status === 'Running' || crawl.status === 'Queued'
              ? 'indigo'
              : 'success',
      action: () => {
        setSelectedProjectId(crawl.projectId);
        navigate(
          crawl.status === 'Succeeded' || crawl.status === 'Partial'
            ? `/audit/urls/${crawl.id}`
            : `/audit/live/${crawl.id}`,
        );
        setCommandPaletteOpen(false);
      },
    }));

    const taskResults: PaletteItem[] = (searchResults?.tasks ?? []).map((task) => ({
      id: `task-${task.id}`,
      title: task.title,
      subtitle: `${task.projectName} · ${task.responsibleRole} · ${task.taskStatus}`,
      group: 'TASKS',
      kind: 'task' as const,
      badgeLabel: task.taskStatus,
      badgeTone: 'indigo',
      action: () => {
        setSelectedProjectId(task.projectId);
        navigate('/tasks');
        setCommandPaletteOpen(false);
      },
    }));

    const projectResults: PaletteItem[] = projects
      .filter((proj) => {
        if (!q) return true;
        return (
          proj.name.toLowerCase().includes(q) ||
          proj.website.toLowerCase().includes(q)
        );
      })
      .map((proj) => ({
        id: `proj-${proj.id}`,
        title: proj.name,
        subtitle: `Switch workspace to ${proj.website}`,
        group: 'PROJECTS',
        kind: 'project' as const,
        badgeLabel: proj.status,
        badgeTone:
          proj.status === 'Active'
            ? 'success'
            : proj.status === 'Blocked'
              ? 'danger'
              : 'warning',
        action: () => {
          setSelectedProjectId(proj.id);
          navigate('/dashboard');
          setCommandPaletteOpen(false);
        },
      }));

    if (scope === 'pages') return filteredPages;
    if (scope === 'issues') return [...issueResults, ...crawlResults];
    if (scope === 'projects') return projectResults;

    // In 'all' mode: when user types a query, surface matched issues + pages + crawls + projects cleanly
    if (q) {
      return [
        ...issueResults,
        ...filteredPages,
        ...crawlResults,
        ...taskResults,
        ...projectResults,
      ];
    }

    // Empty query default: top pages + top open critical/high crawl issues + projects
    return [
      ...issueResults.slice(0, 5),
      ...filteredPages.slice(0, 10),
      ...crawlResults.slice(0, 3),
      ...projectResults.slice(0, 5),
    ];
  }, [
    query,
    scope,
    user?.role,
    projects,
    searchResults,
    navigate,
    setCommandPaletteOpen,
    setSelectedProjectId,
  ]);

  useEffect(() => {
    setActiveIndex((prev) =>
      items.length === 0 ? -1 : Math.min(Math.max(0, prev), items.length - 1),
    );
  }, [items.length]);

  useEffect(() => {
    if (activeIndex >= 0 && itemRefs.current[activeIndex]) {
      itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => nextCommandIndex(prev, items.length, 'down'));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => nextCommandIndex(prev, items.length, 'up'));
    } else if (e.key === 'Enter' && activeIndex >= 0 && items[activeIndex]) {
      e.preventDefault();
      items[activeIndex].action();
    }
  };

  const scopeTabs: { id: SearchScope; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'issues', label: 'Crawl Issues' },
    { id: 'pages', label: 'Pages' },
    { id: 'projects', label: 'Projects' },
  ];

  const renderKindIcon = (kind: PaletteItem['kind']) => {
    if (kind === 'issue') {
      return <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" aria-hidden="true" />;
    }
    if (kind === 'crawl') {
      return <ScanSearch className="h-4 w-4 text-[#0891B2] dark:text-[#22D3EE] shrink-0" aria-hidden="true" />;
    }
    if (kind === 'task') {
      return <CheckSquare className="h-4 w-4 text-[#7047EB] dark:text-[#8B6BFF] shrink-0" aria-hidden="true" />;
    }
    if (kind === 'project') {
      return <FolderKanban className="h-4 w-4 text-emerald-500 shrink-0" aria-hidden="true" />;
    }
    return <Compass className="h-4 w-4 text-[#7047EB] dark:text-[#8B6BFF] shrink-0" aria-hidden="true" />;
  };

  return (
    <SmoothModal
      open={commandPaletteOpen}
      onClose={() => setCommandPaletteOpen(false)}
      ariaLabel="Global command palette"
      maxWidthClass="max-w-2xl"
      alignTop
    >
      <div className="flex items-center gap-3 border-b border-[var(--border-hairline)] px-4 py-3">
        <Search className="h-4 w-4 shrink-0 text-[#7047EB] dark:text-[#8B6BFF]" aria-hidden="true" />
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleInputKeyDown}
          aria-label="Search pages, crawl issues, crawls, or projects"
          placeholder="Search pages, crawl issues (e.g. META-002, canonical, Critical), or projects..."
          className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
        />
        {searching && (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#7047EB]" aria-hidden="true" />
        )}
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(false)}
          aria-label="Close command palette"
          className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scope quick tabs */}
      <div
        role="tablist"
        aria-label="Command palette search scope"
        className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-4 py-2"
      >
        {scopeTabs.map((tab) => {
          const active = scope === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setScope(tab.id);
                setActiveIndex(0);
              }}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-[#7047EB] text-white shadow-2xs'
                  : 'text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="max-h-96 overflow-y-auto p-2" role="listbox" aria-label="Matching commands and crawl issues">
        {items.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">
            {searching
              ? 'Searching workspace...'
              : 'No matching pages, crawl issues, or projects found.'}
          </div>
        ) : (
          items.map((item, idx) => {
            const isActive = idx === activeIndex;
            return (
              <button
                key={item.id}
                ref={(el) => {
                  itemRefs.current[idx] = el;
                }}
                type="button"
                role="option"
                aria-selected={isActive}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={item.action}
                className={`relative flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm cursor-pointer transition-colors ${
                  isActive ? 'text-[#7047EB] dark:text-[#C4B5FD]' : 'text-[var(--text-primary)]'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="command-palette-active"
                    transition={prefersReducedMotion ? { duration: 0 } : SPRING_PILL}
                    className="absolute inset-0 rounded-xl bg-[#7047EB]/10 border border-[#7047EB]/25"
                  />
                )}
                <div className="relative z-10 flex min-w-0 flex-1 items-center gap-3">
                  {renderKindIcon(item.kind)}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{item.title}</div>
                    <div className="truncate text-[11px] text-[var(--text-muted)]">
                      <span className="font-semibold text-[var(--text-secondary)]">
                        {item.group}
                      </span>
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      <span>{item.subtitle}</span>
                    </div>
                  </div>
                </div>
                <div className="relative z-10 flex items-center gap-2 shrink-0">
                  {item.badgeLabel && (
                    <StatusBadge
                      label={item.badgeLabel}
                      tone={item.badgeTone ?? 'neutral'}
                    />
                  )}
                  <ArrowRight
                    className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                      isActive ? 'opacity-100 translate-x-0.5' : 'opacity-40'
                    }`}
                    aria-hidden="true"
                  />
                </div>
              </button>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between border-t border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-4 py-2 text-[11px] text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-2">
          <kbd className="rounded border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-1.5 py-0.5 font-mono text-[10px]">
            ↑↓
          </kbd>
          <span>Navigate</span>
          <kbd className="inline-flex items-center gap-0.5 rounded border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-1.5 py-0.5 font-mono text-[10px]">
            <CornerDownLeft className="h-2.5 w-2.5" />
          </kbd>
          <span>Open</span>
        </span>
        <span>
          <kbd className="rounded border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-1.5 py-0.5 font-mono text-[10px]">
            Esc
          </kbd>{' '}
          to close
        </span>
      </div>
    </SmoothModal>
  );
}
