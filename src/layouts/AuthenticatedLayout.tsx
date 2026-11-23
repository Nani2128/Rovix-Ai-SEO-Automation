import { useEffect, useRef } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';
import { useDashboardStore } from '../stores/useDashboardStore';
import { useThemeStore } from '../stores/useThemeStore';
import { CommandPalette } from '../components/ui/CommandPalette';
import { ToastViewport } from '../components/ui/InteractivePrimitives';
import { DashboardSkeleton } from '../components/ui/StateViews';
import { Sidebar } from '../components/navigation/Sidebar';
import { TopNav } from '../components/navigation/TopNav';
import { MobileBottomNav } from '../components/navigation/MobileBottomNav';

export function AuthenticatedLayout() {
  const status = useAuthStore((s) => s.status);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const setUserScope = useThemeStore((s) => s.setUserScope);
  const projectsCount = useDashboardStore((s) => s.projects.length);
  const hydratedRef = useRef(false);

  useEffect(() => {
    setUserScope(status === 'authenticated' ? userId : null);
  }, [status, userId, setUserScope]);

  useEffect(() => {
    if (status !== 'authenticated') {
      hydratedRef.current = false;
      return;
    }
    if (!hydratedRef.current && projectsCount === 0) {
      hydratedRef.current = true;
      void useDashboardStore.getState().loadProjectsOnly();
    }
  }, [status, projectsCount]);

  if (status === 'checking') {
    return (
      <div className="min-h-screen bg-[var(--bg-canvas)] p-6 sm:p-10">
        <div className="mx-auto max-w-6xl">
          <DashboardSkeleton />
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav />
        <main className="flex-1 px-4 pb-24 pt-5 sm:px-7 sm:pt-7 lg:pb-8">
          <Outlet />
        </main>
      </div>
      <MobileBottomNav />
      <CommandPalette />
      <ToastViewport />
    </div>
  );
}
