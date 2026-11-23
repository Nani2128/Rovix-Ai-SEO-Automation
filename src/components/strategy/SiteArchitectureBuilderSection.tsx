import { useMemo, useState } from 'react';
import {
  Archive,
  Check,
  ChevronDown,
  ChevronRight,
  FolderTree,
  GripVertical,
  Plus,
  Save,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import {
  buildArchitectureTree,
  wouldCreateArchitectureCycle,
} from '../../lib/strategyEngine';
import type { KeywordIntent } from '../../types/dashboard';
import type {
  ArchitecturePageStatus,
  ArchitecturePageType,
  SiteArchitecturePageRecord,
  SiteArchitectureTreeNode,
  StrategyApprovalStatus,
  StrategyEntityKind,
  StrategyWorkspacePayload,
} from '../../types/strategy';
import type {
  CreateArchitecturePagePayload,
  UpdateArchitecturePagePayload,
} from '../../services/strategyService';
import {
  PAGE_STATUS_LABELS,
  PAGE_TYPE_LABELS,
  approvalLabel,
  approvalToneClass,
  confidenceToneClass,
} from './strategyUiHelpers';

const PAGE_TYPES: readonly ArchitecturePageType[] = [
  'homepage',
  'service',
  'product',
  'category',
  'location',
  'blog',
  'resource',
  'case_study',
  'about',
  'contact',
];

const INTENTS: readonly KeywordIntent[] = [
  'Informational',
  'Commercial',
  'Transactional',
  'Navigational',
  'Local',
];

interface SiteArchitectureBuilderSectionProps {
  workspace: StrategyWorkspacePayload;
  busyAction: string | null;
  onCreatePage: (payload: CreateArchitecturePagePayload) => Promise<void>;
  onUpdatePage: (
    pageId: string,
    payload: UpdateArchitecturePagePayload,
  ) => Promise<void>;
  onMovePage: (pageId: string, newParentPageId: string | null) => Promise<void>;
  onArchivePage: (pageId: string, reason?: string) => Promise<void>;
  onDecideApproval: (
    entityKind: StrategyEntityKind,
    entityId: string,
    decision: StrategyApprovalStatus,
    comment?: string,
  ) => Promise<void>;
}

export function SiteArchitectureBuilderSection({
  workspace,
  busyAction,
  onCreatePage,
  onUpdatePage,
  onMovePage,
  onArchivePage,
  onDecideApproval,
}: SiteArchitectureBuilderSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<ArchitecturePageType | 'all'>(
    'all',
  );
  const [showArchived, setShowArchived] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState<Record<string, boolean>>({});
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [draggingPageId, setDraggingPageId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // Create page inline form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newType, setNewType] = useState<ArchitecturePageType>('service');
  const [newParentId, setNewParentId] = useState<string>('');
  const [newPrimaryKw, setNewPrimaryKw] = useState('');
  const [newIntent, setNewIntent] = useState<KeywordIntent>('Commercial');
  const [newGeo, setNewGeo] = useState('');
  const [newRationale, setNewRationale] = useState('');

  // Inspector edit form state (synced on selection)
  const [editTitle, setEditTitle] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editType, setEditType] = useState<ArchitecturePageType>('service');
  const [editStatus, setEditStatus] =
    useState<ArchitecturePageStatus>('proposed');
  const [editPrimaryKw, setEditPrimaryKw] = useState('');
  const [editSecondaryKws, setEditSecondaryKws] = useState('');
  const [editIntent, setEditIntent] = useState<KeywordIntent>('Commercial');
  const [editGeo, setEditGeo] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);

  const activePages = useMemo(
    () =>
      workspace.pages.filter((p) =>
        showArchived ? true : p.pageStatus !== 'archived' && !p.archivedAt,
      ),
    [workspace.pages, showArchived],
  );

  const filteredPages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activePages.filter((p) => {
      if (typeFilter !== 'all' && p.pageType !== typeFilter) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        (p.primaryKeyword?.toLowerCase().includes(q) ?? false) ||
        (p.targetGeography?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [activePages, searchQuery, typeFilter]);

  const treeRoots = useMemo(
    () =>
      buildArchitectureTree(
        filteredPages,
        workspace.internalLinks,
        showArchived,
      ),
    [filteredPages, workspace.internalLinks, showArchived],
  );

  const selectedPage: SiteArchitecturePageRecord | null = useMemo(() => {
    if (!selectedPageId) return activePages[0] ?? null;
    return (
      workspace.pages.find((p) => p.id === selectedPageId) ??
      activePages[0] ??
      null
    );
  }, [workspace.pages, activePages, selectedPageId]);

  const selectPage = (page: SiteArchitecturePageRecord) => {
    setSelectedPageId(page.id);
    setEditTitle(page.title);
    setEditSlug(page.slug);
    setEditType(page.pageType);
    setEditStatus(page.pageStatus);
    setEditPrimaryKw(page.primaryKeyword ?? '');
    setEditSecondaryKws(page.secondaryKeywords.join(', '));
    setEditIntent(page.searchIntent);
    setEditGeo(page.targetGeography ?? '');
    setEditNotes(page.notes ?? '');
    setConfirmArchiveId(null);
  };

  // Sync inspector fields when selectedPage changes initially
  const [syncedPageId, setSyncedPageId] = useState<string | null>(null);
  if (selectedPage && syncedPageId !== selectedPage.id) {
    setSyncedPageId(selectedPage.id);
    setEditTitle(selectedPage.title);
    setEditSlug(selectedPage.slug);
    setEditType(selectedPage.pageType);
    setEditStatus(selectedPage.pageStatus);
    setEditPrimaryKw(selectedPage.primaryKeyword ?? '');
    setEditSecondaryKws(selectedPage.secondaryKeywords.join(', '));
    setEditIntent(selectedPage.searchIntent);
    setEditGeo(selectedPage.targetGeography ?? '');
    setEditNotes(selectedPage.notes ?? '');
  }

  if (!workspace.activeVersion) {
    return (
      <div className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 text-center text-xs text-[var(--text-muted)]">
        Generate an SEO Strategy version first to build and govern your interactive website architecture tree.
      </div>
    );
  }

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !workspace.activeVersion) return;
    const rawSlug =
      newSlug.trim() ||
      `/${newTitle
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')}`;

    await onCreatePage({
      strategyVersionId: workspace.activeVersion.id,
      parentPageId: newParentId || null,
      title: newTitle.trim(),
      slug: rawSlug,
      pageType: newType,
      primaryKeyword: newPrimaryKw.trim() || null,
      searchIntent: newIntent,
      targetGeography: newGeo.trim() || null,
      pageStatus: 'proposed',
      rationale:
        newRationale.trim() ||
        'Proposed manually in Visual Website Architecture Builder.',
    });

    setNewTitle('');
    setNewSlug('');
    setNewPrimaryKw('');
    setNewGeo('');
    setNewRationale('');
    setShowCreateForm(false);
  };

  const handleSaveInspector = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPage) return;
    await onUpdatePage(selectedPage.id, {
      title: editTitle.trim(),
      slug: editSlug.trim(),
      pageType: editType,
      pageStatus: editStatus,
      primaryKeyword: editPrimaryKw.trim() || null,
      secondaryKeywords: editSecondaryKws
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      searchIntent: editIntent,
      targetGeography: editGeo.trim() || null,
      notes: editNotes,
    });
  };

  const handleDropOnNode = async (targetNodeId: string) => {
    setDropTargetId(null);
    if (!draggingPageId || draggingPageId === targetNodeId) {
      setDraggingPageId(null);
      return;
    }
    if (wouldCreateArchitectureCycle(workspace.pages, draggingPageId, targetNodeId)) {
      setDraggingPageId(null);
      return;
    }
    const draggedId = draggingPageId;
    setDraggingPageId(null);
    await onMovePage(draggedId, targetNodeId);
  };

  const renderTreeNode = (node: SiteArchitectureTreeNode) => {
    const hasChildren = node.children.length > 0;
    const isCollapsed = Boolean(collapsedIds[node.id]);
    const isSelected = selectedPage?.id === node.id;
    const isDropTarget = dropTargetId === node.id && draggingPageId !== node.id;
    const isArchived = node.pageStatus === 'archived' || Boolean(node.archivedAt);

    return (
      <div key={node.id} className="select-none">
        <div
          draggable={workspace.canEditStrategy && !isArchived}
          onDragStart={(e) => {
            setDraggingPageId(node.id);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', node.id);
          }}
          onDragEnd={() => {
            setDraggingPageId(null);
            setDropTargetId(null);
          }}
          onDragOver={(e) => {
            if (!draggingPageId || draggingPageId === node.id) return;
            if (wouldCreateArchitectureCycle(workspace.pages, draggingPageId, node.id)) {
              return;
            }
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setDropTargetId(node.id);
          }}
          onDragLeave={() => {
            if (dropTargetId === node.id) setDropTargetId(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            void handleDropOnNode(node.id);
          }}
          onClick={() => selectPage(node)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              selectPage(node);
            }
          }}
          style={{ marginLeft: `${Math.min(node.depth, 5) * 18}px` }}
          className={`group mt-1.5 flex items-start gap-2 rounded-xl border px-3 py-2.5 transition-colors cursor-pointer ${
            isDropTarget
              ? 'border-[#7047EB] bg-[#7047EB]/12'
              : isSelected
                ? 'border-[#7047EB]/60 bg-[#7047EB]/8'
                : 'border-[var(--border-hairline)] bg-[var(--bg-subtle)]/55 hover:border-[#7047EB]/35'
          } ${isArchived ? 'opacity-60' : ''}`}
        >
          {workspace.canEditStrategy && !isArchived && (
            <GripVertical
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] cursor-grab"
              aria-hidden="true"
            />
          )}

          <button
            type="button"
            aria-label={isCollapsed ? 'Expand children' : 'Collapse children'}
            onClick={(e) => {
              e.stopPropagation();
              if (!hasChildren) return;
              setCollapsedIds((prev) => ({
                ...prev,
                [node.id]: !prev[node.id],
              }));
            }}
            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--text-muted)] ${
              hasChildren
                ? 'hover:text-[var(--text-primary)] cursor-pointer'
                : 'opacity-25 cursor-default'
            }`}
          >
            {hasChildren ? (
              isCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              )
            ) : (
              <span className="h-1 w-1 rounded-full bg-[var(--text-muted)]" />
            )}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
              <div className="flex flex-wrap items-baseline gap-x-2 min-w-0">
                <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
                  {node.title}
                </span>
                <span className="font-mono text-[11px] text-[var(--text-muted)] truncate">
                  {node.slug}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-medium shrink-0">
                <span className="text-[var(--text-secondary)]">
                  {PAGE_TYPE_LABELS[node.pageType]}
                </span>
                <span className="text-[var(--text-muted)]">·</span>
                <span className="text-[var(--text-muted)]">
                  {PAGE_STATUS_LABELS[node.pageStatus]}
                </span>
                <span className="text-[var(--text-muted)]">·</span>
                <span className={approvalToneClass(node.approvalStatus)}>
                  {approvalLabel(node.approvalStatus)}
                </span>
              </div>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--text-muted)]">
              <span>
                Primary KW:{' '}
                <strong className="font-medium text-[var(--text-secondary)]">
                  {node.primaryKeyword || 'Unmapped'}
                </strong>
              </span>
              <span>·</span>
              <span>Intent: {node.searchIntent}</span>
              {node.targetGeography && (
                <>
                  <span>·</span>
                  <span>Geo: {node.targetGeography}</span>
                </>
              )}
              <span>·</span>
              <span className="font-mono tabular-nums">
                Links +{node.inboundLinkRecCount}/−{node.outboundLinkRecCount}
              </span>
            </div>
          </div>
        </div>

        {hasChildren && !isCollapsed && (
          <div>{node.children.map((child) => renderTreeNode(child))}</div>
        )}
      </div>
    );
  };

  const validParentsForSelected = selectedPage
    ? activePages.filter(
        (candidate) =>
          candidate.id !== selectedPage.id &&
          !wouldCreateArchitectureCycle(
            workspace.pages,
            selectedPage.id,
            candidate.id,
          ),
      )
    : [];

  return (
    <div className="space-y-4">
      {/* Governance Notice + Toolbar */}
      <section className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-2.5">
            <ShieldAlert
              className="mt-0.5 h-4 w-4 shrink-0 text-[#7047EB] dark:text-[#22D3EE]"
              aria-hidden="true"
            />
            <div>
              <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
                Visual Website Architecture &amp; Sitemap Tree
              </h2>
              <p className="text-[11.5px] text-[var(--text-muted)]">
                Planning draft only — creating, moving, editing, or archiving pages here never modifies your live website. Drag any page onto another page to reparent it, or use the inspector parent selector.
              </p>
            </div>
          </div>

          {workspace.canEditStrategy && (
            <button
              type="button"
              onClick={() => setShowCreateForm((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold text-[var(--accent-on-pill)] whitespace-nowrap shrink-0 cursor-pointer"
              style={{
                background:
                  'linear-gradient(90deg, var(--accent-pill-start), var(--accent-pill-end))',
              }}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{showCreateForm ? 'Close Page Form' : 'Add Proposed Page'}</span>
            </button>
          )}
        </div>

        {/* Inline Add Proposed Page Form */}
        {showCreateForm && workspace.canEditStrategy && (
          <form
            onSubmit={(e) => void handleCreateSubmit(e)}
            className="mt-4 grid gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3.5 sm:grid-cols-2 lg:grid-cols-4"
          >
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                Page Title *
              </span>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g., Commercial Battery Storage"
                className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                URL Slug
              </span>
              <input
                type="text"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                placeholder="/services/battery-storage"
                className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                Page Type
              </span>
              <select
                value={newType}
                onChange={(e) =>
                  setNewType(e.target.value as ArchitecturePageType)
                }
                className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
              >
                {PAGE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {PAGE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                Parent Page
              </span>
              <select
                value={newParentId}
                onChange={(e) => setNewParentId(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
              >
                <option value="">Top-Level Root</option>
                {activePages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.slug})
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                Primary Keyword
              </span>
              <input
                type="text"
                value={newPrimaryKw}
                onChange={(e) => setNewPrimaryKw(e.target.value)}
                placeholder="commercial battery storage"
                className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                Search Intent
              </span>
              <select
                value={newIntent}
                onChange={(e) => setNewIntent(e.target.value as KeywordIntent)}
                className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
              >
                {INTENTS.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                Approved Target Geography
              </span>
              <select
                value={newGeo}
                onChange={(e) => setNewGeo(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
              >
                <option value="">Global / Non-Location</option>
                {workspace.approvedLocations.map((loc) => (
                  <option key={loc.id} value={loc.label}>
                    {loc.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                Strategic Rationale
              </span>
              <input
                type="text"
                value={newRationale}
                onChange={(e) => setNewRationale(e.target.value)}
                placeholder="Evidence or customer demand rationale..."
                className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
              />
            </label>

            <div className="flex items-center justify-end gap-2 sm:col-span-2 lg:col-span-4">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] whitespace-nowrap shrink-0 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyAction !== null || !newTitle.trim()}
                className="rounded-lg px-3.5 py-1.5 text-xs font-semibold text-[var(--accent-on-pill)] whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                style={{
                  background:
                    'linear-gradient(90deg, var(--accent-pill-start), var(--accent-pill-end))',
                }}
              >
                Create Proposed Page
              </button>
            </div>
          </form>
        )}

        {/* Filter Row */}
        <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[200px] flex-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter pages by title, slug, keyword, or location..."
              className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#7047EB] focus:outline-none"
            />
          </div>

          <select
            aria-label="Filter by page type"
            value={typeFilter}
            onChange={(e) =>
              setTypeFilter(e.target.value as ArchitecturePageType | 'all')
            }
            className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
          >
            <option value="all">All Page Types ({activePages.length})</option>
            {PAGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {PAGE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>

          <label className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded border-[var(--border-hairline)]"
            />
            <span>Show Archived</span>
          </label>
        </div>
      </section>

      {/* Master-Detail Split: Left Sitemap Tree + Right Page Inspector */}
      <div className="grid gap-4 lg:grid-cols-12">
        <section className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 lg:col-span-7">
          <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-2.5">
            <div className="flex items-center gap-2">
              <FolderTree
                className="h-4 w-4 text-[#7047EB] dark:text-[#22D3EE]"
                aria-hidden="true"
              />
              <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">
                Interactive Sitemap Hierarchy
              </h3>
            </div>
            <span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">
              {filteredPages.length} page{filteredPages.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="mt-2 max-h-[640px] overflow-y-auto pr-1">
            {treeRoots.length === 0 ? (
              <p className="py-8 text-center text-xs text-[var(--text-muted)]">
                No architecture pages match the current filter.
              </p>
            ) : (
              treeRoots.map((root) => renderTreeNode(root))
            )}
          </div>
        </section>

        {/* Selected Page Inspector */}
        <section className="rounded-[18px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 lg:col-span-5">
          {!selectedPage ? (
            <p className="py-8 text-center text-xs text-[var(--text-muted)]">
              Select a page node from the sitemap tree to inspect or edit its metadata, parent hierarchy, and approval state.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="border-b border-[var(--border-hairline)] pb-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
                    Page Inspector
                  </h3>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                    <span className={confidenceToneClass(selectedPage.confidence)}>
                      {selectedPage.confidence}
                    </span>
                    <span className="text-[var(--text-muted)]">·</span>
                    <span className={approvalToneClass(selectedPage.approvalStatus)}>
                      {approvalLabel(selectedPage.approvalStatus)}
                    </span>
                  </div>
                </div>
                <div className="mt-1 truncate font-mono text-[11px] text-[var(--text-muted)]">
                  {selectedPage.proposedUrl}
                </div>
                {selectedPage.existingUrl && (
                  <div className="mt-0.5 truncate text-[11px] text-emerald-600 dark:text-emerald-400">
                    Verified in crawl: {selectedPage.existingUrl}
                  </div>
                )}
              </div>

              {/* Quick Approval & Move Parent Controls */}
              {workspace.canApproveStrategy &&
                selectedPage.pageStatus !== 'archived' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={
                        busyAction !== null ||
                        selectedPage.approvalStatus === 'approved'
                      }
                      onClick={() =>
                        void onDecideApproval(
                          'architecture_page',
                          selectedPage.id,
                          'approved',
                          `Approved architecture page ${selectedPage.slug}.`,
                        )
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45"
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Approve Page</span>
                    </button>
                    <button
                      type="button"
                      disabled={
                        busyAction !== null ||
                        selectedPage.approvalStatus === 'rejected'
                      }
                      onClick={() =>
                        void onDecideApproval(
                          'architecture_page',
                          selectedPage.id,
                          'rejected',
                          `Rejected architecture page ${selectedPage.slug}.`,
                        )
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-500/20 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Reject</span>
                    </button>
                  </div>
                )}

              {/* Accessible Parent Reparenting Dropdown */}
              {workspace.canEditStrategy &&
                selectedPage.pageStatus !== 'archived' && (
                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                      Move Under Parent Page (Cycle-Protected)
                    </span>
                    <select
                      aria-label="Move page under parent"
                      value={selectedPage.parentPageId ?? ''}
                      disabled={busyAction !== null}
                      onChange={(e) =>
                        void onMovePage(
                          selectedPage.id,
                          e.target.value ? e.target.value : null,
                        )
                      }
                      className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
                    >
                      <option value="">Top-Level Root</option>
                      {validParentsForSelected.map((cand) => (
                        <option key={cand.id} value={cand.id}>
                          {cand.title} ({cand.slug})
                        </option>
                      ))}
                    </select>
                  </label>
                )}

              {/* Editable Page Details Form */}
              <form
                onSubmit={(e) => void handleSaveInspector(e)}
                className="space-y-3"
              >
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                      Page Title
                    </span>
                    <input
                      type="text"
                      disabled={!workspace.canEditStrategy}
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none disabled:opacity-60"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                      URL Path Slug
                    </span>
                    <input
                      type="text"
                      disabled={!workspace.canEditStrategy}
                      value={editSlug}
                      onChange={(e) => setEditSlug(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none disabled:opacity-60"
                    />
                  </label>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-2">
                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                      Page Type
                    </span>
                    <select
                      disabled={!workspace.canEditStrategy}
                      value={editType}
                      onChange={(e) =>
                        setEditType(e.target.value as ArchitecturePageType)
                      }
                      className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none disabled:opacity-60"
                    >
                      {PAGE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {PAGE_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                      Lifecycle Status
                    </span>
                    <select
                      disabled={!workspace.canEditStrategy}
                      value={editStatus}
                      onChange={(e) =>
                        setEditStatus(e.target.value as ArchitecturePageStatus)
                      }
                      className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none disabled:opacity-60"
                    >
                      <option value="existing">Existing (Crawl)</option>
                      <option value="optimize">Optimize Existing</option>
                      <option value="proposed">Proposed New</option>
                    </select>
                  </label>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-2">
                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                      Primary Keyword
                    </span>
                    <input
                      type="text"
                      disabled={!workspace.canEditStrategy}
                      value={editPrimaryKw}
                      onChange={(e) => setEditPrimaryKw(e.target.value)}
                      placeholder="Assign single primary keyword"
                      className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none disabled:opacity-60"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                      Search Intent
                    </span>
                    <select
                      disabled={!workspace.canEditStrategy}
                      value={editIntent}
                      onChange={(e) =>
                        setEditIntent(e.target.value as KeywordIntent)
                      }
                      className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none disabled:opacity-60"
                    >
                      {INTENTS.map((i) => (
                        <option key={i} value={i}>
                          {i}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                    Secondary Keywords (comma-separated)
                  </span>
                  <input
                    type="text"
                    disabled={!workspace.canEditStrategy}
                    value={editSecondaryKws}
                    onChange={(e) => setEditSecondaryKws(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none disabled:opacity-60"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                    Target Geography
                  </span>
                  <input
                    type="text"
                    disabled={!workspace.canEditStrategy}
                    value={editGeo}
                    onChange={(e) => setEditGeo(e.target.value)}
                    placeholder="Optional approved city/state/country"
                    className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none disabled:opacity-60"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                    Architect Notes
                  </span>
                  <textarea
                    rows={2}
                    disabled={!workspace.canEditStrategy}
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none disabled:opacity-60"
                  />
                </label>

                <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-2.5 text-[11px] text-[var(--text-secondary)]">
                  <div className="font-semibold text-[var(--text-primary)]">
                    Rationale &amp; Evidence
                  </div>
                  <p className="mt-1 leading-relaxed">{selectedPage.rationale}</p>
                  {selectedPage.evidence.length > 0 && (
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[var(--text-muted)]">
                      {selectedPage.evidence.map((ev, i) => (
                        <li key={i}>
                          {ev.label}: {ev.observedDetail}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {workspace.canEditStrategy &&
                  selectedPage.pageStatus !== 'archived' && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <button
                        type="submit"
                        disabled={busyAction !== null}
                        className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold text-[var(--accent-on-pill)] whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                        style={{
                          background:
                            'linear-gradient(90deg, var(--accent-pill-start), var(--accent-pill-end))',
                        }}
                      >
                        <Save className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Save Page Changes</span>
                      </button>

                      {confirmArchiveId === selectedPage.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={busyAction !== null}
                            onClick={() => {
                              void onArchivePage(
                                selectedPage.id,
                                'Archived from Visual Website Architecture Builder.',
                              );
                              setConfirmArchiveId(null);
                            }}
                            className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            Confirm Archive
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmArchiveId(null)}
                            className="rounded-lg border border-[var(--border-hairline)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmArchiveId(selectedPage.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-2.5 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:border-rose-500/40 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Archive Page</span>
                        </button>
                      )}
                    </div>
                  )}
              </form>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
