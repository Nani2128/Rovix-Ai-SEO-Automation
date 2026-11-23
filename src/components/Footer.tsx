import type { AppRoute } from '../types/navigation';
import { RovixLogo } from './RovixLogo';

interface FooterProps {
  onNavigate: (route: AppRoute, sectionId?: string) => void;
}

export function Footer({ onNavigate }: FooterProps) {
  return (
    <footer className="border-t border-[var(--border-hairline)] bg-[var(--bg-subtle)] py-12 sm:py-16">
      <div className="mx-auto max-w-[1280px] px-5 sm:px-8">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/');
              }}
              className="inline-flex items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#7047EB]"
            >
              <RovixLogo />
            </a>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
              Rovix AI SEO Intelligence &amp; Automation. Technical crawling,
              Google Search Console &amp; GA4 connectors, and dual-approval
              remediation.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 sm:gap-12">
            <div>
              <h3 className="font-display text-xs font-semibold tracking-wider text-[var(--text-primary)] uppercase">
                Platform
              </h3>
              <ul className="mt-3 space-y-2.5 text-sm text-[var(--text-muted)]">
                <li>
                  <button
                    type="button"
                    onClick={() => onNavigate('/', 'features')}
                    className="cursor-pointer hover:text-[var(--text-primary)] transition-colors"
                  >
                    Capabilities
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => onNavigate('/', 'platform-explorer')}
                    className="cursor-pointer hover:text-[var(--text-primary)] transition-colors"
                  >
                    Architecture Explorer
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => onNavigate('/', 'solutions')}
                    className="cursor-pointer hover:text-[var(--text-primary)] transition-colors"
                  >
                    Workflows
                  </button>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-display text-xs font-semibold tracking-wider text-[var(--text-primary)] uppercase">
                Documentation
              </h3>
              <ul className="mt-3 space-y-2.5 text-sm text-[var(--text-muted)]">
                <li>
                  <button
                    type="button"
                    onClick={() => onNavigate('/pricing')}
                    className="cursor-pointer hover:text-[var(--text-primary)] transition-colors"
                  >
                    Plans Overview
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => onNavigate('/resources')}
                    className="cursor-pointer hover:text-[var(--text-primary)] transition-colors"
                  >
                    Resources
                  </button>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-display text-xs font-semibold tracking-wider text-[var(--text-primary)] uppercase">
                Workspace
              </h3>
              <ul className="mt-3 space-y-2.5 text-sm text-[var(--text-muted)]">
                <li>
                  <button
                    type="button"
                    onClick={() => onNavigate('/signin')}
                    className="cursor-pointer hover:text-[var(--text-primary)] transition-colors"
                  >
                    Sign In
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => onNavigate('/onboarding')}
                    className="cursor-pointer hover:text-[var(--text-primary)] transition-colors"
                  >
                    Workspace Setup
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-[var(--border-hairline)] pt-6 text-xs text-[var(--text-muted)] sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Rovix AI. All rights reserved.</p>
          <p>Tenant-Isolated Workspace · Encrypted Credential Vault</p>
        </div>
      </div>
    </footer>
  );
}
