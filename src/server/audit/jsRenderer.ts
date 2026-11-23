import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';
import type { RenderedDiffSummary } from '../../types/crawl';
import { SANDBOX_HOST, validateOutboundUrl } from './security';
import { extractHtmlSignals, type ExtractedHtmlSignals } from './seoRulesEngine';

const execFileAsync = promisify(execFile);

const CHROME_SHELL_CANDIDATES = [
  '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
];

export function findHeadlessBrowserPath(): string | null {
  for (const p of CHROME_SHELL_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export interface JsRenderOutput {
  renderedHtml: string | null;
  renderedSignals: ExtractedHtmlSignals | null;
  diff: RenderedDiffSummary;
}

export async function renderUrlInIsolatedBrowser(params: {
  url: string;
  rawHtml: string;
  rawSignals: ExtractedHtmlSignals;
  rootDomain: string;
}): Promise<JsRenderOutput> {
  const { url, rawHtml, rawSignals, rootDomain } = params;
  const browserPath = findHeadlessBrowserPath();
  if (!browserPath) {
    return {
      renderedHtml: null,
      renderedSignals: null,
      diff: {
        attempted: true,
        status: 'unavailable',
        reason: 'Headless Chromium worker binary is not installed in this environment.',
        rawTitle: rawSignals.title,
        renderedTitle: null,
        rawCanonical: rawSignals.canonicalLinks[0] ?? null,
        renderedCanonical: null,
        rawH1: rawSignals.h1,
        renderedH1: null,
        rawRobots: rawSignals.robotsDirectives,
        renderedRobots: [],
        addedLinksCount: 0,
        addedLinks: [],
      },
    };
  }

  try {
    const validated = await validateOutboundUrl(url, { allowSandboxHost: true });
    let targetArg: string;
    if (validated.isSandboxFixture && validated.url.hostname === SANDBOX_HOST) {
      // Execute the sandbox HTML inside isolated browser with <base> pointing to sandbox host
      const withBase = rawHtml.includes('<head>')
        ? rawHtml.replace('<head>', `<head><base href="https://${SANDBOX_HOST}/" />`)
        : `<base href="https://${SANDBOX_HOST}/" />${rawHtml}`;
      targetArg = `data:text/html;charset=utf-8,${encodeURIComponent(withBase)}`;
    } else {
      targetArg = validated.url.toString();
    }

    const { stdout } = await execFileAsync(
      browserPath,
      [
        '--headless',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--virtual-time-budget=2500',
        '--dump-dom',
        targetArg,
      ],
      {
        timeout: 10_000,
        maxBuffer: 2 * 1024 * 1024,
      },
    );

    const renderedHtml = stdout?.trim() ?? '';
    if (!renderedHtml || !renderedHtml.includes('<')) {
      throw new Error('Headless browser returned empty DOM output.');
    }

    const renderedSignals = extractHtmlSignals(renderedHtml, url, rootDomain);
    const rawLinkSet = new Set(rawSignals.internalLinks);
    const addedLinks = renderedSignals.internalLinks.filter((lnk) => !rawLinkSet.has(lnk));

    return {
      renderedHtml,
      renderedSignals,
      diff: {
        attempted: true,
        status: 'ok',
        rawTitle: rawSignals.title,
        renderedTitle: renderedSignals.title,
        rawCanonical: rawSignals.canonicalLinks[0] ?? null,
        renderedCanonical: renderedSignals.canonicalLinks[0] ?? null,
        rawH1: rawSignals.h1,
        renderedH1: renderedSignals.h1,
        rawRobots: rawSignals.robotsDirectives,
        renderedRobots: renderedSignals.robotsDirectives,
        addedLinksCount: addedLinks.length,
        addedLinks,
      },
    };
  } catch (err) {
    return {
      renderedHtml: null,
      renderedSignals: null,
      diff: {
        attempted: true,
        status: 'failed',
        reason: err instanceof Error ? err.message : 'JS rendering failed.',
        rawTitle: rawSignals.title,
        renderedTitle: null,
        rawCanonical: rawSignals.canonicalLinks[0] ?? null,
        renderedCanonical: null,
        rawH1: rawSignals.h1,
        renderedH1: null,
        rawRobots: rawSignals.robotsDirectives,
        renderedRobots: [],
        addedLinksCount: 0,
        addedLinks: [],
      },
    };
  }
}
