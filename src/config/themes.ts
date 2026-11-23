export type ThemePresetId =
  | 'enterprise-light'
  | 'midnight-glass'
  | 'neo-tactile'
  | 'soft-neumorphic'
  | 'pastel-3d'
  | 'emerald-glass'
  | 'luxury-dark';

export interface ThemePresetDefinition {
  id: ThemePresetId;
  name: string;
  tagline: string;
  isDark: boolean;
  surfaceStyle: string;
  swatches: readonly [string, string, string, string];
  previewBg: string;
  previewCard: string;
  previewAccent: string;
  previewText: string;
  accentPrimary: string;
  accentSecondary: string;
}

export const DEFAULT_LIGHT_PRESET: ThemePresetId = 'enterprise-light';
export const DEFAULT_DARK_PRESET: ThemePresetId = 'midnight-glass';

export const THEME_PRESETS: readonly ThemePresetDefinition[] = [
  {
    id: 'enterprise-light',
    name: 'Enterprise Light',
    tagline: 'Clean crisp surfaces with royal violet accents',
    isDark: false,
    surfaceStyle: 'Crisp SaaS Light',
    swatches: ['#F3F5FA', '#FFFFFF', '#7047EB', '#2563EB'],
    previewBg: '#F3F5FA',
    previewCard: '#FFFFFF',
    previewAccent: '#7047EB',
    previewText: '#101827',
    accentPrimary: '#7047EB',
    accentSecondary: '#2563EB',
  },
  {
    id: 'midnight-glass',
    name: 'Midnight Glass',
    tagline: 'Deep obsidian glassmorphism with blue & cyan lighting',
    isDark: true,
    surfaceStyle: 'Dark Frosted Glass',
    swatches: ['#090E1A', '#101827', '#8B6BFF', '#22D3EE'],
    previewBg: '#090E1A',
    previewCard: '#142035',
    previewAccent: '#22D3EE',
    previewText: '#F1F5F9',
    accentPrimary: '#8B6BFF',
    accentSecondary: '#22D3EE',
  },
  {
    id: 'neo-tactile',
    name: 'Neo-Tactile',
    tagline: 'Elevated tactile controls and crisp structural bevels',
    isDark: false,
    surfaceStyle: 'Tactile Elevated',
    swatches: ['#EBEEF4', '#FFFFFF', '#4F46E5', '#0EA5E9'],
    previewBg: '#EBEEF4',
    previewCard: '#FFFFFF',
    previewAccent: '#4F46E5',
    previewText: '#0F172A',
    accentPrimary: '#4F46E5',
    accentSecondary: '#0EA5E9',
  },
  {
    id: 'soft-neumorphic',
    name: 'Soft Neumorphic',
    tagline: 'Sculpted mist surfaces with gentle depth & highlights',
    isDark: false,
    surfaceStyle: 'Neumorphic Mist',
    swatches: ['#E7ECF4', '#EFF3F9', '#6366F1', '#14B8A6'],
    previewBg: '#E7ECF4',
    previewCard: '#EFF3F9',
    previewAccent: '#6366F1',
    previewText: '#1E293B',
    accentPrimary: '#6366F1',
    accentSecondary: '#14B8A6',
  },
  {
    id: 'pastel-3d',
    name: 'Pastel 3D',
    tagline: 'Lavender mist gradients with dimensional floating planes',
    isDark: false,
    surfaceStyle: 'Lavender Dimensional',
    swatches: ['#F3EEFF', '#FFFFFF', '#7C3AED', '#06B6D4'],
    previewBg: '#F3EEFF',
    previewCard: '#FCF9FF',
    previewAccent: '#7C3AED',
    previewText: '#1E1B4B',
    accentPrimary: '#7C3AED',
    accentSecondary: '#06B6D4',
  },
  {
    id: 'emerald-glass',
    name: 'Emerald Glass',
    tagline: 'Deep forest glassmorphism with crisp emerald glow',
    isDark: true,
    surfaceStyle: 'Emerald Dark Glass',
    swatches: ['#051612', '#0B241E', '#10B981', '#34D399'],
    previewBg: '#051612',
    previewCard: '#0B241E',
    previewAccent: '#10B981',
    previewText: '#ECFDF5',
    accentPrimary: '#10B981',
    accentSecondary: '#34D399',
  },
  {
    id: 'luxury-dark',
    name: 'Luxury Dark',
    tagline: 'Obsidian charcoal surfaces with restrained brushed gold',
    isDark: true,
    surfaceStyle: 'Obsidian & Gold',
    swatches: ['#0A0A0C', '#141418', '#D4AF37', '#F3D578'],
    previewBg: '#0A0A0C',
    previewCard: '#16161B',
    previewAccent: '#D4AF37',
    previewText: '#F5F3EE',
    accentPrimary: '#D4AF37',
    accentSecondary: '#C89D3C',
  },
] as const;

export const THEME_PRESET_MAP: Record<ThemePresetId, ThemePresetDefinition> =
  Object.fromEntries(THEME_PRESETS.map((p) => [p.id, p])) as Record<
    ThemePresetId,
    ThemePresetDefinition
  >;

export function isValidThemePresetId(value: unknown): value is ThemePresetId {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(THEME_PRESET_MAP, value)
  );
}

export function getThemePresetDefinition(id: ThemePresetId): ThemePresetDefinition {
  return THEME_PRESET_MAP[id] ?? THEME_PRESET_MAP[DEFAULT_LIGHT_PRESET];
}
