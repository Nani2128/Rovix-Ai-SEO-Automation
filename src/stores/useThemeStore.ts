import { create } from 'zustand';
import {
  DEFAULT_DARK_PRESET,
  DEFAULT_LIGHT_PRESET,
  getThemePresetDefinition,
  isValidThemePresetId,
  type ThemePresetId,
} from '../config/themes';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'rovix_theme';
export const THEME_PRESET_STORAGE_KEY = 'rovix_theme_preset';

export function isValidThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function presetStorageKeyForUser(userScope: string | null): string {
  return userScope
    ? `${THEME_PRESET_STORAGE_KEY}:${userScope}`
    : THEME_PRESET_STORAGE_KEY;
}

export function readStoredThemeMode(): ThemeMode {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (isValidThemeMode(raw)) return raw;
    }
  } catch {
    // Ignore storage restriction (private mode / blocked cookies)
  }
  return 'system';
}

export function readStoredThemePreset(
  userScope: string | null = null,
  fallbackResolved: ResolvedTheme = 'light',
): ThemePresetId {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (userScope) {
        const scoped = window.localStorage.getItem(presetStorageKeyForUser(userScope));
        if (isValidThemePresetId(scoped)) return scoped;
      }
      const raw = window.localStorage.getItem(THEME_PRESET_STORAGE_KEY);
      if (isValidThemePresetId(raw)) return raw;
    }
  } catch {
    // Ignore storage restrictions
  }
  return fallbackResolved === 'dark' ? DEFAULT_DARK_PRESET : DEFAULT_LIGHT_PRESET;
}

function persistThemeMode(mode: ThemeMode): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    }
  } catch {
    // Ignore storage quota or sandbox restrictions
  }
}

function persistThemePreset(
  preset: ThemePresetId,
  userScope: string | null = null,
): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(THEME_PRESET_STORAGE_KEY, preset);
      if (userScope) {
        window.localStorage.setItem(presetStorageKeyForUser(userScope), preset);
      }
    }
  } catch {
    // Ignore storage quota or sandbox restrictions
  }
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === 'system' ? getSystemTheme() : mode;
}

export function applyThemeToDom(
  resolved: ResolvedTheme,
  preset?: ThemePresetId,
): void {
  if (typeof document === 'undefined' || !document.documentElement) return;
  const root = document.documentElement;
  const activePreset =
    preset ?? (resolved === 'dark' ? DEFAULT_DARK_PRESET : DEFAULT_LIGHT_PRESET);
  const def = getThemePresetDefinition(activePreset);
  const isDark = def ? def.isDark : resolved === 'dark';
  const resolvedValue: ResolvedTheme = isDark ? 'dark' : 'light';

  root.classList.toggle('dark', isDark);
  root.dataset.theme = resolvedValue;
  root.dataset.themePreset = activePreset;
  root.style.colorScheme = resolvedValue;
}

export interface ThemeStoreState {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  preset: ThemePresetId;
  userScope: string | null;
  setMode: (mode: ThemeMode) => void;
  setPreset: (preset: ThemePresetId) => void;
  setUserScope: (userId: string | null) => void;
  toggleTheme: () => void;
  /** Alias preserved for backward compatibility */
  toggleLightDark: () => void;
  syncFromSystem: () => void;
  syncFromStorage: (rawValue?: string | null) => void;
}

const initialMode = readStoredThemeMode();
const initialSystemOrExplicitResolved = resolveTheme(initialMode);
const initialPreset = readStoredThemePreset(null, initialSystemOrExplicitResolved);
const initialPresetDef = getThemePresetDefinition(initialPreset);
const initialResolved: ResolvedTheme =
  initialMode === 'system' &&
  typeof window !== 'undefined' &&
  window.localStorage &&
  !window.localStorage.getItem(THEME_PRESET_STORAGE_KEY)
    ? initialSystemOrExplicitResolved
    : initialPresetDef.isDark
      ? 'dark'
      : 'light';

applyThemeToDom(initialResolved, initialPreset);

export const useThemeStore = create<ThemeStoreState>((set, get) => ({
  mode: initialMode,
  resolvedTheme: initialResolved,
  preset: initialPreset,
  userScope: null,

  setMode: (mode) => {
    const safeMode: ThemeMode = isValidThemeMode(mode) ? mode : 'system';
    const resolved = resolveTheme(safeMode);
    const currentPresetDef = getThemePresetDefinition(get().preset);
    const nextPreset: ThemePresetId =
      currentPresetDef.isDark === (resolved === 'dark')
        ? get().preset
        : resolved === 'dark'
          ? DEFAULT_DARK_PRESET
          : DEFAULT_LIGHT_PRESET;

    persistThemeMode(safeMode);
    persistThemePreset(nextPreset, get().userScope);
    applyThemeToDom(resolved, nextPreset);
    set({ mode: safeMode, resolvedTheme: resolved, preset: nextPreset });
  },

  setPreset: (preset) => {
    const safePreset: ThemePresetId = isValidThemePresetId(preset)
      ? preset
      : DEFAULT_LIGHT_PRESET;
    const def = getThemePresetDefinition(safePreset);
    const nextResolved: ResolvedTheme = def.isDark ? 'dark' : 'light';
    const nextMode: ThemeMode = nextResolved;

    persistThemeMode(nextMode);
    persistThemePreset(safePreset, get().userScope);
    applyThemeToDom(nextResolved, safePreset);
    set({
      preset: safePreset,
      resolvedTheme: nextResolved,
      mode: nextMode,
    });
  },

  setUserScope: (userId) => {
    if (!userId) {
      set({ userScope: null });
      return;
    }
    const scopedPreset = readStoredThemePreset(userId, get().resolvedTheme);
    const def = getThemePresetDefinition(scopedPreset);
    const nextResolved: ResolvedTheme = def.isDark ? 'dark' : 'light';
    persistThemeMode(nextResolved);
    persistThemePreset(scopedPreset, userId);
    applyThemeToDom(nextResolved, scopedPreset);
    set({
      userScope: userId,
      preset: scopedPreset,
      resolvedTheme: nextResolved,
      mode: nextResolved,
    });
  },

  toggleTheme: () => {
    const nextMode: ThemeMode = get().resolvedTheme === 'dark' ? 'light' : 'dark';
    const nextPreset: ThemePresetId =
      nextMode === 'dark' ? DEFAULT_DARK_PRESET : DEFAULT_LIGHT_PRESET;
    persistThemeMode(nextMode);
    persistThemePreset(nextPreset, get().userScope);
    applyThemeToDom(nextMode, nextPreset);
    set({ mode: nextMode, resolvedTheme: nextMode, preset: nextPreset });
  },

  toggleLightDark: () => {
    get().toggleTheme();
  },

  syncFromSystem: () => {
    if (get().mode !== 'system') return;
    const resolved = getSystemTheme();
    const nextPreset = resolved === 'dark' ? DEFAULT_DARK_PRESET : DEFAULT_LIGHT_PRESET;
    applyThemeToDom(resolved, nextPreset);
    set({ resolvedTheme: resolved, preset: nextPreset });
  },

  syncFromStorage: (rawValue) => {
    const nextMode: ThemeMode =
      rawValue === undefined
        ? readStoredThemeMode()
        : isValidThemeMode(rawValue)
          ? rawValue
          : 'system';
    const resolved = resolveTheme(nextMode);
    const currentScoped = readStoredThemePreset(get().userScope, resolved);
    const def = getThemePresetDefinition(currentScoped);
    const alignedPreset =
      def.isDark === (resolved === 'dark')
        ? currentScoped
        : resolved === 'dark'
          ? DEFAULT_DARK_PRESET
          : DEFAULT_LIGHT_PRESET;

    applyThemeToDom(resolved, alignedPreset);
    set({ mode: nextMode, resolvedTheme: resolved, preset: alignedPreset });
  },
}));

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (event) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) {
      useThemeStore.getState().syncFromStorage(event.newValue);
    } else if (
      event.key === THEME_PRESET_STORAGE_KEY ||
      event.key?.startsWith(`${THEME_PRESET_STORAGE_KEY}:`)
    ) {
      const next = event.newValue;
      if (isValidThemePresetId(next)) {
        const def = getThemePresetDefinition(next);
        const resolved: ResolvedTheme = def.isDark ? 'dark' : 'light';
        applyThemeToDom(resolved, next);
        useThemeStore.setState({
          preset: next,
          resolvedTheme: resolved,
          mode: resolved,
        });
      }
    }
  });
}
