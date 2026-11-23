export type UserRole =
  | 'Platform Admin'
  | 'Agency Owner'
  | 'SEO Strategist'
  | 'Business Owner'
  | 'Editor'
  | 'Developer'
  | 'Publisher'
  | 'Outreach Lead'
  | 'Project Manager'
  | 'QA';

export interface RolePermissions {
  canApproveKeywords: boolean;
  canRunAutomations: boolean;
  canManageProjects: boolean;
  canManageIntegrations: boolean;
  canManageSettings: boolean;
  canPublishContent: boolean;
  canViewAnalytics: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarInitials: string;
  title: string;
}

export interface Tenant {
  id: string;
  name: string;
  plan: 'Starter' | 'Growth' | 'Enterprise';
  primaryDomain: string;
}

export interface AuthSessionResponse {
  authenticated: boolean;
  user: User | null;
  tenant: Tenant | null;
  devMode: boolean;
  productionSafe: boolean;
  authModeLabel: string;
  expiresAt?: string;
  sessionToken?: string;
}
