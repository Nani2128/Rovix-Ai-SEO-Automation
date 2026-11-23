import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Activity,
  Blocks,
  Check,
  CheckSquare,
  Cpu,
  FileBarChart2,
  FilePenLine,
  FolderKanban,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  LineChart,
  Link2,
  MapPin,
  ScanSearch,
  Settings,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { MOBILE_SHEET_SPRING, SPRING_PILL } from '../../config/motion';
import { SIDEBAR_NAV_GROUPS } from '../../config/navigation';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { canAccessNavItem } from '../../utils/dashboardLogic';

const PRIMARY_TABS = [
  { label: 'Overview', path: '/dashboard', icon: LayoutDashboard },
  { label: 'Projects', path: '/projects', icon: FolderKanban },
  { label: 'Audit', path: '/audit', icon: ScanSearch },
  { label: 'Analytics', path: '/analytics', icon: LineChart },
] as const;

const MORE_ICONS = {
  KeyRound,
  Users,
  FilePenLine,
  Link2,
  MapPin,
  Sparkles,
  CheckSquare,
  Activity,
  FileBarChart2,
  Blocks,
  Settings,
  Gauge,
  Cpu,
} as const;

export function MobileBottomNav() {
  const prefersReducedMotion = useReducedMotion();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);

  const user = useAuthStore((s) => s.user);
  const { projects, selectedProjectId, setSelectedProjectId } = useDashboardStore();
  const role = user?.role ?? 'QA';

  useEffect(() => {
    setSheetOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sheetOpen]);

  const secondaryItems = SIDEBAR_NAV_GROUPS.flatMap((g) => g.items).filter(
    (item) =>
      canAccessNavItem(role, item.requiredRoles) &&
      !PRIMARY_TABS.some((p) => p.path === item.path),
  );

  const isSecondaryActive = secondaryItems.some((item) => pathname === item.path);

  return (
    <>
      <nav
        aria-label="Mobile Primary Navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-hairline)] bg-[var(--bg-glass)] backdrop-blur-md lg:hidden"
      >
        <div className="mx-auto grid h-16 max-w-lg grid-cols-5 items-center px-1">
          {PRIMARY_TABS.map((tab) => {
            const Icon = tab.icon;
            const active =
              pathname === tab.path ||
              (tab.path === '/audit' && pathname.startsWith('/audit/'));

            return (
              <NavLink
                key={tab.path}
                to={tab.path}
                aria-current={active ? 'page' : undefined}
                className={`relative flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7047EB] ${
                  active
                    ? 'text-[#7047EB] dark:text-[#8B6BFF]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="mobile-bottom-active-bar"
                    transition={prefersReducedMotion ? { duration: 0 } : SPRING_PILL}
                    className="absolute top-0 h-[2.5px] w-7 rounded-full bg-gradient-to-r from-[#7047EB] to-[#2563EB]"
                  />
                )}
                <Icon className="h-[20px] w-[20px]" aria-hidden="true" />
                <span className="text-[10px] font-semibold tracking-tight leading-none">
                  {tab.label}
                </span>
              </NavLink>
            );
          })}

          <button
            type="button"
            onClick={() => setSheetOpen((prev) => !prev)}
            aria-expanded={sheetOpen}
            aria-label="More workspace navigation"
            className={`relative flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7047EB] ${
              sheetOpen || isSecondaryActive
                ? 'text-[#7047EB] dark:text-[#8B6BFF]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <LayoutGrid className="h-[20px] w-[20px]" aria-hidden="true" />
            <span className="text-[10px] font-semibold tracking-tight leading-none">
              More
            </span>
          </button>
        </div>
      </nav>

      {/* Slide-up Bottom Sheet Drawer for Secondary Modules & Project Switch */}
      <AnimatePresence>
        {sheetOpen && (
          <div
            className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="More workspace modules"
          >
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setSheetOpen(false)}
              className="fixed inset-0 bg-slate-950/50 backdrop-blur-[2px]"
            />

            <motion.div
              initial={prefersReducedMotion ? false : { y: '100%' }}
              animate={{ y: 0 }}
              exit={prefersReducedMotion ? undefined : { y: '100%' }}
              transition={prefersReducedMotion ? { duration: 0 } : MOBILE_SHEET_SPRING}
              className="relative z-10 max-h-[82vh] overflow-y-auto rounded-t-3xl border-t border-[var(--border-hairline)] bg-[var(--bg-surface)] px-5 pb-8 pt-3 shadow-[0_-20px_50px_-14px_rgba(15,23,42,0.4)]"
            >
              <div
                aria-hidden="true"
                className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700"
              />

              <div className="flex items-center justify-between pb-3 border-b border-[var(--border-hairline)]">
                <div>
                  <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
                    Workspace Modules
                  </h2>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Quick access &amp; project context
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  aria-label="Close workspace sheet"
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {projects.length > 0 && (
                <div className="mt-4">
                  <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Active Domain Project
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {projects.map((proj) => {
                      const selected = proj.id === selectedProjectId;
                      return (
                        <button
                          key={proj.id}
                          type="button"
                          onClick={() => {
                            setSelectedProjectId(proj.id);
                            setSheetOpen(false);
                          }}
                          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold cursor-pointer transition-colors ${
                            selected
                              ? 'border-[#7047EB] bg-[#7047EB]/12 text-[#7047EB] dark:text-[#C4B5FD]'
                              : 'border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                          }`}
                        >
                          {selected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                          <span>{proj.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {secondaryItems.map((item) => {
                  const Icon =
                    MORE_ICONS[item.iconName as keyof typeof MORE_ICONS] ?? Activity;
                  const active = pathname === item.path;
                  return (
                    <button
                      key={item.path}
                      type="button"
                      onClick={() => {
                        setSheetOpen(false);
                        navigate(item.path);
                      }}
                      className={`flex min-h-[52px] items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 text-left text-xs font-semibold cursor-pointer transition-colors ${
                        active
                          ? 'border-[#7047EB] bg-[#7047EB]/12 text-[#7047EB] dark:text-[#C4B5FD]'
                          : 'border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--text-primary)] hover:border-[#7047EB]/40'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-[#7047EB] dark:text-[#8B6BFF]" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
