import { create } from 'zustand';
import type { RolePermissions, Tenant, User, UserRole } from '../types/auth';
import { ApiError, setClientSessionToken } from '../services/apiClient';
import { authService } from '../services/authService';
import { getRolePermissions } from '../utils/dashboardLogic';

interface AuthStoreState {
  status: 'checking' | 'authenticated' | 'unauthenticated';
  user: User | null;
  tenant: Tenant | null;
  permissions: RolePermissions;
  devMode: boolean;
  productionSafe: boolean;
  authModeLabel: string;
  authError: string | null;
  isSubmitting: boolean;

  checkSession: () => Promise<void>;
  register: (params: {
    name: string;
    email: string;
    password: string;
    workspaceName: string;
    primaryDomain: string;
  }) => Promise<boolean>;
  login: (
    email: string,
    password: string,
    rememberMe: boolean,
  ) => Promise<boolean>;
  logout: () => Promise<void>;
  switchDevRole: (role: UserRole) => Promise<void>;
  clearAuthError: () => void;
  expireSession: () => void;
}

const DEFAULT_PERMS = getRolePermissions('QA');
let authGeneration = 0;

export const useAuthStore = create<AuthStoreState>((set) => ({
  status: 'checking',
  user: null,
  tenant: null,
  permissions: DEFAULT_PERMS,
  devMode: false,
  productionSafe: false,
  authModeLabel: 'Session Authentication',
  authError: null,
  isSubmitting: false,

  checkSession: async () => {
    const reqGen = ++authGeneration;
    try {
      const res = await authService.getSession();
      if (reqGen !== authGeneration) return;

      if (res.authenticated && res.user) {
        if (res.sessionToken) {
          setClientSessionToken(res.sessionToken);
        }
        set({
          status: 'authenticated',
          user: res.user,
          tenant: res.tenant,
          permissions: getRolePermissions(res.user.role),
          devMode: res.devMode,
          productionSafe: Boolean(res.productionSafe),
          authModeLabel: res.authModeLabel,
          authError: null,
        });
      } else {
        setClientSessionToken(null);
        set({
          status: 'unauthenticated',
          user: null,
          tenant: null,
          permissions: DEFAULT_PERMS,
          devMode: res.devMode,
          productionSafe: Boolean(res.productionSafe),
          authModeLabel: res.authModeLabel,
        });
      }
    } catch {
      if (reqGen !== authGeneration) return;
      setClientSessionToken(null);
      set({
        status: 'unauthenticated',
        user: null,
        tenant: null,
        permissions: DEFAULT_PERMS,
      });
    }
  },

  register: async (params) => {
    authGeneration += 1;
    set({ isSubmitting: true, authError: null });
    try {
      const res = await authService.register(params);
      if (res.authenticated && res.user) {
        setClientSessionToken(res.sessionToken ?? null);
        set({
          status: 'authenticated',
          user: res.user,
          tenant: res.tenant,
          permissions: getRolePermissions(res.user.role),
          devMode: res.devMode,
          productionSafe: Boolean(res.productionSafe),
          authModeLabel: res.authModeLabel,
          isSubmitting: false,
          authError: null,
        });
        return true;
      }
      set({
        isSubmitting: false,
        authError: 'Unable to create workspace session.',
      });
      return false;
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Network error while creating workspace.';
      set({ isSubmitting: false, authError: message });
      return false;
    }
  },

  login: async (email, password, rememberMe) => {
    authGeneration += 1;
    set({ isSubmitting: true, authError: null });
    try {
      const res = await authService.login({ email, password, rememberMe });
      if (res.authenticated && res.user) {
        setClientSessionToken(res.sessionToken ?? null);
        set({
          status: 'authenticated',
          user: res.user,
          tenant: res.tenant,
          permissions: getRolePermissions(res.user.role),
          devMode: res.devMode,
          productionSafe: Boolean(res.productionSafe),
          authModeLabel: res.authModeLabel,
          isSubmitting: false,
          authError: null,
        });
        return true;
      }
      set({
        isSubmitting: false,
        authError: 'Unable to establish an authenticated session.',
      });
      return false;
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Network error while contacting the authentication service.';
      set({
        isSubmitting: false,
        authError: message,
      });
      return false;
    }
  },

  logout: async () => {
    authGeneration += 1;
    try {
      await authService.logout();
    } finally {
      setClientSessionToken(null);
      set({
        status: 'unauthenticated',
        user: null,
        tenant: null,
        permissions: DEFAULT_PERMS,
        authError: null,
      });
    }
  },

  switchDevRole: async (role) => {
    try {
      const res = await authService.switchDevRole(role);
      if (res.authenticated && res.user) {
        if (res.sessionToken) {
          setClientSessionToken(res.sessionToken);
        }
        set({
          user: res.user,
          tenant: res.tenant,
          permissions: getRolePermissions(res.user.role),
        });
      }
    } catch {
      // Blocked in production or expired session
    }
  },

  clearAuthError: () => set({ authError: null }),
  expireSession: () => {
    authGeneration += 1;
    setClientSessionToken(null);
    set({
      status: 'unauthenticated',
      user: null,
      tenant: null,
      permissions: DEFAULT_PERMS,
      authError: 'Your session expired. Please sign in again.',
    });
  },
}));
