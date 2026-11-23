import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Activity,
  ArrowRight,
  Blocks,
  CalendarClock,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Coins,
  Compass,
  Cpu,
  FileBarChart2,
  FilePenLine,
  FileSearch2,
  FolderKanban,
  Gauge,
  Globe,
  KeyRound,
  LayoutDashboard,
  LineChart,
  Link2,
  MapPin,
  Plus,
  ScanSearch,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  X,
} from 'lucide-react';
import { MOTION_EASE, SPRING_PILL } from '../../config/motion';
import {
  SIDEBAR_NAV_GROUPS,
  type SidebarNavItem,
} from '../../config/navigation';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { useToastStore } from '../../stores/useToastStore';
import { canAccessNavItem } from '../../utils/dashboardLogic';
import { FloatingPopover } from '../animation/MotionPrimitives';
import { RovixLogo } from '../RovixLogo';

const ICON_MAP: Record<SidebarNavItem['iconName'], typeof LayoutDashboard> = {
  LayoutDashboard,
  FolderKanban,
  ScanSearch,
  KeyRound,
  Users,
  FilePenLine,
  Link2,
  MapPin,
  Sparkles,
  LineChart,
  CheckSquare,
  Activity,
  FileBarChart2,
  Blocks,
  Settings,
  Gauge,
  Globe,
  Cpu,
  Workflow,
  Coins,
  CalendarClock,
  Compass,
  FileSearch2,
};

export function Sidebar() {
  const prefersReducedMotion = useReducedMotion();
  const location = useLocation();
  const navigate = useNavigate();

  const user = useAuthStore((s) => s.user);
  const {
    sidebarCollapsed,
    toggleSidebar,
    mobileDrawerOpen,
    setMobileDrawerOpen,
    projects,
    selectedProjectId,
    setSelectedProjectId,
  } = useDashboardStore();
  const pushToast = useToastStore((s) => s.pushToast);

  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const projectBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileDrawerOpen, setMobileDrawerOpen]);

  const activeProject =
    projects.find((p) => p.id === selectedProjectId) ?? projects[0] ?? null;
  const role = user?.role ?? 'QA';

  const renderSidebarContent = (isMobile: boolean) => {
    const collapsed = isMobile ? false : sidebarCollapsed;

    return (
      <div className="flex h-full flex-col justify-between bg-[var(--bg-surface)] border-r border-[var(--border-hairline)]">
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Top Brand Row */}
          <div className="flex h-[68px] shrink-0 items-center justify-between px-4 border-b border-[var(--border-hairline)]">
            <NavLink
              to="/dashboard"
              onClick={() => setMobileDrawerOpen(false)}
              className="flex items-center overflow-hidden"
            >
              <RovixLogo showWordmark={!collapsed} />
            </NavLink>

            {isMobile ? (
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                aria-label="Close sidebar"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:border-[#7047EB]/45 hover:text-[var(--text-primary)] cursor-pointer transition-colors"
              >
                {collapsed ? (
                  <ChevronRight className="h-3.5 w-3.5" />
                ) : (
                  <ChevronLeft className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>

          {/* Workspace / Project Selector */}
          {!collapsed && (
            <div className="relative shrink-0 px-3.5 pt-3">
              {projects.length === 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setMobileDrawerOpen(false);
                    navigate('/projects');
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-left hover:border-[#7047EB]/45 cursor-pointer transition-colors"
                >
                  <div className="min-w-0">
                    <div className="truncate font-display text-xs font-semibold text-[var(--text-primary)]">
                      No projects yet
                    </div>
                    <div className="truncate text-[11px] text-[var(--text-muted)]">
                      Create your first domain
                    </div>
                  </div>
                  <Plus className="h-3.5 w-3.5 shrink-0 text-[#7047EB] dark:text-[#8B6BFF]" />
                </button>
              ) : (
                <>
                  <button
                    ref={isMobile ? undefined : projectBtnRef}
                    type="button"
                    onClick={() => setProjectMenuOpen((p) => !p)}
                    aria-expanded={projectMenuOpen}
                    aria-label="Switch active project workspace"
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-left hover:border-[#7047EB]/40 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7047EB]"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-display text-xs font-semibold text-[var(--text-primary)]">
                        {activeProject?.name ?? 'Select project'}
                      </div>
                      <div className="truncate text-[11px] text-[var(--text-muted)]">
                        {activeProject?.website ?? 'No domain configured'}
                      </div>
                    </div>
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-transform duration-150 ${
                        projectMenuOpen ? 'rotate-180 text-[#7047EB] dark:text-[#8B6BFF]' : ''
                      }`}
                    />
                  </button>

                  <FloatingPopover
                    open={projectMenuOpen && projects.length > 0}
                    onClose={() => setProjectMenuOpen(false)}
                    anchorRef={isMobile ? undefined : projectBtnRef}
                    className="absolute inset-x-3.5 top-full z-30 mt-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-1.5 shadow-[0_16px_32px_-12px_rgba(15,23,42,0.28)]"
                  >
                    {projects.map((proj) => {
                      const selected = proj.id === selectedProjectId;
                      return (
                        <button
                          key={proj.id}
                          type="button"
                          onClick={() => {
                            setSelectedProjectId(proj.id);
                            setProjectMenuOpen(false);
                            pushToast({
                              title: `Switched workspace to ${proj.name}`,
                              detail: proj.website,
                              tone: 'info',
                            });
                          }}
                          className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs cursor-pointer transition-colors ${
                            selected
                              ? 'bg-[#7047EB]/12 text-[#7047EB] dark:text-[#8B6BFF] font-semibold'
                              : 'text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="truncate">{proj.name}</div>
                            <div className="truncate text-[10.5px] text-[var(--text-muted)]">
                              {proj.website}
                            </div>
                          </div>
                          {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
                        </button>
                      );
                    })}
                  </FloatingPopover>
                </>
              )}
            </div>
          )}

          {/* Navigation Groups */}
          <nav
            aria-label="Workspace Navigation"
            className="mt-2.5 min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3"
          >
            {SIDEBAR_NAV_GROUPS.map((group) => {
              const visibleItems = group.items.filter((item) =>
                canAccessNavItem(role, item.requiredRoles),
              );
              if (visibleItems.length === 0) return null;

              return (
                <div key={group.title}>
                  {!collapsed && (
                    <div className="px-2.5 pb-1 font-display text-[10.5px] font-semibold tracking-[0.08em] text-[var(--text-muted)] uppercase">
                      {group.title}
                    </div>
                  )}
                  <ul className="space-y-0.5">
                    {visibleItems.map((item) => {
                      const Icon = ICON_MAP[item.iconName];
                      const active =
                        location.pathname === item.path ||
                        (item.path === '/audit' &&
                          location.pathname.startsWith('/audit/'));

                      return (
                        <li key={item.path}>
                          <NavLink
                            to={item.path}
                            onClick={() => setMobileDrawerOpen(false)}
                            title={collapsed ? item.label : undefined}
                            className={`relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)] ${
                              collapsed ? 'justify-center px-2' : ''
                            } ${
                              active
                                ? 'text-[var(--accent-on-pill)] font-semibold'
                                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            {active && (
                              <motion.span
                                layoutId={
                                  isMobile
                                    ? 'mobile-sidebar-active-pill'
                                    : 'desktop-sidebar-active-pill'
                                }
                                transition={
                                  prefersReducedMotion ? { duration: 0 } : SPRING_PILL
                                }
                                className="absolute inset-0 rounded-xl shadow-[0_8px_18px_-6px_var(--focus-ring)]"
                                style={{
                                  background:
                                    'linear-gradient(90deg, var(--accent-pill-start), var(--accent-pill-end))',
                                }}
                              />
                            )}
                            <Icon
                              className={`relative z-10 h-4 w-4 shrink-0 transition-transform duration-150 ${
                                active ? 'text-[var(--accent-on-pill)]' : 'text-[var(--text-muted)]'
                              }`}
                              aria-hidden="true"
                            />
                            {!collapsed && (
                              <span className="relative z-10 truncate">
                                {item.label}
                              </span>
                            )}
                          </NavLink>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </nav>
        </div>

        {/* Bottom Workspace Readiness Card */}
        {!collapsed && (
          <div className="shrink-0 border-t border-[var(--border-hairline)] p-3">
            <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#7047EB]/12 text-[#7047EB] dark:text-[#8B6BFF] shrink-0">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                </div>
                <div className="font-display text-xs font-bold text-[var(--text-primary)]">
                  Google Connectors
                </div>
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-[var(--text-muted)]">
                Connect Search Console & GA4 OAuth or inspect crawler health.
              </p>
              <button
                type="button"
                onClick={() => {
                  setMobileDrawerOpen(false);
                  navigate('/integrations');
                }}
                className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-[var(--accent-on-pill)] cursor-pointer hover:opacity-95 transition-opacity"
                style={{
                  background:
                    'linear-gradient(90deg, var(--accent-pill-start), var(--accent-pill-end))',
                }}
              >
                <span>Manage Integrations</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <aside
        className={`hidden lg:block shrink-0 transition-[width] duration-200 ease-out ${
          sidebarCollapsed ? 'w-[76px]' : 'w-[248px]'
        }`}
      >
        <div className="sticky top-0 h-screen">{renderSidebarContent(false)}</div>
      </aside>

      <AnimatePresence>
        {mobileDrawerOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setMobileDrawerOpen(false)}
              className="fixed inset-0 bg-slate-950/50 backdrop-blur-[2px]"
            />
            <motion.aside
              initial={prefersReducedMotion ? false : { x: '-100%' }}
              animate={{ x: 0 }}
              exit={prefersReducedMotion ? undefined : { x: '-100%' }}
              transition={{ duration: 0.24, ease: MOTION_EASE }}
              className="relative z-10 h-full w-[264px]"
            >
              {renderSidebarContent(true)}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
