import { create } from 'zustand';

export type ToastTone = 'success' | 'info' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  title: string;
  detail?: string;
  tone: ToastTone;
}

interface ToastState {
  toasts: ToastItem[];
  pushToast: (toast: Omit<ToastItem, 'id'>) => void;
  dismissToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  pushToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...toast, id }] }));
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      }, 4200);
    }
  },
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
