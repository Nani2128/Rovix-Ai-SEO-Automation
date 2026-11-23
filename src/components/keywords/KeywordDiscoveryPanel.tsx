import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Compass,
  Globe,
  History,
  Plus,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type {
  KeywordBusinessProfile,
  KeywordIntent,
  KeywordResearchRun,
} from '../../types/keywords';
import { GlassPanel } from '../ui/GlassPanel';
import { InteractiveButton } from '../ui/InteractivePrimitives';
import { StatusBadge } from '../ui/StateViews';

export function KeywordDiscoveryPanel({
  profile,
  runs,
  canApproveProfile,
  onSaveProfile,
  onRunDiscovery,
  onAddManual,
}: {
  profile: KeywordBusinessProfile;
  runs: KeywordResearchRun[];
  canApproveProfile: boolean;
  onSaveProfile: (payload: {
    approvedNiche: string;
    approvedServices: string[];
    targetAudience: string;
    targetCountry: string;
    targetCity: string;
    targetLanguage: string;
    competitorUrls: string[];
    approveProfile: boolean;
  }) => Promise<void>;
  onRunDiscovery: (payload: {
    seedTerms: string[];
    targetCountry: string;
    targetCity: string;
    targetLanguage: string;
    intentFocus: KeywordIntent | 'all';
    competitorUrls: string[];
    includeAutocomplete: boolean;
    includeTrends: boolean;
    includeAiExpansion: boolean;
  }) => Promise<void>;
  onAddManual: (payload: {
    keyword: string;
    intent?: KeywordIntent;
    targetCountry: string;
    targetCity: string;
    targetLanguage: string;
    notes?: string;
  }) => Promise<void>;
}) {
  // Business Profile state
  const [niche, setNiche] = useState(profile.approvedNiche);
  const [servicesText, setServicesText] = useState(
    profile.approvedServices.join(', '),
  );
  const [audience, setAudience] = useState(profile.targetAudience);
  const [profCountry, setProfCountry] = useState(profile.targetCountry || 'US');
  const [profCity, setProfCity] = useState(profile.targetCity);
  const [profLang, setProfLang] = useState(profile.targetLanguage || 'en');
  const [profCompetitors, setProfCompetitors] = useState(
    profile.competitorUrls.join('\n'),
  );
  const [savingProfile, setSavingProfile] = useState(false);

  // Discovery launcher state
  const [seedsText, setSeedsText] = useState(
    profile.approvedServices.slice(0, 3).join(', '),
  );
  const [country, setCountry] = useState(profile.targetCountry || 'US');
  const [city, setCity] = useState(profile.targetCity);
  const [language, setLanguage] = useState(profile.targetLanguage || 'en');
  const [intentFocus, setIntentFocus] = useState<KeywordIntent | 'all'>('all');
  const [compUrlsText, setCompUrlsText] = useState(
    profile.competitorUrls.join('\n'),
  );
  const [includeAutocomplete, setIncludeAutocomplete] = useState(true);
  const [includeTrends, setIncludeTrends] = useState(true);
  const [includeAiExpansion, setIncludeAiExpansion] = useState(false);
  const [runningDiscovery, setRunningDiscovery] = useState(false);

  // Manual keyword state
  const [manualKw, setManualKw] = useState('');
  const [manualIntent, setManualIntent] = useState<KeywordIntent | 'auto'>('auto');
  const [manualNotes, setManualNotes] = useState('');
  const [addingManual, setAddingManual] = useState(false);

  useEffect(() => {
    setNiche(profile.approvedNiche);
    setServicesText(profile.approvedServices.join(', '));
    setAudience(profile.targetAudience);
    setProfCountry(profile.targetCountry || 'US');
    setProfCity(profile.targetCity);
    setProfLang(profile.targetLanguage || 'en');
    setProfCompetitors(profile.competitorUrls.join('\n'));
    setCountry(profile.targetCountry || 'US');
    setCity(profile.targetCity);
    setLanguage(profile.targetLanguage || 'en');
    setCompUrlsText(profile.competitorUrls.join('\n'));
    if (!seedsText && profile.approvedServices.length > 0) {
      setSeedsText(profile.approvedServices.slice(0, 3).join(', '));
    }
  }, [profile]);

  const handleProfileSave = async (approve: boolean) => {
    setSavingProfile(true);
    try {
      await onSaveProfile({
        approvedNiche: niche,
        approvedServices: servicesText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        targetAudience: audience,
        targetCountry: profCountry,
        targetCity: profCity,
        targetLanguage: profLang,
        competitorUrls: profCompetitors
          .split(/\r?\n|,/)
          .map((u) => u.trim())
          .filter(Boolean),
        approveProfile: approve,
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleLaunchDiscovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setRunningDiscovery(true);
    try {
      await onRunDiscovery({
        seedTerms: seedsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        targetCountry: country,
        targetCity: city,
        targetLanguage: language,
        intentFocus,
        competitorUrls: compUrlsText
          .split(/\r?\n|,/)
          .map((u) => u.trim())
          .filter(Boolean),
        includeAutocomplete,
        includeTrends,
        includeAiExpansion,
      });
    } finally {
      setRunningDiscovery(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualKw.trim()) return;
    setAddingManual(true);
    try {
      await onAddManual({
        keyword: manualKw.trim(),
        intent: manualIntent === 'auto' ? undefined : manualIntent,
        targetCountry: country,
        targetCity: city,
        targetLanguage: language,
        notes: manualNotes.trim() || undefined,
      });
      setManualKw('');
      setManualNotes('');
    } finally {
      setAddingManual(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Owner-Approved Business Profile */}
        <GlassPanel className="p-5 lg:col-span-5 space-y-4">
          <div className="flex items-start justify-between gap-2 border-b border-[var(--border-hairline)] pb-3">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck
                  className="h-4 w-4 text-[var(--accent-primary)]"
                  aria-hidden="true"
                />
                <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                  Business Context Profile
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                Required relevance baseline &amp; owner approval gate before keyword sign-off
              </p>
            </div>
            <StatusBadge
              label={
                profile.approvalStatus === 'approved' ? 'Approved' : 'Pending Approval'
              }
              tone={profile.approvalStatus === 'approved' ? 'success' : 'warning'}
            />
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label
                htmlFor="kw-prof-niche"
                className="block font-semibold text-[var(--text-primary)]"
              >
                Approved Niche / Industry
              </label>
              <input
                id="kw-prof-niche"
                type="text"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                placeholder="e.g., B2B Technical SEO & Organic Growth Agency"
                className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="kw-prof-services"
                className="block font-semibold text-[var(--text-primary)]"
              >
                Approved Core Services / Offerings (comma-separated)
              </label>
              <input
                id="kw-prof-services"
                type="text"
                value={servicesText}
                onChange={(e) => setServicesText(e.target.value)}
                placeholder="technical seo audit, enterprise seo, core web vitals optimization"
                className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="kw-prof-audience"
                className="block font-semibold text-[var(--text-primary)]"
              >
                Target Customer / ICP
              </label>
              <input
                id="kw-prof-audience"
                type="text"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="e.g., SaaS VP Marketing, Ecommerce Heads of Growth"
                className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label
                  htmlFor="kw-prof-country"
                  className="block font-semibold text-[var(--text-primary)]"
                >
                  Country
                </label>
                <input
                  id="kw-prof-country"
                  type="text"
                  value={profCountry}
                  onChange={(e) => setProfCountry(e.target.value)}
                  placeholder="US"
                  className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="kw-prof-city"
                  className="block font-semibold text-[var(--text-primary)]"
                >
                  City / Region
                </label>
                <input
                  id="kw-prof-city"
                  type="text"
                  value={profCity}
                  onChange={(e) => setProfCity(e.target.value)}
                  placeholder="Optional"
                  className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="kw-prof-lang"
                  className="block font-semibold text-[var(--text-primary)]"
                >
                  Language
                </label>
                <input
                  id="kw-prof-lang"
                  type="text"
                  value={profLang}
                  onChange={(e) => setProfLang(e.target.value)}
                  placeholder="en"
                  className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="kw-prof-comp"
                className="block font-semibold text-[var(--text-primary)]"
              >
                Competitor URLs (one per line, SSRF-validated)
              </label>
              <textarea
                id="kw-prof-comp"
                rows={2}
                value={profCompetitors}
                onChange={(e) => setProfCompetitors(e.target.value)}
                placeholder="https://competitor.com/services"
                className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <InteractiveButton
                variant="secondary"
                size="sm"
                loading={savingProfile}
                onClick={() => void handleProfileSave(false)}
              >
                <span>Save Draft</span>
              </InteractiveButton>
              {canApproveProfile && (
                <InteractiveButton
                  variant="primary"
                  size="sm"
                  loading={savingProfile}
                  onClick={() => void handleProfileSave(true)}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Save &amp; Owner Approve</span>
                </InteractiveButton>
              )}
            </div>
          </div>
        </GlassPanel>

        {/* Keyword Discovery Launcher + Manual Entry */}
        <GlassPanel className="p-5 lg:col-span-7 space-y-5">
          <div className="border-b border-[var(--border-hairline)] pb-3">
            <div className="flex items-center gap-2">
              <Compass className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
              <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
                Keyword Discovery &amp; Enrichment Run
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Imports live GSC queries, site crawl headings, Google Autocomplete suggestions, and Google Trends 0–100 index. Missing market volume stays &ldquo;Unavailable&rdquo;.
            </p>
          </div>

          <form onSubmit={(e) => void handleLaunchDiscovery(e)} className="space-y-3.5 text-xs">
            <div>
              <label
                htmlFor="kw-seed-terms"
                className="block font-semibold text-[var(--text-primary)]"
              >
                Seed Keywords / Service Topics (comma-separated)
              </label>
              <input
                id="kw-seed-terms"
                type="text"
                value={seedsText}
                onChange={(e) => setSeedsText(e.target.value)}
                placeholder="technical seo audit, core web vitals consulting, enterprise seo"
                className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-4">
              <div>
                <label htmlFor="kw-disc-country" className="block font-semibold text-[var(--text-primary)]">
                  Target Country
                </label>
                <input
                  id="kw-disc-country"
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="kw-disc-city" className="block font-semibold text-[var(--text-primary)]">
                  Target City
                </label>
                <input
                  id="kw-disc-city"
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Optional"
                  className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="kw-disc-lang" className="block font-semibold text-[var(--text-primary)]">
                  Language
                </label>
                <input
                  id="kw-disc-lang"
                  type="text"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="kw-disc-intent" className="block font-semibold text-[var(--text-primary)]">
                  Intent Focus
                </label>
                <select
                  id="kw-disc-intent"
                  value={intentFocus}
                  onChange={(e) =>
                    setIntentFocus(e.target.value as KeywordIntent | 'all')
                  }
                  className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                >
                  <option value="all">All Intents</option>
                  <option value="Transactional">Transactional</option>
                  <option value="Commercial">Commercial</option>
                  <option value="Local">Local</option>
                  <option value="Informational">Informational</option>
                  <option value="Navigational">Navigational</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="kw-disc-comp" className="block font-semibold text-[var(--text-primary)]">
                Competitor URLs to Inspect (optional, SSRF-protected)
              </label>
              <input
                id="kw-disc-comp"
                type="text"
                value={compUrlsText.replace(/\n/g, ', ')}
                onChange={(e) => setCompUrlsText(e.target.value)}
                placeholder="https://competitor.com/services"
                className="mt-1 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3.5 py-2.5">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeAutocomplete}
                  onChange={(e) => setIncludeAutocomplete(e.target.checked)}
                  className="h-3.5 w-3.5 rounded accent-[var(--accent-primary)]"
                />
                <span className="font-medium text-[var(--text-primary)]">
                  Search Autocomplete
                </span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeTrends}
                  onChange={(e) => setIncludeTrends(e.target.checked)}
                  className="h-3.5 w-3.5 rounded accent-[var(--accent-primary)]"
                />
                <span className="font-medium text-[var(--text-primary)]">
                  Google Trends (0–100)
                </span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeAiExpansion}
                  onChange={(e) => setIncludeAiExpansion(e.target.checked)}
                  className="h-3.5 w-3.5 rounded accent-[var(--accent-primary)]"
                />
                <span className="font-medium text-[var(--text-primary)]">
                  AI Semantic Expansion (flagged AI Suggestion)
                </span>
              </label>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                Scope: {country}
                {city ? ` · ${city} (city metrics labeled honestly)` : ' (country)'} · {language}
              </span>
              <InteractiveButton
                type="submit"
                variant="primary"
                size="md"
                loading={runningDiscovery}
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{runningDiscovery ? 'Discovering...' : 'Run Keyword Discovery'}</span>
              </InteractiveButton>
            </div>
          </form>

          {/* Quick Manual Target Addition */}
          <form
            onSubmit={(e) => void handleManualSubmit(e)}
            className="border-t border-[var(--border-hairline)] pt-4 space-y-2.5 text-xs"
          >
            <div className="font-display text-xs font-bold text-[var(--text-primary)]">
              Add Manual Keyword Target
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
              <input
                type="text"
                value={manualKw}
                onChange={(e) => setManualKw(e.target.value)}
                placeholder="Enter exact keyword phrase..."
                aria-label="Manual keyword phrase"
                className="sm:col-span-5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
              />
              <select
                aria-label="Manual keyword intent"
                value={manualIntent}
                onChange={(e) =>
                  setManualIntent(e.target.value as KeywordIntent | 'auto')
                }
                className="sm:col-span-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
              >
                <option value="auto">Auto-classify Intent</option>
                <option value="Transactional">Transactional</option>
                <option value="Commercial">Commercial</option>
                <option value="Local">Local</option>
                <option value="Informational">Informational</option>
                <option value="Navigational">Navigational</option>
              </select>
              <input
                type="text"
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                placeholder="Optional note"
                aria-label="Manual keyword note"
                className="sm:col-span-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
              />
              <InteractiveButton
                type="submit"
                variant="secondary"
                size="md"
                loading={addingManual}
                className="sm:col-span-2"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Add</span>
              </InteractiveButton>
            </div>
          </form>
        </GlassPanel>
      </div>

      {/* Research Run History */}
      <GlassPanel className="p-5">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border-hairline)] pb-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
            <h3 className="font-display text-sm font-bold text-[var(--text-primary)]">
              Persisted Research Runs
            </h3>
          </div>
          <span className="font-mono text-xs text-[var(--text-muted)]">
            {runs.length} runs stored
          </span>
        </div>

        {runs.length === 0 ? (
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            No keyword discovery runs have been executed for this project yet.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {runs.slice(0, 8).map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-xs text-[var(--text-primary)]">
                      Seeds: {r.seedTerms.join(', ')}
                    </span>
                    <StatusBadge
                      label={r.status}
                      tone={r.status === 'Completed' ? 'success' : 'warning'}
                    />
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                    Market: {r.targetCountry}
                    {r.targetCity ? ` · ${r.targetCity}` : ''} ({r.targetLanguage}) ·
                    Triggered by {r.triggeredBy} ·{' '}
                    {new Date(r.startedAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3 font-mono text-xs text-[var(--text-secondary)]">
                  <span>{r.totalDiscovered} keywords</span>
                  <span>{r.totalClustersCreated} clusters</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
