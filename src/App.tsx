import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { useAuthStore } from './stores/useAuthStore';
import { useThemeStore } from './stores/useThemeStore';
import { WelcomePage } from './pages/Welcome/WelcomePage';
import { LoginPage } from './pages/Login/LoginPage';
import { AuthenticatedLayout } from './layouts/AuthenticatedLayout';
import { DashboardSkeleton } from './components/ui/StateViews';

const DashboardPage = lazy(() =>
  import('./pages/Dashboard/DashboardPage').then((m) => ({
    default: m.DashboardPage,
  })),
);

const ProjectsPage = lazy(() =>
  import('./pages/Projects/ProjectsPage').then((m) => ({
    default: m.ProjectsPage,
  })),
);

const AuditOverviewPage = lazy(() =>
  import('./pages/Audit/AuditOverviewPage').then((m) => ({
    default: m.AuditOverviewPage,
  })),
);

const NewCrawlPage = lazy(() =>
  import('./pages/Audit/NewCrawlPage').then((m) => ({
    default: m.NewCrawlPage,
  })),
);

const LiveCrawlPage = lazy(() =>
  import('./pages/Audit/LiveCrawlPage').then((m) => ({
    default: m.LiveCrawlPage,
  })),
);

const URLExplorerPage = lazy(() =>
  import('./pages/Audit/URLExplorerPage').then((m) => ({
    default: m.URLExplorerPage,
  })),
);

const TechnicalIssuesPage = lazy(() =>
  import('./pages/Audit/TechnicalIssuesPage').then((m) => ({
    default: m.TechnicalIssuesPage,
  })),
);

const IssueDetailsPage = lazy(() =>
  import('./pages/Audit/IssueDetailsPage').then((m) => ({
    default: m.IssueDetailsPage,
  })),
);

const CrawlHistoryPage = lazy(() =>
  import('./pages/Audit/CrawlHistoryPage').then((m) => ({
    default: m.CrawlHistoryPage,
  })),
);

const ReverificationPage = lazy(() =>
  import('./pages/Audit/ReverificationPage').then((m) => ({
    default: m.ReverificationPage,
  })),
);

const IntegrationsPage = lazy(() =>
  import('./pages/Integrations/IntegrationsPage').then((m) => ({
    default: m.IntegrationsPage,
  })),
);

const OperationalHealthPage = lazy(() =>
  import('./pages/Monitoring/OperationalHealthPage').then((m) => ({
    default: m.OperationalHealthPage,
  })),
);

const AnalyticsPage = lazy(() =>
  import('./pages/Analytics/AnalyticsPage').then((m) => ({
    default: m.AnalyticsPage,
  })),
);

const PerformancePage = lazy(() =>
  import('./pages/Performance/PerformancePage').then((m) => ({
    default: m.PerformancePage,
  })),
);

const KeywordsPage = lazy(() =>
  import('./pages/Keywords/KeywordsPage').then((m) => ({
    default: m.KeywordsPage,
  })),
);

const GeographicIntelligencePage = lazy(() =>
  import('./pages/Geographic/GeographicIntelligencePage').then((m) => ({
    default: m.GeographicIntelligencePage,
  })),
);

const CompetitorsPage = lazy(() =>
  import('./pages/Competitors/CompetitorsPage').then((m) => ({
    default: m.CompetitorsPage,
  })),
);

const StrategyWorkspacePage = lazy(() =>
  import('./pages/Strategy/StrategyWorkspacePage').then((m) => ({
    default: m.StrategyWorkspacePage,
  })),
);

const OnPageWorkspacePage = lazy(() =>
  import('./pages/OnPage/OnPageWorkspacePage').then((m) => ({
    default: m.OnPageWorkspacePage,
  })),
);

const AgentFactoryPage = lazy(() =>
  import('./pages/AgentFactory/AgentFactoryPage').then((m) => ({
    default: m.AgentFactoryPage,
  })),
);

const WorkflowStudioPage = lazy(() =>
  import('./pages/AgentFactory/WorkflowStudioPage').then((m) => ({
    default: m.WorkflowStudioPage,
  })),
);

const AgentUsageAnalyticsPage = lazy(() =>
  import('./pages/AgentFactory/AgentUsageAnalyticsPage').then((m) => ({
    default: m.AgentUsageAnalyticsPage,
  })),
);

const OperationsControlCenterPage = lazy(() =>
  import('./pages/AgentFactory/OperationsControlCenterPage').then((m) => ({
    default: m.OperationsControlCenterPage,
  })),
);

const TasksPage = lazy(() =>
  import('./pages/Tasks/TasksPage').then((m) => ({
    default: m.TasksPage,
  })),
);

const ReportsPage = lazy(() =>
  import('./pages/Reports/ReportsPage').then((m) => ({
    default: m.ReportsPage,
  })),
);

const SettingsPage = lazy(() =>
  import('./pages/Settings/SettingsPage').then((m) => ({
    default: m.SettingsPage,
  })),
);

const ModulePlaceholderPage = lazy(() =>
  import('./pages/ModulePlaceholder/ModulePlaceholderPage').then((m) => ({
    default: m.ModulePlaceholderPage,
  })),
);

const EXTERNAL_PROVIDER_MODULE_PATHS = [
  '/content',
  '/backlinks',
  '/local-seo',
  '/geo-visibility',
];

export default function App() {
  const checkSession = useAuthStore((s) => s.checkSession);
  const syncFromSystem = useThemeStore((s) => s.syncFromSystem);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => syncFromSystem();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [syncFromSystem]);

  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <Suspense
          fallback={
            <div className="min-h-screen bg-[var(--bg-canvas)] p-8">
              <DashboardSkeleton />
            </div>
          }
        >
          <Routes>
            {/* Public Welcome & Phase 1 Routes */}
            <Route path="/" element={<WelcomePage />} />
            <Route
              path="/onboarding"
              element={<WelcomePage subRoute="onboarding" />}
            />
            <Route
              path="/pricing"
              element={<WelcomePage subRoute="pricing" />}
            />
            <Route
              path="/resources"
              element={<WelcomePage subRoute="resources" />}
            />

            {/* Auth Routes */}
            <Route path="/login" element={<LoginPage mode="login" />} />
            <Route path="/signin" element={<Navigate to="/login" replace />} />
            <Route
              path="/forgot-password"
              element={<LoginPage mode="forgot-password" />}
            />

            {/* Protected Authenticated Application Shell */}
            <Route element={<AuthenticatedLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/projects" element={<ProjectsPage />} />

              {/* Phase 3: Technical SEO Audit & Crawl Engine */}
              <Route path="/audit" element={<AuditOverviewPage />} />
              <Route path="/audit/new" element={<NewCrawlPage />} />
              <Route path="/audit/live" element={<LiveCrawlPage />} />
              <Route path="/audit/live/:crawlId" element={<LiveCrawlPage />} />
              <Route path="/audit/urls" element={<URLExplorerPage />} />
              <Route path="/audit/urls/:crawlId" element={<URLExplorerPage />} />
              <Route path="/audit/issues" element={<TechnicalIssuesPage />} />
              <Route path="/audit/issues/:issueId" element={<IssueDetailsPage />} />
              <Route path="/audit/history" element={<CrawlHistoryPage />} />
              <Route path="/audit/reverify" element={<ReverificationPage />} />

              {/* Phase 5 & Phase 6: Production Real-Data & Performance Modules */}
              <Route path="/performance" element={<PerformancePage />} />
              <Route path="/keywords" element={<KeywordsPage />} />
              <Route path="/geographic-intelligence" element={<GeographicIntelligencePage />} />
              <Route path="/competitors" element={<CompetitorsPage />} />
              <Route path="/strategy" element={<StrategyWorkspacePage />} />
              <Route path="/on-page" element={<OnPageWorkspacePage />} />
              <Route path="/agent-factory" element={<AgentFactoryPage />} />
              <Route path="/agent-factory/workflows" element={<WorkflowStudioPage />} />
              <Route path="/agent-factory/analytics" element={<AgentUsageAnalyticsPage />} />
              <Route path="/agent-factory/operations" element={<OperationsControlCenterPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/monitoring" element={<OperationalHealthPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/integrations" element={<IntegrationsPage />} />
              <Route path="/settings" element={<SettingsPage />} />

              {/* Modules requiring external third-party data providers */}
              {EXTERNAL_PROVIDER_MODULE_PATHS.map((path) => (
                <Route
                  key={path}
                  path={path}
                  element={<ModulePlaceholderPage />}
                />
              ))}
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </MotionConfig>
  );
}
