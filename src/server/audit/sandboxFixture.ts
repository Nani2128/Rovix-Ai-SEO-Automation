import { SANDBOX_HOST } from './security';

export interface SandboxFixState {
  fixNoindexPage: boolean;
  fixCanonicalConflict: boolean;
  fixBrokenLink: boolean;
  fixMissingMetaDescription: boolean;
  fixInvalidSchema: boolean;
  fixRedirectChain: boolean;
  simulatePartial500: boolean;
}

export const SANDBOX_FIX_STATE: SandboxFixState = {
  fixNoindexPage: false,
  fixCanonicalConflict: false,
  fixBrokenLink: false,
  fixMissingMetaDescription: false,
  fixInvalidSchema: false,
  fixRedirectChain: false,
  simulatePartial500: false,
};

export function resetSandboxFixes(): void {
  SANDBOX_FIX_STATE.fixNoindexPage = false;
  SANDBOX_FIX_STATE.fixCanonicalConflict = false;
  SANDBOX_FIX_STATE.fixBrokenLink = false;
  SANDBOX_FIX_STATE.fixMissingMetaDescription = false;
  SANDBOX_FIX_STATE.fixInvalidSchema = false;
  SANDBOX_FIX_STATE.fixRedirectChain = false;
  SANDBOX_FIX_STATE.simulatePartial500 = false;
}

export interface SandboxHttpResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export function serveSandboxUrl(urlStr: string): SandboxHttpResponse {
  const parsed = new URL(urlStr);
  const path = parsed.pathname === '/' ? '/' : parsed.pathname.replace(/\/+$/, '');
  const base = `https://${SANDBOX_HOST}`;

  if (path === '/robots.txt') {
    return {
      statusCode: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
      body: [
        'User-agent: *',
        'Allow: /',
        'Disallow: /private-admin',
        'Crawl-delay: 0',
        `Sitemap: ${base}/sitemap.xml`,
      ].join('\n'),
    };
  }

  if (path === '/sitemap.xml') {
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/xml; charset=utf-8' },
      body: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${base}/</loc><lastmod>2026-11-15</lastmod></url>
  <url><loc>${base}/noindex-page</loc><lastmod>2026-11-14</lastmod></url>
  <url><loc>${base}/canonical-conflict</loc><lastmod>2026-11-14</lastmod></url>
  <url><loc>${base}/sitemap-only-landing</loc><lastmod>2026-11-12</lastmod></url>
</urlset>`,
    };
  }

  if (path === '/') {
    const brokenLinkHref = SANDBOX_FIX_STATE.fixBrokenLink ? '/other-page' : '/broken-target';
    return {
      statusCode: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Rovix Sandbox Fixture — Technical SEO Audit Target</title>
  <meta name="description" content="Controlled fixture website for deterministic technical SEO crawl and reverification testing." />
  <link rel="canonical" href="${base}/" />
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Rovix Sandbox"}</script>
</head>
<body>
  <h1>Rovix Sandbox SEO Fixture</h1>
  <nav>
    <a href="/noindex-page">Noindex Page</a>
    <a href="/canonical-conflict">Canonical Conflict</a>
    <a href="/other-page">Other Page</a>
    <a href="/redirect-hop-1">Redirect Chain</a>
    <a href="/redirect-loop-a">Redirect Loop</a>
    <a href="${brokenLinkHref}">Target Resource</a>
    <a href="/duplicate-title-a">Duplicate Title A</a>
    <a href="/duplicate-title-b">Duplicate Title B</a>
    <a href="/invalid-schema">Invalid Schema</a>
    <a href="/hreflang-en">Hreflang EN</a>
    <a href="/private-admin">Robots Blocked Admin</a>
    <a href="/js-rendered-hub">JS Rendered Hub</a>
    ${SANDBOX_FIX_STATE.simulatePartial500 ? '<a href="/transient-500">Transient 500</a>' : ''}
  </nav>
</body>
</html>`,
    };
  }

  if (path === '/noindex-page') {
    const robotsMeta = SANDBOX_FIX_STATE.fixNoindexPage
      ? '<meta name="robots" content="index, follow" />'
      : '<meta name="robots" content="noindex, follow" />';
    return {
      statusCode: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Noindex Diagnostic Page — Sandbox Fixture</title>
  <meta name="description" content="Controlled fixture page testing meta robots noindex detection and reverification." />
  ${robotsMeta}
  <link rel="canonical" href="${base}/noindex-page" />
</head>
<body>
  <h1>Noindex Diagnostic Target</h1>
  <a href="/">Back Home</a>
</body>
</html>`,
    };
  }

  if (path === '/canonical-conflict') {
    const canonicalBlock = SANDBOX_FIX_STATE.fixCanonicalConflict
      ? `<link rel="canonical" href="${base}/canonical-conflict" />`
      : `<link rel="canonical" href="${base}/canonical-conflict" />\n  <link rel="canonical" href="${base}/other-page" />`;
    return {
      statusCode: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Canonical Conflict Target — Sandbox Fixture</title>
  <meta name="description" content="Fixture page validating canonical conflict and duplicate canonical tag detection." />
  ${canonicalBlock}
</head>
<body>
  <h1>Canonical Conflict Target</h1>
  <a href="/">Back Home</a>
</body>
</html>`,
    };
  }

  if (path === '/other-page') {
    return {
      statusCode: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Canonical Destination Page — Sandbox Fixture</title>
  <meta name="description" content="Clean canonical destination page on the Rovix controlled sandbox site." />
  <link rel="canonical" href="${base}/other-page" />
</head>
<body>
  <h1>Canonical Destination Page</h1>
  <a href="/">Back Home</a>
</body>
</html>`,
    };
  }

  if (path === '/redirect-hop-1') {
    return {
      statusCode: 301,
      headers: {
        location: SANDBOX_FIX_STATE.fixRedirectChain
          ? `${base}/redirect-target`
          : `${base}/redirect-hop-2`,
      },
      body: '',
    };
  }

  if (path === '/redirect-hop-2') {
    return {
      statusCode: 302,
      headers: { location: `${base}/redirect-target` },
      body: '',
    };
  }

  if (path === '/redirect-target') {
    return {
      statusCode: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Redirect Final Target — Sandbox Fixture</title>
  <meta name="description" content="Final target page resolved after server redirects." />
  <link rel="canonical" href="${base}/redirect-target" />
</head>
<body>
  <h1>Redirect Final Target</h1>
  <a href="/">Back Home</a>
</body>
</html>`,
    };
  }

  if (path === '/redirect-loop-a') {
    return {
      statusCode: 302,
      headers: { location: `${base}/redirect-loop-b` },
      body: '',
    };
  }

  if (path === '/redirect-loop-b') {
    return {
      statusCode: 302,
      headers: { location: `${base}/redirect-loop-a` },
      body: '',
    };
  }

  if (path === '/broken-target') {
    return {
      statusCode: 404,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: '<html><head><title>404 Not Found</title></head><body><h1>Resource Not Found</h1></body></html>',
    };
  }

  if (path === '/duplicate-title-a' || path === '/duplicate-title-b') {
    const metaDesc = SANDBOX_FIX_STATE.fixMissingMetaDescription
      ? `<meta name="description" content="Unique meta description added for ${path} on the Rovix sandbox." />`
      : '';
    return {
      statusCode: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Shared Duplicate Sandbox Title</title>
  ${metaDesc}
  <link rel="canonical" href="${base}${path}" />
</head>
<body>
  <h1>Page ${path}</h1>
  <a href="/">Back Home</a>
</body>
</html>`,
    };
  }

  if (path === '/invalid-schema') {
    const schemaScript = SANDBOX_FIX_STATE.fixInvalidSchema
      ? '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"Valid Schema"}</script>'
      : '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article", broken_json</script>';
    return {
      statusCode: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Structured Data Diagnostic — Sandbox Fixture</title>
  <meta name="description" content="Page containing invalid JSON-LD and heading skip for rule validation." />
  <link rel="canonical" href="${base}/invalid-schema" />
  ${schemaScript}
</head>
<body>
  <h1>Schema Validation Test</h1>
  <h3>Skipped H2 Heading Level</h3>
  <img src="/logo.png" />
  <a href="/">Back Home</a>
</body>
</html>`,
    };
  }

  if (path === '/hreflang-en') {
    return {
      statusCode: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>English Hreflang Page — Sandbox Fixture</title>
  <meta name="description" content="International SEO page testing hreflang validation and return links." />
  <link rel="canonical" href="${base}/hreflang-en" />
  <link rel="alternate" hreflang="en-US" href="${base}/hreflang-en" />
  <link rel="alternate" hreflang="es-ES" href="${base}/hreflang-es" />
  <link rel="alternate" hreflang="xx-INVALID" href="${base}/hreflang-es" />
</head>
<body>
  <h1>English Alternate Target</h1>
  <a href="/hreflang-es">Spanish Version</a>
</body>
</html>`,
    };
  }

  if (path === '/hreflang-es') {
    return {
      statusCode: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Spanish Hreflang Page — Sandbox Fixture</title>
  <meta name="description" content="Spanish alternate page intentionally missing return link to English URL." />
  <link rel="canonical" href="${base}/hreflang-es" />
  <link rel="alternate" hreflang="es-ES" href="${base}/hreflang-es" />
</head>
<body>
  <h1>Versión en Español</h1>
  <a href="/">Back Home</a>
</body>
</html>`,
    };
  }

  if (path === '/private-admin') {
    return {
      statusCode: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: '<html><head><title>Private Admin</title></head><body><h1>Admin</h1></body></html>',
    };
  }

  if (path === '/sitemap-only-landing') {
    return {
      statusCode: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sitemap-Only Orphan Page — Sandbox Fixture</title>
  <meta name="description" content="Discovered exclusively through sitemap.xml with zero internal links." />
  <link rel="canonical" href="${base}/sitemap-only-landing" />
</head>
<body>
  <h1>Sitemap Orphan Landing Page</h1>
</body>
</html>`,
    };
  }

  if (path === '/js-rendered-hub') {
    return {
      statusCode: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>JavaScript Rendered Hub — Sandbox Fixture</title>
  <meta name="description" content="Client-side script injects additional navigation links on hydration." />
  <link rel="canonical" href="${base}/js-rendered-hub" />
</head>
<body>
  <h1>JS Hydration Hub</h1>
  <div id="mount"></div>
  <script>
    (function(){
      var el = document.getElementById('mount');
      if (el) {
        el.innerHTML = '<a href="/js-discovered-feature">Hydrated Feature Link</a>';
      }
    })();
  </script>
</body>
</html>`,
    };
  }

  if (path === '/js-discovered-feature') {
    return {
      statusCode: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>JS Discovered Feature Page — Sandbox Fixture</title>
  <meta name="description" content="Target page only reachable through JavaScript DOM rendering." />
  <link rel="canonical" href="${base}/js-discovered-feature" />
</head>
<body>
  <h1>JavaScript Discovered Target</h1>
  <a href="/">Back Home</a>
</body>
</html>`,
    };
  }

  if (path === '/transient-500') {
    return {
      statusCode: 500,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: '<html><head><title>500 Error</title></head><body><h1>Internal Server Error</h1></body></html>',
    };
  }

  return {
    statusCode: 404,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: '<html><head><title>404 Not Found</title></head><body><h1>Not Found</h1></body></html>',
  };
}
