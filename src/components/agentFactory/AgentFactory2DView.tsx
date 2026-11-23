import { useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  Compass,
  FileText,
  Gauge,
  Globe,
  Layers,
  PenTool,
  Server,
  ShieldCheck,
  Tags,
} from 'lucide-react';
import {
  getStateVisualSpec,
  resolveAgentFactoryLayout,
} from '../../lib/agentFactoryState';
import type {
  AgentActiveCommunicationLink,
  AgentId,
  AgentStationNodeSnapshot,
} from '../../types/agentFactory';
import { StatusBadge } from '../ui/StateViews';

const PROP_ICONS: Record<AgentStationNodeSnapshot['propKind'], typeof Bot> = {
  core: Bot,
  radar: Compass,
  compare: Layers,
  tags: Tags,
  globe: Globe,
  server: Server,
  gauge: Gauge,
  docs: FileText,
  quill: PenTool,
  shield: ShieldCheck,
  chart: Activity,
};

export interface AgentFactory2DViewProps {
  nodes: AgentStationNodeSnapshot[];
  activeLinks: AgentActiveCommunicationLink[];
  selectedAgentId: AgentId;
  onSelectAgent: (agentId: AgentId) => void;
  fallbackNotice?: string | null;
}

export function AgentFactory2DView({
  nodes,
  activeLinks,
  selectedAgentId,
  onSelectAgent,
  fallbackNotice,
}: AgentFactory2DViewProps) {
  const layout = useMemo(() => resolveAgentFactoryLayout(), []);
  const coordById = useMemo(
    () => new Map(layout.map((c) => [c.agentId, c])),
    [layout],
  );
  const selectedNode =
    nodes.find((n) => n.agentId === selectedAgentId) ?? nodes[0] ?? null;
  const connectedSet = useMemo(
    () =>
      new Set<AgentId>(
        selectedNode ? [selectedNode.agentId, ...selectedNode.connectedAgentIds] : [],
      ),
    [selectedNode],
  );

  const hubCoord = coordById.get('orchestrator');

  return (
    <div
      data-testid="agent-factory-2d-view"
      className="relative flex h-full min-h-[460px] w-full flex-col justify-between overflow-hidden rounded-[22px] border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4"
    >
      {fallbackNotice && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-300/60 bg-amber-50/90 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/50 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{fallbackNotice}</span>
        </div>
      )}

      {/* Desktop / Tablet Spatial 2D Graph */}
      <div className="relative hidden flex-1 md:block">
        <svg
          aria-hidden="true"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          {nodes
            .filter((n) => !n.isOrchestrator)
            .map((node) => {
              const pt = coordById.get(node.agentId);
              if (!pt || !hubCoord) return null;
              const isHighlighted =
                node.agentId === selectedAgentId ||
                selectedAgentId === 'orchestrator' ||
                connectedSet.has(node.agentId);
              const isCommunicating = activeLinks.some(
                (l) =>
                  l.sourceAgentId === node.agentId ||
                  l.destinationAgentId === node.agentId,
              );
              const spec = getStateVisualSpec(node.state);
              const isActive =
                node.state === 'running' ||
                node.state === 'retrying' ||
                isCommunicating;
              return (
                <line
                  key={`conduit-${node.agentId}`}
                  x1={hubCoord.x2dPct}
                  y1={hubCoord.y2dPct}
                  x2={pt.x2dPct}
                  y2={pt.y2dPct}
                  stroke={isActive || isHighlighted ? spec.colorHex : '#64748B'}
                  strokeWidth={isActive ? 0.55 : isHighlighted ? 0.35 : 0.2}
                  strokeDasharray={isActive ? '1.4 1.0' : undefined}
                  strokeOpacity={isActive ? 0.95 : isHighlighted ? 0.65 : 0.25}
                />
              );
            })}
        </svg>

        {nodes.map((node) => {
          const coord = coordById.get(node.agentId);
          if (!coord) return null;
          const Icon = PROP_ICONS[node.propKind] ?? Bot;
          const spec = getStateVisualSpec(node.state);
          const isSelected = node.agentId === selectedAgentId;
          const isNeighbor = connectedSet.has(node.agentId);

          return (
            <button
              key={node.agentId}
              type="button"
              onClick={() => onSelectAgent(node.agentId)}
              aria-pressed={isSelected}
              aria-label={`${node.name} — ${spec.label}`}
              style={{
                left: `${coord.x2dPct}%`,
                top: `${coord.y2dPct}%`,
                transform: 'translate(-50%, -50%)',
                borderColor: isSelected ? spec.colorHex : undefined,
              }}
              className={`absolute flex flex-col items-center gap-1 rounded-2xl border px-3 py-2 text-center shadow-sm transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7047EB] ${
                node.isOrchestrator
                  ? 'z-20 min-w-[148px] bg-[var(--bg-surface)] py-3 shadow-md'
                  : 'z-10 min-w-[126px] bg-[var(--bg-surface)]'
              } ${
                isSelected
                  ? 'ring-2 ring-[#7047EB]/40'
                  : isNeighbor
                    ? 'border-[var(--border-hairline)] opacity-100'
                    : 'border-[var(--border-hairline)] opacity-85 hover:opacity-100'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: `${spec.colorHex}20`,
                    color: spec.colorHex,
                  }}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span className="font-display text-[11.5px] font-bold text-[var(--text-primary)] whitespace-nowrap">
                  {node.shortName}
                </span>
              </div>
              <StatusBadge label={spec.label} tone={spec.badgeTone} />
            </button>
          );
        })}
      </div>

      {/* Responsive Mobile Compact Grid */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:hidden">
        {nodes.map((node) => {
          const Icon = PROP_ICONS[node.propKind] ?? Bot;
          const spec = getStateVisualSpec(node.state);
          const isSelected = node.agentId === selectedAgentId;
          return (
            <button
              key={node.agentId}
              type="button"
              onClick={() => onSelectAgent(node.agentId)}
              aria-pressed={isSelected}
              className={`flex items-center justify-between gap-2 rounded-2xl border bg-[var(--bg-surface)] p-3 text-left transition-colors cursor-pointer ${
                isSelected
                  ? 'border-[#7047EB] ring-1 ring-[#7047EB]/30'
                  : 'border-[var(--border-hairline)]'
              }`}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                  style={{
                    backgroundColor: `${spec.colorHex}20`,
                    color: spec.colorHex,
                  }}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="truncate font-display text-xs font-bold text-[var(--text-primary)]">
                    {node.name}
                  </div>
                  <div className="truncate text-[11px] text-[var(--text-muted)]">
                    {node.role}
                  </div>
                </div>
              </div>
              <StatusBadge label={spec.label} tone={spec.badgeTone} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
