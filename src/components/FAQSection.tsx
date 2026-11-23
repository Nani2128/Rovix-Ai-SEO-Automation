import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { MOTION_EASE } from '../config/motion';

interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

const FAQ_ITEMS: readonly FaqItem[] = [
  {
    id: 'faq-1',
    question: 'How does Rovix AI inspect websites safely without modifying live pages?',
    answer:
      'Rovix AI runs read-only HTTP and optional headless Chromium crawls with SSRF validation, per-domain ownership verification, and rate-limited requests. Every remediation ticket requires role-based approvals and live URL reverification.',
  },
  {
    id: 'faq-2',
    question: 'What happens before Google Search Console or GA4 are connected?',
    answer:
      'Rovix AI never fabricates numbers to make dashboards look populated. Unconnected data sources display honest "Not Connected" or "Waiting for Crawl" states with direct navigation to configure OAuth connectors.',
  },
  {
    id: 'faq-3',
    question: 'How are SEO Health Scores and project completion calculated?',
    answer:
      'SEO Health Scores use documented server-side weighting across Technical SEO, On-Page SEO, Content Quality, Performance, and Indexability derived directly from persisted crawl issues. Project progress reflects verified task weight divided by approved scoped task weight.',
  },
  {
    id: 'faq-4',
    question: 'How are Google OAuth refresh tokens protected on the server?',
    answer:
      'OAuth tokens are stored server-side encrypted with AES-256-GCM authenticated encryption, never sent to browser storage, and scoped strictly per tenant and project.',
  },
  {
    id: 'faq-5',
    question: 'Can we run live Core Web Vitals checks before connecting OAuth?',
    answer:
      'Yes. The PageSpeed Insights v5 diagnostics tool inside Integrations tests public URLs for Performance, SEO, Accessibility, Best Practices, LCP, CLS, INP, and TTFB in real time.',
  },
];

export function FAQSection() {
  const prefersReducedMotion = useReducedMotion();
  const [openId, setOpenId] = useState<string | null>('faq-1');

  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="bg-[var(--bg-canvas)] py-20 sm:py-24 border-t border-[var(--border-hairline)]"
    >
      <div className="mx-auto max-w-[920px] px-5 sm:px-8">
        <div className="text-center">
          <p className="font-display text-xs font-semibold tracking-[0.12em] text-[#7047EB] dark:text-[#8B6BFF] uppercase">
            Frequently Asked Questions
          </p>
          <h2
            id="faq-heading"
            className="mt-2 font-display text-3xl sm:text-[34px] font-bold tracking-tight text-[var(--text-primary)] text-balance"
          >
            Architecture, OAuth security, and data integrity
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-[var(--text-muted)]">
            How Rovix AI structures automated SEO crawling while keeping real data
            traceability and RBAC gates intact.
          </p>
        </div>

        <div className="mt-10 divide-y divide-[var(--border-hairline)] rounded-[20px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-5 sm:px-8">
          {FAQ_ITEMS.map((item) => {
            const isOpen = openId === item.id;
            const panelId = `${item.id}-panel`;
            return (
              <div key={item.id} className="py-5">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenId(isOpen ? null : item.id)}
                  className="flex w-full items-center justify-between gap-4 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#7047EB]"
                >
                  <span className="font-display text-[16px] font-semibold text-[var(--text-primary)]">
                    {item.question}
                  </span>
                  <motion.span
                    animate={prefersReducedMotion ? undefined : { rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.2, ease: MOTION_EASE }}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-subtle)] text-[#7047EB] dark:text-[#8B6BFF]"
                  >
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  </motion.span>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={panelId}
                      initial={
                        prefersReducedMotion
                          ? false
                          : { opacity: 0, height: 0 }
                      }
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={
                        prefersReducedMotion
                          ? undefined
                          : { opacity: 0, height: 0 }
                      }
                      transition={{ duration: 0.24, ease: MOTION_EASE }}
                      className="overflow-hidden"
                    >
                      <p className="pt-3 pr-10 text-[14.5px] leading-[1.65] text-[var(--text-muted)]">
                        {item.answer}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
