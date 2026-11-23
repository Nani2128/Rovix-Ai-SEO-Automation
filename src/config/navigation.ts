import type { UserRole } from '../types/auth';

export interface SidebarNavItem {
  label: string;
  path: string;
  iconName:
    | 'LayoutDashboard'
    | 'FolderKanban'
    | 'ScanSearch'
    | 'KeyRound'
    | 'Users'
    | 'FilePenLine'
    | 'Link2'
    | 'MapPin'
    | 'Sparkles'
    | 'LineChart'
    | 'CheckSquare'
    | 'Activity'
    | 'FileBarChart2'
    | 'Blocks'
    | 'Settings'
    | 'Gauge'
    | 'Globe'
    | 'Cpu'
    | 'Workflow'
    | 'Coins'
    | 'CalendarClock'
    | 'Compass'
    | 'FileSearch2';
  requiredRoles?: UserRole[];
  statusDot?: 'active';
}

export interface SidebarNavGroup {
  title: string;
  items: SidebarNavItem[];
}

export const ALL_ROLES: readonly UserRole[] = [
  'Platform Admin',
  'Agency Owner',
  'SEO Strategist',
  'Business Owner',
  'Editor',
  'Developer',
  'Publisher',
  'Outreach Lead',
  'Project Manager',
  'QA',
] as const;

export const SIDEBAR_NAV_GROUPS: readonly SidebarNavGroup[] = [
  {
    title: 'OVERVIEW',
    items: [
      { label: 'Dashboard', path: '/dashboard', iconName: 'LayoutDashboard' },
      { label: 'Projects', path: '/projects', iconName: 'FolderKanban' },
    ],
  },
  {
    title: 'SEO INTELLIGENCE',
    items: [
      { label: 'Audit & Crawl', path: '/audit', iconName: 'ScanSearch' },
      { label: 'Keyword Lab', path: '/keywords', iconName: 'KeyRound' },
      { label: 'Geographic Intel', path: '/geographic-intelligence', iconName: 'Globe' },
      { label: 'Competitors', path: '/competitors', iconName: 'Users' },
      { label: 'Strategy & Architecture', path: '/strategy', iconName: 'Compass' },
      { label: 'On-Page SEO', path: '/on-page', iconName: 'FileSearch2' },
      { label: 'Content Studio', path: '/content', iconName: 'FilePenLine' },
      { label: 'Backlinks', path: '/backlinks', iconName: 'Link2' },
      { label: 'Local SEO', path: '/local-seo', iconName: 'MapPin' },
      { label: 'GEO Visibility', path: '/geo-visibility', iconName: 'Sparkles' },
    ],
  },
  {
    title: 'PERFORMANCE',
    items: [
      { label: 'Speed & Vitals', path: '/performance', iconName: 'Gauge' },
      { label: 'Analytics & ROI', path: '/analytics', iconName: 'LineChart' },
    ],
  },
  {
    title: 'OPERATIONS',
    items: [
      { label: 'AI Agent Factory', path: '/agent-factory', iconName: 'Cpu' },
      { label: 'Workflow Studio', path: '/agent-factory/workflows', iconName: 'Workflow' },
      { label: 'Usage & Cost', path: '/agent-factory/analytics', iconName: 'Coins' },
      { label: 'Operations', path: '/agent-factory/operations', iconName: 'CalendarClock' },
      { label: 'Tasks & Approvals', path: '/tasks', iconName: 'CheckSquare' },
      { label: 'Monitoring', path: '/monitoring', iconName: 'Activity' },
      { label: 'Weekly Reports', path: '/reports', iconName: 'FileBarChart2' },
    ],
  },
  {
    title: 'SYSTEM',
    items: [
      {
        label: 'Integrations',
        path: '/integrations',
        iconName: 'Blocks',
        statusDot: 'active',
        requiredRoles: [
          'Platform Admin',
          'Agency Owner',
          'SEO Strategist',
          'Developer',
          'Project Manager',
        ],
      },
      {
        label: 'Settings',
        path: '/settings',
        iconName: 'Settings',
        requiredRoles: [
          'Platform Admin',
          'Agency Owner',
          'Business Owner',
          'Developer',
        ],
      },
    ],
  },
];

export const MODULE_METADATA: Record<
  string,
  { title: string; subtitle: string; phaseTarget: string; description: string }
> = {
  '/audit': {
    title: 'Audit & Crawl',
    subtitle: 'Technical SEO diagnostics and indexability engine',
    phaseTarget: 'Phase 3',
    description:
      'Automated site crawls, Core Web Vitals telemetry, canonical verification, and schema checks.',
  },
  '/keywords': {
    title: 'Keyword Lab',
    subtitle: 'Search intent clustering and ranking opportunity explorer',
    phaseTarget: 'Phase 7',
    description:
      'Multi-market keyword discovery, SERP overlap clustering, and approval workflows.',
  },
  '/geographic-intelligence': {
    title: 'Geographic Search Intelligence',
    subtitle: 'Country, state, region, and city demand intelligence & URL mapping',
    phaseTarget: 'Phase 8',
    description:
      'Interactive geographic map, approved target markets, GSC country telemetry, regional Trends, and location-to-URL governance.',
  },
  '/competitors': {
    title: 'Competitors & Content Gaps',
    subtitle: 'Evidence-backed competitor HTML analysis, keyword overlap & content gap scoring',
    phaseTarget: 'Phase 9',
    description:
      'Analyze approved peer domains live, compare heading/schema/word depth vs crawled project pages, and queue owner-approved content plans.',
  },
  '/strategy': {
    title: 'SEO Strategy & Architecture',
    subtitle: 'Evidence-driven SEO strategy, interactive sitemap builder, keyword mapping & prioritized roadmap',
    phaseTarget: 'Module 7',
    description:
      'Synthesize verified crawl, keyword, geographic, and competitor evidence into a versioned SEO strategy, visual website architecture tree, internal linking matrix, and approval-governed roadmap.',
  },
  '/on-page': {
    title: 'On-Page SEO Optimization',
    subtitle: 'Crawl-backed page intelligence, deterministic 10-category scoring, versioned drafts & crawl verification',
    phaseTarget: 'Module 8',
    description:
      'Inspect crawled page titles, meta descriptions, headings, visible body copy, image alt attributes, JSON-LD schema, keyword alignment, and approval-governed optimization drafts.',
  },
  '/content': {
    title: 'Content Studio',
    subtitle: 'AI-assisted editorial briefs and optimization workflows',
    phaseTarget: 'Phase 3',
    description:
      'Entity coverage scoring, brief generation, editorial review gates, and publishing queues.',
  },
  '/backlinks': {
    title: 'Backlinks',
    subtitle: 'Authority profile and outreach prospect tracking',
    phaseTarget: 'Phase 3',
    description:
      'Referring domain monitoring, anchor balance checks, and vetted outreach pipeline.',
  },
  '/local-seo': {
    title: 'Local SEO',
    subtitle: 'Multi-location listing integrity and local pack tracking',
    phaseTarget: 'Phase 4',
    description:
      'NAP consistency checks, Google Business Profile signals, and regional visibility grids.',
  },
  '/geo-visibility': {
    title: 'GEO Visibility',
    subtitle: 'Generative answer-engine citation intelligence',
    phaseTarget: 'Phase 4',
    description:
      'Monitor brand citations, structured entity recall, and sentiment across AI search engines.',
  },
  '/performance': {
    title: 'Performance & Usability',
    subtitle: 'Core Web Vitals, PageSpeed Lighthouse Lab, and CrUX Field diagnostics',
    phaseTarget: 'Phase 6',
    description:
      'Analyze Mobile & Desktop speed, LCP/CLS/INP/TBT telemetry, resource payloads, and usability checks.',
  },
  '/analytics': {
    title: 'Analytics & ROI',
    subtitle: 'Search attribution and pipeline conversion telemetry',
    phaseTarget: 'Phase 3',
    description:
      'Unified GSC, GA4, and CRM attribution linking organic rankings to qualified revenue.',
  },
  '/agent-factory': {
    title: 'AI Agent Factory',
    subtitle: 'Isometric 3D operations topology and live backend execution telemetry',
    phaseTarget: 'Stage 1',
    description:
      'Observe real-time orchestration, agent availability, inter-agent handoffs, and SSE workflow telemetry.',
  },
  '/agent-factory/workflows': {
    title: 'Workflow Studio',
    subtitle: 'Visual multi-agent DAG builder, restricted conditions, governance gates & live execution',
    phaseTarget: 'Stage 4',
    description:
      'Design, validate, version, and execute real multi-agent SEO workflows with live node telemetry and human approval gates.',
  },
  '/agent-factory/analytics': {
    title: 'Usage & Cost Intelligence',
    subtitle: 'Measured provider tokens, micro-USD cost reconciliation, pricing registry & spending budgets',
    phaseTarget: 'Stage 5',
    description:
      'Audit actual LLM and specialist token consumption, reconciled workflow spend, versioned pricing schedules, execution timing, and active budget guardrails.',
  },
  '/agent-factory/operations': {
    title: 'Autonomous Operations',
    subtitle: 'Persistent scheduler, event-driven automations, self-healing recovery & autonomy governance',
    phaseTarget: 'Stage 6',
    description:
      'Manage persistent timezone-aware workflow schedules, signed webhook and domain event triggers, dead-letter recovery, autonomy policies, and live worker health.',
  },
  '/tasks': {
    title: 'Tasks & Approvals',
    subtitle: 'Scoped delivery weights and human-in-the-loop signoffs',
    phaseTarget: 'Phase 3',
    description:
      'Track verified task weights, resolve overdue approvals, and unblock automation runs.',
  },
  '/monitoring': {
    title: 'Monitoring',
    subtitle: 'Live worker queue health and recurring audit schedules',
    phaseTarget: 'Phase 3',
    description:
      'Observe crawl queues, retry states, uptime checks, and webhook delivery health.',
  },
  '/reports': {
    title: 'Weekly Reports',
    subtitle: 'Automated executive summaries and stakeholder digests',
    phaseTarget: 'Phase 4',
    description:
      'Scheduled weekly PDF/portal digests summarizing verified outcomes and next priorities.',
  },
  '/integrations': {
    title: 'Integrations',
    subtitle: 'Google Search Console, GA4, CMS, and CRM connectors',
    phaseTarget: 'Phase 3',
    description:
      'Server-side OAuth connections and credential vault governance across tenant workspaces.',
  },
  '/settings': {
    title: 'Settings',
    subtitle: 'Workspace governance, team roles, and security controls',
    phaseTarget: 'Phase 3',
    description:
      'Manage tenant domains, RBAC policies, session lifetimes, and notification rules.',
  },
};
