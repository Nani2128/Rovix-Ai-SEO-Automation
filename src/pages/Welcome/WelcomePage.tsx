import { Suspense, lazy, useCallback, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { AppRoute, SeoPillarId } from '../../types/navigation';
import { Navbar } from '../../components/Navbar';
import { HeroSection } from '../../components/HeroSection';
import { FeatureStrip } from '../../components/FeatureStrip';
import { FAQSection } from '../../components/FAQSection';
import { Footer } from '../../components/Footer';
import { PlaceholderRouteView } from '../../components/PlaceholderRouteView';
import { SecurityIntegritySection } from '../../components/SecurityIntegritySection';

const PlatformExplorer3D = lazy(() =>
  import('../../components/PlatformExplorer3D').then((m) => ({
    default: m.PlatformExplorer3D,
  })),
);

const SolutionsSection = lazy(() =>
  import('../../components/SolutionsSection').then((m) => ({
    default: m.SolutionsSection,
  })),
);

export function WelcomePage({
  subRoute,
}: {
  subRoute?: 'onboarding' | 'pricing' | 'resources';
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [activePillar, setActivePillar] =
    useState<SeoPillarId>('technical-seo');

  const activeRoute: AppRoute =
    subRoute === 'onboarding'
      ? '/onboarding'
      : subRoute === 'pricing'
        ? '/pricing'
        : subRoute === 'resources'
          ? '/resources'
          : '/';

  const handleNavigate = useCallback(
    (targetRoute: AppRoute, sectionId?: string) => {
      if (targetRoute === '/signin') {
        navigate('/login');
        return;
      }
      if (location.pathname !== targetRoute) {
        navigate(targetRoute);
      }

      if (sectionId) {
        window.setTimeout(() => {
          const el = document.getElementById(sectionId);
          if (el) {
            const reduced = window.matchMedia(
              '(prefers-reduced-motion: reduce)',
            ).matches;
            el.scrollIntoView({
              behavior: reduced ? 'auto' : 'smooth',
              block: 'start',
            });
          }
        }, 80);
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [location.pathname, navigate],
  );

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-surface)] text-[var(--text-primary)]">
      <Navbar activeRoute={activeRoute} onNavigate={handleNavigate} />

      {!subRoute ? (
        <main className="flex-1">
          <HeroSection onNavigate={handleNavigate} />

          <FeatureStrip
            activePillar={activePillar}
            onSelectPillar={setActivePillar}
          />

          <Suspense
            fallback={
              <div className="bg-[var(--bg-canvas)] py-20 text-center text-sm text-[var(--text-muted)]">
                Loading interactive 3D architecture preview...
              </div>
            }
          >
            <PlatformExplorer3D
              activePillar={activePillar}
              onSelectPillar={setActivePillar}
            />
          </Suspense>

          <Suspense
            fallback={
              <div className="bg-[var(--bg-surface)] py-20 text-center text-sm text-[var(--text-muted)]">
                Loading workflow overview...
              </div>
            }
          >
            <SolutionsSection onNavigate={handleNavigate} />
          </Suspense>

          <SecurityIntegritySection />

          <FAQSection />
        </main>
      ) : (
        <div className="flex-1 bg-[var(--bg-canvas)]">
          <PlaceholderRouteView
            route={activeRoute as '/onboarding' | '/pricing' | '/resources'}
            onNavigate={handleNavigate}
          />
        </div>
      )}

      <Footer onNavigate={handleNavigate} />
    </div>
  );
}
