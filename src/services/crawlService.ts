import type {
  CrawlConfigurationData,
  CrawlEventRecord,
  CrawlRun,
  CrawlURLRecord,
  ProjectDomainVerification,
  VerificationMethod,
} from '../types/crawl';
import type { CrawlConfigResponse } from '../types/audit';
import { apiFetch, getAuthHeaders } from './apiClient';

export interface UrlQueryParams {
  search?: string;
  filter?: string;
  sortBy?: 'normalized_url' | 'status_code' | 'depth' | 'issue_count' | 'fetched_at';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export const crawlService = {
  fetchCrawlConfig(projectId: string, signal?: AbortSignal): Promise<CrawlConfigResponse> {
    return apiFetch<CrawlConfigResponse>(
      `/api/projects/${encodeURIComponent(projectId)}/crawl-config`,
      { method: 'GET', signal },
    );
  },

  saveCrawlConfig(
    projectId: string,
    config: Partial<CrawlConfigurationData>,
  ): Promise<{ configuration: CrawlConfigurationData }> {
    return apiFetch<{ configuration: CrawlConfigurationData }>(
      `/api/projects/${encodeURIComponent(projectId)}/crawl-config`,
      {
        method: 'PUT',
        body: JSON.stringify(config),
      },
    );
  },

  verifyDomain(
    projectId: string,
    payload: {
      canonicalDomain: string;
      verificationMethod: VerificationMethod;
      crawlPolicyApproved: boolean;
    },
  ): Promise<{ verification: ProjectDomainVerification }> {
    return apiFetch<{ verification: ProjectDomainVerification }>(
      `/api/projects/${encodeURIComponent(projectId)}/verify-domain`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  startCrawl(
    projectId: string,
    configuration?: Partial<CrawlConfigurationData>,
  ): Promise<{ crawlRun: CrawlRun }> {
    return apiFetch<{ crawlRun: CrawlRun }>(
      `/api/projects/${encodeURIComponent(projectId)}/crawls`,
      {
        method: 'POST',
        body: JSON.stringify({ configuration }),
      },
    );
  },

  listProjectCrawls(projectId: string): Promise<{ crawls: CrawlRun[] }> {
    return apiFetch<{ crawls: CrawlRun[] }>(
      `/api/projects/${encodeURIComponent(projectId)}/crawls`,
      { method: 'GET' },
    );
  },

  fetchCrawlDetails(crawlId: string): Promise<{
    crawlRun: CrawlRun;
    events: CrawlEventRecord[];
    urls: CrawlURLRecord[];
  }> {
    return apiFetch<{
      crawlRun: CrawlRun;
      events: CrawlEventRecord[];
      urls: CrawlURLRecord[];
    }>(`/api/crawls/${encodeURIComponent(crawlId)}`, { method: 'GET' });
  },

  cancelCrawl(crawlId: string): Promise<{ crawlRun: CrawlRun }> {
    return apiFetch<{ crawlRun: CrawlRun }>(
      `/api/crawls/${encodeURIComponent(crawlId)}/cancel`,
      { method: 'POST' },
    );
  },

  fetchCrawlUrls(
    crawlId: string,
    params: UrlQueryParams = {},
  ): Promise<{
    items: CrawlURLRecord[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.filter) q.set('filter', params.filter);
    if (params.sortBy) q.set('sortBy', params.sortBy);
    if (params.sortDir) q.set('sortDir', params.sortDir);
    if (params.page) q.set('page', String(params.page));
    if (params.pageSize) q.set('pageSize', String(params.pageSize));
    return apiFetch(
      `/api/crawls/${encodeURIComponent(crawlId)}/urls?${q.toString()}`,
      { method: 'GET' },
    );
  },

  async downloadUrlsCsv(crawlId: string, params: UrlQueryParams = {}): Promise<void> {
    const q = new URLSearchParams({ format: 'csv' });
    if (params.search) q.set('search', params.search);
    if (params.filter) q.set('filter', params.filter);
    const res = await fetch(
      `/api/crawls/${encodeURIComponent(crawlId)}/urls?${q.toString()}`,
      { credentials: 'include', headers: getAuthHeaders() },
    );
    if (!res.ok) {
      throw new Error('Unable to export CSV.');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rovix-urls-${crawlId}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  fetchUrlSnapshot(
    crawlId: string,
    urlId: string,
  ): Promise<{ url: CrawlURLRecord; rawHtml: string | null; renderedDom: string | null }> {
    return apiFetch(
      `/api/crawls/${encodeURIComponent(crawlId)}/urls/${encodeURIComponent(urlId)}/snapshot`,
      { method: 'GET' },
    );
  },

  subscribeCrawlEvents(
    crawlId: string,
    handlers: {
      onSnapshot: (data: { crawlRun: CrawlRun; events: CrawlEventRecord[] }) => void;
      onEvent: (data: { event: CrawlEventRecord; crawlRun: CrawlRun | null }) => void;
      onError?: () => void;
    },
  ): () => void {
    let closed = false;
    let es: EventSource | null = null;

    const connect = async () => {
      let ticketQs = '';
      try {
        const res = await apiFetch<{ ticket: string }>(
          `/api/crawls/${encodeURIComponent(crawlId)}/stream-ticket`,
          { method: 'POST' },
        );
        if (res.ticket) {
          ticketQs = `?ticket=${encodeURIComponent(res.ticket)}`;
        }
      } catch {
        // Fall back to HttpOnly session cookie on same origin
      }

      if (closed) return;

      es = new EventSource(
        `/api/crawls/${encodeURIComponent(crawlId)}/events${ticketQs}`,
        { withCredentials: true },
      );

      es.addEventListener('snapshot', (e) => {
        try {
          const parsed = JSON.parse((e as MessageEvent).data) as {
            crawlRun: CrawlRun;
            events: CrawlEventRecord[];
          };
          handlers.onSnapshot(parsed);
        } catch {
          // Ignore parse error
        }
      });

      es.addEventListener('crawl_event', (e) => {
        try {
          const parsed = JSON.parse((e as MessageEvent).data) as {
            event: CrawlEventRecord;
            crawlRun: CrawlRun | null;
          };
          handlers.onEvent(parsed);
        } catch {
          // Ignore parse error
        }
      });

      es.onerror = () => {
        handlers.onError?.();
      };
    };

    void connect();

    return () => {
      closed = true;
      es?.close();
    };
  },
};
