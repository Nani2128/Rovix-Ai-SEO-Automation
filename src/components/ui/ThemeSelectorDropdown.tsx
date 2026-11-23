import { useRef, useState } from 'react';
import { Check, ChevronDown, Palette } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import {
  THEME_PRESETS,
  getThemePresetDefinition,
  type ThemePresetDefinition,
} from '../../config/themes';
import { useThemeStore } from '../../stores/useThemeStore';
import { FloatingPopover } from '../animation/MotionPrimitives';

function ThemeMiniThumbnail({ preset }: { preset: ThemePresetDefinition }) {
  return (
    <div
      aria-hidden="true"
      className="relative flex h-9 w-12 shrink-0 flex-col justify-between overflow-hidden rounded-lg border p-1.5"
      style={{
        backgroundColor: preset.previewBg,
        borderColor: preset.isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.12)',
      }}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          className="h-1.5 w-4 rounded-full"
          style={{ backgroundColor: preset.previewText, opacity: 0.75 }}
        />
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: preset.previewAccent }}
        />
      </div>
      <div
        className="flex items-center justify-between rounded px-1 py-1"
        style={{ backgroundColor: preset.previewCard }}
      >
        <span
          className="h-1 w-3.5 rounded-full"
          style={{ backgroundColor: preset.previewText, opacity: 0.45 }}
        />
        <span
          className="h-1.5 w-2.5 rounded-sm"
          style={{ backgroundColor: preset.previewAccent }}
        />
      </div>
    </div>
  );
}

export function ThemeSelectorDropdown({
  compact = false,
  align = 'right',
}: {
  compact?: boolean;
  align?: 'left' | 'right';
}) {
  const prefersReducedMotion = useReducedMotion();
  const { preset, setPreset } = useThemeStore();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const activePreset = getThemePresetDefinition(preset);

  return (
    <div className="relative">
      <motion.button
        ref={triggerRef}
        type="button"
        whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
        onClick={() => setOpen((v) => !v)}
        aria-label={`Choose Theme: ${activePreset.name}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        title="Appearance & UI Theme Presets"
        className={`inline-flex h-9 items-center gap-2 rounded-xl border px-2.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7047EB] ${
          open
            ? 'border-[#7047EB]/55 bg-[#7047EB]/10 text-[var(--text-primary)]'
            : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[#7047EB]/45 hover:text-[var(--text-primary)]'
        }`}
      >
        <span
          aria-hidden="true"
          className="h-3 w-3 shrink-0 rounded-full border border-black/15 dark:border-white/20"
          style={{ backgroundColor: activePreset.accentPrimary }}
        />
        <Palette className="h-3.5 w-3.5 shrink-0 text-[var(--accent-primary)]" aria-hidden="true" />
        <span className={compact ? 'hidden md:inline' : 'inline'}>
          {compact ? 'Appearance' : activePreset.name}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-[var(--text-muted)] transition-transform duration-150 ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </motion.button>

      <FloatingPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        className={`absolute ${
          align === 'left' ? 'left-0' : 'right-0'
        } z-50 mt-2 w-[340px] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-2.5 shadow-[var(--shadow-elevated)]`}
      >
        <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-2 pb-2">
          <div>
            <div className="font-display text-xs font-bold text-[var(--text-primary)]">
              Appearance
            </div>
            <div className="text-[11px] text-[var(--text-muted)]">
              Instant application-wide UI theme preset
            </div>
          </div>
          <span className="font-mono text-[10px] font-semibold text-[var(--text-muted)]">
            {THEME_PRESETS.length} presets
          </span>
        </div>

        <div
          role="listbox"
          aria-label="Choose Theme"
          className="mt-2 max-h-[360px] space-y-1 overflow-y-auto pr-0.5"
        >
          {THEME_PRESETS.map((item) => {
            const isSelected = item.id === preset;
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  setPreset(item.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#7047EB] ${
                  isSelected
                    ? 'border-[#7047EB]/50 bg-[var(--accent-soft)]'
                    : 'border-transparent hover:border-[var(--border-hairline)] hover:bg-[var(--bg-subtle)]'
                }`}
              >
                <ThemeMiniThumbnail preset={item} />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-display text-xs font-bold text-[var(--text-primary)]">
                      {item.name}
                    </span>
                    <div className="flex items-center gap-1 shrink-0" aria-hidden="true">
                      {item.swatches.map((swatch, idx) => (
                        <span
                          key={idx}
                          className="h-2.5 w-2.5 rounded-full border border-black/15 dark:border-white/20"
                          style={{ backgroundColor: swatch }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="mt-0.5 truncate text-[10.5px] text-[var(--text-muted)]">
                    {item.surfaceStyle} · {item.isDark ? 'Dark' : 'Light'}
                  </div>
                </div>

                <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                  {isSelected && (
                    <Check
                      className="h-4 w-4 text-[var(--accent-primary)]"
                      aria-label="Selected theme"
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </FloatingPopover>
    </div>
  );
}
