export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const SESSION_TOKEN_STORAGE_KEY = 'rovix_session_token';
let inMemorySessionToken: string | null = null;

export function getClientSessionToken(): string | null {
  if (inMemorySessionToken) return inMemorySessionToken;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const stored = window.sessionStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
      if (stored) {
        inMemorySessionToken = stored;
        return stored;
      }
    }
  } catch {
    // Ignore restricted storage
  }
  return null;
}

export function setClientSessionToken(token: string | null): void {
  inMemorySessionToken = token && token.trim() ? token.trim() : null;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      if (inMemorySessionToken) {
        window.sessionStorage.setItem(
          SESSION_TOKEN_STORAGE_KEY,
          inMemorySessionToken,
        );
      } else {
        window.sessionStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
      }
    }
  } catch {
    // Ignore restricted storage
  }
}

export function getAuthHeaders(): Record<string, string> {
  const token = getClientSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiFetch<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(options?.headers ?? {}),
    },
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const message =
      (data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : null) || `Request failed with status ${res.status}`;
    throw new ApiError(res.status, message);
  }

  return data as T;
}
