import type { AuthSessionResponse, UserRole } from '../types/auth';
import { apiFetch } from './apiClient';

export const authService = {
  getSession(): Promise<AuthSessionResponse> {
    return apiFetch<AuthSessionResponse>('/api/auth/session', {
      method: 'GET',
    });
  },

  register(params: {
    name: string;
    email: string;
    password: string;
    workspaceName: string;
    primaryDomain: string;
  }): Promise<AuthSessionResponse> {
    return apiFetch<AuthSessionResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  login(params: {
    email: string;
    password: string;
    rememberMe: boolean;
  }): Promise<AuthSessionResponse> {
    return apiFetch<AuthSessionResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  logout(): Promise<{ ok: boolean }> {
    return apiFetch<{ ok: boolean }>('/api/auth/logout', {
      method: 'POST',
    });
  },

  forgotPassword(email: string): Promise<{ ok: boolean; message: string }> {
    return apiFetch<{ ok: boolean; message: string }>(
      '/api/auth/forgot-password',
      {
        method: 'POST',
        body: JSON.stringify({ email }),
      },
    );
  },

  switchDevRole(role: UserRole): Promise<AuthSessionResponse> {
    return apiFetch<AuthSessionResponse>('/api/auth/switch-role', {
      method: 'POST',
      body: JSON.stringify({ role }),
    });
  },
};
