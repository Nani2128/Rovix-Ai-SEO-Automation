export type AppRoute =
  | '/'
  | '/login'
  | '/forgot-password'
  | '/onboarding'
  | '/signin'
  | '/pricing'
  | '/resources'
  | '/dashboard'
  | '/projects'
  | '/audit'
  | '/keywords'
  | '/competitors'
  | '/content'
  | '/backlinks'
  | '/local-seo'
  | '/geo-visibility'
  | '/analytics'
  | '/tasks'
  | '/monitoring'
  | '/reports'
  | '/integrations'
  | '/settings';

export type SeoPillarId =
  | 'technical-seo'
  | 'keyword-intelligence'
  | 'ai-content'
  | 'geo-visibility'
  | 'analytics-roi';

export interface SeoPillarSpec {
  id: SeoPillarId;
  title: string;
  shortDesc: string;
  capabilitySummary: string;
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  accentHex: string;
}
