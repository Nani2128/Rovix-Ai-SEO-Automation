import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  Activity,
  ArrowRight,
  Bell,
  Building2,
  CheckCircle2,
  ChevronDown,
  Database,
  HelpCircle,
  LogOut,
  Menu,
  Search,
  Settings,
  Shield,
  ShieldAlert,
} from 'lucide-react';
import { ALL_ROLES } from '../../config/navigation';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { useToastStore } from '../../stores/useToastStore';
import { FloatingPopover } from '../animation/MotionPrimitives';
import { ThemeSelectorDropdown } from '../ui/ThemeSelectorDropdown';
import { ThemeToggle } from '../ui/ThemeToggle';

type NotifFilter = 'all' | 'crawls' | 'syncs';

export function TopNav() {
  const prefersReducedMotion = useReducedMotion();
  const navigate = useNavigate();

  const { user, tenant, logout, switchDevRole, devMode, productionSafe } =
    useAuthStore();
  const { setMobileDrawerOpen, setCommandPaletteOpen, overview } =
    useDashboardStore();
  const pushToast = useToastStore((s) => s.pushToast);

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifFilter, setNotifFilter] = useState<NotifFilter>('all');
  const [helpOpen, setHelpOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const notifBtnRef = useRef<HTMLButtonElement>(null);
  const helpBtnRef = useRef<HTMLButtonElement>(null);
  const profileBtnRef = useRef<HTMLButtonElement>(null);

  const closeAll = () => {
    setNotifOpen(false);
    setHelpOpen(false);
    setProfileOpen(false);
  };

  const handleLogout = async () => {
    closeAll();
    await logout();
    navigate('/login', { replace: true });
  };

  const allNotifications = overview?.recentActivity ?? [];
  const filteredNotifications = useMemo(() => {
    const list =
      notifFilter === 'all'
        ? allNotifications
        : notifFilter === 'crawls'
          ? allNotifications.filter(
              (ev) =>
                ev.type === 'crawl' ||
                ev.type === 'issue' ||
                ev.type === 'verification',
            )
          : allNotifications.filter(
              (ev) =>
                ev.type === 'sync' ||
                ev.type === 'integration_failure' ||
                ev.type === 'keyword_approval',
            );
    return list.slice(0, 6);
  }, [allNotifications, notifFilter]);

  return (
    <header className="sticky top-0 z-30 flex h-[56px] sm:h-[68px] items-center justify-between gap-3 border-b border-[var(--border-hairline)] bg-[var(--bg-glass)] backdrop-blur-md px-3.5 sm:px-7">
      {/* Left: Mobile Drawer Trigger + Global Search / Command Palette */}
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => setMobileDrawerOpen(true)}
          aria-label="Open navigation sidebar"
          className="inline-flex lg:hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7047EB]"
        >
          <Menu className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          aria-label="Open global search and command palette"
          className="flex h-10 w-10 sm:h-auto sm:w-auto sm:min-w-0 sm:flex-1 sm:max-w-md items-center justify-center sm:justify-between gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 sm:px-3 sm:py-2 text-left text-xs sm:text-sm text-[var(--text-muted)] shadow-2xs hover:border-[var(--accent-primary)]/40 hover:bg-[var(--bg-surface)] cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]"
        >
          <span className="flex min-w-0 items-center gap-2 sm:truncate">
            <Search className="h-4 w-4 shrink-0 text-[var(--accent-primary)]" aria-hidden="true" />
            <span className="hidden sm:inline truncate">Search projects, crawls, issues...</span>
          </span>
          <kbd className="hidden sm:inline-flex shrink-0 items-center rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-[var(--text-muted)]">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right: Org Badge, Theme Toggle, Notification Center, Help, User Profile Dropdown */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        {tenant && (
          <div className="hidden xl:flex items-center gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)]">
            <Building2 className="h-3.5 w-3.5 text-[#7047EB] dark:text-[#8B6BFF]" aria-hidden="true" />
            <span>{tenant.name}</span>
          </div>
        )}

        <ThemeSelectorDropdown compact />
        <ThemeToggle compact />

        {/* Notification Center */}
        <div className="relative">
          <motion.button
            ref={notifBtnRef}
            type="button"
            whileTap={prefersReducedMotion ? undefined : { scale: 0.96 }}
            onClick={() => {
              const next = !notifOpen;
              closeAll();
              setNotifOpen(next);
            }}
            aria-label="Workspace Notification Center"
            aria-expanded={notifOpen}
            className={`relative flex h-9 w-9 items-center justify-center rounded-xl border transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7047EB] ${
              notifOpen
                ? 'border-[#7047EB]/45 bg-[#7047EB]/12 text-[#7047EB] dark:text-[#A78BFA]'
                : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
            }`}
          >
            <Bell className="h-4 w-4" />
            {allNotifications.length > 0 && (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[#7047EB]" />
            )}
          </motion.button>

          <FloatingPopover
            open={notifOpen}
            onClose={() => setNotifOpen(false)}
            anchorRef={notifBtnRef}
            className="absolute right-0 mt-2 w-[336px] max-w-[calc(100vw-2rem)] rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--shadow-elevated)]"
          >
            <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-2.5">
              <div>
                <span className="font-display text-xs font-bold text-[var(--text-primary)]">
                  Notification Center
                </span>
                <div className="text-[10.5px] text-[var(--text-muted)]">
                  Verified SQLite activity feed
                </div>
              </div>
              <span className="rounded-md bg-[var(--bg-subtle)] px-2 py-0.5 font-mono text-[10.5px] font-semibold text-[#7047EB] dark:text-[#C4B5FD]">
                {allNotifications.length} logged
              </span>
            </div>

            <div className="mt-2.5 flex items-center gap-1 rounded-xl bg-[var(--bg-subtle)] p-1">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'crawls', label: 'Crawls & Fixes' },
                  { id: 'syncs', label: 'Integrations' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setNotifFilter(tab.id)}
                  className={`flex-1 rounded-lg py-1 text-[11px] font-semibold cursor-pointer transition-colors ${
                    notifFilter === tab.id
                      ? 'bg-[var(--bg-surface)] text-[#7047EB] dark:text-[#C4B5FD] shadow-2xs'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="mt-2.5 max-h-72 space-y-2 overflow-y-auto pr-0.5">
              {filteredNotifications.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border-hairline)] py-6 text-center text-xs text-[var(--text-muted)]">
                  No persisted workspace events in this filter yet.
                </div>
              ) : (
                filteredNotifications.map((ev) => {
                  const Icon =
                    ev.type === 'crawl'
                      ? Activity
                      : ev.type === 'integration_failure'
                        ? ShieldAlert
                        : ev.type === 'sync'
                          ? Database
                          : CheckCircle2;
                  const iconColor =
                    ev.status === 'Failed'
                      ? 'text-[#E05275] bg-[#E05275]/10'
                      : ev.status === 'Succeeded'
                        ? 'text-[#0D9488] bg-[#0D9488]/10'
                        : 'text-[#7047EB] bg-[#7047EB]/10';
                  return (
                    <div
                      key={ev.id}
                      className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-2.5 text-xs transition-colors hover:border-[#7047EB]/35"
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${iconColor}`}
                        >
                          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-[var(--text-primary)] leading-snug">
                            {ev.action}
                          </div>
                          <div className="mt-0.5 text-[10.5px] text-[var(--text-muted)]">
                            {ev.actor} · {ev.timestamp}
                          </div>
                          {ev.evidenceUrl && (
                            <button
                              type="button"
                              onClick={() => {
                                setNotifOpen(false);
                                navigate(ev.evidenceUrl!);
                              }}
                              className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-semibold text-[#7047EB] dark:text-[#A78BFA] hover:underline cursor-pointer"
                            >
                              <span>Inspect Evidence</span>
                              <ArrowRight className="h-2.5 w-2.5" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </FloatingPopover>
        </div>

        {/* Help Center */}
        <div className="relative hidden sm:block">
          <motion.button
            ref={helpBtnRef}
            type="button"
            whileTap={prefersReducedMotion ? undefined : { scale: 0.96 }}
            onClick={() => {
              const next = !helpOpen;
              closeAll();
              setHelpOpen(next);
            }}
            aria-label="Help center"
            aria-expanded={helpOpen}
            className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7047EB] ${
              helpOpen
                ? 'border-[#7047EB]/45 bg-[#7047EB]/12 text-[#7047EB] dark:text-[#A78BFA]'
                : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
            }`}
          >
            <HelpCircle className="h-4 w-4" />
          </motion.button>

          <FloatingPopover
            open={helpOpen}
            onClose={() => setHelpOpen(false)}
            anchorRef={helpBtnRef}
            className="absolute right-0 mt-2 w-72 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-elevated)]"
          >
            <div className="font-display text-xs font-bold text-[var(--text-primary)]">
              Rovix Workspace Guide
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-muted)]">
              Press <kbd className="rounded border border-[var(--border-hairline)] px-1 font-mono">⌘K</kbd> anytime
              to jump across technical audits, URL topology, Google OAuth integrations, or domain settings.
            </p>
            <button
              type="button"
              onClick={() => {
                closeAll();
                navigate('/monitoring');
              }}
              className="mt-3 text-xs font-semibold text-[#7047EB] dark:text-[#A78BFA] hover:underline cursor-pointer"
            >
              Inspect System Health →
            </button>
          </FloatingPopover>
        </div>

        {/* User Avatar & Profile Dropdown */}
        <div className="relative">
          <motion.button
            ref={profileBtnRef}
            type="button"
            whileTap={prefersReducedMotion ? undefined : { scale: 0.985 }}
            onClick={() => {
              const next = !profileOpen;
              closeAll();
              setProfileOpen(next);
            }}
            aria-expanded={profileOpen}
            aria-label="User profile and role menu"
            className={`flex items-center gap-2 rounded-xl border py-1.5 pl-2 pr-2.5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7047EB] ${
              profileOpen
                ? 'border-[#7047EB]/45 bg-[#7047EB]/8'
                : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]'
            }`}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#7047EB] to-[#2563EB] font-display text-xs font-bold text-white shadow-2xs">
              {user?.avatarInitials ?? 'RA'}
            </span>
            <span className="hidden sm:block text-left">
              <span className="block font-display text-xs font-semibold leading-tight text-[var(--text-primary)]">
                {user?.name ?? 'User'}
              </span>
              <span className="block text-[10.5px] leading-tight text-[var(--text-muted)]">
                {user?.role ?? 'Member'}
              </span>
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 text-[var(--text-muted)] transition-transform duration-150 ${
                profileOpen ? 'rotate-180 text-[#7047EB] dark:text-[#8B6BFF]' : ''
              }`}
              aria-hidden="true"
            />
          </motion.button>

          <FloatingPopover
            open={profileOpen}
            onClose={() => setProfileOpen(false)}
            anchorRef={profileBtnRef}
            className="absolute right-0 mt-2 w-64 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-2 shadow-[var(--shadow-elevated)]"
          >
            <div className="border-b border-[var(--border-hairline)] px-3 py-2">
              <div className="text-xs font-semibold text-[var(--text-primary)]">
                {user?.name}
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">{user?.email}</div>
            </div>

            {devMode && !productionSafe && (
              <div className="border-b border-[var(--border-hairline)] px-3 py-2.5">
                <label
                  htmlFor="dev-role-select"
                  className="flex items-center gap-1.5 text-[10.5px] font-semibold text-[#7047EB] dark:text-[#8B6BFF] uppercase tracking-wider"
                >
                  <Shield className="h-3 w-3" aria-hidden="true" />
                  <span>Dev RBAC Test Role</span>
                </label>
                <select
                  id="dev-role-select"
                  value={user?.role ?? 'Agency Owner'}
                  onChange={(e) => {
                    const nextRole = e.target.value as (typeof ALL_ROLES)[number];
                    void switchDevRole(nextRole).then(() => {
                      pushToast({
                        title: `Active role switched to ${nextRole}`,
                        detail: 'Session RBAC permissions updated.',
                        tone: 'info',
                      });
                    });
                  }}
                  className="mt-1.5 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none cursor-pointer"
                >
                  {ALL_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="py-1">
              <button
                type="button"
                onClick={() => {
                  closeAll();
                  navigate('/settings');
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer transition-colors"
              >
                <Settings className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden="true" />
                <span>Workspace Settings</span>
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Sign Out</span>
              </button>
            </div>
          </FloatingPopover>
        </div>
      </div>
    </header>
  );
}
