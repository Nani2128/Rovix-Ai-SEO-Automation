import type { AgentCatalogDefinition, AgentId, AgentStationId } from '../types/agentFactory';

export const AGENT_STATION_IDS: readonly AgentStationId[] = [
  'research_agent',
  'competitor_intelligence_agent',
  'keyword_intelligence_agent',
  'geographic_intelligence_agent',
  'technical_seo_agent',
  'performance_analysis_agent',
  'content_strategy_agent',
  'content_generation_agent',
  'quality_assurance_agent',
  'reporting_agent',
] as const;

export const AGENT_CATALOG: readonly AgentCatalogDefinition[] = [
  {
    agentId: 'orchestrator',
    name: 'AI Orchestrator',
    shortName: 'Orchestrator',
    role: 'Central Workflow Coordinator',
    description:
      'Coordinates pipeline handoffs across crawl, performance, keyword, geographic, competitor, QA, and reporting telemetry stations.',
    isOrchestrator: true,
    accentHex: '#22D3EE',
    propKind: 'core',
    connectedAgentIds: [...AGENT_STATION_IDS],
  },
  {
    agentId: 'research_agent',
    name: 'Research Agent',
    shortName: 'Research',
    role: 'Discovery & SERP Evidence',
    description:
      'Collects initial discovery seeds, autocomplete suggestions, and search landscape signals before specialist routing.',
    isOrchestrator: false,
    accentHex: '#38BDF8',
    propKind: 'radar',
    connectedAgentIds: [
      'orchestrator',
      'keyword_intelligence_agent',
      'competitor_intelligence_agent',
      'geographic_intelligence_agent',
    ],
  },
  {
    agentId: 'competitor_intelligence_agent',
    name: 'Competitor Intelligence Agent',
    shortName: 'Competitors',
    role: 'Domain Benchmarking & Page Gap Analysis',
    description:
      'Crawls approved competitor pages via SSRF-guarded HTTP inspection and detects heading, schema, and topic coverage gaps.',
    isOrchestrator: false,
    accentHex: '#A78BFA',
    propKind: 'compare',
    connectedAgentIds: [
      'orchestrator',
      'research_agent',
      'keyword_intelligence_agent',
      'content_strategy_agent',
    ],
  },
  {
    agentId: 'keyword_intelligence_agent',
    name: 'Keyword Intelligence Agent',
    shortName: 'Keywords',
    role: 'Intent Classification & Clustering',
    description:
      'Clusters discovered queries, maps keywords to target project URLs, and surfaces evidence-backed opportunities.',
    isOrchestrator: false,
    accentHex: '#8B5CF6',
    propKind: 'tags',
    connectedAgentIds: [
      'orchestrator',
      'research_agent',
      'geographic_intelligence_agent',
      'competitor_intelligence_agent',
      'content_strategy_agent',
    ],
  },
  {
    agentId: 'geographic_intelligence_agent',
    name: 'Geographic Intelligence Agent',
    shortName: 'Geo Intel',
    role: 'Country, Regional & Local Mapping',
    description:
      'Maps approved target markets, GSC country telemetry, Google Trends regional interest, and location-to-URL coverage.',
    isOrchestrator: false,
    accentHex: '#10B981',
    propKind: 'globe',
    connectedAgentIds: [
      'orchestrator',
      'keyword_intelligence_agent',
      'research_agent',
    ],
  },
  {
    agentId: 'technical_seo_agent',
    name: 'Technical SEO Agent',
    shortName: 'Tech SEO',
    role: 'Site Crawler & Indexability Rules',
    description:
      'Executes bounded project crawls, evaluates canonicals, status codes, schema, and metadata rules, and emits technical issues.',
    isOrchestrator: false,
    accentHex: '#06B6D4',
    propKind: 'server',
    connectedAgentIds: [
      'orchestrator',
      'quality_assurance_agent',
      'performance_analysis_agent',
      'competitor_intelligence_agent',
    ],
  },
  {
    agentId: 'performance_analysis_agent',
    name: 'Performance Analysis Agent',
    shortName: 'Performance',
    role: 'Core Web Vitals & Lighthouse Telemetry',
    description:
      'Runs Google PageSpeed Insights Mobile and Desktop audits for LCP, CLS, INP, TBT, and payload resource diagnostics.',
    isOrchestrator: false,
    accentHex: '#F59E0B',
    propKind: 'gauge',
    connectedAgentIds: [
      'orchestrator',
      'technical_seo_agent',
      'quality_assurance_agent',
    ],
  },
  {
    agentId: 'content_strategy_agent',
    name: 'Content Strategy Agent',
    shortName: 'Strategy',
    role: 'Brief Planning & Gap Prioritization',
    description:
      'Synthesizes competitor content gaps and keyword clusters into structured editorial briefs awaiting human approval.',
    isOrchestrator: false,
    accentHex: '#EC4899',
    propKind: 'docs',
    connectedAgentIds: [
      'orchestrator',
      'competitor_intelligence_agent',
      'keyword_intelligence_agent',
      'content_generation_agent',
    ],
  },
  {
    agentId: 'content_generation_agent',
    name: 'Content Generation Agent',
    shortName: 'Writer',
    role: 'Draft Authoring (Stage 2 Planned)',
    description:
      'Dedicated drafting station reserved for Stage 2 approved brief execution. Currently displays hardware/pipeline readiness only.',
    isOrchestrator: false,
    accentHex: '#FB7185',
    propKind: 'quill',
    connectedAgentIds: [
      'orchestrator',
      'content_strategy_agent',
      'quality_assurance_agent',
    ],
  },
  {
    agentId: 'quality_assurance_agent',
    name: 'Quality Assurance Agent',
    shortName: 'QA Verify',
    role: 'Fix Reverification & Verification Gates',
    description:
      'Re-crawls fixed URLs and checks performance/technical rules before closing tickets or marking technical issues Verified.',
    isOrchestrator: false,
    accentHex: '#34D399',
    propKind: 'shield',
    connectedAgentIds: [
      'orchestrator',
      'technical_seo_agent',
      'performance_analysis_agent',
      'reporting_agent',
    ],
  },
  {
    agentId: 'reporting_agent',
    name: 'Reporting Agent',
    shortName: 'Reporting',
    role: 'Diagnostics Export & Executive Digests',
    description:
      'Aggregates verified outcomes, CSV/JSON audit bundles, and stakeholder summaries (autonomous digests planned in Stage 2).',
    isOrchestrator: false,
    accentHex: '#60A5FA',
    propKind: 'chart',
    connectedAgentIds: ['orchestrator', 'quality_assurance_agent'],
  },
] as const;

export const AGENT_CATALOG_MAP: Record<AgentId, AgentCatalogDefinition> =
  Object.fromEntries(AGENT_CATALOG.map((item) => [item.agentId, item])) as Record<
    AgentId,
    AgentCatalogDefinition
  >;

export function getAgentCatalogDefinition(agentId: AgentId): AgentCatalogDefinition {
  return AGENT_CATALOG_MAP[agentId] ?? AGENT_CATALOG_MAP.orchestrator;
}
