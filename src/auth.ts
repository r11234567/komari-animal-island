export interface StoredSession {
  loggedIn: boolean;
  username: string;
}

const STORAGE_KEYS = [
  'token',
  'jwt',
  'session_token',
  'access_token',
  'komari_token',
  'auth_token',
];

/**
 * 尝试从 localStorage、sessionStorage 与 Cookie 中检索鉴权凭据或 JWT
 */
export function getStoredAuthToken(): string | null {
  if (typeof window === 'undefined') return null;

  for (const key of STORAGE_KEYS) {
    try {
      const val = localStorage.getItem(key) || sessionStorage.getItem(key);
      if (val && val.trim()) return val.trim();
    } catch {
      // 某些隐私模式或沙盒下访问 storage 会抛异常
    }
  }

  try {
    const match = document.cookie.match(
      /(?:^|;\s*)(?:session_token|token|jwt|access_token)=([^;]+)/,
    );
    if (match && match[1]) {
      return decodeURIComponent(match[1].trim());
    }
  } catch {
    // 忽略 cookie 访问异常
  }

  return null;
}

/**
 * 保存登录颁发的 Token 到本地存储
 */
export function saveAuthToken(token: string): void {
  if (typeof window === 'undefined' || !token) return;
  try {
    localStorage.setItem('token', token);
    sessionStorage.setItem('token', token);
  } catch {
    // 忽略异常
  }
}

/**
 * 清除已保存的 Token
 */
export function clearAuthToken(): void {
  if (typeof window === 'undefined') return;
  for (const key of STORAGE_KEYS) {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {
      // 忽略异常
    }
  }
}

/**
 * 解析 JWT 负载（Payload）
 */
export function parseJwt(
  token: string,
): { exp?: number; username?: string; sub?: string; user?: string; [key: string]: unknown } | null {
  try {
    const parts = token.trim().split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

/**
 * 校验 JWT 是否格式有效且未过期
 */
export function isJwtValid(token: string): boolean {
  const payload = parseJwt(token);
  if (!payload) return false;
  if (typeof payload.exp === 'number') {
    // 留出 5 秒容差时间
    return payload.exp * 1000 > Date.now() - 5000;
  }
  return true;
}
