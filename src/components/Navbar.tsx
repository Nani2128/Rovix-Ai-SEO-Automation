import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Menu, X } from 'lucide-react';
import type { AppRoute } from '../types/navigation';
import { RovixLogo } from './RovixLogo';
import { CTAButton } from './CTAButton';
import { ThemeSelectorDropdown } from './ui/ThemeSelectorDropdown';
import { ThemeToggle } from './ui/ThemeToggle';

interface NavbarProps {
  activeRoute: AppRoute;
  onNavigate: (route: AppRoute, sectionId?: string) => void;
}

interface NavItem {
  label: string;
  id: string;
  type: 'section' | 'route';
  route: AppRoute;
  sectionId?: string;
}

const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Capabilities', id: 'features', type: 'section', route: '/', sectionId: 'features' },
  { label: 'Workflows', id: 'solutions', type: 'section', route: '/', sectionId: 'solutions' },
  { label: 'Plans', id: 'pricing', type: 'route', route: '/pricing' },
  { label: 'Resources', id: 'resources', type: 'route', route: '/resources' },
];

export function Navbar({ activeRoute, onNavigate }: NavbarProps) {
  const prefersReducedMotion = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [hoveredNav, setHoveredNav] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 18);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleItemClick = (item: NavItem) => {
    setMobileOpen(false);
    onNavigate(item.route, item.sectionId);
  };

  return (
    <motion.header
      initial={prefersReducedMotion ? false : { opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className={`sticky top-0 z-40 w-full transition-colors duration-200 ${
        scrolled
          ? 'bg-[var(--bg-surface)]/95 backdrop-blur-md border-b border-[var(--border-hairline)] shadow-[0_6px_24px_-12px_rgba(15,23,42,0.14)]'
          : 'bg-[var(--bg-surface)]/90 backdrop-blur-xs border-b border-transparent'
      }`}
    >
      <div className="mx-auto flex h-[68px] max-w-[1280px] items-center justify-between gap-6 px-5 sm:px-8">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            setMobileOpen(false);
            onNavigate('/');
          }}
          className="inline-flex items-center whitespace-nowrap shrink-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#7047EB]"
          aria-label="Rovix AI Home"
        >
          <RovixLogo />
        </a>

        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center gap-7"
          onMouseLeave={() => setHoveredNav(null)}
        >
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.type === 'route' && activeRoute === item.route;
            const showUnderline = hoveredNav === item.id || isActive;

            return (
              <button
                key={item.id}
                type="button"
                onMouseEnter={() => setHoveredNav(item.id)}
                onClick={() => handleItemClick(item)}
                className={`relative py-2 text-[14.5px] font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#7047EB] ${
                  isActive
                    ? 'text-[#7047EB] dark:text-[#8B6BFF]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {item.label}
                {showUnderline && (
                  <motion.span
                    layoutId="navbar-underline"
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute inset-x-0 bottom-0.5 h-[2px] rounded-full bg-gradient-to-r from-[#7047EB] to-[#2563EB]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="hidden md:flex items-center gap-2.5 shrink-0">
          <ThemeSelectorDropdown compact />
          <ThemeToggle compact />
          <button
            type="button"
            onClick={() => onNavigate('/signin')}
            className={`px-3.5 py-2 text-sm font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7047EB] ${
              activeRoute === '/signin'
                ? 'text-[#7047EB] dark:text-[#8B6BFF] bg-[#7047EB]/10'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
            }`}
          >
            Sign In
          </button>
          <CTAButton
            size="sm"
            variant="primary"
            onClick={() => onNavigate('/signin')}
          >
            Open Workspace
          </CTAButton>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeSelectorDropdown compact />
          <ThemeToggle compact />
          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation-drawer"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="inline-flex items-center justify-center h-10 w-10 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7047EB]"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            id="mobile-navigation-drawer"
            initial={prefersReducedMotion ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="md:hidden border-t border-[var(--border-hairline)] bg-[var(--bg-surface)] px-5 py-4 shadow-[0_16px_32px_-12px_rgba(15,23,42,0.2)]"
          >
            <nav aria-label="Mobile Navigation" className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => {
                const isActive =
                  item.type === 'route' && activeRoute === item.route;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className={`flex items-center justify-between min-h-[44px] px-3 rounded-xl text-left text-[15px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-[#7047EB]/10 text-[#7047EB] dark:text-[#8B6BFF]'
                        : 'text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
                    }`}
                  >
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="mt-4 pt-4 border-t border-[var(--border-hairline)] flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  onNavigate('/signin');
                }}
                className="min-h-[44px] w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 text-sm font-medium text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-subtle)]"
              >
                Sign In
              </button>
              <CTAButton
                size="md"
                variant="primary"
                className="w-full"
                onClick={() => {
                  setMobileOpen(false);
                  onNavigate('/onboarding');
                }}
              >
                Get Started
              </CTAButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
