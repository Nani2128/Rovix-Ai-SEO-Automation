import test from 'node:test';
import assert from 'node:assert/strict';

function createMockClassList() {
  const set = new Set<string>();
  return {
    add: (token: string) => set.add(token),
    remove: (token: string) => set.delete(token),
    contains: (token: string) => set.has(token),
    toggle: (token: string, force?: boolean) => {
      if (force === undefined) {
        if (set.has(token)) {
          set.delete(token);
          return false;
        }
        set.add(token);
        return true;
      }
      if (force) {
        set.add(token);
        return true;
      }
      set.delete(token);
      return false;
    },
  };
}

function createDomEnvironment(initialStored: string | null = 'dark', systemDark = false) {
  const storageMap = new Map<string, string>();
  if (initialStored !== null) {
    storageMap.set('rovix_theme', initialStored);
  }
  const classList = createMockClassList();
  const root = {
    classList,
    dataset: {} as Record<string, string>,
    style: { colorScheme: '' },
  };
  const listeners: Record<string, ((ev: unknown) => void)[]> = {};

  (globalThis as Record<string, unknown>).document = {
    documentElement: root,
  };
  const dispatchStorage = (key: string, newValue: string | null) => {
    for (const cb of listeners.storage ?? []) {
      cb({ key, newValue });
    }
  };

  (globalThis as Record<string, unknown>).window = {
    localStorage: {
      getItem: (k: string) => storageMap.get(k) ?? null,
      setItem: (k: string, v: string) => {
        storageMap.set(k, v);
      },
      removeItem: (k: string) => storageMap.delete(k),
    },
    matchMedia: () => ({
      matches: systemDark,
    }),
    addEventListener: (type: string, cb: (ev: unknown) => void) => {
      listeners[type] = listeners[type] ?? [];
      listeners[type].push(cb);
    },
  };

  return { storageMap, root, dispatchStorage };
}

test('useThemeStore reads initial localStorage state, toggles documentElement.classList, and persists preference', async () => {
  const { storageMap, root, dispatchStorage } = createDomEnvironment('dark', false);

  const mod = await import('./useThemeStore');
  const { useThemeStore, THEME_STORAGE_KEY } = mod;

  // Initial load picks up stored 'dark' immediately and applies DOM class
  assert.equal(useThemeStore.getState().mode, 'dark');
  assert.equal(useThemeStore.getState().resolvedTheme, 'dark');
  assert.equal(root.classList.contains('dark'), true);
  assert.equal(root.style.colorScheme, 'dark');

  // toggleTheme switches to light, removes .dark class, and writes to localStorage
  useThemeStore.getState().toggleTheme();
  assert.equal(useThemeStore.getState().mode, 'light');
  assert.equal(useThemeStore.getState().resolvedTheme, 'light');
  assert.equal(root.classList.contains('dark'), false);
  assert.equal(root.dataset.theme, 'light');
  assert.equal(root.style.colorScheme, 'light');
  assert.equal(storageMap.get(THEME_STORAGE_KEY), 'light');

  // toggleTheme again switches back to dark and persists
  useThemeStore.getState().toggleTheme();
  assert.equal(useThemeStore.getState().mode, 'dark');
  assert.equal(useThemeStore.getState().resolvedTheme, 'dark');
  assert.equal(root.classList.contains('dark'), true);
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(storageMap.get(THEME_STORAGE_KEY), 'dark');

  // Corrupted storage sync falls back cleanly to system preference (false -> light)
  useThemeStore.getState().syncFromStorage('invalid-theme-token');
  assert.equal(useThemeStore.getState().mode, 'system');
  assert.equal(useThemeStore.getState().resolvedTheme, 'light');
  assert.equal(root.classList.contains('dark'), false);

  // Cross-tab storage update syncs cleanly
  dispatchStorage(THEME_STORAGE_KEY, 'dark');
  assert.equal(useThemeStore.getState().mode, 'dark');
  assert.equal(useThemeStore.getState().resolvedTheme, 'dark');
  assert.equal(root.classList.contains('dark'), true);
});

test('useThemeStore switches across all 7 presets, applies DOM dataset attributes, and isolates preferences per user', async () => {
  const { storageMap, root } = createDomEnvironment('light', false);
  const { THEME_PRESETS } = await import('../config/themes');
  const { useThemeStore, THEME_PRESET_STORAGE_KEY } = await import('./useThemeStore');

  // Verify every single preset applies correct .dark class and dataset.themePreset
  for (const preset of THEME_PRESETS) {
    useThemeStore.getState().setPreset(preset.id);
    assert.equal(useThemeStore.getState().preset, preset.id);
    assert.equal(root.dataset.themePreset, preset.id);
    assert.equal(root.classList.contains('dark'), preset.isDark);
    assert.equal(root.dataset.theme, preset.isDark ? 'dark' : 'light');
    assert.equal(root.style.colorScheme, preset.isDark ? 'dark' : 'light');
    assert.equal(storageMap.get(THEME_PRESET_STORAGE_KEY), preset.id);
  }

  // Per-user preference isolation
  useThemeStore.getState().setUserScope('user-alpha');
  useThemeStore.getState().setPreset('luxury-dark');
  assert.equal(storageMap.get(`${THEME_PRESET_STORAGE_KEY}:user-alpha`), 'luxury-dark');

  // New user falls back to shared preset unless overridden, then saves independently
  useThemeStore.getState().setUserScope('user-beta');
  useThemeStore.getState().setPreset('pastel-3d');
  assert.equal(storageMap.get(`${THEME_PRESET_STORAGE_KEY}:user-beta`), 'pastel-3d');
  assert.equal(storageMap.get(`${THEME_PRESET_STORAGE_KEY}:user-alpha`), 'luxury-dark');

  // Switching back to user-alpha restores luxury-dark immediately
  useThemeStore.getState().setUserScope('user-alpha');
  assert.equal(useThemeStore.getState().preset, 'luxury-dark');
  assert.equal(root.dataset.themePreset, 'luxury-dark');
  assert.equal(root.classList.contains('dark'), true);

  // Invalid preset safely falls back to enterprise-light
  useThemeStore.getState().setPreset('non-existent-preset' as never);
  assert.equal(useThemeStore.getState().preset, 'enterprise-light');
  assert.equal(root.dataset.themePreset, 'enterprise-light');
  assert.equal(root.classList.contains('dark'), false);
});
