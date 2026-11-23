import { create } from 'zustand';
import type {
  ApprovalStatus,
  DataLoadStatus,
  DateRangePreset,
  Project,
  SEOOverview,
} from '../types/dashboard';
import { ApiError } from '../services/apiClient';
import { dashboardService } from '../services/dashboardService';
import { useAuthStore } from './useAuthStore';

interface DashboardStoreState {
  selectedProjectId: string;
  dateRange: DateRangePreset;
  customStart: string;
  customEnd: string;
  overview: SEOOverview | null;
  projects: Project[];
  sandboxFixturesEnabled: boolean;
  loadStatus: DataLoadStatus;
  errorMessage: string | null;
  sidebarCollapsed: boolean;
  mobileDrawerOpen: boolean;
  commandPaletteOpen: boolean;
  actionNotice: string | null;

  setSelectedProjectId: (id: string) => void;
  setDateRange: (range: DateRangePreset) => void;
  setCustomDates: (start: string, end: string) => void;
  toggleSidebar: () => void;
  setMobileDrawerOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  loadDashboardData: () => Promise<void>;
  loadProjectsOnly: () => Promise<void>;
  createProject: (payload: {
    name: string;
    website: string;
    targetMarkets: string[];
  }) => Promise<Project | null>;
  deleteProject: (projectId: string) => Promise<boolean>;
  registerSandboxProject: () => Promise<Project | null>;
  updateKeywordStatus: (
    keywordId: string,
    status: ApprovalStatus,
  ) => Promise<void>;
  clearActionNotice: () => void;
}

function getDefaultDates() {
  const end = new Date();
  const start = new Date(end.getTime() - 29 * 86400 * 1000);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

const defaults = getDefaultDates();

export const useDashboardStore = create<DashboardStoreState>((set, get) => ({
  selectedProjectId: '',
  dateRange: '30d',
  customStart: defaults.start,
  customEnd: defaults.end,
  overview: null,
  projects: [],
  sandboxFixturesEnabled: false,
  loadStatus: 'idle',
  errorMessage: null,
  sidebarCollapsed: false,
  mobileDrawerOpen: false,
  commandPaletteOpen: false,
  actionNotice: null,

  setSelectedProjectId: (id) => {
    set({ selectedProjectId: id });
    void get().loadDashboardData();
  },

  setDateRange: (range) => {
    set({ dateRange: range });
    void get().loadDashboardData();
  },

  setCustomDates: (start, end) => {
    set({ customStart: start, customEnd: end, dateRange: 'custom' });
    void get().loadDashboardData();
  },

  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  setMobileDrawerOpen: (open) => set({ mobileDrawerOpen: open }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  loadDashboardData: async () => {
    const { selectedProjectId, dateRange, customStart, customEnd } = get();
    set({ loadStatus: 'loading', errorMessage: null });

    try {
      const projectsRes = await dashboardService.fetchProjects();
      const projects = projectsRes.projects;
      const activeId =
        projects.find((p) => p.id === selectedProjectId)?.id ??
        projects[0]?.id ??
        '';

      const overview = await dashboardService.fetchOverview({
        projectId: activeId,
        range: dateRange,
        customStart: dateRange === 'custom' ? customStart : undefined,
        customEnd: dateRange === 'custom' ? customEnd : undefined,
      });

      set({
        selectedProjectId: overview.project?.id ?? activeId,
        overview,
        projects,
        sandboxFixturesEnabled: Boolean(projectsRes.sandboxFixturesEnabled),
        loadStatus:
          projects.length === 0
            ? 'empty'
            : overview.isStale
              ? 'stale'
              : 'success',
        errorMessage: null,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        useAuthStore.getState().expireSession();
        return;
      }
      set({
        loadStatus: 'error',
        errorMessage:
          err instanceof Error
            ? err.message
            : 'Unable to load SEO dashboard data.',
      });
    }
  },

  loadProjectsOnly: async () => {
    try {
      const res = await dashboardService.fetchProjects();
      const currentSelected = get().selectedProjectId;
      const nextSelected =
        res.projects.find((p) => p.id === currentSelected)?.id ??
        res.projects[0]?.id ??
        '';
      set({
        projects: res.projects,
        selectedProjectId: nextSelected,
        sandboxFixturesEnabled: Boolean(res.sandboxFixturesEnabled),
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        useAuthStore.getState().expireSession();
      }
    }
  },

  createProject: async (payload) => {
    try {
      const res = await dashboardService.createProject(payload);
      const nextProjects = [...get().projects, res.project];
      set({
        projects: nextProjects,
        selectedProjectId: res.project.id,
        actionNotice: `Created domain project "${res.project.name}".`,
      });
      void get().loadDashboardData();
      return res.project;
    } catch (err) {
      set({
        actionNotice:
          err instanceof ApiError ? err.message : 'Unable to create project.',
      });
      return null;
    }
  },

  deleteProject: async (projectId) => {
    try {
      await dashboardService.deleteProject(projectId);
      const remaining = get().projects.filter((p) => p.id !== projectId);
      const nextId =
        get().selectedProjectId === projectId
          ? (remaining[0]?.id ?? '')
          : get().selectedProjectId;
      set({
        projects: remaining,
        selectedProjectId: nextId,
        actionNotice: 'Project removed from active workspace.',
      });
      void get().loadDashboardData();
      return true;
    } catch (err) {
      set({
        actionNotice:
          err instanceof ApiError ? err.message : 'Unable to remove project.',
      });
      return false;
    }
  },

  registerSandboxProject: async () => {
    try {
      const res = await dashboardService.registerSandboxProject();
      const exists = get().projects.some((p) => p.id === res.project.id);
      const nextProjects = exists
        ? get().projects
        : [...get().projects, res.project];
      set({
        projects: nextProjects,
        selectedProjectId: res.project.id,
        actionNotice: 'Registered isolated local sandbox target for verification.',
      });
      void get().loadDashboardData();
      return res.project;
    } catch (err) {
      set({
        actionNotice:
          err instanceof ApiError
            ? err.message
            : 'Sandbox targets are unavailable.',
      });
      return null;
    }
  },

  updateKeywordStatus: async (keywordId, status) => {
    try {
      const res = await dashboardService.updateKeywordApproval(keywordId, status);
      const current = get().overview;
      if (current) {
        set({
          overview: {
            ...current,
            keywords: current.keywords.map((kw) =>
              kw.id === keywordId ? res.keyword : kw,
            ),
          },
          actionNotice: `Updated "${res.keyword.keyword}" to ${status}.`,
        });
      }
      void get().loadDashboardData();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        useAuthStore.getState().expireSession();
        return;
      }
      set({
        actionNotice:
          err instanceof ApiError
            ? err.message
            : 'Failed to update keyword approval.',
      });
    }
  },

  clearActionNotice: () => set({ actionNotice: null }),
}));
