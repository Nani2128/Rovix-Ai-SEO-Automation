import { Monitor, Moon, Sun } from 'lucide-react';
import { useThemeStore, type ThemeMode } from '../../stores/useThemeStore';

const MODES: readonly { id: ThemeMode; label: string; icon: typeof Sun }[] = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { mode, resolvedTheme, setMode, toggleTheme } = useThemeStore();

  if (compact) {
    const isDark = resolvedTheme === 'dark';
    return (
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={isDark ? 'Switch to Light theme' : 'Switch to Dark theme'}
        title={isDark ? 'Switch to Light theme' : 'Switch to Dark theme'}
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[#7047EB]/45 hover:text-[#7047EB] dark:hover:text-[#8B6BFF] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7047EB]"
      >
        {isDark ? (
          <Sun className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Moon className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Theme preference"
      className="inline-flex items-center gap-0.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-1"
    >
      {MODES.map((m) => {
        const Icon = m.icon;
        const active = mode === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              active
                ? 'bg-[var(--bg-surface)] text-[var(--accent-primary)] shadow-2xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
