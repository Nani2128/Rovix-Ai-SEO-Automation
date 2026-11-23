import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type OnNodesChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  AlertCircle,
  Archive,
  BookmarkPlus,
  CheckCircle2,
  Copy,
  Cpu,
  LayoutGrid,
  Maximize2,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  Redo2,
  Save,
  ShieldCheck,
  Square,
  Trash2,
  Undo2,
  UploadCloud,
  Workflow,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { PageTransition } from '../../components/animation/MotionPrimitives';
import { EmptyStateCard, ErrorStateCard } from '../../components/ui/StateViews';
import { StudioBottomDrawer } from '../../components/workflowStudio/StudioBottomDrawer';
import {
  StudioCustomNode,
  type StudioFlowNodeData,
} from '../../components/workflowStudio/StudioCustomNode';
import { StudioMobileEditor } from '../../components/workflowStudio/StudioMobileEditor';
import { StudioNodeInspectorPanel } from '../../components/workflowStudio/StudioNodeInspectorPanel';
import { StudioNodeLibrarySidebar } from '../../components/workflowStudio/StudioNodeLibrarySidebar';
import {
  BUILTIN_STUDIO_TEMPLATES,
  createStudioNodeFromCatalog,
  getStudioNodeCatalogItem,
} from '../../lib/workflowStudioCatalog';
import {
  autoLayoutStudioGraph,
  createStudioHistory,
  isValidStudioConnection,
  pushStudioHistory,
  redoStudioHistory,
  undoStudioHistory,
  validateStudioWorkflowGraph,
  type StudioHistoryStack,
} from '../../lib/workflowStudioEngine';
import {
  agentFactoryService,
  type AgentFactoryConnectionStatus,
} from '../../services/agentFactoryService';
import { workflowStudioService } from '../../services/workflowStudioService';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { useThemeStore } from '../../stores/useThemeStore';
import { useToastStore } from '../../stores/useToastStore';
import type {
  AgentFactoryEvent,
  AgentWorkflowDetail,
} from '../../types/agentFactory';
import type {
  StudioCanvasEdge,
  StudioCanvasNode,
  StudioEdgeType,
  StudioLiveNodeStatus,
  StudioNodeConfig,
  StudioNodeSubtype,
  StudioProviderAvailabilityMap,
  StudioValidationReport,
  StudioWorkflowGraph,
  StudioWorkflowRecord,
  StudioWorkflowTemplateRecord,
  StudioWorkflowVersionRecord,
} from '../../types/workflowStudio';

const NODE_TYPES = {
  studioNode: StudioCustomNode,
};

const EDIT_ROLES = new Set([
  'Platform Admin',
  'Agency Owner',
  'SEO Strategist',
  'Project Manager',
  'Business Owner',
  'Editor',
  'Developer',
]);
const PUBLISH_ROLES = new Set([
  'Platform Admin',
  'Agency Owner',
  'SEO Strategist',
  'Project Manager',
]);
const ARCHIVE_ROLES = new Set([
  'Platform Admin',
  'Agency Owner',
]);
const APPROVE_ROLES = new Set([
  'Platform Admin',
  'Agency Owner',
  'Business Owner',
]);

function makeUniqueNodeId(subtype: StudioNodeSubtype, existingIds: Set<string>): string {
  const base = subtype.replace(/[^a-z0-9_]/gi, '_').slice(0, 24);
  let i = 1;
  while (existingIds.has(`${base}_${i}`)) {
    i += 1;
  }
  return `${base}_${i}`;
}

function getEdgeVisualColor(edgeType: StudioEdgeType, sourceHandle: string): string {
  if (edgeType === 'error' || sourceHandle === 'error') return '#EF4444';
  if (edgeType === 'approval' || sourceHandle === 'approved') return '#10B981';
  if (edgeType === 'conditional') {
    if (sourceHandle === 'true') return '#10B981';
    if (sourceHandle === 'false') return '#F59E0B';
    return '#8B5CF6';
  }
  return '#7047EB';
}

function deriveLiveNodeMap(activeExecution: AgentWorkflowDetail | null): {
  statusByNode: Record<string, StudioLiveNodeStatus>;
  durationByNode: Record<string, number | null>;
  summaryByNode: Record<string, string | null>;
  selectedBranchByNode: Record<string, 'true' | 'false' | null>;
} {
  const statusByNode: Record<string, StudioLiveNodeStatus> = {};
  const durationByNode: Record<string, number | null> = {};
  const summaryByNode: Record<string, string | null> = {};
  const selectedBranchByNode: Record<string, 'true' | 'false' | null> = {};

  if (!activeExecution) {
    return { statusByNode, durationByNode, summaryByNode, selectedBranchByNode };
  }

  const outputByTaskId = new Map(activeExecution.outputs.map((o) => [o.taskId, o]));

  for (const task of activeExecution.tasks) {
    const isSkipped =
      task.status === 'cancelled' &&
      Boolean(task.blockingReason?.startsWith('Skipped:'));
    statusByNode[task.nodeKey] = isSkipped
      ? 'skipped'
      : (task.status as StudioLiveNodeStatus);
    durationByNode[task.nodeKey] = task.durationMs;

    const out = outputByTaskId.get(task.id);
    summaryByNode[task.nodeKey] =
      out?.summary ?? task.errorSummary ?? task.blockingReason ?? null;

    if (out && out.payload && typeof out.payload === 'object') {
      const branch = (out.payload as Record<string, unknown>).selectedBranch;
      if (branch === 'true' || branch === 'false') {
        selectedBranchByNode[task.nodeKey] = branch;
      }
    }
  }

  return { statusByNode, durationByNode, summaryByNode, selectedBranchByNode };
}

interface ContextMenuState {
  nodeId: string;
  x: number;
  y: number;
}

function WorkflowStudioCanvasWorkspace() {
  const navigate = useNavigate();
  const { zoomIn, zoomOut, fitView, screenToFlowPosition, setCenter } =
    useReactFlow();

  const user = useAuthStore((s) => s.user);
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const pushToast = useToastStore((s) => s.pushToast);

  const projects = useDashboardStore((s) => s.projects);
  const selectedProjectId = useDashboardStore((s) => s.selectedProjectId);
  const setSelectedProjectId = useDashboardStore((s) => s.setSelectedProjectId);
  const loadProjectsOnly = useDashboardStore((s) => s.loadProjectsOnly);

  const activeProjectId = selectedProjectId || projects[0]?.id || '';
  const userRole = user?.role ?? 'QA';
  const canEdit = EDIT_ROLES.has(userRole);
  const canPublish = PUBLISH_ROLES.has(userRole);
  const canArchive = ARCHIVE_ROLES.has(userRole);
  const canApprove = APPROVE_ROLES.has(userRole);

  // Studio catalog & persisted records
  const [workflows, setWorkflows] = useState<StudioWorkflowRecord[]>([]);
  const [templates, setTemplates] = useState<StudioWorkflowTemplateRecord[]>(() => [
    ...BUILTIN_STUDIO_TEMPLATES,
  ]);
  const [providerAvailability, setProviderAvailability] =
    useState<StudioProviderAvailabilityMap>({});
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(
    null,
  );
  const [currentWorkflowRecord, setCurrentWorkflowRecord] =
    useState<StudioWorkflowRecord | null>(null);
  const [versions, setVersions] = useState<StudioWorkflowVersionRecord[]>([]);
  const [activeExecution, setActiveExecution] =
    useState<AgentWorkflowDetail | null>(null);
  const [liveEvents, setLiveEvents] = useState<AgentFactoryEvent[]>([]);
  const [connectionStatus, setConnectionStatus] =
    useState<AgentFactoryConnectionStatus>('connecting');

  // Graph editor state + undo/redo stack
  const defaultTemplate = BUILTIN_STUDIO_TEMPLATES[0];
  const [workflowName, setWorkflowName] = useState<string>(defaultTemplate.name);
  const [workflowDescription, setWorkflowDescription] = useState<string>(
    defaultTemplate.description,
  );
  const [history, setHistory] = useState<StudioHistoryStack>(() =>
    createStudioHistory(defaultTemplate.graph),
  );
  const [dirty, setDirty] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    defaultTemplate.graph.nodes[0]?.id ?? null,
  );
  const [validation, setValidation] = useState<StudioValidationReport | null>(
    null,
  );

  // UI chrome state
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateNameInput, setTemplateNameInput] = useState('');
  const [templateCategoryInput, setTemplateCategoryInput] = useState('Custom SEO');
  const [templateDescInput, setTemplateDescInput] = useState('');
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);

  const canvasWrapperRef = useRef<HTMLDivElement | null>(null);
  const refreshTimerRef = useRef<number | null>(null);

  const graph = history.present;

  // Ensure projects are loaded
  useEffect(() => {
    if (projects.length === 0) {
      void loadProjectsOnly();
    }
  }, [projects.length, loadProjectsOnly]);

  // Run local real-time validation whenever graph or providerAvailability changes
  useEffect(() => {
    const report = validateStudioWorkflowGraph(graph, {
      projectId: activeProjectId || undefined,
      providerAvailability,
    });
    setValidation(report);
  }, [graph, activeProjectId, providerAvailability]);

  // Helper to apply a loaded StudioWorkflowDetailResponse into editor state
  const hydrateFromDetail = useCallback(
    (detail: {
      workflow: StudioWorkflowRecord;
      versions: StudioWorkflowVersionRecord[];
      activeExecution: AgentWorkflowDetail | null;
      providerAvailability: StudioProviderAvailabilityMap;
    }) => {
      setCurrentWorkflowRecord(detail.workflow);
      setSelectedWorkflowId(detail.workflow.id);
      setWorkflowName(detail.workflow.name);
      setWorkflowDescription(detail.workflow.description);
      setHistory(createStudioHistory(detail.workflow.draftGraph));
      setVersions(detail.versions);
      setActiveExecution(detail.activeExecution);
      setProviderAvailability(detail.providerAvailability);
      setSelectedNodeId(detail.workflow.draftGraph.nodes[0]?.id ?? null);
      setDirty(false);
    },
    [],
  );

  // Load workspace studio workflows + templates when project changes
  const fetchProjectStudioList = useCallback(
    async (preferWorkflowId?: string | null) => {
      if (!activeProjectId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadError(null);
      try {
        const listRes = await workflowStudioService.listWorkflows(activeProjectId);
        setWorkflows(listRes.workflows);
        setTemplates(listRes.templates);
        setProviderAvailability(listRes.providerAvailability);

        const targetId =
          preferWorkflowId ??
          (selectedWorkflowId &&
          listRes.workflows.some((w) => w.id === selectedWorkflowId)
            ? selectedWorkflowId
            : listRes.workflows[0]?.id ?? null);

        if (targetId) {
          const detail = await workflowStudioService.getWorkflowDetail(
            activeProjectId,
            targetId,
          );
          hydrateFromDetail(detail);
        } else {
          // Initialize clean unsaved canvas from Complete SEO Audit template
          const tpl = listRes.templates[0] ?? BUILTIN_STUDIO_TEMPLATES[0];
          setCurrentWorkflowRecord(null);
          setSelectedWorkflowId(null);
          setWorkflowName(tpl.name);
          setWorkflowDescription(tpl.description);
          setHistory(createStudioHistory(tpl.graph));
          setVersions([]);
          setActiveExecution(null);
          setSelectedNodeId(tpl.graph.nodes[0]?.id ?? null);
          setDirty(false);
        }
      } catch (err) {
        setLoadError(
          err instanceof Error
            ? err.message
            : 'Unable to load Workflow Studio for this project.',
        );
      } finally {
        setLoading(false);
      }
    },
    [activeProjectId, selectedWorkflowId, hydrateFromDetail],
  );

  useEffect(() => {
    void fetchProjectStudioList(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId]);

  // Refresh active execution detail without overwriting unsaved draft edits
  const refreshExecutionOnly = useCallback(async () => {
    if (!activeProjectId || !selectedWorkflowId) return;
    try {
      const detail = await workflowStudioService.getWorkflowDetail(
        activeProjectId,
        selectedWorkflowId,
      );
      setActiveExecution(detail.activeExecution);
      setVersions(detail.versions);
      setProviderAvailability(detail.providerAvailability);
    } catch {
      // Transient stream sync error ignored
    }
  }, [activeProjectId, selectedWorkflowId]);

  // Live SSE subscription using existing Stage 1-3 Agent Factory stream
  useEffect(() => {
    if (!activeProjectId) return;
    const unsubscribe = agentFactoryService.subscribeToStream(activeProjectId, {
      onStatusChange: setConnectionStatus,
      onSnapshot: () => {
        // Snapshot handled by stream; keep active workflow detail authoritative
      },
      onEvent: (ev) => {
        setLiveEvents((prev) => [ev, ...prev.filter((p) => p.id !== ev.id)].slice(0, 120));
        if (
          activeExecution &&
          ev.workflowId &&
          ev.workflowId === activeExecution.workflow.id
        ) {
          if (refreshTimerRef.current !== null) {
            window.clearTimeout(refreshTimerRef.current);
          }
          refreshTimerRef.current = window.setTimeout(() => {
            void refreshExecutionOnly();
          }, 260);
        }
      },
    });

    return () => {
      unsubscribe();
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [activeProjectId, activeExecution?.workflow.id, refreshExecutionOnly]);

  // Mutate graph with undo/redo history push
  const commitGraphChange = useCallback((nextGraph: StudioWorkflowGraph) => {
    setHistory((prev) => pushStudioHistory(prev, nextGraph));
    setDirty(true);
  }, []);

  // Update positions quietly during drag, then push history when drag finishes
  const applyNodePositionLive = useCallback(
    (nodeId: string, pos: { x: number; y: number }) => {
      setHistory((prev) => ({
        ...prev,
        present: {
          ...prev.present,
          nodes: prev.present.nodes.map((n) =>
            n.id === nodeId ? { ...n, position: pos } : n,
          ),
        },
      }));
      setDirty(true);
    },
    [],
  );

  // Switch between saved workflows
  const handleSelectWorkflow = useCallback(
    async (workflowId: string) => {
      if (!activeProjectId) return;
      if (workflowId === '__new__') {
        const trigger = createStudioNodeFromCatalog('manual_trigger', { x: 60, y: 180 }, 'trigger_1');
        const research = createStudioNodeFromCatalog('research_agent', { x: 360, y: 180 }, 'research_1');
        const newGraph: StudioWorkflowGraph = {
          nodes: [trigger, research],
          edges: [
            {
              id: 'e_init_1',
              source: trigger.id,
              target: research.id,
              edgeType: 'dependency',
              sourceHandle: 'default',
            },
          ],
        };
        setCurrentWorkflowRecord(null);
        setSelectedWorkflowId(null);
        setWorkflowName('Untitled SEO Workflow');
        setWorkflowDescription('Custom multi-agent workflow');
        setHistory(createStudioHistory(newGraph));
        setVersions([]);
        setActiveExecution(null);
        setSelectedNodeId(trigger.id);
        setDirty(true);
        return;
      }

      try {
        const detail = await workflowStudioService.getWorkflowDetail(
          activeProjectId,
          workflowId,
        );
        hydrateFromDetail(detail);
        window.setTimeout(() => void fitView({ padding: 0.16, duration: 220 }), 50);
      } catch (err) {
        pushToast({
          tone: 'error',
          title: 'Failed to open workflow',
          detail: err instanceof Error ? err.message : undefined,
        });
      }
    },
    [activeProjectId, hydrateFromDetail, fitView, pushToast],
  );

  // Add a node to canvas (at drop position or smart offset)
  const handleAddNode = useCallback(
    (subtype: StudioNodeSubtype, position?: { x: number; y: number }) => {
      if (!canEdit) return;
      const existingIds = new Set(graph.nodes.map((n) => n.id));
      const newId = makeUniqueNodeId(subtype, existingIds);

      const fallbackPos = (() => {
        if (graph.nodes.length === 0) return { x: 80, y: 140 };
        const maxX = Math.max(...graph.nodes.map((n) => n.position.x));
        const avgY =
          graph.nodes.reduce((sum, n) => sum + n.position.y, 0) /
          graph.nodes.length;
        return { x: maxX + 275, y: Math.round(avgY) };
      })();

      const newNode = createStudioNodeFromCatalog(
        subtype,
        position ?? fallbackPos,
        newId,
      );

      // If user clicked "+ Add" while another node is selected and the new node accepts incoming connections, auto-link cleanly
      const nextEdges = [...graph.edges];
      if (!position && selectedNodeId) {
        const selectedNode = graph.nodes.find((n) => n.id === selectedNodeId);
        const check = isValidStudioConnection({
          sourceNode: selectedNode,
          targetNode: newNode,
          existingEdges: nextEdges,
        });
        if (check.valid && selectedNode) {
          nextEdges.push({
            id: `e_${selectedNode.id}_${newNode.id}_${Date.now().toString(36)}`,
            source: selectedNode.id,
            target: newNode.id,
            edgeType: check.edgeType,
            sourceHandle: check.normalizedHandle,
          });
        }
      }

      commitGraphChange({
        nodes: [...graph.nodes, newNode],
        edges: nextEdges,
      });
      setSelectedNodeId(newNode.id);
    },
    [canEdit, graph, selectedNodeId, commitGraphChange],
  );

  const handleLoadTemplate = useCallback(
    (template: StudioWorkflowTemplateRecord) => {
      if (!canEdit) return;
      const cloned = structuredClone(template.graph);
      setWorkflowName(template.name);
      setWorkflowDescription(template.description);
      commitGraphChange(cloned);
      setSelectedNodeId(cloned.nodes[0]?.id ?? null);
      pushToast({
        tone: 'info',
        title: `Loaded template "${template.name}"`,
        detail: `${cloned.nodes.length} nodes ready on canvas.`,
      });
      window.setTimeout(() => void fitView({ padding: 0.16, duration: 240 }), 60);
    },
    [canEdit, commitGraphChange, fitView, pushToast],
  );

  const handleUpdateNode = useCallback(
    (
      nodeId: string,
      patch: { label?: string; config?: Partial<StudioNodeConfig> },
    ) => {
      if (!canEdit) return;
      const nextNodes = graph.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        return {
          ...n,
          label: patch.label !== undefined ? patch.label : n.label,
          config: patch.config ? { ...n.config, ...patch.config } : n.config,
        };
      });
      commitGraphChange({ ...graph, nodes: nextNodes });
    },
    [canEdit, graph, commitGraphChange],
  );

  const handleDuplicateNode = useCallback(
    (nodeId: string) => {
      if (!canEdit) return;
      const orig = graph.nodes.find((n) => n.id === nodeId);
      if (!orig) return;
      const existingIds = new Set(graph.nodes.map((n) => n.id));
      const newId = makeUniqueNodeId(orig.subtype, existingIds);
      const copy: StudioCanvasNode = {
        ...structuredClone(orig),
        id: newId,
        label: `${orig.label} (Copy)`,
        position: { x: orig.position.x + 48, y: orig.position.y + 92 },
      };
      commitGraphChange({
        ...graph,
        nodes: [...graph.nodes, copy],
      });
      setSelectedNodeId(copy.id);
      setContextMenu(null);
    },
    [canEdit, graph, commitGraphChange],
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      if (!canEdit) return;
      const nextNodes = graph.nodes.filter((n) => n.id !== nodeId);
      const nextEdges = graph.edges.filter(
        (e) => e.source !== nodeId && e.target !== nodeId,
      );
      commitGraphChange({ nodes: nextNodes, edges: nextEdges });
      if (selectedNodeId === nodeId) {
        setSelectedNodeId(nextNodes[0]?.id ?? null);
      }
      setContextMenu(null);
    },
    [canEdit, graph, selectedNodeId, commitGraphChange],
  );

  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      if (!canEdit) return;
      commitGraphChange({
        ...graph,
        edges: graph.edges.filter((e) => e.id !== edgeId),
      });
    },
    [canEdit, graph, commitGraphChange],
  );

  const handleInsertApprovalAfter = useCallback(
    (nodeId: string) => {
      if (!canEdit) return;
      const source = graph.nodes.find((n) => n.id === nodeId);
      if (!source) return;
      const existingIds = new Set(graph.nodes.map((n) => n.id));
      const gateId = makeUniqueNodeId('human_approval', existingIds);
      const gate = createStudioNodeFromCatalog(
        'human_approval',
        { x: source.position.x + 275, y: source.position.y },
        gateId,
      );
      const nextEdge: StudioCanvasEdge = {
        id: `e_${source.id}_${gate.id}_${Date.now().toString(36)}`,
        source: source.id,
        target: gate.id,
        edgeType: 'dependency',
        sourceHandle: 'default',
      };
      commitGraphChange({
        nodes: [...graph.nodes, gate],
        edges: [...graph.edges, nextEdge],
      });
      setSelectedNodeId(gate.id);
      setContextMenu(null);
    },
    [canEdit, graph, commitGraphChange],
  );

  // React Flow onConnect handler (enforces single source of truth validation)
  const handleConnect = useCallback(
    (conn: Connection) => {
      if (!canEdit || !conn.source || !conn.target) return;
      const sourceNode = graph.nodes.find((n) => n.id === conn.source);
      const targetNode = graph.nodes.find((n) => n.id === conn.target);
      const check = isValidStudioConnection({
        sourceNode,
        targetNode,
        sourceHandle: conn.sourceHandle ?? null,
        existingEdges: graph.edges,
      });

      if (!check.valid) {
        pushToast({
          tone: 'warning',
          title: 'Invalid workflow connection',
          detail: check.reason,
        });
        return;
      }

      const label =
        check.normalizedHandle === 'true'
          ? 'True'
          : check.normalizedHandle === 'false'
            ? 'False'
            : check.normalizedHandle === 'approved'
              ? 'Approved'
              : check.normalizedHandle === 'error'
                ? 'On Error'
                : undefined;

      const newEdge: StudioCanvasEdge = {
        id: `e_${conn.source}_${conn.target}_${check.normalizedHandle}_${Date.now().toString(36)}`,
        source: conn.source,
        target: conn.target,
        edgeType: check.edgeType,
        sourceHandle: check.normalizedHandle,
        label,
      };
      commitGraphChange({
        ...graph,
        edges: [...graph.edges, newEdge],
      });
    },
    [canEdit, graph, commitGraphChange, pushToast],
  );

  // React Flow drag-and-drop from Node Library
  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (!canEdit) return;
      const subtype = event.dataTransfer.getData(
        'application/x-rovix-studio-node',
      ) as StudioNodeSubtype;
      if (!subtype || !getStudioNodeCatalogItem(subtype)) return;
      const pos = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      handleAddNode(subtype, {
        x: Math.round(pos.x - 110),
        y: Math.round(pos.y - 40),
      });
    },
    [canEdit, screenToFlowPosition, handleAddNode],
  );

  // React Flow node changes (dragging / selection / keyboard delete)
  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
      for (const ch of changes) {
        if (ch.type === 'position' && ch.position) {
          applyNodePositionLive(ch.id, {
            x: Math.round(ch.position.x),
            y: Math.round(ch.position.y),
          });
        } else if (ch.type === 'remove' && canEdit) {
          handleDeleteNode(ch.id);
        } else if (ch.type === 'select' && ch.selected) {
          setSelectedNodeId(ch.id);
        }
      }
    },
    [applyNodePositionLive, canEdit, handleDeleteNode],
  );

  // Server validation
  const handleValidate = useCallback(async () => {
    if (!activeProjectId) return;
    try {
      const report = await workflowStudioService.validateGraph(activeProjectId, {
        studioWorkflowId: selectedWorkflowId,
        graph,
      });
      setValidation(report);
      pushToast({
        tone: report.valid ? 'success' : 'warning',
        title: report.valid
          ? 'Workflow validation passed'
          : `Validation found ${report.errorCount} blocking error(s)`,
        detail: `${report.topologicalOrder.length} executable nodes · ${report.warningCount} warning(s)`,
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Validation request failed',
        detail: err instanceof Error ? err.message : undefined,
      });
    }
  }, [activeProjectId, selectedWorkflowId, graph, pushToast]);

  // Save draft (auto-creates record if unsaved)
  const ensureSavedWorkflowId = useCallback(
    async (createSnapshot = true): Promise<string | null> => {
      if (!activeProjectId) return null;
      if (!selectedWorkflowId) {
        const created = await workflowStudioService.createWorkflow(
          activeProjectId,
          {
            name: workflowName.trim() || 'Untitled SEO Workflow',
            description: workflowDescription.trim(),
            graph,
          },
        );
        setSelectedWorkflowId(created.workflow.id);
        setCurrentWorkflowRecord(created.workflow);
        setValidation(created.validation);
        setWorkflows((prev) => [created.workflow, ...prev]);
        setVersions((prev) => [created.version, ...prev]);
        setDirty(false);
        return created.workflow.id;
      }

      const saved = await workflowStudioService.saveDraft(
        activeProjectId,
        selectedWorkflowId,
        {
          name: workflowName.trim() || 'Untitled SEO Workflow',
          description: workflowDescription.trim(),
          graph,
          createSnapshot,
          changeSummary: createSnapshot
            ? 'Saved visual workflow snapshot'
            : 'Updated draft layout',
        },
      );
      setCurrentWorkflowRecord(saved.workflow);
      setValidation(saved.validation);
      setWorkflows((prev) =>
        prev.map((w) => (w.id === saved.workflow.id ? saved.workflow : w)),
      );
      if (saved.createdVersion) {
        setVersions((prev) => [saved.createdVersion!, ...prev]);
      }
      setDirty(false);
      return saved.workflow.id;
    },
    [activeProjectId, selectedWorkflowId, workflowName, workflowDescription, graph],
  );

  const handleSave = useCallback(async () => {
    if (!canEdit || !activeProjectId) return;
    setSaving(true);
    try {
      await ensureSavedWorkflowId(true);
      pushToast({
        tone: 'success',
        title: 'Workflow saved',
        detail: `"${workflowName.trim() || 'Untitled SEO Workflow'}" persisted to SQLite.`,
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Failed to save workflow',
        detail: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }, [canEdit, activeProjectId, ensureSavedWorkflowId, workflowName, pushToast]);

  const handlePublish = useCallback(async () => {
    if (!canPublish || !activeProjectId) return;
    setSaving(true);
    try {
      const wfId = await ensureSavedWorkflowId(false);
      if (!wfId) return;
      const res = await workflowStudioService.publishWorkflow(
        activeProjectId,
        wfId,
        { graph, changeSummary: 'Published immutable release version' },
      );
      setCurrentWorkflowRecord(res.workflow);
      setValidation(res.validation);
      setVersions((prev) => [res.version, ...prev]);
      setWorkflows((prev) =>
        prev.map((w) => (w.id === res.workflow.id ? res.workflow : w)),
      );
      setDirty(false);
      pushToast({
        tone: 'success',
        title: `Published v${res.version.versionNumber}`,
        detail: 'Immutable workflow version is now published.',
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Publish blocked',
        detail: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }, [canPublish, activeProjectId, ensureSavedWorkflowId, graph, pushToast]);

  const handleDuplicateWorkflow = useCallback(async () => {
    if (!canEdit || !activeProjectId || !selectedWorkflowId) return;
    try {
      const dup = await workflowStudioService.duplicateWorkflow(
        activeProjectId,
        selectedWorkflowId,
      );
      setWorkflows((prev) => [dup.workflow, ...prev]);
      const detail = await workflowStudioService.getWorkflowDetail(
        activeProjectId,
        dup.workflow.id,
      );
      hydrateFromDetail(detail);
      pushToast({
        tone: 'success',
        title: 'Workflow duplicated',
        detail: `Created "${dup.workflow.name}".`,
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Duplicate failed',
        detail: err instanceof Error ? err.message : undefined,
      });
    }
  }, [canEdit, activeProjectId, selectedWorkflowId, hydrateFromDetail, pushToast]);

  const handleArchiveWorkflow = useCallback(async () => {
    if (!canArchive || !activeProjectId || !selectedWorkflowId) return;
    try {
      await workflowStudioService.archiveWorkflow(
        activeProjectId,
        selectedWorkflowId,
      );
      pushToast({
        tone: 'info',
        title: 'Workflow archived',
      });
      await fetchProjectStudioList(null);
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Archive failed',
        detail: err instanceof Error ? err.message : undefined,
      });
    }
  }, [canArchive, activeProjectId, selectedWorkflowId, fetchProjectStudioList, pushToast]);

  const handleRestoreVersion = useCallback(
    async (versionId: string) => {
      if (!canEdit || !activeProjectId || !selectedWorkflowId) return;
      try {
        const res = await workflowStudioService.restoreVersion(
          activeProjectId,
          selectedWorkflowId,
          versionId,
        );
        setCurrentWorkflowRecord(res.workflow);
        setHistory(createStudioHistory(res.workflow.draftGraph));
        setValidation(res.validation);
        if (res.createdVersion) {
          setVersions((prev) => [res.createdVersion!, ...prev]);
        }
        setDirty(false);
        pushToast({
          tone: 'success',
          title: 'Version restored',
          detail: `Draft restored to v${res.workflow.activeVersionNumber}.`,
        });
      } catch (err) {
        pushToast({
          tone: 'error',
          title: 'Restore failed',
          detail: err instanceof Error ? err.message : undefined,
        });
      }
    },
    [canEdit, activeProjectId, selectedWorkflowId, pushToast],
  );

  // Execute workflow through single Stage 2/3 DAG engine with immutable version snapshot
  const handleExecute = useCallback(async () => {
    if (!canEdit || !activeProjectId) return;
    if (validation && !validation.valid) {
      pushToast({
        tone: 'warning',
        title: 'Cannot execute invalid workflow',
        detail: `Resolve ${validation.errorCount} blocking validation error(s) first.`,
      });
      return;
    }
    setExecuting(true);
    try {
      const wfId = await ensureSavedWorkflowId(false);
      if (!wfId) return;
      const res = await workflowStudioService.executeWorkflow(
        activeProjectId,
        wfId,
        { graph },
      );
      setActiveExecution(res.execution);
      setVersions((prev) => [res.version, ...prev.filter((v) => v.id !== res.version.id)]);
      setValidation(res.validation);
      pushToast({
        tone: 'success',
        title: `Execution launched (v${res.version.versionNumber})`,
        detail: `Running through Rovix DAG engine · ${res.execution.tasks.length} scheduled task(s).`,
      });
      // Poll once briefly in case fast deterministic/local steps complete immediately
      window.setTimeout(() => void refreshExecutionOnly(), 650);
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Execution failed to start',
        detail: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setExecuting(false);
    }
  }, [
    canEdit,
    activeProjectId,
    validation,
    ensureSavedWorkflowId,
    graph,
    refreshExecutionOnly,
    pushToast,
  ]);

  const handleCancelExecution = useCallback(async () => {
    if (!canEdit || !activeProjectId || !activeExecution) return;
    try {
      const cancelled = await workflowStudioService.cancelExecution(
        activeProjectId,
        activeExecution.workflow.id,
        'Cancelled by operator from Workflow Studio',
      );
      setActiveExecution(cancelled);
      pushToast({
        tone: 'info',
        title: 'Execution cancelled',
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Unable to cancel execution',
        detail: err instanceof Error ? err.message : undefined,
      });
    }
  }, [canEdit, activeProjectId, activeExecution, pushToast]);

  const handleApproveGate = useCallback(
    async (approvalId: string, decision: 'approved' | 'rejected') => {
      if (!canApprove || !activeProjectId) return;
      try {
        const res = await agentFactoryService.decideApproval(
          activeProjectId,
          approvalId,
          {
            decision,
            comments:
              decision === 'approved'
                ? 'Approved inside Workflow Studio'
                : 'Rejected inside Workflow Studio',
          },
        );
        setActiveExecution(res.workflow);
        pushToast({
          tone: decision === 'approved' ? 'success' : 'warning',
          title:
            decision === 'approved'
              ? 'Approval granted — workflow resumed'
              : 'Approval rejected',
        });
      } catch (err) {
        pushToast({
          tone: 'error',
          title: 'Approval decision failed',
          detail: err instanceof Error ? err.message : undefined,
        });
      }
    },
    [canApprove, activeProjectId, pushToast],
  );

  const handleSaveAsTemplateSubmit = useCallback(async () => {
    if (!activeProjectId || !templateNameInput.trim()) return;
    try {
      const saved = await workflowStudioService.saveAsTemplate(activeProjectId, {
        name: templateNameInput.trim(),
        category: templateCategoryInput.trim() || 'Custom SEO',
        description:
          templateDescInput.trim() ||
          `Saved from workflow "${workflowName}"`,
        graph,
      });
      setTemplates((prev) => [saved, ...prev]);
      setTemplateModalOpen(false);
      setTemplateNameInput('');
      setTemplateDescInput('');
      pushToast({
        tone: 'success',
        title: `Template "${saved.name}" saved`,
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Unable to save template',
        detail: err instanceof Error ? err.message : undefined,
      });
    }
  }, [
    activeProjectId,
    templateNameInput,
    templateCategoryInput,
    templateDescInput,
    workflowName,
    graph,
    pushToast,
  ]);

  const handleAutoLayout = useCallback(() => {
    if (!canEdit) return;
    const laidOut = autoLayoutStudioGraph(graph);
    commitGraphChange(laidOut);
    window.setTimeout(() => void fitView({ padding: 0.16, duration: 240 }), 40);
  }, [canEdit, graph, commitGraphChange, fitView]);

  const handleFocusNode = useCallback(
    (nodeId: string) => {
      const target = graph.nodes.find((n) => n.id === nodeId);
      if (!target) return;
      setSelectedNodeId(nodeId);
      void setCenter(target.position.x + 120, target.position.y + 50, {
        zoom: 1,
        duration: 300,
      });
    },
    [graph.nodes, setCenter],
  );

  // Derive live execution state maps from persisted backend tasks
  const { statusByNode, durationByNode, summaryByNode, selectedBranchByNode } =
    useMemo(() => deriveLiveNodeMap(activeExecution), [activeExecution]);

  const handleNodeContextMenu = useCallback(
    (nodeId: string, clientX: number, clientY: number) => {
      setSelectedNodeId(nodeId);
      setContextMenu({ nodeId, x: clientX, y: clientY });
    },
    [],
  );

  // Build React Flow nodes
  const flowNodes: Node[] = useMemo(() => {
    const issuesByNode = new Map<string, StudioValidationReport['issues']>();
    for (const issue of validation?.issues ?? []) {
      if (issue.nodeId) {
        const list = issuesByNode.get(issue.nodeId) ?? [];
        list.push(issue);
        issuesByNode.set(issue.nodeId, list);
      }
    }

    return graph.nodes.map((node) => {
      const prov =
        node.category === 'agent' ? providerAvailability[node.subtype] : null;
      const data: StudioFlowNodeData = {
        studioNode: node,
        liveStatus: statusByNode[node.id] ?? 'idle',
        liveDurationMs: durationByNode[node.id] ?? null,
        liveSummary: summaryByNode[node.id] ?? null,
        selectedBranch: selectedBranchByNode[node.id] ?? null,
        providerStatus: prov?.status ?? null,
        providerSummary: prov?.summary ?? null,
        validationIssues: issuesByNode.get(node.id) ?? [],
        onContextMenuRequest: handleNodeContextMenu,
      };

      return {
        id: node.id,
        type: 'studioNode',
        position: node.position,
        selected: node.id === selectedNodeId,
        data,
      };
    });
  }, [
    graph.nodes,
    validation,
    providerAvailability,
    statusByNode,
    durationByNode,
    summaryByNode,
    selectedBranchByNode,
    selectedNodeId,
    handleNodeContextMenu,
  ]);

  // Build React Flow edges — ONLY animate genuinely executed active paths!
  const flowEdges: Edge[] = useMemo(() => {
    return graph.edges.map((e) => {
      const sourceStatus = statusByNode[e.source] ?? 'idle';
      const targetStatus = statusByNode[e.target] ?? 'idle';
      const sourceBranch = selectedBranchByNode[e.source] ?? null;

      // Conditional edge only activates if its exact branch was selected at runtime
      const branchTaken =
        e.edgeType !== 'conditional' ||
        (sourceBranch !== null && sourceBranch === e.sourceHandle);
      const isErrorEdgeTaken =
        e.edgeType === 'error' && sourceStatus === 'failed';
      const isStandardEdgeActive =
        e.edgeType !== 'error' &&
        branchTaken &&
        sourceStatus === 'completed' &&
        (targetStatus === 'running' ||
          targetStatus === 'waiting_for_approval' ||
          targetStatus === 'completed');

      const animated =
        (isStandardEdgeActive &&
          (targetStatus === 'running' || targetStatus === 'waiting_for_approval')) ||
        (isErrorEdgeTaken && targetStatus === 'running');

      const isUntakenBranch =
        (e.edgeType === 'conditional' &&
          sourceBranch !== null &&
          sourceBranch !== e.sourceHandle) ||
        targetStatus === 'skipped';

      const color = getEdgeVisualColor(e.edgeType, e.sourceHandle);

      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        label: e.label,
        animated,
        type: 'smoothstep',
        style: {
          stroke: color,
          strokeWidth: isStandardEdgeActive || isErrorEdgeTaken ? 2.4 : 1.75,
          strokeDasharray:
            e.edgeType === 'conditional' || e.edgeType === 'error'
              ? '5 4'
              : undefined,
          opacity: isUntakenBranch ? 0.28 : 0.92,
        },
        labelStyle: {
          fontSize: 10,
          fontWeight: 600,
          fill: 'var(--text-secondary)',
        },
        labelBgStyle: {
          fill: 'var(--bg-surface)',
          fillOpacity: 0.92,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
          width: 16,
          height: 16,
        },
      };
    });
  }, [graph.edges, statusByNode, selectedBranchByNode]);

  const selectedNode = useMemo(
    () => graph.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [graph.nodes, selectedNodeId],
  );

  const isRunningExecution =
    activeExecution?.workflow.status === 'running' ||
    activeExecution?.workflow.status === 'queued';
  const isWaitingApproval =
    activeExecution?.workflow.status === 'waiting_for_approval';

  const isDarkTheme = resolvedTheme === 'dark';

  if (!activeProjectId && !loading) {
    return (
      <PageTransition className="space-y-6">
        <EmptyStateCard
          title="No active project workspace"
          description="Create or select a website project first so Workflow Studio can validate provider availability and run multi-agent DAG workflows."
          actionLabel="Go to Projects"
          onAction={() => navigate('/projects')}
        />
      </PageTransition>
    );
  }

  if (loadError) {
    return (
      <PageTransition className="space-y-6">
        <ErrorStateCard
          message={loadError}
          onRetry={() => void fetchProjectStudioList(null)}
        />
      </PageTransition>
    );
  }

  return (
    <PageTransition className="flex flex-col gap-3">
      {/* TOP TOOLBAR */}
      <header
        aria-label="Workflow Studio Toolbar"
        className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3.5 py-2.5 shadow-xs"
      >
        {/* Left: Title + Project + Workflow Selector + Editable Name */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)]">
              <Workflow className="h-4 w-4" aria-hidden="true" />
            </span>
            <h1 className="font-display text-sm font-bold tracking-tight text-[var(--text-primary)] whitespace-nowrap sm:text-base">
              Workflow Studio
            </h1>
          </div>

          <span className="hidden h-4 w-px bg-[var(--border-hairline)] sm:inline-block" />

          {/* Project selector */}
          {projects.length > 0 && (
            <select
              aria-label="Select project workspace"
              value={activeProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="max-w-[140px] truncate rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2 py-1 text-xs font-semibold text-[var(--text-primary)] cursor-pointer"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          {/* Saved workflow switcher */}
          <select
            aria-label="Select saved workflow"
            value={selectedWorkflowId ?? '__unsaved__'}
            onChange={(e) => {
              if (e.target.value !== '__unsaved__') {
                void handleSelectWorkflow(e.target.value);
              }
            }}
            className="max-w-[170px] truncate rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2 py-1 text-xs font-medium text-[var(--text-primary)] cursor-pointer"
          >
            {!selectedWorkflowId && (
              <option value="__unsaved__">Unsaved Draft</option>
            )}
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} (v{w.activeVersionNumber})
              </option>
            ))}
            {canEdit && <option value="__new__">+ New Blank Workflow</option>}
          </select>

          {/* Editable workflow name */}
          <label className="hidden items-center sm:flex">
            <span className="sr-only">Workflow name</span>
            <input
              type="text"
              aria-label="Workflow name"
              disabled={!canEdit}
              value={workflowName}
              onChange={(e) => {
                setWorkflowName(e.target.value);
                setDirty(true);
              }}
              className="w-[180px] rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none disabled:opacity-65"
            />
          </label>

          {/* Status metadata text */}
          <span className="hidden items-center gap-1.5 font-mono text-[11px] text-[var(--text-muted)] xl:inline-flex">
            <span>
              {currentWorkflowRecord
                ? `v${currentWorkflowRecord.activeVersionNumber} · ${currentWorkflowRecord.status}`
                : 'Draft'}
            </span>
            {dirty && <span className="text-amber-600 dark:text-amber-400">· Unsaved</span>}
          </span>
        </div>

        {/* Right: Actions + Undo/Redo + Zoom + Execute */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Desktop Library Toggle */}
          <button
            type="button"
            onClick={() => setLibraryOpen((o) => !o)}
            aria-label={libraryOpen ? 'Hide node library' : 'Show node library'}
            title={libraryOpen ? 'Hide node library' : 'Show node library'}
            className="hidden h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] lg:inline-flex cursor-pointer"
          >
            {libraryOpen ? (
              <PanelLeftClose className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <PanelLeftOpen className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>

          {/* Undo / Redo / Auto-Layout */}
          <div className="hidden items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-0.5 sm:inline-flex">
            <button
              type="button"
              disabled={!canEdit || history.past.length === 0}
              onClick={() => {
                setHistory((h) => undoStudioHistory(h));
                setDirty(true);
              }}
              aria-label="Undo"
              title="Undo"
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] disabled:opacity-35 cursor-pointer"
            >
              <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={!canEdit || history.future.length === 0}
              onClick={() => {
                setHistory((h) => redoStudioHistory(h));
                setDirty(true);
              }}
              aria-label="Redo"
              title="Redo"
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] disabled:opacity-35 cursor-pointer"
            >
              <Redo2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={!canEdit || graph.nodes.length === 0}
              onClick={handleAutoLayout}
              aria-label="Auto-layout graph"
              title="Auto-layout graph"
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] disabled:opacity-35 cursor-pointer"
            >
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="hidden items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-0.5 lg:inline-flex">
            <button
              type="button"
              onClick={() => void zoomOut({ duration: 180 })}
              aria-label="Zoom out"
              title="Zoom out"
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => void zoomIn({ duration: 180 })}
              aria-label="Zoom in"
              title="Zoom in"
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => void fitView({ padding: 0.16, duration: 220 })}
              aria-label="Fit canvas to view"
              title="Fit canvas to view"
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          {/* Validate */}
          <button
            type="button"
            onClick={() => void handleValidate()}
            className="hidden items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)] whitespace-nowrap shrink-0 lg:inline-flex cursor-pointer"
          >
            {validation?.valid ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" aria-hidden="true" />
            )}
            <span>Validate</span>
          </button>

          {/* Save */}
          <button
            type="button"
            disabled={!canEdit || saving}
            onClick={() => void handleSave()}
            className="hidden items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)] disabled:opacity-45 whitespace-nowrap shrink-0 lg:inline-flex cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{saving ? 'Saving...' : 'Save'}</span>
          </button>

          {/* Save as Template */}
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setTemplateNameInput(`${workflowName} Template`);
                setTemplateDescInput(workflowDescription);
                setTemplateModalOpen(true);
              }}
              className="hidden items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-primary)] whitespace-nowrap shrink-0 md:inline-flex cursor-pointer"
            >
              <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Save Template</span>
            </button>
          )}

          {/* Publish */}
          {canPublish && (
            <button
              type="button"
              disabled={saving || (validation ? !validation.valid : false)}
              onClick={() => void handlePublish()}
              className="hidden items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:border-emerald-500 hover:text-emerald-600 disabled:opacity-45 whitespace-nowrap shrink-0 xl:inline-flex cursor-pointer"
            >
              <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Publish</span>
            </button>
          )}

          {/* Duplicate & Archive */}
          {selectedWorkflowId && canEdit && (
            <button
              type="button"
              onClick={() => void handleDuplicateWorkflow()}
              aria-label="Duplicate workflow"
              title="Duplicate workflow"
              className="hidden h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] 2xl:inline-flex cursor-pointer"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
          {selectedWorkflowId && canArchive && (
            <button
              type="button"
              onClick={() => void handleArchiveWorkflow()}
              aria-label="Archive workflow"
              title="Archive workflow"
              className="hidden h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-rose-600 2xl:inline-flex cursor-pointer"
            >
              <Archive className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}

          {/* Execute / Cancel */}
          {isRunningExecution ? (
            <button
              type="button"
              onClick={() => void handleCancelExecution()}
              className="hidden items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 whitespace-nowrap shrink-0 lg:inline-flex cursor-pointer"
            >
              <Square className="h-3 w-3 fill-current" aria-hidden="true" />
              <span>Cancel Run</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={
                !canEdit ||
                executing ||
                (validation ? !validation.valid : false)
              }
              onClick={() => void handleExecute()}
              className="hidden items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold text-[var(--accent-on-pill)] shadow-xs transition-opacity hover:opacity-95 disabled:opacity-45 whitespace-nowrap shrink-0 lg:inline-flex cursor-pointer"
              style={{
                background:
                  'linear-gradient(90deg, var(--accent-pill-start), var(--accent-pill-end))',
              }}
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{executing ? 'Launching...' : 'Execute'}</span>
            </button>
          )}

          {/* Link back to 3D Agent Factory */}
          <Link
            to="/agent-factory"
            className="hidden items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0 2xl:inline-flex"
          >
            <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
            <span>3D Factory</span>
          </Link>
        </div>
      </header>

      {/* EXECUTION STATUS STRIP */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3.5 py-1.5 text-[11px]">
        <div className="flex flex-wrap items-center gap-3 text-[var(--text-secondary)]">
          <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
            <span
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor:
                  connectionStatus === 'connected'
                    ? '#10B981'
                    : connectionStatus === 'connecting'
                      ? '#F59E0B'
                      : '#EF4444',
              }}
            />
            <span>
              {connectionStatus === 'connected'
                ? 'Live SSE Connected'
                : connectionStatus === 'connecting'
                  ? 'Connecting Stream'
                  : 'Stream Disconnected'}
            </span>
          </span>
          <span>·</span>
          <span data-testid="studio-execution-status">
            Execution:{' '}
            <strong className="capitalize text-[var(--text-primary)]">
              {activeExecution
                ? activeExecution.workflow.status.replace(/_/g, ' ')
                : 'Idle'}
            </strong>
          </span>
          {activeExecution && (
            <>
              <span>·</span>
              <span className="font-mono text-[10.5px] text-[var(--text-muted)]">
                Stage: {activeExecution.workflow.currentStage}
              </span>
            </>
          )}
          {isWaitingApproval && (
            <span className="font-semibold text-amber-600 dark:text-amber-400">
              · Human Approval Gate Paused (review in Approvals tab)
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 font-mono text-[10.5px] text-[var(--text-muted)]">
          <span>{graph.nodes.length}/30 nodes</span>
          <span>·</span>
          <span>{graph.edges.length}/60 edges</span>
          {!canEdit && <span>· Read-Only ({userRole})</span>}
        </div>
      </div>

      {/* MOBILE SIMPLIFIED EDITOR (< 1024px) */}
      <StudioMobileEditor
        workflowName={workflowName}
        nodes={graph.nodes}
        edges={graph.edges}
        templates={templates}
        validation={validation}
        liveStatusByNode={statusByNode}
        canEdit={canEdit}
        isExecuting={executing || isRunningExecution}
        onChangeWorkflowName={(name) => {
          setWorkflowName(name);
          setDirty(true);
        }}
        onAddNode={(subtype) => handleAddNode(subtype)}
        onDeleteNode={handleDeleteNode}
        onSelectNode={(nodeId) => {
          setSelectedNodeId(nodeId);
          setMobileInspectorOpen(true);
        }}
        onLoadTemplate={handleLoadTemplate}
        onValidate={() => void handleValidate()}
        onSave={() => void handleSave()}
        onExecute={() => void handleExecute()}
      />

      {/* MOBILE INSPECTOR MODAL */}
      {mobileInspectorOpen && selectedNode && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Node Inspector"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 lg:hidden"
        >
          <div className="flex max-h-[82vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-4 py-2.5">
              <span className="font-display text-sm font-bold text-[var(--text-primary)]">
                Configure Node
              </span>
              <button
                type="button"
                onClick={() => setMobileInspectorOpen(false)}
                aria-label="Close node inspector"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto [&>aside]:w-full [&>aside]:border-l-0">
              <StudioNodeInspectorPanel
                projectId={activeProjectId || null}
                selectedNode={selectedNode}
                allNodes={graph.nodes}
                allEdges={graph.edges}
                activeExecutionWorkflowId={activeExecution?.workflow.id ?? null}
                providerAvailability={providerAvailability}
                validationIssues={validation?.issues ?? []}
                canEdit={canEdit}
                onUpdateNode={handleUpdateNode}
                onDuplicateNode={handleDuplicateNode}
                onDeleteNode={(id) => {
                  handleDeleteNode(id);
                  setMobileInspectorOpen(false);
                }}
                onDeleteEdge={handleDeleteEdge}
              />
            </div>
          </div>
        </div>
      )}

      {/* DESKTOP FULL-SCREEN WORKFLOW STUDIO WORKSPACE (>= 1024px) */}
      <div className="hidden h-[calc(100vh-204px)] min-h-[600px] flex-col overflow-hidden rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] shadow-xs lg:flex">
        <div className="flex min-h-0 flex-1">
          {/* Left Node & Template Library */}
          {libraryOpen && (
            <StudioNodeLibrarySidebar
              templates={templates}
              providerAvailability={providerAvailability}
              canEdit={canEdit}
              onAddNode={(subtype) => handleAddNode(subtype)}
              onLoadTemplate={handleLoadTemplate}
            />
          )}

          {/* Center Infinite React Flow Canvas */}
          <div
            ref={canvasWrapperRef}
            data-testid="workflow-studio-canvas"
            className="relative min-w-0 flex-1 overflow-hidden bg-[var(--bg-canvas)]"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => setContextMenu(null)}
          >
            <div className="absolute inset-0">
            {loading ? (
              <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">
                Loading Workflow Studio canvas...
              </div>
            ) : (
              <ReactFlow
                nodes={flowNodes}
                edges={flowEdges}
                nodeTypes={NODE_TYPES}
                onNodesChange={handleNodesChange}
                onConnect={handleConnect}
                onNodeClick={(_, node) => {
                  setSelectedNodeId(node.id);
                  setContextMenu(null);
                }}
                onPaneClick={() => setContextMenu(null)}
                fitView
                fitViewOptions={{ padding: 0.16 }}
                minZoom={0.35}
                maxZoom={1.75}
                className={isDarkTheme ? 'dark' : ''}
                style={
                  {
                    backgroundColor: 'var(--bg-canvas)',
                    '--xy-background-color': 'var(--bg-canvas)',
                    '--xy-controls-button-background-color': 'var(--bg-surface)',
                    '--xy-controls-button-background-color-hover': 'var(--bg-subtle)',
                    '--xy-controls-button-color': 'var(--text-primary)',
                    '--xy-controls-button-border-color': 'var(--border-hairline)',
                  } as CSSProperties
                }
                proOptions={{ hideAttribution: true }}
              >
                <Background
                  variant={BackgroundVariant.Dots}
                  gap={20}
                  size={1.2}
                  color={isDarkTheme ? '#334155' : '#CBD5E1'}
                />
                <MiniMap
                  pannable
                  zoomable
                  nodeStrokeWidth={2}
                  style={{
                    width: 148,
                    height: 96,
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-hairline)',
                    borderRadius: 10,
                  }}
                />
                <Controls
                  showInteractive={false}
                  style={{
                    borderRadius: 10,
                    border: '1px solid var(--border-hairline)',
                    overflow: 'hidden',
                  }}
                />
              </ReactFlow>
            )}
            </div>

            {/* Empty Canvas Helper Overlay */}
            {!loading && graph.nodes.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="pointer-events-auto max-w-sm rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 text-center shadow-lg">
                  <Workflow className="mx-auto h-7 w-7 text-[var(--accent-primary)]" aria-hidden="true" />
                  <h2 className="mt-2 font-display text-sm font-bold text-[var(--text-primary)]">
                    Start Building Your SEO Workflow
                  </h2>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Drag nodes from the left library or quick-load a built-in template.
                  </p>
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => handleAddNode('manual_trigger', { x: 80, y: 160 })}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Add Manual Trigger</span>
                  </button>
                </div>
              </div>
            )}

            {/* Floating Right-Click Node Context Menu */}
            {contextMenu && canEdit && (
              <div
                role="menu"
                aria-label="Node actions menu"
                className="fixed z-50 w-48 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-1 shadow-xl"
                style={{ left: contextMenu.x, top: contextMenu.y }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setSelectedNodeId(contextMenu.nodeId);
                    setContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                >
                  <Workflow className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Configure Node</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleDuplicateNode(contextMenu.nodeId)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Duplicate Node</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleInsertApprovalAfter(contextMenu.nodeId)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-emerald-600 hover:bg-[var(--bg-subtle)] dark:text-emerald-400 cursor-pointer"
                >
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Add Approval Gate After</span>
                </button>
                <div className="my-1 h-px bg-[var(--border-hairline)]" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleDeleteNode(contextMenu.nodeId)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Delete Node</span>
                </button>
              </div>
            )}
          </div>

          {/* Right Node Properties & Live Execution Inspector */}
          <StudioNodeInspectorPanel
            projectId={activeProjectId || null}
            selectedNode={selectedNode}
            allNodes={graph.nodes}
            allEdges={graph.edges}
            activeExecutionWorkflowId={activeExecution?.workflow.id ?? null}
            providerAvailability={providerAvailability}
            validationIssues={validation?.issues ?? []}
            canEdit={canEdit}
            onUpdateNode={handleUpdateNode}
            onDuplicateNode={handleDuplicateNode}
            onDeleteNode={handleDeleteNode}
            onDeleteEdge={handleDeleteEdge}
          />
        </div>

        {/* Bottom Diagnostics, Validation, Logs, Approvals & Versions Drawer */}
        <StudioBottomDrawer
          validation={validation}
          activeExecution={activeExecution}
          liveEvents={liveEvents}
          versions={versions}
          canEdit={canEdit}
          canApprove={canApprove}
          onFocusNode={handleFocusNode}
          onRestoreVersion={(vId) => void handleRestoreVersion(vId)}
          onApproveGate={(aId, dec) => void handleApproveGate(aId, dec)}
        />
      </div>

      {/* SAVE AS TEMPLATE MODAL */}
      {templateModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Save Workflow as Reusable Template"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                Save as Reusable Template
              </h2>
              <button
                type="button"
                onClick={() => setTemplateModalOpen(false)}
                aria-label="Close modal"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Persist this multi-agent graph structure in your workspace template library for future projects and runs.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                  Template Name
                </label>
                <input
                  type="text"
                  value={templateNameInput}
                  onChange={(e) => setTemplateNameInput(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                  Category
                </label>
                <input
                  type="text"
                  value={templateCategoryInput}
                  onChange={(e) => setTemplateCategoryInput(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={templateDescInput}
                  onChange={(e) => setTemplateDescInput(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)]"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTemplateModalOpen(false)}
                className="rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!templateNameInput.trim()}
                onClick={() => void handleSaveAsTemplateSubmit()}
                className="rounded-lg bg-[var(--accent-primary)] px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-45 cursor-pointer"
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}
    </PageTransition>
  );
}

export function WorkflowStudioPage() {
  return (
    <ReactFlowProvider>
      <WorkflowStudioCanvasWorkspace />
    </ReactFlowProvider>
  );
}

export default WorkflowStudioPage;
