import type { AgentFactoryEvent } from '../../types/agentFactory';

type ActivityBusListener = (payload: {
  tenantId: string;
  projectId?: string | null;
  reason: string;
  timestamp: string;
}) => void;

type AgentFactoryListener = (event: AgentFactoryEvent) => void;

const listenersByTenant = new Map<string, Set<ActivityBusListener>>();
const agentListenersByTenant = new Map<string, Set<AgentFactoryListener>>();
const agentHistoryByTenant = new Map<string, AgentFactoryEvent[]>();
const MAX_AGENT_HISTORY_PER_TENANT = 120;

export function publishTenantActivityUpdate(params: {
  tenantId: string;
  projectId?: string | null;
  reason: string;
}): void {
  const set = listenersByTenant.get(params.tenantId);
  if (!set || set.size === 0) return;
  const payload = {
    ...params,
    timestamp: new Date().toISOString(),
  };
  for (const listener of set) {
    try {
      listener(payload);
    } catch {
      // Never break caller if an SSE client disconnected abruptly
    }
  }
}

export function subscribeToTenantActivityUpdates(
  tenantId: string,
  listener: ActivityBusListener,
): () => void {
  let set = listenersByTenant.get(tenantId);
  if (!set) {
    set = new Set();
    listenersByTenant.set(tenantId, set);
  }
  set.add(listener);
  return () => {
    const current = listenersByTenant.get(tenantId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      listenersByTenant.delete(tenantId);
    }
  };
}

export function publishAgentFactoryEvent(event: AgentFactoryEvent): boolean {
  let history = agentHistoryByTenant.get(event.tenantId);
  if (!history) {
    history = [];
    agentHistoryByTenant.set(event.tenantId, history);
  }

  // Duplicate event protection inside ring buffer
  if (history.some((existing) => existing.id === event.id)) {
    return false;
  }

  history.unshift(event);
  if (history.length > MAX_AGENT_HISTORY_PER_TENANT) {
    history.length = MAX_AGENT_HISTORY_PER_TENANT;
  }

  const listeners = agentListenersByTenant.get(event.tenantId);
  if (listeners && listeners.size > 0) {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // Guard against stale SSE sockets
      }
    }
  }
  return true;
}

export function listRecentAgentFactoryEvents(
  tenantId: string,
  projectId?: string | null,
  limit = 60,
): AgentFactoryEvent[] {
  const history = agentHistoryByTenant.get(tenantId) ?? [];
  const filtered = projectId
    ? history.filter((ev) => ev.projectId === projectId)
    : history;
  return filtered.slice(0, Math.max(1, limit));
}

export function listMissedAgentFactoryEvents(params: {
  tenantId: string;
  projectId: string;
  lastEventId: string;
}): AgentFactoryEvent[] {
  const history = listRecentAgentFactoryEvents(params.tenantId, params.projectId, 100);
  const idx = history.findIndex((ev) => ev.id === params.lastEventId);
  if (idx <= 0) return [];
  // History is newest-first; return missed events in chronological order
  return history.slice(0, idx).reverse();
}

export function subscribeToAgentFactoryEvents(
  tenantId: string,
  listener: AgentFactoryListener,
): () => void {
  let set = agentListenersByTenant.get(tenantId);
  if (!set) {
    set = new Set();
    agentListenersByTenant.set(tenantId, set);
  }
  set.add(listener);
  return () => {
    const current = agentListenersByTenant.get(tenantId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      agentListenersByTenant.delete(tenantId);
    }
  };
}

export function clearAgentFactoryBusForTests(tenantId?: string): void {
  if (tenantId) {
    agentHistoryByTenant.delete(tenantId);
  } else {
    agentHistoryByTenant.clear();
  }
}

