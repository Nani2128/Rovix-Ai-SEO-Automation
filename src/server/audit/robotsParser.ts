import type { RobotsAnalysisResult, RobotsRuleGroup } from '../../types/crawl';

export function parseRobotsTxt(
  rawText: string,
  fetchedUrl: string,
  statusCode: number | null,
): RobotsAnalysisResult {
  const fetchedAt = new Date().toISOString();
  const accessible = statusCode !== null && statusCode >= 200 && statusCode < 300;
  if (!accessible) {
    return {
      fetchedUrl,
      statusCode,
      accessible: false,
      malformed: statusCode !== 404 && statusCode !== null,
      parseErrors:
        statusCode === 404
          ? ['robots.txt returned 404 Not Found (treated as no crawl restrictions).']
          : [`robots.txt inaccessible with HTTP ${statusCode ?? 'network error'}.`],
      sitemaps: [],
      groups: [],
      rawText,
      fetchedAt,
    };
  }

  const lines = rawText.split(/\r?\n/);
  const groups: RobotsRuleGroup[] = [];
  const sitemaps: string[] = [];
  const parseErrors: string[] = [];

  let currentAgents: string[] = [];
  let currentGroup: RobotsRuleGroup | null = null;
  let seenRuleInBlock = false;

  const commitGroup = () => {
    if (currentGroup && currentAgents.length > 0) {
      for (const ua of currentAgents) {
        groups.push({
          userAgent: ua,
          allow: [...currentGroup.allow],
          disallow: [...currentGroup.disallow],
          crawlDelaySec: currentGroup.crawlDelaySec,
        });
      }
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const clean = lines[i].replace(/#.*$/, '').trim();
    if (!clean) continue;

    const colonIdx = clean.indexOf(':');
    if (colonIdx === -1) {
      parseErrors.push(`Line ${i + 1}: missing ":" directive separator ("${clean.slice(0, 40)}")`);
      continue;
    }

    const directive = clean.slice(0, colonIdx).trim().toLowerCase();
    const value = clean.slice(colonIdx + 1).trim();

    if (directive === 'user-agent') {
      if (seenRuleInBlock) {
        commitGroup();
        currentAgents = [];
        currentGroup = null;
        seenRuleInBlock = false;
      }
      if (value) {
        currentAgents.push(value.toLowerCase());
      } else {
        parseErrors.push(`Line ${i + 1}: empty User-agent directive`);
      }
      if (!currentGroup) {
        currentGroup = { userAgent: value.toLowerCase(), allow: [], disallow: [], crawlDelaySec: null };
      }
    } else if (directive === 'disallow') {
      if (currentAgents.length === 0) {
        parseErrors.push(`Line ${i + 1}: Disallow directive without preceding User-agent`);
        continue;
      }
      seenRuleInBlock = true;
      if (value) currentGroup!.disallow.push(value);
    } else if (directive === 'allow') {
      if (currentAgents.length === 0) {
        parseErrors.push(`Line ${i + 1}: Allow directive without preceding User-agent`);
        continue;
      }
      seenRuleInBlock = true;
      if (value) currentGroup!.allow.push(value);
    } else if (directive === 'crawl-delay') {
      if (currentAgents.length === 0) {
        parseErrors.push(`Line ${i + 1}: Crawl-delay directive without preceding User-agent`);
        continue;
      }
      seenRuleInBlock = true;
      const num = Number(value);
      if (Number.isFinite(num) && num >= 0) {
        currentGroup!.crawlDelaySec = Math.min(num, 30);
      } else {
        parseErrors.push(`Line ${i + 1}: invalid Crawl-delay value "${value}"`);
      }
    } else if (directive === 'sitemap') {
      if (value) sitemaps.push(value);
    }
  }

  commitGroup();

  return {
    fetchedUrl,
    statusCode,
    accessible: true,
    malformed: parseErrors.length > 0,
    parseErrors,
    sitemaps: Array.from(new Set(sitemaps)),
    groups,
    rawText,
    fetchedAt,
  };
}

function matchPattern(urlPath: string, pattern: string): number {
  if (!pattern) return -1;
  const endsAnchor = pattern.endsWith('$');
  const core = endsAnchor ? pattern.slice(0, -1) : pattern;
  const regexStr =
    '^' +
    core
      .split('*')
      .map((seg) => seg.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*') +
    (endsAnchor ? '$' : '');
  try {
    const rx = new RegExp(regexStr);
    return rx.test(urlPath) ? pattern.length : -1;
  } catch {
    return urlPath.startsWith(pattern) ? pattern.length : -1;
  }
}

export function evaluateRobotsForUrl(
  urlPathWithSearch: string,
  groups: readonly RobotsRuleGroup[],
  botName = 'rovixbot',
): { allowed: boolean; matchedRule: string | null; crawlDelaySec: number | null } {
  const lowerBot = botName.toLowerCase();
  const specific = groups.filter((g) => g.userAgent === lowerBot);
  const wildcard = groups.filter((g) => g.userAgent === '*');
  const activeGroups = specific.length > 0 ? specific : wildcard;

  if (activeGroups.length === 0) {
    return { allowed: true, matchedRule: null, crawlDelaySec: null };
  }

  let bestAllowLen = -1;
  let bestAllowRule: string | null = null;
  let bestDisallowLen = -1;
  let bestDisallowRule: string | null = null;
  let crawlDelaySec: number | null = null;

  for (const grp of activeGroups) {
    if (grp.crawlDelaySec !== null) {
      crawlDelaySec = grp.crawlDelaySec;
    }
    for (const rule of grp.allow) {
      const len = matchPattern(urlPathWithSearch, rule);
      if (len > bestAllowLen) {
        bestAllowLen = len;
        bestAllowRule = `Allow: ${rule}`;
      }
    }
    for (const rule of grp.disallow) {
      const len = matchPattern(urlPathWithSearch, rule);
      if (len > bestDisallowLen) {
        bestDisallowLen = len;
        bestDisallowRule = `Disallow: ${rule}`;
      }
    }
  }

  if (bestDisallowLen === -1) {
    return { allowed: true, matchedRule: bestAllowRule, crawlDelaySec };
  }
  if (bestAllowLen >= bestDisallowLen) {
    return { allowed: true, matchedRule: bestAllowRule, crawlDelaySec };
  }
  return { allowed: false, matchedRule: bestDisallowRule, crawlDelaySec };
}
