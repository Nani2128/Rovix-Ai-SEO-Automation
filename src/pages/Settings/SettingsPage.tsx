import { Check, Lock, Palette, Shield, SlidersHorizontal, X } from 'lucide-react';
import { ALL_ROLES } from '../../config/navigation';
import { THEME_PRESETS } from '../../config/themes';
import { useAuthStore } from '../../stores/useAuthStore';
import { useThemeStore } from '../../stores/useThemeStore';
import { getRolePermissions } from '../../utils/dashboardLogic';
import { PageTransition } from '../../components/animation/MotionPrimitives';
import { StatusBadge } from '../../components/ui/StateViews';
import { ThemeSelectorDropdown } from '../../components/ui/ThemeSelectorDropdown';
import { ThemeToggle } from '../../components/ui/ThemeToggle';

const CAPABILITY_COLUMNS = [
  { key: 'canApproveKeywords', label: 'Approve Keywords' },
  { key: 'canRunAutomations', label: 'Run Crawls' },
  { key: 'canManageProjects', label: 'Manage Projects' },
  { key: 'canManageIntegrations', label: 'Integrations' },
  { key: 'canManageSettings', label: 'Settings & Backups' },
  { key: 'canPublishContent', label: 'Publish Content' },
  { key: 'canViewAnalytics', label: 'View Analytics' },
] as const;

export function SettingsPage() {
  const { user, tenant, authModeLabel, productionSafe } = useAuthStore();
  const { preset, setPreset } = useThemeStore();

  return (
    <PageTransition className="mx-auto max-w-[1360px] space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
            Workspace Governance &amp; Settings
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Tenant isolation controls, Light/Dark interface theme, and server-enforced RBAC matrix
          </p>
        </div>

        <StatusBadge
          label={productionSafe ? 'Production Security Enforced' : 'Development Environment'}
          tone={productionSafe ? 'success' : 'indigo'}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Tenant & Session Identity */}
        <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 sm:p-6">
          <div className="flex items-center gap-2.5 border-b border-[var(--border-hairline)] pb-3">
            <Shield className="h-4 w-4 text-[#7047EB] dark:text-[#A78BFA]" aria-hidden="true" />
            <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
              Workspace &amp; Account Session
            </h2>
          </div>

          <dl className="mt-4 space-y-3 text-xs">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[var(--text-muted)]">Workspace Name</dt>
              <dd className="font-semibold text-[var(--text-primary)]">{tenant?.name ?? 'N/A'}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[var(--text-muted)]">Primary Domain</dt>
              <dd className="font-mono text-[var(--text-primary)]">{tenant?.primaryDomain ?? 'Unassigned'}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[var(--text-muted)]">Signed-in Member</dt>
              <dd className="font-medium text-[var(--text-primary)]">
                {user?.name} ({user?.email})
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[var(--text-muted)]">Active Role</dt>
              <dd>
                <StatusBadge label={user?.role ?? 'Member'} tone="indigo" />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[var(--text-muted)]">Session Transport</dt>
              <dd className="font-mono text-[11px] text-[var(--text-secondary)]">
                HttpOnly HMAC-SHA256 Cookie ({authModeLabel})
              </dd>
            </div>
          </dl>
        </section>

        {/* Appearance & Theme Controls */}
        <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-hairline)] pb-3">
            <div className="flex items-center gap-2.5">
              <SlidersHorizontal className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
              <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                Global UI Theme &amp; Accessibility
              </h2>
            </div>
            <ThemeSelectorDropdown />
          </div>

          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4">
              <div>
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  Color Mode Quick Switch
                </div>
                <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                  Persisted per workspace member with pre-paint anti-flash hydration
                </div>
              </div>
              <ThemeToggle />
            </div>

            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                <Palette className="h-3.5 w-3.5 text-[var(--accent-primary)]" aria-hidden="true" />
                <span>Application-Wide Theme Presets</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {THEME_PRESETS.map((item) => {
                  const selected = item.id === preset;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setPreset(item.id)}
                      aria-pressed={selected}
                      className={`flex items-center justify-between gap-2.5 rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
                        selected
                          ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] shadow-2xs'
                          : 'border-[var(--border-hairline)] bg-[var(--bg-subtle)] hover:border-[var(--accent-primary)]/45'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-display text-xs font-bold text-[var(--text-primary)]">
                            {item.name}
                          </span>
                          <span className="text-[10px] font-medium text-[var(--text-muted)]">
                            ({item.isDark ? 'Dark' : 'Light'})
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-[10.5px] text-[var(--text-muted)]">
                          {item.surfaceStyle}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {item.swatches.map((hex, i) => (
                          <span
                            key={i}
                            className="h-2.5 w-2.5 rounded-full border border-black/15 dark:border-white/20"
                            style={{ backgroundColor: hex }}
                          />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4 text-xs text-[var(--text-secondary)]">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-primary)]" aria-hidden="true" />
              <div>
                All sensitive actions — OAuth authorization, crawl execution, SQLite backup snapshots, and project deletion — are strictly validated server-side against your signed session role.
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Complete 10-Role RBAC Matrix */}
      <section className="rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 sm:p-6">
        <div className="border-b border-[var(--border-hairline)] pb-3">
          <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
            Role-Based Access Control (RBAC) Capability Matrix
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Live permission mapping shared between API authorization middleware and workspace UI gates
          </p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                <th className="py-2.5 pr-3">Workspace Role</th>
                {CAPABILITY_COLUMNS.map((c) => (
                  <th key={c.key} className="py-2.5 px-2 text-center">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {ALL_ROLES.map((role) => {
                const perms = getRolePermissions(role);
                const isActive = user?.role === role;
                return (
                  <tr
                    key={role}
                    className={
                      isActive ? 'bg-[#7047EB]/6 dark:bg-[#7047EB]/12' : undefined
                    }
                  >
                    <td className="py-2.5 pr-3 font-semibold text-[var(--text-primary)]">
                      {role}{' '}
                      {isActive && (
                        <span className="ml-1.5 font-mono text-[10px] text-[#7047EB] dark:text-[#C4B5FD]">
                          (Current)
                        </span>
                      )}
                    </td>
                    {CAPABILITY_COLUMNS.map((col) => {
                      const allowed = perms[col.key];
                      return (
                        <td key={col.key} className="py-2.5 px-2 text-center">
                          {allowed ? (
                            <Check
                              className="mx-auto h-4 w-4 text-emerald-600 dark:text-emerald-400"
                              aria-label="Allowed"
                            />
                          ) : (
                            <X
                              className="mx-auto h-3.5 w-3.5 text-[var(--text-muted)] opacity-50"
                              aria-label="Restricted"
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </PageTransition>
  );
}
