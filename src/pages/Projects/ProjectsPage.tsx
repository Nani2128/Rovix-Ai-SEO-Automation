import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { FlaskConical, Plus, X } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { PageTransition } from '../../components/animation/MotionPrimitives';
import { InteractiveButton } from '../../components/ui/InteractivePrimitives';
import { MultiProjectPortfolio } from '../../components/dashboard/MultiProjectPortfolio';

export function ProjectsPage() {
  const permissions = useAuthStore((s) => s.permissions);
  const {
    projects,
    sandboxFixturesEnabled,
    loadProjectsOnly,
    createProject,
    registerSandboxProject,
  } = useDashboardStore();

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [markets, setMarkets] = useState('US');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void loadProjectsOnly();
  }, [loadProjectsOnly]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!website.trim()) return;
    setSubmitting(true);
    const created = await createProject({
      name: name.trim() || website.replace(/^https?:\/\//i, ''),
      website: website.trim(),
      targetMarkets: markets
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean),
    });
    setSubmitting(false);
    if (created) {
      setName('');
      setWebsite('');
      setMarkets('US');
      setShowCreate(false);
    }
  };

  return (
    <PageTransition className="mx-auto max-w-[1360px] space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
            Project Portfolio
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Manage verified website properties, task delivery weights, and active crawl targets.
          </p>
        </div>

        {permissions.canManageProjects && (
          <div className="flex flex-wrap items-center gap-2.5">
            {sandboxFixturesEnabled && (
              <InteractiveButton
                variant="secondary"
                size="md"
                onClick={() => void registerSandboxProject()}
              >
                <FlaskConical className="h-3.5 w-3.5 text-[#0891B2]" aria-hidden="true" />
                <span>Register Local Sandbox</span>
              </InteractiveButton>
            )}
            <InteractiveButton
              variant="primary"
              size="md"
              onClick={() => setShowCreate((prev) => !prev)}
            >
              {showCreate ? (
                <>
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Close Form</span>
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>New Domain Project</span>
                </>
              )}
            </InteractiveButton>
          </div>
        )}
      </div>

      {showCreate && permissions.canManageProjects && (
        <form
          onSubmit={handleSubmit}
          className="rounded-[20px] border border-[#7047EB]/30 bg-[var(--bg-surface)] p-5 sm:p-6 shadow-[0_10px_28px_-18px_rgba(112,71,235,0.22)]"
        >
          <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
            Register Website Domain
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Private internal IP targets and metadata endpoints are blocked by SSRF security controls in production.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label
                htmlFor="proj-name"
                className="block text-xs font-semibold text-[var(--text-primary)] mb-1"
              >
                Project Name
              </label>
              <input
                id="proj-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Company Website"
                className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="proj-url"
                className="block text-xs font-semibold text-[var(--text-primary)] mb-1"
              >
                Primary Website URL
              </label>
              <input
                id="proj-url"
                type="url"
                required
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://example.com"
                className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="proj-markets"
                className="block text-xs font-semibold text-[var(--text-primary)] mb-1"
              >
                Target Markets (comma-separated)
              </label>
              <input
                id="proj-markets"
                type="text"
                value={markets}
                onChange={(e) => setMarkets(e.target.value)}
                placeholder="US, UK, DE"
                className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[#7047EB] focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <InteractiveButton
              type="button"
              variant="secondary"
              size="md"
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </InteractiveButton>
            <InteractiveButton
              type="submit"
              variant="primary"
              size="md"
              loading={submitting}
            >
              Create Domain Project
            </InteractiveButton>
          </div>
        </form>
      )}

      <MultiProjectPortfolio
        projects={projects}
        allowDelete
        onCreateRequest={
          permissions.canManageProjects ? () => setShowCreate(true) : undefined
        }
      />
    </PageTransition>
  );
}
