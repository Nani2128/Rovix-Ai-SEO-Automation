import * as cheerio from 'cheerio';
import type { SitemapEntry } from '../../types/crawl';

export interface ParsedSitemapResult {
  kind: 'urlset' | 'sitemapindex' | 'malformed';
  entries: SitemapEntry[];
  childSitemaps: string[];
  error?: string;
}

export function parseSitemapXml(xmlText: string, sourceUrl: string): ParsedSitemapResult {
  const trimmed = xmlText.trim();
  if (!trimmed || (!trimmed.includes('<urlset') && !trimmed.includes('<sitemapindex'))) {
    return {
      kind: 'malformed',
      entries: [],
      childSitemaps: [],
      error: 'XML root is neither <urlset> nor <sitemapindex>.',
    };
  }

  try {
    const $ = cheerio.load(trimmed, { xmlMode: true });
    const hasSitemapIndex = $('sitemapindex').length > 0;
    const hasUrlset = $('urlset').length > 0;

    if (!hasSitemapIndex && !hasUrlset) {
      return {
        kind: 'malformed',
        entries: [],
        childSitemaps: [],
        error: 'Unable to parse valid <urlset> or <sitemapindex> elements.',
      };
    }

    if (hasSitemapIndex) {
      const childSitemaps: string[] = [];
      $('sitemapindex > sitemap').each((_i, el) => {
        const loc = $(el).find('loc').first().text().trim();
        if (loc) childSitemaps.push(loc);
      });
      if (childSitemaps.length === 0) {
        return {
          kind: 'malformed',
          entries: [],
          childSitemaps: [],
          error: '<sitemapindex> contains zero <sitemap><loc> entries.',
        };
      }
      return { kind: 'sitemapindex', entries: [], childSitemaps };
    }

    const entries: SitemapEntry[] = [];
    let invalidEntries = 0;
    $('urlset > url').each((_i, el) => {
      const loc = $(el).find('loc').first().text().trim();
      const lastmod = $(el).find('lastmod').first().text().trim() || null;
      if (!loc) {
        invalidEntries++;
        return;
      }
      entries.push({ loc, lastmod, sourceSitemap: sourceUrl });
    });

    if (entries.length === 0 && invalidEntries > 0) {
      return {
        kind: 'malformed',
        entries: [],
        childSitemaps: [],
        error: 'Sitemap <url> elements missing valid <loc> tags.',
      };
    }

    return { kind: 'urlset', entries, childSitemaps: [] };
  } catch (err) {
    return {
      kind: 'malformed',
      entries: [],
      childSitemaps: [],
      error: err instanceof Error ? err.message : 'Malformed XML document.',
    };
  }
}
