import type { ThemePresetId } from '../config/themes';
import type {
  AgentActiveCommunicationLink,
  AgentExecutionState,
  AgentFactoryEvent,
  AgentFactorySnapshot,
  AgentFactoryWorkflowSummary,
  AgentId,
  AgentStationNodeSnapshot,
} from '../types/agentFactory';
import { AGENT_CATALOG } from './agentFactoryCatalog';

export interface AgentFactoryClientState {
  snapshot: AgentFactorySnapshot;
  seenEventIds: Set<string>;
}

export interface AgentStateVisualSpec {
  label: string;
  colorHex: string;
  emissiveHex: string;
  emissiveIntensity: number;
  badgeTone: 'neutral' | 'info' | 'indigo' | 'success' | 'warning' | 'danger';
  isAnimated: boolean;
}

export interface Theme3DPalette {
  presetId: ThemePresetId;
  isDark: boolean;
  canvasBg: string;
  fogHex: string;
  floorHex: string;
  gridLineHex: string;
  plinthHex: string;
  plinthTrimHex: string;
  glassTintHex: string;
  glassOpacity: number;
  hudSurfaceBg: string;
  hudBorder: string;
  hudTextPrimary: string;
  hudTextMuted: string;
  accentPrimary: string;
  accentSecondary: string;
  robotShellHex: string;
  robotVisorHex: string;
  conduitIdleHex: string;
  ambientLightHex: string;
  ambientGroundHex: string;
  keyLightHex: string;
}

export const COMMUNICATION_LINK_TTL_MS = 12_000;
const MAX_TIMELINE_EVENTS = 80;

export function getStateVisualSpec(state: AgentExecutionState): AgentStateVisualSpec {
  switch (state) {
    case 'running':
      return {
        label: 'Running',
        colorHex: '#06B6D4',
        emissiveHex: '#22D3EE',
        emissiveIntensity: 1.45,
        badgeTone: 'info',
        isAnimated: true,
      };
    case 'communicating':
      return {
        label: 'Communicating',
        colorHex: '#8B5CF6',
        emissiveHex: '#A78BFA',
        emissiveIntensity: 1.55,
        badgeTone: 'indigo',
        isAnimated: true,
      };
    case 'queued':
      return {
        label: 'Queued',
        colorHex: '#3B82F6',
        emissiveHex: '#60A5FA',
        emissiveIntensity: 0.9,
        badgeTone: 'indigo',
        isAnimated: false,
      };
    case 'retrying':
      return {
        label: 'Retrying',
        colorHex: '#F59E0B',
        emissiveHex: '#FBBF24',
        emissiveIntensity: 1.25,
        badgeTone: 'warning',
        isAnimated: true,
      };
    case 'waiting_for_approval':
      return {
        label: 'Waiting Approval',
        colorHex: '#F59E0B',
        emissiveHex: '#FBBF24',
        emissiveIntensity: 1.15,
        badgeTone: 'warning',
        isAnimated: false,
      };
    case 'completed':
      return {
        label: 'Completed',
        colorHex: '#10B981',
        emissiveHex: '#34D399',
        emissiveIntensity: 0.85,
        badgeTone: 'success',
        isAnimated: false,
      };
    case 'failed':
      return {
        label: 'Failed',
        colorHex: '#EF4444',
        emissiveHex: '#F87171',
        emissiveIntensity: 1.35,
        badgeTone: 'danger',
        isAnimated: false,
      };
    case 'scheduled':
      return {
        label: 'Scheduled',
        colorHex: '#6366F1',
        emissiveHex: '#818CF8',
        emissiveIntensity: 0.72,
        badgeTone: 'indigo',
        isAnimated: false,
      };
    case 'waiting_for_trigger':
      return {
        label: 'Waiting Trigger',
        colorHex: '#0EA5E9',
        emissiveHex: '#38BDF8',
        emissiveIntensity: 0.62,
        badgeTone: 'info',
        isAnimated: false,
      };
    case 'paused':
      return {
        label: 'Paused',
        colorHex: '#D97706',
        emissiveHex: '#F59E0B',
        emissiveIntensity: 0.65,
        badgeTone: 'warning',
        isAnimated: false,
      };
    case 'recovered':
      return {
        label: 'Recovered',
        colorHex: '#14B8A6',
        emissiveHex: '#2DD4BF',
        emissiveIntensity: 0.95,
        badgeTone: 'success',
        isAnimated: false,
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        colorHex: '#94A3B8',
        emissiveHex: '#64748B',
        emissiveIntensity: 0.4,
        badgeTone: 'warning',
        isAnimated: false,
      };
    case 'unavailable':
      return {
        label: 'Unavailable',
        colorHex: '#64748B',
        emissiveHex: '#334155',
        emissiveIntensity: 0.12,
        badgeTone: 'neutral',
        isAnimated: false,
      };
    case 'idle':
    default:
      return {
        label: 'Idle',
        colorHex: '#38BDF8',
        emissiveHex: '#0284C7',
        emissiveIntensity: 0.28,
        badgeTone: 'neutral',
        isAnimated: false,
      };
  }
}

export function extractTheme3DPalette(presetId: ThemePresetId): Theme3DPalette {
  switch (presetId) {
    case 'enterprise-light':
      return {
        presetId,
        isDark: false,
        canvasBg: '#EAF0FA',
        fogHex: '#EAF0FA',
        floorHex: '#DDE5F2',
        gridLineHex: '#C8D3E6',
        plinthHex: '#FFFFFF',
        plinthTrimHex: '#CBD5E1',
        glassTintHex: '#7047EB',
        glassOpacity: 0.22,
        hudSurfaceBg: 'rgba(255, 255, 255, 0.94)',
        hudBorder: '#D5DCEB',
        hudTextPrimary: '#101827',
        hudTextMuted: '#475569',
        accentPrimary: '#7047EB',
        accentSecondary: '#2563EB',
        robotShellHex: '#F8FAFC',
        robotVisorHex: '#0F172A',
        conduitIdleHex: '#94A3B8',
        ambientLightHex: '#F8FAFC',
        ambientGroundHex: '#CBD5E1',
        keyLightHex: '#FFFDF8',
      };
    case 'neo-tactile':
      return {
        presetId,
        isDark: false,
        canvasBg: '#E4E8F1',
        fogHex: '#E4E8F1',
        floorHex: '#D8DFEC',
        gridLineHex: '#C2CCDC',
        plinthHex: '#FFFFFF',
        plinthTrimHex: '#B8C4D8',
        glassTintHex: '#4F46E5',
        glassOpacity: 0.22,
        hudSurfaceBg: 'rgba(255, 255, 255, 0.96)',
        hudBorder: '#C7D1E2',
        hudTextPrimary: '#0F172A',
        hudTextMuted: '#475569',
        accentPrimary: '#4F46E5',
        accentSecondary: '#0284C7',
        robotShellHex: '#FFFFFF',
        robotVisorHex: '#0F172A',
        conduitIdleHex: '#94A3B8',
        ambientLightHex: '#F1F5F9',
        ambientGroundHex: '#CBD5E1',
        keyLightHex: '#FFFFFF',
      };
    case 'soft-neumorphic':
      return {
        presetId,
        isDark: false,
        canvasBg: '#DFE6F0',
        fogHex: '#DFE6F0',
        floorHex: '#D6DFEB',
        gridLineHex: '#C1CDDE',
        plinthHex: '#EEF3F9',
        plinthTrimHex: '#CBD6E6',
        glassTintHex: '#6366F1',
        glassOpacity: 0.2,
        hudSurfaceBg: 'rgba(239, 243, 249, 0.95)',
        hudBorder: '#CCD6E5',
        hudTextPrimary: '#1E293B',
        hudTextMuted: '#475569',
        accentPrimary: '#6366F1',
        accentSecondary: '#14B8A6',
        robotShellHex: '#F4F7FC',
        robotVisorHex: '#1E293B',
        conduitIdleHex: '#94A3B8',
        ambientLightHex: '#F8FAFC',
        ambientGroundHex: '#CBD5E1',
        keyLightHex: '#FFF9F0',
      };
    case 'pastel-3d':
      return {
        presetId,
        isDark: false,
        canvasBg: '#ECE5FE',
        fogHex: '#ECE5FE',
        floorHex: '#E3DAFB',
        gridLineHex: '#CFC2FA',
        plinthHex: '#FCF9FF',
        plinthTrimHex: '#D8CCFD',
        glassTintHex: '#7C3AED',
        glassOpacity: 0.22,
        hudSurfaceBg: 'rgba(252, 249, 255, 0.95)',
        hudBorder: '#DDD2FE',
        hudTextPrimary: '#1E1B4B',
        hudTextMuted: '#4338CA',
        accentPrimary: '#7C3AED',
        accentSecondary: '#06B6D4',
        robotShellHex: '#FFFFFF',
        robotVisorHex: '#1E1B4B',
        conduitIdleHex: '#A78BFA',
        ambientLightHex: '#F5F3FF',
        ambientGroundHex: '#DDD6FE',
        keyLightHex: '#FFFDF9',
      };
    case 'emerald-glass':
      return {
        presetId,
        isDark: true,
        canvasBg: '#041410',
        fogHex: '#041410',
        floorHex: '#071E18',
        gridLineHex: '#123A2F',
        plinthHex: '#0C2820',
        plinthTrimHex: '#194A3C',
        glassTintHex: '#10B981',
        glassOpacity: 0.26,
        hudSurfaceBg: 'rgba(9, 33, 27, 0.94)',
        hudBorder: 'rgba(52, 211, 153, 0.34)',
        hudTextPrimary: '#ECFDF5',
        hudTextMuted: '#A7F3D0',
        accentPrimary: '#10B981',
        accentSecondary: '#34D399',
        robotShellHex: '#E2E8F0',
        robotVisorHex: '#041511',
        conduitIdleHex: '#1B4D3E',
        ambientLightHex: '#A7F3D0',
        ambientGroundHex: '#041511',
        keyLightHex: '#ECFDF5',
      };
    case 'luxury-dark':
      return {
        presetId,
        isDark: true,
        canvasBg: '#09090B',
        fogHex: '#09090B',
        floorHex: '#111116',
        gridLineHex: '#27272F',
        plinthHex: '#17171D',
        plinthTrimHex: '#332C1A',
        glassTintHex: '#D4AF37',
        glassOpacity: 0.24,
        hudSurfaceBg: 'rgba(19, 19, 23, 0.95)',
        hudBorder: 'rgba(212, 175, 55, 0.34)',
        hudTextPrimary: '#F5F3EE',
        hudTextMuted: '#D4CFC4',
        accentPrimary: '#D4AF37',
        accentSecondary: '#E6C76B',
        robotShellHex: '#E7E5E4',
        robotVisorHex: '#09090B',
        conduitIdleHex: '#3F3722',
        ambientLightHex: '#F5E6C4',
        ambientGroundHex: '#0A0A0C',
        keyLightHex: '#FFF6E0',
      };
    case 'midnight-glass':
    default:
      return {
        presetId: 'midnight-glass',
        isDark: true,
        canvasBg: '#090E1A',
        fogHex: '#090E1A',
        floorHex: '#0F172A',
        gridLineHex: '#1E293B',
        plinthHex: '#162033',
        plinthTrimHex: '#25354E',
        glassTintHex: '#22D3EE',
        glassOpacity: 0.26,
        hudSurfaceBg: 'rgba(16, 24, 39, 0.94)',
        hudBorder: 'rgba(56, 189, 248, 0.32)',
        hudTextPrimary: '#F1F5F9',
        hudTextMuted: '#94A3B8',
        accentPrimary: '#8B6BFF',
        accentSecondary: '#22D3EE',
        robotShellHex: '#E2E8F0',
        robotVisorHex: '#090E1A',
        conduitIdleHex: '#23334C',
        ambientLightHex: '#C7D2FE',
        ambientGroundHex: '#090E1A',
        keyLightHex: '#F8FAFC',
      };
  }
}

export interface SpatialStationCoord {
  agentId: AgentId;
  x: number;
  y: number;
  z: number;
  /** Angle facing inward toward orchestrator */
  yaw: number;
  /** 2D SVG percent coordinates (0..100) */
  x2dPct: number;
  y2dPct: number;
}

export function resolveAgentFactoryLayout(): SpatialStationCoord[] {
  const result: SpatialStationCoord[] = [
    {
      agentId: 'orchestrator',
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      x2dPct: 50,
      y2dPct: 50,
    },
  ];

  const stations = AGENT_CATALOG.filter((a) => !a.isOrchestrator);
  const count = stations.length; // 10 stations

  stations.forEach((station, idx) => {
    // Staggered dual-ring radial placement so all 11 stations frame cleanly inside isometric viewports
    const angle = (idx / count) * Math.PI * 2 - Math.PI / 2;
    const radius3D = idx % 2 === 0 ? 5.3 : 6.45;
    const x = Number((Math.cos(angle) * radius3D).toFixed(3));
    const z = Number((Math.sin(angle) * radius3D).toFixed(3));
    const yaw = Math.atan2(-x, -z);

    const radius2D = idx % 2 === 0 ? 31 : 38;
    const x2dPct = Number((50 + Math.cos(angle) * radius2D).toFixed(2));
    const y2dPct = Number((50 + Math.sin(angle) * radius2D).toFixed(2));

    result.push({
      agentId: station.agentId,
      x,
      y: 0,
      z,
      yaw,
      x2dPct,
      y2dPct,
    });
  });

  return result;
}

export function recomputeSnapshotCounts(
  nodes: AgentStationNodeSnapshot[],
  workflows: AgentFactoryWorkflowSummary[],
): {
  counts: AgentFactorySnapshot['counts'];
  systemHealth: AgentFactorySnapshot['systemHealth'];
} {
  const stationNodes = nodes.filter((n) => !n.isOrchestrator);
  const activeAgents = stationNodes.filter(
    (n) =>
      n.state === 'running' ||
      n.state === 'communicating' ||
      n.state === 'retrying',
  ).length;
  const queuedTasks = stationNodes.filter((n) => n.state === 'queued').length;
  const failedExecutions = stationNodes.filter((n) => n.state === 'failed').length;
  const waitingApprovalTasks = stationNodes.filter(
    (n) => n.state === 'waiting_for_approval',
  ).length;
  const connectedAgents = stationNodes.filter(
    (n) => n.availabilityStatus !== 'unavailable',
  ).length;
  const unavailableAgents = stationNodes.filter(
    (n) => n.availabilityStatus === 'unavailable',
  ).length;
  const runningWorkflows = workflows.filter(
    (w) =>
      w.status === 'running' ||
      w.status === 'queued' ||
      w.status === 'waiting_for_approval',
  ).length;

  const systemHealth: AgentFactorySnapshot['systemHealth'] =
    failedExecutions > 0
      ? 'attention_required'
      : activeAgents > 0 || queuedTasks > 0 || waitingApprovalTasks > 0
        ? 'healthy'
        : unavailableAgents === stationNodes.length
          ? 'degraded'
          : 'healthy';

  return {
    counts: {
      activeAgents,
      runningWorkflows,
      queuedTasks,
      failedExecutions,
      waitingApprovalTasks,
      connectedAgents,
      unavailableAgents,
    },
    systemHealth,
  };
}

export function createInitialAgentFactoryState(
  snapshot: AgentFactorySnapshot,
): AgentFactoryClientState {
  const seenEventIds = new Set<string>();
  const dedupedEvents: AgentFactoryEvent[] = [];
  for (const ev of snapshot.recentEvents) {
    if (!seenEventIds.has(ev.id)) {
      seenEventIds.add(ev.id);
      dedupedEvents.push(ev);
    }
  }

  const dedupedNodes = snapshot.nodes.map((node) => {
    const nodeSeen = new Set<string>();
    const recentEvents = node.recentEvents.filter((ev) => {
      if (nodeSeen.has(ev.id)) return false;
      nodeSeen.add(ev.id);
      return true;
    });
    return { ...node, recentEvents };
  });

  const { counts, systemHealth } = recomputeSnapshotCounts(
    dedupedNodes,
    snapshot.workflows,
  );

  return {
    snapshot: {
      ...snapshot,
      counts,
      systemHealth,
      nodes: dedupedNodes,
      recentEvents: dedupedEvents.slice(0, MAX_TIMELINE_EVENTS),
    },
    seenEventIds,
  };
}

export function applyAgentFactoryEvent(
  prevState: AgentFactoryClientState,
  event: AgentFactoryEvent,
  nowMs: number = Date.now(),
): AgentFactoryClientState {
  // Ignore events for another tenant/project or already processed event IDs
  if (
    event.tenantId !== prevState.snapshot.tenantId ||
    (event.projectId && event.projectId !== prevState.snapshot.projectId)
  ) {
    return prevState;
  }

  if (prevState.seenEventIds.has(event.id)) {
    return prevState;
  }

  const nextSeen = new Set(prevState.seenEventIds);
  nextSeen.add(event.id);

  // Update timeline events (strictly real events, newest first)
  const nextTimeline = [event, ...prevState.snapshot.recentEvents].slice(
    0,
    MAX_TIMELINE_EVENTS,
  );

  // Update communication links
  let nextLinks: AgentActiveCommunicationLink[] =
    prevState.snapshot.activeLinks.filter((l) => l.expiresAtMs > nowMs);

  const isLinkEvent =
    event.eventType === 'agent.communication' ||
    event.eventType === 'handoff.recorded' ||
    event.eventType === 'agent.message.sent' ||
    event.eventType === 'agent.message.delivered' ||
    event.eventType === 'agent.message.failed' ||
    event.eventType === 'agent.delegation.created' ||
    event.eventType === 'agent.delegation.completed' ||
    event.eventType === 'conflict.detected';

  if (isLinkEvent && event.sourceAgentId && event.destinationAgentId) {
    const filtered = nextLinks.filter(
      (l) =>
        !(
          l.sourceAgentId === event.sourceAgentId &&
          l.destinationAgentId === event.destinationAgentId &&
          l.workflowId === event.workflowId
        ),
    );
    const linkStatus: AgentActiveCommunicationLink['status'] =
      event.eventType === 'agent.message.failed'
        ? 'failed'
        : event.eventType === 'conflict.detected'
          ? 'conflict'
          : event.eventType === 'agent.message.delivered' ||
              event.eventType === 'agent.delegation.completed'
            ? 'delivered'
            : 'active';

    filtered.push({
      id: `link-${event.id}`,
      sourceAgentId: event.sourceAgentId,
      destinationAgentId: event.destinationAgentId,
      workflowId: event.workflowId,
      label: event.summary,
      timestamp: event.timestamp,
      expiresAtMs: nowMs + COMMUNICATION_LINK_TTL_MS,
      correlationId: event.correlationId ?? null,
      status: linkStatus,
      isPeerToPeer:
        event.sourceAgentId !== 'orchestrator' &&
        event.destinationAgentId !== 'orchestrator',
    });
    nextLinks = filtered;
  } else if (
    event.eventType === 'workflow.completed' ||
    event.eventType === 'workflow.failed' ||
    event.eventType === 'workflow.cancelled'
  ) {
    nextLinks = nextLinks.filter((l) => l.workflowId !== event.workflowId);
  } else if (
    event.eventType === 'agent.failed' ||
    event.eventType === 'agent.cancelled'
  ) {
    nextLinks = nextLinks.filter(
      (l) =>
        !(
          l.workflowId === event.workflowId &&
          (l.sourceAgentId === event.agentId ||
            l.destinationAgentId === event.agentId)
        ),
    );
  }

  // Update workflows
  let nextWorkflows = [...prevState.snapshot.workflows];
  const existingWfIdx = nextWorkflows.findIndex(
    (w) => w.workflowId === event.workflowId,
  );
  if (event.eventType === 'workflow.started' || event.eventType === 'agent.started') {
    const wfEntry: AgentFactoryWorkflowSummary = {
      workflowId: event.workflowId,
      title: event.taskTitle,
      status: 'running',
      leadAgentId: event.agentId,
      startedAt: event.timestamp,
      completedAt: null,
      evidenceUrl: event.evidenceUrl,
      errorSummary: null,
    };
    if (existingWfIdx >= 0) {
      nextWorkflows[existingWfIdx] = {
        ...nextWorkflows[existingWfIdx],
        status: 'running',
      };
    } else {
      nextWorkflows = [wfEntry, ...nextWorkflows].slice(0, 20);
    }
  } else if (event.eventType === 'agent.queued' && existingWfIdx < 0) {
    const queuedEntry: AgentFactoryWorkflowSummary = {
      workflowId: event.workflowId,
      title: event.taskTitle,
      status: 'queued',
      leadAgentId: event.agentId,
      startedAt: event.timestamp,
      completedAt: null,
      evidenceUrl: event.evidenceUrl,
      errorSummary: null,
    };
    nextWorkflows = [queuedEntry, ...nextWorkflows].slice(0, 20);
  } else if (
    event.eventType === 'workflow.completed' ||
    event.eventType === 'workflow.failed' ||
    event.eventType === 'workflow.cancelled' ||
    event.eventType === 'agent.cancelled'
  ) {
    const nextWfStatus: AgentFactoryWorkflowSummary['status'] =
      event.eventType === 'workflow.failed'
        ? 'failed'
        : event.eventType === 'agent.cancelled' || event.eventType === 'workflow.cancelled'
          ? 'cancelled'
          : 'completed';
    if (existingWfIdx >= 0) {
      nextWorkflows[existingWfIdx] = {
        ...nextWorkflows[existingWfIdx],
        status: nextWfStatus,
        completedAt: event.timestamp,
        errorSummary: event.errorSummary,
      };
    } else {
      nextWorkflows = [
        {
          workflowId: event.workflowId,
          title: event.taskTitle,
          status: nextWfStatus,
          leadAgentId: event.agentId,
          startedAt: event.timestamp,
          completedAt: event.timestamp,
          evidenceUrl: event.evidenceUrl,
          errorSummary: event.errorSummary,
        },
        ...nextWorkflows,
      ].slice(0, 20);
    }
  } else if (event.eventType === 'workflow.paused' && existingWfIdx >= 0) {
    nextWorkflows[existingWfIdx] = {
      ...nextWorkflows[existingWfIdx],
      status: 'paused',
      blockingReason: event.summary,
    };
  } else if (
    (event.eventType === 'workflow.resumed' || event.eventType === 'workflow.recovered') &&
    existingWfIdx >= 0
  ) {
    nextWorkflows[existingWfIdx] = {
      ...nextWorkflows[existingWfIdx],
      status: 'running',
      blockingReason: null,
    };
  } else if (event.eventType === 'task.waiting_approval' && existingWfIdx >= 0) {
    nextWorkflows[existingWfIdx] = {
      ...nextWorkflows[existingWfIdx],
      status: 'waiting_for_approval',
      blockingReason: event.summary,
    };
  } else if (event.eventType === 'approval.decided' && existingWfIdx >= 0) {
    nextWorkflows[existingWfIdx] = {
      ...nextWorkflows[existingWfIdx],
      status: event.status === 'failed' ? 'failed' : 'running',
      blockingReason: null,
    };
  }

  // Update targeted node(s)
  const affectedAgents = new Set<AgentId>([event.agentId]);
  if (isLinkEvent) {
    if (event.sourceAgentId) affectedAgents.add(event.sourceAgentId);
    if (event.destinationAgentId) affectedAgents.add(event.destinationAgentId);
  }

  const intermediateNodes = prevState.snapshot.nodes.map((node) => {
    if (!affectedAgents.has(node.agentId)) {
      return node;
    }

    const updatedRecent = [event, ...node.recentEvents].slice(0, 25);

    if (
      event.eventType === 'agent.communication' ||
      event.eventType === 'handoff.recorded' ||
      event.eventType === 'agent.message.sent' ||
      event.eventType === 'agent.message.delivered' ||
      event.eventType === 'agent.delegation.created'
    ) {
      const nextState: AgentExecutionState =
        node.state === 'unavailable' ? 'unavailable' : 'communicating';
      return {
        ...node,
        state: nextState,
        recentEvents: updatedRecent,
      };
    }

    const nextProgress =
      typeof event.progressPct === 'number' && Number.isFinite(event.progressPct)
        ? Math.max(0, Math.min(100, event.progressPct))
        : node.currentTask?.progressPct ?? null;

    if (
      event.eventType === 'agent.queued' ||
      event.eventType === 'agent.started' ||
      event.eventType === 'agent.progress' ||
      event.eventType === 'agent.retrying' ||
      event.eventType === 'task.waiting_approval' ||
      event.eventType === 'approval.decided' ||
      event.eventType === 'workflow.started'
    ) {
      const nextNodeState: AgentExecutionState =
        event.eventType === 'agent.queued'
          ? 'queued'
          : event.eventType === 'agent.retrying'
            ? 'retrying'
            : event.eventType === 'task.waiting_approval'
              ? 'waiting_for_approval'
              : 'running';
      const nextMetrics = { ...node.metrics };
      if (event.eventType === 'agent.queued') {
        nextMetrics.queueDepth = Math.max(1, nextMetrics.queueDepth);
      } else if (event.eventType === 'agent.started') {
        nextMetrics.runningCount = Math.max(1, nextMetrics.runningCount);
      } else if (event.eventType === 'agent.retrying') {
        nextMetrics.retryCount += 1;
      } else if (event.eventType === 'task.waiting_approval') {
        nextMetrics.waitingApprovalCount = Math.max(
          1,
          nextMetrics.waitingApprovalCount,
        );
      }
      return {
        ...node,
        state: nextNodeState,
        metrics: nextMetrics,
        currentTask: {
          taskId: event.taskId,
          workflowId: event.workflowId,
          title: event.taskTitle,
          startedAt: node.currentTask?.startedAt ?? event.timestamp,
          progressPct: nextProgress,
          evidenceUrl: event.evidenceUrl,
        },
        recentEvents: updatedRecent,
      };
    }

    if (
      event.eventType === 'workflow.paused' ||
      event.eventType === 'workflow.resumed' ||
      event.eventType === 'workflow.recovered' ||
      event.eventType === 'schedule.triggered' ||
      event.eventType === 'trigger.fired'
    ) {
      const nextNodeState: AgentExecutionState =
        event.eventType === 'workflow.paused'
          ? 'paused'
          : event.eventType === 'workflow.recovered'
            ? 'recovered'
            : event.eventType === 'schedule.triggered'
              ? 'scheduled'
              : event.eventType === 'trigger.fired'
                ? 'waiting_for_trigger'
                : 'running';
      return {
        ...node,
        state: nextNodeState,
        recentEvents: updatedRecent,
      };
    }

    // Terminal event: agent.completed / agent.failed / agent.cancelled / task.dead_lettered / workflow.completed / workflow.failed / workflow.cancelled
    const terminalState: AgentExecutionState =
      event.eventType === 'agent.failed' ||
      event.eventType === 'workflow.failed' ||
      event.eventType === 'task.dead_lettered'
        ? 'failed'
        : event.eventType === 'agent.cancelled' ||
            event.eventType === 'workflow.cancelled'
          ? 'cancelled'
          : 'completed';

    const nextMetrics = { ...node.metrics };
    if (event.eventType === 'agent.completed') {
      nextMetrics.completedCount += 1;
      nextMetrics.runningCount = Math.max(0, nextMetrics.runningCount - 1);
      if (typeof event.durationMs === 'number' && Number.isFinite(event.durationMs)) {
        nextMetrics.lastDurationMs = event.durationMs;
      }
      if (
        typeof event.inputTokens === 'number' &&
        typeof event.outputTokens === 'number'
      ) {
        nextMetrics.totalInputTokens =
          (nextMetrics.totalInputTokens ?? 0) + event.inputTokens;
        nextMetrics.totalOutputTokens =
          (nextMetrics.totalOutputTokens ?? 0) + event.outputTokens;
        nextMetrics.tokenUsageAvailable = true;
      }
      if (event.provider) nextMetrics.lastProvider = event.provider;
      if (event.model) nextMetrics.lastModel = event.model;
    } else if (event.eventType === 'agent.failed') {
      nextMetrics.failedCount += 1;
      nextMetrics.runningCount = Math.max(0, nextMetrics.runningCount - 1);
    } else if (event.eventType === 'agent.cancelled') {
      nextMetrics.runningCount = Math.max(0, nextMetrics.runningCount - 1);
      nextMetrics.queueDepth = Math.max(0, nextMetrics.queueDepth - 1);
    }

    return {
      ...node,
      state: terminalState,
      metrics: nextMetrics,
      currentTask: null,
      lastExecution: {
        status: terminalState,
        summary: event.summary,
        timestamp: event.timestamp,
        errorSummary: event.errorSummary,
        evidenceUrl: event.evidenceUrl,
      },
      recentEvents: updatedRecent,
    };
  });

  // Derive AI Orchestrator roll-up state honestly
  const stationNodes = intermediateNodes.filter((n) => !n.isOrchestrator);
  const anyActive = stationNodes.some(
    (n) =>
      n.state === 'running' ||
      n.state === 'communicating' ||
      n.state === 'retrying' ||
      n.state === 'queued',
  );
  const anyWaitingApproval = stationNodes.some(
    (n) => n.state === 'waiting_for_approval',
  );
  const anyFailed = stationNodes.some((n) => n.state === 'failed');

  const finalNodes = intermediateNodes.map((node) => {
    if (!node.isOrchestrator) return node;
    const derivedState: AgentExecutionState =
      nextLinks.length > 0
        ? 'communicating'
        : anyActive
          ? 'running'
          : anyWaitingApproval
            ? 'waiting_for_approval'
            : anyFailed
              ? 'failed'
              : node.lastExecution?.status === 'completed'
                ? 'completed'
                : 'idle';
    return {
      ...node,
      state: derivedState,
    };
  });

  const { counts, systemHealth } = recomputeSnapshotCounts(
    finalNodes,
    nextWorkflows,
  );

  return {
    snapshot: {
      ...prevState.snapshot,
      generatedAt: event.timestamp,
      counts,
      systemHealth,
      nodes: finalNodes,
      workflows: nextWorkflows,
      recentEvents: nextTimeline,
      activeLinks: nextLinks,
    },
    seenEventIds: nextSeen,
  };
}

export function pruneExpiredCommunicationLinks(
  prevState: AgentFactoryClientState,
  nowMs: number = Date.now(),
): AgentFactoryClientState {
  const remaining = prevState.snapshot.activeLinks.filter(
    (l) => l.expiresAtMs > nowMs,
  );
  if (remaining.length === prevState.snapshot.activeLinks.length) {
    return prevState;
  }

  const activeSourceTargets = new Set<AgentId>();
  remaining.forEach((l) => {
    activeSourceTargets.add(l.sourceAgentId);
    activeSourceTargets.add(l.destinationAgentId);
  });

  const nextNodes = prevState.snapshot.nodes.map((node) => {
    if (node.state !== 'communicating' || activeSourceTargets.has(node.agentId)) {
      return node;
    }
    const fallbackState: AgentExecutionState = node.currentTask
      ? 'running'
      : node.lastExecution?.status ?? 'idle';
    return {
      ...node,
      state: fallbackState,
    };
  });

  const { counts, systemHealth } = recomputeSnapshotCounts(
    nextNodes,
    prevState.snapshot.workflows,
  );

  return {
    ...prevState,
    snapshot: {
      ...prevState.snapshot,
      counts,
      systemHealth,
      nodes: nextNodes,
      activeLinks: remaining,
    },
  };
}
