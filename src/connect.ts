import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { BrowserService } from '@komari/proto/komari/browser/v1/browser_pb';
import { MetricsService } from '@komari/proto/komari/metrics/v1/metrics_pb';

// Komari 的公开大屏走 Connect：BrowserService 提供站点信息、节点列表与状态推送，
// MetricsService 提供延迟统计。公开大屏是全站最高频的请求来源，二进制编码比 JSON
// 小，值得默认开启。
const transport = createConnectTransport({
  baseUrl: typeof window === 'undefined' ? 'http://localhost' : window.location.origin,
  useBinaryFormat: true,
  // 站点可能开启私有访问，凭据必须随请求发出，否则会被判为访客。
  fetch: (input, init) => fetch(input, { ...init, credentials: 'same-origin' }),
});

export const browser = createClient(BrowserService, transport);
export const metrics = createClient(MetricsService, transport);
