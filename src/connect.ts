import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { BrowserService } from '@komari/proto/komari/browser/v1/browser_pb';
import { MetricsService } from '@komari/proto/komari/metrics/v1/metrics_pb';
import { PasswordLoginService } from '@komari/proto/komari/credential/v1/credential_pb';
import { getStoredAuthToken, isJwtValid } from './auth';

// Komari 的公开大屏走 Connect：BrowserService 提供站点信息、节点列表与状态推送，
// MetricsService 提供延迟统计。
const transport = createConnectTransport({
  baseUrl: typeof window === 'undefined' ? 'http://localhost' : window.location.origin,
  useBinaryFormat: true,
  fetch: (input, init) => {
    const token = getStoredAuthToken();
    const headers = new Headers(init?.headers);
    // 仅当存储的凭据为 API Token 或有效 JWT 时才注入 Authorization 头，避免非 API 凭据导致后端 401
    if (token && !headers.has('Authorization') && (token.startsWith('komari_api_') || isJwtValid(token))) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return fetch(input, { ...init, headers, credentials: 'same-origin' });
  },
});

export const browser = createClient(BrowserService, transport);
export const metrics = createClient(MetricsService, transport);

// 登录服务专用客户端：原生 Connect-RPC JSON 格式，通过 same-origin Cookie 完成两步验证
const loginTransport = createConnectTransport({
  baseUrl: typeof window === 'undefined' ? 'http://localhost' : window.location.origin,
  useBinaryFormat: false,
  fetch: (input, init) => fetch(input, { ...init, credentials: 'same-origin' }),
});

export const passwordLogin = createClient(PasswordLoginService, loginTransport);

