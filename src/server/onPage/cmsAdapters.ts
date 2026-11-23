import type {
  CmsConnectionRecord,
  CmsPlatform,
  CmsPlatformDescriptor,
  OnPageOptimizationDraftRecord,
} from '../../types/onPage';
import {
  normalizeCanonicalDomain,
  SecurityBlockedError,
  validateOutboundUrl,
} from '../audit/security';
import { encryptSecretPayload } from '../integrations/cryptoVault';

export const CMS_PLATFORM_DESCRIPTORS: CmsPlatformDescriptor[] = [
  {
    platform: 'wordpress',
    label: 'WordPress (REST API / Yoast & RankMath Meta)',
    capabilities: [
      'Manual JSON / Markdown draft handoff export',
      'Encrypted Application Password storage (AES-256-GCM)',
      'Explicit human approval required before any future external push',
    ],
    credentialFields: [
      { key: 'username', label: 'WordPress Username', secret: false },
      { key: 'applicationPassword', label: 'Application Password', secret: true },
    ],
    manualExportFormats: ['json', 'csv', 'markdown'],
    publishRequiresApproval: true,
  },
  {
    platform: 'webflow',
    label: 'Webflow (CMS & Page Metadata API)',
    capabilities: [
      'Manual JSON / Markdown draft handoff export',
      'Encrypted Site API Token storage (AES-256-GCM)',
      'Explicit human approval required before any future external push',
    ],
    credentialFields: [
      { key: 'siteId', label: 'Webflow Site ID', secret: false },
      { key: 'apiToken', label: 'Site API Bearer Token', secret: true },
    ],
    manualExportFormats: ['json', 'csv', 'markdown'],
    publishRequiresApproval: true,
  },
  {
    platform: 'shopify',
    label: 'Shopify (Admin GraphQL / Storefront SEO)',
    capabilities: [
      'Manual JSON / Markdown draft handoff export',
      'Encrypted Admin Access Token storage (AES-256-GCM)',
      'Explicit human approval required before any future external push',
    ],
    credentialFields: [
      { key: 'shopDomain', label: 'MyShopify Domain', secret: false },
      { key: 'adminAccessToken', label: 'Admin API Access Token', secret: true },
    ],
    manualExportFormats: ['json', 'csv', 'markdown'],
    publishRequiresApproval: true,
  },
];

export const VALID_CMS_PLATFORMS = new Set<CmsPlatform>([
  'wordpress',
  'webflow',
  'shopify',
]);

export function getCmsPlatformDescriptor(
  platform: CmsPlatform,
): CmsPlatformDescriptor {
  const found = CMS_PLATFORM_DESCRIPTORS.find((d) => d.platform === platform);
  if (!found) {
    throw new Error(`VALIDATION_ERROR: Unsupported CMS platform "${platform}".`);
  }
  return found;
}

/**
 * Validates CMS site URL against SSRF rules and encrypts credentials with AES-256-GCM.
 * Never claims `connected` status without an explicit verified live handshake; always stores
 * `configured_unverified` and enforces `autoPublishPermitted: false`.
 */
export async function prepareEncryptedCmsConfiguration(params: {
  platform: CmsPlatform;
  siteUrl: string;
  displayName?: string;
  credentials: Record<string, string>;
}): Promise<{
  platform: CmsPlatform;
  displayName: string;
  normalizedSiteUrl: string;
  encryptedCredentialsJson: string;
  status: 'configured_unverified';
}> {
  if (!VALID_CMS_PLATFORMS.has(params.platform)) {
    throw new Error(
      `VALIDATION_ERROR: Unsupported CMS platform "${params.platform}".`,
    );
  }
  const descriptor = getCmsPlatformDescriptor(params.platform);

  const trimmedUrl = params.siteUrl.trim();
  if (!trimmedUrl) {
    throw new Error('VALIDATION_ERROR: CMS site URL is required.');
  }

  // Validate hostname & protocol (blocks localhost, private IPs, metadata endpoints)
  const canonicalHost = normalizeCanonicalDomain(trimmedUrl);
  const fullUrl = /^https?:\/\//i.test(trimmedUrl)
    ? trimmedUrl
    : `https://${trimmedUrl}`;

  // Perform strict SSRF check (allowing sandbox host for authorized test environments)
  try {
    await validateOutboundUrl(fullUrl, { allowSandboxHost: true });
  } catch (err) {
    if (err instanceof SecurityBlockedError) {
      // Allow DNS-unresolvable test domains only if hostname is not private/blocked;
      // always block explicit SSRF scheme/host/IP/credentials violations.
      if (err.code !== 'DNS_RESOLUTION_FAILED' && err.code !== 'DNS_RESOLUTION_EMPTY') {
        throw new Error(`SSRF_BLOCKED: ${err.message}`);
      }
    } else {
      throw err;
    }
  }

  const sanitizedCreds: Record<string, string> = {};
  for (const field of descriptor.credentialFields) {
    const val = (params.credentials[field.key] ?? '').trim();
    if (!val) {
      throw new Error(
        `VALIDATION_ERROR: Missing required CMS credential field "${field.label}".`,
      );
    }
    sanitizedCreds[field.key] = val;
  }

  const encryptedCredentialsJson = encryptSecretPayload({
    platform: params.platform,
    siteUrl: fullUrl,
    credentials: sanitizedCreds,
    storedAt: new Date().toISOString(),
  });

  return {
    platform: params.platform,
    displayName: params.displayName?.trim() || `${descriptor.label.split(' ')[0]} (${canonicalHost})`,
    normalizedSiteUrl: fullUrl,
    encryptedCredentialsJson,
    status: 'configured_unverified',
  };
}

/**
 * Generates a structured manual handoff package for a CMS/development team.
 * Never modifies the live website automatically.
 */
export function buildManualCmsHandoffExport(params: {
  draft: OnPageOptimizationDraftRecord;
  platform: CmsPlatform | 'manual';
  format: 'json' | 'markdown';
  connection: CmsConnectionRecord | null;
}): { filename: string; contentType: string; content: string } {
  const safeSlug =
    params.draft.pageUrl
      .replace(/^https?:\/\//i, '')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'page';

  if (params.format === 'json') {
    const payload = {
      exportType: 'rovix_onpage_manual_handoff',
      autoPublishPermitted: false,
      cmsPlatform: params.platform,
      cmsConnectionStatus: params.connection?.status ?? 'not_configured',
      draftId: params.draft.id,
      versionNumber: params.draft.versionNumber,
      approvalStatus: params.draft.approvalStatus,
      lifecycleStatus: params.draft.lifecycleStatus,
      pageUrl: params.draft.pageUrl,
      originalSnapshot: params.draft.originalSnapshot,
      proposedChanges: params.draft.proposed,
      changeSummary: params.draft.changeSummary,
      exportedAt: new Date().toISOString(),
    };
    return {
      filename: `onpage-draft-v${params.draft.versionNumber}-${safeSlug}.json`,
      contentType: 'application/json; charset=utf-8',
      content: JSON.stringify(payload, null, 2),
    };
  }

  const lines: string[] = [
    `# On-Page Optimization Handoff — Draft v${params.draft.versionNumber}`,
    '',
    `- **Target URL:** ${params.draft.pageUrl}`,
    `- **Approval Status:** ${params.draft.approvalStatus}`,
    `- **Lifecycle Status:** ${params.draft.lifecycleStatus}`,
    `- **CMS Target:** ${params.platform} (${params.connection?.status ?? 'not_configured'})`,
    `- **Note:** Manual implementation handoff only. Rovix AI does not modify live websites automatically.`,
    '',
    '## Title Tag',
    `- **Original:** ${params.draft.originalSnapshot.title ?? '(Missing)'}`,
    `- **Proposed:** ${params.draft.proposed.proposedTitle || '(Unchanged)'}`,
    '',
    '## Meta Description',
    `- **Original:** ${params.draft.originalSnapshot.metaDescription ?? '(Missing)'}`,
    `- **Proposed:** ${params.draft.proposed.proposedMetaDescription || '(Unchanged)'}`,
    '',
    '## Primary H1 Heading',
    `- **Original:** ${params.draft.originalSnapshot.h1 ?? '(Missing)'}`,
    `- **Proposed:** ${params.draft.proposed.proposedH1 || '(Unchanged)'}`,
    '',
    '## Proposed Headings Outline',
    ...(params.draft.proposed.proposedHeadings.length > 0
      ? params.draft.proposed.proposedHeadings.map(
          (h) => `- **${h.tag.toUpperCase()}**: ${h.text}`,
        )
      : ['- (No heading structure changes specified)']),
    '',
    '## Image Alt Updates',
    ...(params.draft.proposed.proposedImageAlts.length > 0
      ? params.draft.proposed.proposedImageAlts.map(
          (img) =>
            `- \`${img.src}\`: "${img.currentAlt ?? '(missing)'}" → "${img.proposedAlt}"`,
        )
      : ['- (No image alt updates specified)']),
    '',
    '## Proposed JSON-LD Schema',
    params.draft.proposed.proposedSchemaJsonLd.trim()
      ? `\`\`\`json\n${params.draft.proposed.proposedSchemaJsonLd.trim()}\n\`\`\``
      : '_No JSON-LD payload specified._',
    '',
    '## Content & Internal Linking Notes',
    params.draft.proposed.proposedContentNotes || '_No additional content notes._',
    ...(params.draft.proposed.proposedInternalLinks.length > 0
      ? [
          '',
          '### Internal Links to Add',
          ...params.draft.proposed.proposedInternalLinks.map(
            (l) => `- Link to \`${l.targetUrl}\` with anchor "${l.anchorText}" — ${l.rationale}`,
          ),
        ]
      : []),
  ];

  return {
    filename: `onpage-draft-v${params.draft.versionNumber}-${safeSlug}.md`,
    contentType: 'text/markdown; charset=utf-8',
    content: lines.join('\n'),
  };
}
