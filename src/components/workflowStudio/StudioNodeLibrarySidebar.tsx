import { useMemo, useState } from 'react';
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Database,
  GitBranch,
  Layers,
  PlayCircle,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type {
  StudioNodeCatalogItem,
  StudioNodeCategory,
  StudioNodeSubtype,
  StudioProviderAvailabilityMap,
  StudioWorkflowTemplateRecord,
} from '../../types/workflowStudio';
import { STUDIO_NODE_CATALOG } from '../../lib/workflowStudioCatalog';

interface StudioNodeLibrarySidebarProps {
  templates: StudioWorkflowTemplateRecord[];
  providerAvailability: StudioProviderAvailabilityMap;
  canEdit: boolean;
  onAddNode: (subtype: StudioNodeSubtype) => void;
  onLoadTemplate: (template: StudioWorkflowTemplateRecord) => void;
}

const CATEGORY_ORDER: Array<{
  category: StudioNodeCategory;
  label: string;
  icon: typeof Bot;
}> = [
  { category: 'agent', label: 'Specialist Agents (11)', icon: Bot },
  { category: 'trigger', label: 'Triggers', icon: PlayCircle },
  { category: 'condition', label: 'Conditions', icon: GitBranch },
  { category: 'data', label: 'Data & Evidence', icon: Database },
  { category: 'governance', label: 'Approval & Governance', icon: ShieldCheck },
];

export function StudioNodeLibrarySidebar({
  templates,
  providerAvailability,
  canEdit,
  onAddNode,
  onLoadTemplate,
}: StudioNodeLibrarySidebarProps) {
  const [activeTab, setActiveTab] = useState<'nodes' | 'templates'>('nodes');
  const [searchQuery, setSearchQuery] = useState('');
  const [openCategories, setOpenCategories] = useState<Record<StudioNodeCategory, boolean>>({
    agent: true,
    trigger: true,
    condition: true,
    data: false,
    governance: true,
  });

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const groupedNodes = useMemo(() => {
    const map = new Map<StudioNodeCategory, StudioNodeCatalogItem[]>();
    for (const c of CATEGORY_ORDER) map.set(c.category, []);
    for (const item of STUDIO_NODE_CATALOG) {
      if (normalizedQuery) {
        const hay = `${item.label} ${item.shortLabel} ${item.description} ${item.capabilities.join(' ')}`.toLowerCase();
        if (!hay.includes(normalizedQuery)) continue;
      }
      map.get(item.category)?.push(item);
    }
    return map;
  }, [normalizedQuery]);

  const filteredTemplates = useMemo(() => {
    if (!normalizedQuery) return templates;
    return templates.filter((t) =>
      `${t.name} ${t.category} ${t.description}`.toLowerCase().includes(normalizedQuery),
    );
  }, [templates, normalizedQuery]);

  const toggleCategory = (cat: StudioNodeCategory) => {
    setOpenCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  return (
    <aside
      aria-label="Workflow Node & Template Library"
      className="flex h-full w-[268px] shrink-0 flex-col border-r border-[var(--border-hairline)] bg-[var(--bg-surface)]"
    >
      {/* Tab Switcher */}
      <div className="flex shrink-0 border-b border-[var(--border-hairline)] p-2">
        <div className="grid w-full grid-cols-2 gap-1 rounded-lg bg-[var(--bg-subtle)] p-0.5">
          <button
            type="button"
            onClick={() => setActiveTab('nodes')}
            className={`flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'nodes'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Node Library</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('templates')}
            className={`flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'templates'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Templates ({templates.length})</span>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="shrink-0 border-b border-[var(--border-hairline)] px-3 py-2">
        <label className="relative block">
          <span className="sr-only">Search nodes or templates</span>
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              activeTab === 'nodes' ? 'Filter agents & nodes...' : 'Filter templates...'
            }
            className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] py-1.5 pl-8 pr-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
          />
        </label>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5">
        {activeTab === 'nodes' ? (
          <div className="space-y-2.5">
            {CATEGORY_ORDER.map(({ category, label, icon: CatIcon }) => {
              const items = groupedNodes.get(category) ?? [];
              if (items.length === 0) return null;
              const isOpen = normalizedQuery ? true : openCategories[category];

              return (
                <div key={category} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => toggleCategory(category)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      <CatIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{label}</span>
                    </span>
                    {isOpen ? (
                      <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </button>

                  {isOpen && (
                    <div className="space-y-1">
                      {items.map((item) => {
                        const prov =
                          item.category === 'agent'
                            ? providerAvailability[item.subtype]
                            : null;
                        const unavailable = prov?.status === 'unavailable';
                        return (
                          <div
                            key={item.subtype}
                            draggable={canEdit}
                            onDragStart={(e) => {
                              e.dataTransfer.setData(
                                'application/x-rovix-studio-node',
                                item.subtype,
                              );
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            className="group flex items-start justify-between gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-2 transition-colors hover:border-[var(--accent-primary)]/50 hover:bg-[var(--bg-subtle)]"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="h-2 w-2 shrink-0 rounded-full"
                                  style={{ backgroundColor: item.accentHex }}
                                />
                                <span className="truncate text-xs font-semibold text-[var(--text-primary)]">
                                  {item.label}
                                </span>
                              </div>
                              <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-snug text-[var(--text-muted)]">
                                {item.description}
                              </p>
                              <div className="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                                <span className="capitalize">
                                  {item.executionType.replace('_', ' ')}
                                </span>
                                {unavailable && (
                                  <>
                                    <span>·</span>
                                    <span className="font-medium text-amber-600 dark:text-amber-400">
                                      Provider unavailable
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={!canEdit}
                              onClick={() => onAddNode(item.subtype)}
                              aria-label={`Add ${item.label} to canvas`}
                              title={canEdit ? `Add ${item.label}` : 'Read-only role'}
                              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] disabled:opacity-40 cursor-pointer"
                            >
                              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTemplates.map((tpl) => (
              <div
                key={tpl.id}
                className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3 transition-colors hover:border-[var(--accent-primary)]/45"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-display text-xs font-semibold text-[var(--text-primary)]">
                      {tpl.name}
                    </div>
                    <div className="mt-0.5 text-[10.5px] text-[var(--text-muted)]">
                      {tpl.category} · {tpl.graph.nodes.length} nodes ·{' '}
                      {tpl.isBuiltIn ? 'Built-in' : 'Saved'}
                    </div>
                  </div>
                </div>
                <p className="mt-1.5 text-[11px] leading-snug text-[var(--text-secondary)]">
                  {tpl.description}
                </p>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => onLoadTemplate(tpl)}
                  className="mt-2.5 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] disabled:opacity-45 cursor-pointer"
                >
                  Load Template into Canvas
                </button>
              </div>
            ))}
            {filteredTemplates.length === 0 && (
              <p className="py-6 text-center text-xs text-[var(--text-muted)]">
                No templates match your filter.
              </p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
