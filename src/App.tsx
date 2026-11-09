import { useEffect, useMemo, useState } from 'react';
import {
  BackTop, Button, Card, Cursor, Divider, Drawer, Footer, Form, FormItem, Icon,
  Image, Input, Loading, Modal, Notification, Progress, Radio, Select, Tabs, Tag, Time,
  Title, Typewriter, Wallet,
} from 'animal-island-ui';
import item351 from 'animal-island-ui/items/item-351.png';
import item477 from 'animal-island-ui/items/item-477.png';
import policeBadge from './assets/police-badge.png';
import { connectLive, loadInitialData, loadNetworkLatencies, loadPingLatencies, loadSession } from './api';
import type { NetworkLatency } from './api';
import type { LiveState, NodeInfo, PublicSettings } from './types';
import { saveAuthToken } from './auth';
import { useNativePasswordLogin } from './hooks/useNativePasswordLogin';
import { normalizeOTP, validOTP } from './utils/otpInput';
import { formatTrafficGB } from './utils/trafficDisplay';

function formatLoginError(error: string): string {
  if (!error) return '';
  const lower = error.toLowerCase();
  if (lower.includes('credential verification failed')) {
    return '账号或通行密码错误，请核对后重试';
  }
  if (lower.includes('invalid argument') || lower.includes('username and password are required')) {
    return '请输入完整的岛民账号与通行密码';
  }
  if (lower.includes('capacity reached') || lower.includes('limit') || lower.includes('too many') || lower.includes('attempt limit')) {
    return '登录尝试过于频繁，请稍后再试';
  }
  if (lower.includes('cooldown') || lower.includes('wait up to 60 seconds')) {
    return '验证码发送过于频繁，请稍候再试';
  }
  if (lower.includes('enter the complete verification code')) {
    return '请输入完整的两步验证码';
  }
  if (lower.includes('unsupported credential prompt')) {
    return '不支持的二次验证类型';
  }
  if (lower.includes('no available second factor')) {
    return '未配置可用的二次验证方式';
  }
  if (lower.includes('login was not completed')) {
    return '验证码错误或已失效，请重新输入';
  }
  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('connection refused')) {
    return '无法连接到 Komari 验证服务，请检查网络';
  }
  return error;
}

type ViewMode = 'grid' | 'list';
type Appearance = 'light' | 'dark';
type SortMode = 'name-asc' | 'name-desc' | 'cpu-desc' | 'memory-desc' | 'network-desc';
type LoginValues = { username?: string; password?: string; twoFactor?: string };

const PASSKEY_REDIRECT_KEY = 'animal-island:passkey-login-redirect';
const PASSKEY_REDIRECT_MAX_AGE_MS = 60_000;

const REGION_NAMES: Record<string, string> = {
  CN: '中国大陆', HK: '中国香港', MO: '中国澳门', TW: '中国台湾',
  SG: '新加坡', US: '美国', JP: '日本', KR: '韩国', DE: '德国',
  GB: '英国', FR: '法国', CA: '加拿大', AU: '澳大利亚', RU: '俄罗斯',
  NL: '荷兰', FI: '芬兰', IN: '印度', BR: '巴西',
};

const regionCode = (region = '') => {
  const value = region.trim();
  if (/^[A-Za-z]{2}$/.test(value)) return value.toUpperCase();
  const points = [...value].map((char) => char.codePointAt(0) ?? 0);
  if (points.length === 2 && points.every((point) => point >= 0x1f1e6 && point <= 0x1f1ff)) {
    return String.fromCharCode(...points.map((point) => point - 0x1f1e6 + 65));
  }
  return value || 'UNKNOWN';
};
const regionLabel = (region = '') => {
  const code = regionCode(region);
  return code === 'UNKNOWN' ? '未知地区' : REGION_NAMES[code] || code;
};
const BRAND_COLORS = ['app-green', 'app-yellow', 'app-orange', 'app-blue', 'app-pink', 'app-teal'] as const;
const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: 'name-asc', label: '名称 A-Z' },
  { key: 'name-desc', label: '名称 Z-A' },
  { key: 'cpu-desc', label: 'CPU 高到低' },
  { key: 'memory-desc', label: '内存高到低' },
  { key: 'network-desc', label: '网络速率高到低' },
];
const SORT_SETTING_VALUES: Record<string, SortMode> = {
  '名称 A-Z': 'name-asc', '名称 Z-A': 'name-desc', 'CPU 高到低': 'cpu-desc',
  '内存高到低': 'memory-desc', '网络速率高到低': 'network-desc',
};
const normalizeSortMode = (value?: string): SortMode => {
  if (value && SORT_SETTING_VALUES[value]) return SORT_SETTING_VALUES[value];
  return SORT_OPTIONS.some((item) => item.key === value) ? value as SortMode : 'name-asc';
};

const clamp = (value: number) => Math.max(0, Math.min(100, value));
const percent = (used = 0, total = 0) => total > 0 ? clamp((used / total) * 100) : 0;
const formatPercent = (value = 0) => `${Math.round(value)}%`;
const formatBytes = (value = 0) => {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.max(0, Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1));
  return `${(value / 1024 ** index).toFixed(index > 2 ? 2 : 1)} ${units[index]}`;
};
const formatSpeed = (value = 0) => `${formatBytes(value)}/s`;
const formatMoney = (value = 0) => Number.isInteger(value) ? String(value) : value.toFixed(2);
const liveLatency = (state?: LiveState) => {
  const values = Object.values(state?.ping || {}).filter((value) => Number.isFinite(value) && value >= 0);
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
};
const latencyColor = (latency: number) => latency <= 150 ? 'app-green' : latency <= 300 ? 'app-yellow' : 'app-red';
const hasBilling = (node: NodeInfo) => Number(node.price) > 0 && Number(node.billing_cycle) !== 0;
const billingCycleLabel = (cycle = 0) => {
  if (cycle === -1) return '一次性付费';
  const presets: Record<number, string> = { 30: '每月', 92: '每季', 365: '每年', 730: '每两年' };
  return presets[cycle] || `每 ${cycle} 天`;
};
const renewalLabel = (node: NodeInfo) => {
  if (Number(node.billing_cycle) === -1) return '长期一次性';
  if (!node.expired_at) return '续期日期未设置';
  const date = new Date(node.expired_at);
  if (!Number.isFinite(date.getTime())) return '续期日期未设置';
  return `${node.auto_renewal ? '自动续期' : '到期'} ${date.toLocaleDateString('zh-CN')}`;
};
const remainingValue = (node: NodeInfo) => {
  const price = Number(node.price);
  const cycle = Number(node.billing_cycle);
  const expires = node.expired_at ? new Date(node.expired_at).getTime() : 0;
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(cycle) || cycle === 0) return 0;
  if (cycle === -1) return Math.round(price * 100) / 100;
  if (cycle < 0 || !Number.isFinite(expires) || expires <= Date.now()) return 0;
  return Math.round(price * Math.min(1, (expires - Date.now()) / (cycle * 86400000)) * 100) / 100;
};
const formatUptime = (seconds = 0) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}天 ${hours}时 ${minutes}分`;
};

const formatTrafficResetSchedule = (day?: number, time = '00:00:00', timezone = 'Asia/Shanghai') => {
  if (day == null) return '';
  if (day === 0) return '不设置月度重置';
  const clock = time.length === 8 && time.endsWith(':00') ? time.slice(0, 5) : time || '00:00';
  return `每月 ${day} 日 ${clock}${timezone ? ` (${timezone})` : ''}`;
};

const formatTrafficResetRemaining = (instant?: string, now = new Date()) => {
  if (!instant) return '';
  const target = new Date(instant);
  const diffMs = target.getTime() - now.getTime();
  if (isNaN(diffMs) || diffMs <= 0) return '即将重置';
  const days = Math.floor(diffMs / (24 * 3600 * 1000));
  const hours = Math.floor((diffMs % (24 * 3600 * 1000)) / (3600 * 1000));
  const minutes = Math.floor((diffMs % (3600 * 1000)) / (60 * 1000));
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`;
  if (minutes > 0) return `${minutes} 分钟`;
  return '即将重置';
};

interface TrafficQuotaInfo {
  used: number;
  limit: number;
  pct: number;
  mode: 'sum' | 'max';
  scheduleText: string;
  remainingText: string;
  badgeText: string;
  nextReset?: string;
}

const getTrafficQuotaInfo = (node: NodeInfo, live?: LiveState): TrafficQuotaInfo | undefined => {
  const limit = node.traffic_limit ?? 0;
  if (!Number.isFinite(limit) || limit <= 0) return undefined;
  const up = live?.network?.totalUp ?? 0;
  const down = live?.network?.totalDown ?? 0;
  const mode = node.traffic_limit_type === 'sum' ? 'sum' : 'max';
  const used = mode === 'sum' ? up + down : Math.max(up, down);
  const pct = Math.min(100, Math.max(0, Math.round((used / limit) * 100)));

  const day = node.traffic_reset_day ?? node.traffic_accounting?.resetDay;
  const time = node.traffic_reset_time || node.traffic_accounting?.resetTime || '00:00:00';
  const timezone = node.traffic_reset_timezone || node.traffic_accounting?.resetTimezone || 'Asia/Shanghai';
  let nextReset = node.traffic_next_reset || node.traffic_accounting?.nextReset;

  if (!nextReset && day && day >= 1 && day <= 31) {
    try {
      const parts = time.split(':').map((s) => Number(s) || 0);
      const now = new Date();
      let candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, parts[0] || 0, parts[1] || 0, parts[2] || 0));
      if (candidate.getTime() <= now.getTime()) {
        candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, day, parts[0] || 0, parts[1] || 0, parts[2] || 0));
      }
      nextReset = candidate.toISOString();
    } catch {
      /* ignore */
    }
  }

  const scheduleText = formatTrafficResetSchedule(day, time, timezone);
  const remainingText = formatTrafficResetRemaining(nextReset);
  const badgeText = remainingText ? `还有 ${remainingText}` : day ? `${day} 日重置` : '';

  return {
    used,
    limit,
    pct,
    mode,
    scheduleText,
    remainingText,
    badgeText,
    nextReset,
  };
};

interface GpuStats {
  hasGpu: boolean;
  hasGpuMem: boolean;
  usage?: number;
  memoryUsed?: number;
  memoryTotal?: number;
  deviceName?: string;
  temperature?: number;
}

function getGpuStats(node?: NodeInfo, live?: LiveState): GpuStats {
  if (!live && !node) {
    return { hasGpu: false, hasGpuMem: false };
  }

  const gpu = live?.gpu as any;
  const rawGpus = (gpu?.detailed_info || gpu?.devices || (Array.isArray(gpu) ? gpu : null) || (live as any)?.gpus) as Array<any> | null;

  let deviceName = node?.gpu_name || gpu?.name || '';
  let usage: number | undefined = undefined;
  let memoryUsed = 0;
  let memoryTotal = 0;
  let temperature: number | undefined = undefined;
  let deviceCount = 0;

  if (rawGpus && Array.isArray(rawGpus) && rawGpus.length > 0) {
    deviceCount = rawGpus.length;
    let sumUsage = 0;
    let measuredCount = 0;

    for (const d of rawGpus) {
      if (!deviceName && d?.name) deviceName = d.name;
      const memUsed = Number(d?.memory_used ?? d?.memoryUsedBytes ?? d?.used ?? 0);
      const memTotal = Number(d?.memory_total ?? d?.memoryTotalBytes ?? d?.total ?? 0);
      if (memUsed > 0) memoryUsed += memUsed;
      if (memTotal > 0) memoryTotal += memTotal;

      const util = d?.utilization ?? d?.utilizationPercent ?? d?.usage;
      if (util !== undefined && util !== null && Number.isFinite(Number(util))) {
        sumUsage += Number(util);
        measuredCount++;
      }
      if (d?.temperature ?? d?.temperatureCelsius) {
        temperature = Number(d.temperature ?? d.temperatureCelsius);
      }
    }

    if (measuredCount > 0) {
      usage = Math.round((sumUsage / measuredCount) * 10) / 10;
    }
  }

  if (usage === undefined) {
    const candidateUsage = gpu?.average_usage ?? gpu?.usage ?? (live as any)?.gpu_usage ?? (live as any)?.gpu;
    if (candidateUsage !== undefined && candidateUsage !== null && Number.isFinite(Number(candidateUsage))) {
      usage = Math.round(Number(candidateUsage) * 10) / 10;
    }
  }

  if (memoryTotal === 0) {
    const memTotal = Number(gpu?.total_memory ?? gpu?.memory_total ?? (live as any)?.gpu_memory_total ?? 0);
    const memUsed = Number(gpu?.used_memory ?? gpu?.memory_used ?? (live as any)?.gpu_memory_used ?? 0);
    if (memTotal > 0) {
      memoryTotal = memTotal;
      memoryUsed = memUsed;
    }
  }

  const hasGpuDeviceName = Boolean(deviceName && !['none', 'unknown', 'null', 'false', '0', ''].includes(deviceName.trim().toLowerCase()));
  const hasUsage = usage !== undefined && Number.isFinite(usage) && usage >= 0;
  const hasMemory = memoryTotal > 0 && Number.isFinite(memoryTotal);

  // 默认不展示：仅当后端返回了有效 GPU 数据（存在设备/指标且数值正常）时展示
  const hasGpu = (deviceCount > 0 || hasGpuDeviceName || Boolean(gpu)) && hasUsage;
  const hasGpuMem = hasMemory;

  return {
    hasGpu,
    hasGpuMem,
    usage: hasGpu ? usage : undefined,
    memoryUsed: hasGpuMem ? memoryUsed : undefined,
    memoryTotal: hasGpuMem ? memoryTotal : undefined,
    deviceName: hasGpuDeviceName ? deviceName : undefined,
    temperature,
  };
}

function Metric({ label, used, total, isTraffic }: { label: string; used?: number; total?: number; isTraffic?: boolean }) {
  const value = percent(used, total);
  const isTrafficMetric = isTraffic || label === '已用' || label === '已用配额';
  const displayValue = label === 'CPU' || label === 'GPU'
    ? `${Math.round(used || 0)}% / ${(total || 100).toFixed(1)}%`
    : isTrafficMetric
      ? `${formatTrafficGB(used)} / ${formatTrafficGB(total)}`
      : `${formatBytes(used)} / ${formatBytes(total)}`;
  return (
    <div className="node-metric">
      <div className="metric-label"><span>{label}</span><strong>{formatPercent(value)}</strong></div>
      <Progress percent={value} size="small" showInfo={false} />
      <span className="metric-value">{displayValue}</span>
    </div>
  );
}

function NodeCard({ node, live, online, latency, networkLatencies = [], showLatency, onDetails }: {
  node: NodeInfo; live?: LiveState; online: boolean; latency?: number | null; networkLatencies?: NetworkLatency[]; showLatency: boolean; onDetails: () => void;
}) {
  const displayedLatency = liveLatency(live) ?? latency;
  const gpuStats = getGpuStats(node, live);
  const trafficQuota = getTrafficQuotaInfo(node, live);

  return (
    <Card className="km-node-card" color={online ? 'default' : 'brown'} pattern={online ? 'app-teal' : 'none'}>
      <div className="node-heading">
        <div>
          <span className={`status-dot ${online ? 'online' : ''}`} aria-hidden="true" />
          <strong>{node.name}</strong>
        </div>
        <div className="node-heading-tags">
          {showLatency && displayedLatency != null && <Tag className="latency-tag" size="small" color={latencyColor(displayedLatency)} variant="soft">{displayedLatency} ms</Tag>}
          <Tag size="small" color={online ? 'app-green' : 'brown'} variant="soft">{online ? '在线' : '离线'}</Tag>
        </div>
      </div>
      <div className="node-meta">
        <span>{online ? formatUptime(live?.uptime) : '等待连接'}</span>
        <span>
          {node.virtualization?.toUpperCase() || 'UNKNOWN'} · {node.region || '未知地区'}
          {gpuStats.deviceName ? ` · ${gpuStats.deviceName}` : ''}
        </span>
      </div>
      <Metric label="CPU" used={live?.cpu?.usage} total={100} />
      <Metric label="内存" used={live?.ram?.used} total={live?.ram?.total || node.mem_total} />
      {gpuStats.hasGpu && <Metric label="GPU" used={gpuStats.usage} total={100} />}
      {gpuStats.hasGpuMem && <Metric label="显存" used={gpuStats.memoryUsed} total={gpuStats.memoryTotal} />}
      <Metric label="硬盘" used={live?.disk?.used} total={live?.disk?.total || node.disk_total} />
      <Metric label="SWAP" used={live?.swap?.used} total={live?.swap?.total || node.swap_total} />
      {trafficQuota && (
        <div className="traffic-quota-box" style={{ marginTop: 8, marginBottom: 8, padding: '8px 10px', background: 'rgba(255,255,255,0.65)', borderRadius: 8, border: '1px dashed #d1cfc7' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, fontSize: 12 }}>
            <span style={{ fontWeight: 600, color: '#433d3c' }}>
              流量配额 ({trafficQuota.mode === 'sum' ? '求和' : '取最大'})
            </span>
            {trafficQuota.badgeText && (
              <Tag size="small" color="app-blue" variant="soft">
                ⟳ {trafficQuota.badgeText}
              </Tag>
            )}
          </div>
          <Metric label="已用" used={trafficQuota.used} total={trafficQuota.limit} />
          {trafficQuota.scheduleText && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#777', marginTop: 4 }}>
              <span>重置: {trafficQuota.scheduleText}</span>
              {trafficQuota.remainingText && <span style={{ color: '#2b7de9', fontWeight: 500 }}>{trafficQuota.remainingText}后重置</span>}
            </div>
          )}
        </div>
      )}
      <div className={`network-grid ${networkLatencies.length ? 'has-network-latency' : ''}`}>
        <div><strong>实时网络</strong><span>下载 {formatSpeed(live?.network?.down)}</span><span>上传 {formatSpeed(live?.network?.up)}</span></div>
        <div><strong>总流量</strong><span>接收 {formatTrafficGB(live?.network?.totalDown)}</span><span>发送 {formatTrafficGB(live?.network?.totalUp)}</span></div>
        {networkLatencies.length > 0 && <div className="network-latency-panel"><strong>三网延迟</strong>{networkLatencies.map((item) => <Tag key={item.taskId} size="small" color={item.latency == null ? 'brown' : latencyColor(item.latency)} variant="soft">{item.name} {item.latency == null ? '—' : item.latency} ms</Tag>)}</div>}
      </div>
      <Button type="dashed" size="small" block icon={<Icon name="icon-map" size={18} />} onClick={onDetails}>
        查看详情
      </Button>
    </Card>
  );
}

function NodeListRow({ node, live, online, networkLatencies = [], onDetails }: {
  node: NodeInfo; live?: LiveState; online: boolean; networkLatencies?: NetworkLatency[]; onDetails: () => void;
}) {
  const gpuStats = getGpuStats(node, live);
  const trafficQuota = getTrafficQuotaInfo(node, live);
  const extraStatsCount = (gpuStats.hasGpu ? 1 : 0) + (gpuStats.hasGpuMem ? 1 : 0);
  const rowClasses = [
    'km-node-row',
    networkLatencies.length ? 'has-network-latency' : '',
    extraStatsCount === 1 ? 'has-gpu-4' : extraStatsCount === 2 ? 'has-gpu-5' : '',
  ].filter(Boolean).join(' ');

  return (
    <Card className={rowClasses} color={online ? 'default' : 'brown'} pattern={online ? 'app-teal' : 'none'}>
      <div className="row-identity">
        <span className={`status-dot ${online ? 'online' : ''}`} aria-hidden="true" />
        <div>
          <strong>{node.name}</strong>
          <span>
            {regionLabel(node.region)} · {node.virtualization?.toUpperCase() || 'UNKNOWN'}
            {gpuStats.deviceName ? ` · ${gpuStats.deviceName}` : ''}
          </span>
        </div>
      </div>
      <div className="row-stat"><span>CPU</span><strong>{formatPercent(live?.cpu?.usage)}</strong></div>
      <div className="row-stat"><span>内存</span><strong>{formatPercent(percent(live?.ram?.used, live?.ram?.total || node.mem_total))}</strong></div>
      {gpuStats.hasGpu && <div className="row-stat"><span>GPU</span><strong>{formatPercent(gpuStats.usage)}</strong></div>}
      {gpuStats.hasGpuMem && <div className="row-stat"><span>显存</span><strong>{formatPercent(percent(gpuStats.memoryUsed, gpuStats.memoryTotal))}</strong></div>}
      <div className="row-stat"><span>硬盘</span><strong>{formatPercent(percent(live?.disk?.used, live?.disk?.total || node.disk_total))}</strong></div>
      <div className="row-stat row-network"><span>网络</span><strong>↓ {formatSpeed(live?.network?.down)} / ↑ {formatSpeed(live?.network?.up)}</strong></div>
      {trafficQuota && (
        <div className="row-stat">
          <span>配额</span>
          <strong>{trafficQuota.pct}% ({formatTrafficGB(trafficQuota.used)} / {formatTrafficGB(trafficQuota.limit)})</strong>
          {trafficQuota.badgeText && <small style={{ fontSize: 10, color: '#2b7de9', display: 'block' }}>⟳ {trafficQuota.badgeText}</small>}
        </div>
      )}
      {networkLatencies.length > 0 && <div className="row-network-latency"><span>三网延迟</span><div>{networkLatencies.map((item) => <Tag key={item.taskId} size="small" color={item.latency == null ? 'brown' : latencyColor(item.latency)} variant="soft">{item.name} {item.latency == null ? '—' : item.latency} ms</Tag>)}</div></div>}
      <Tag size="small" color={online ? 'app-green' : 'brown'}>{online ? '在线' : '离线'}</Tag>
      <Button type="dashed" size="small" icon={<Icon name="icon-map" size={18} />} onClick={onDetails}>详情</Button>
    </Card>
  );
}

interface VerificationPromptInfo {
  length?: number;
  digits?: number;
  charset?: string;
  method?: string;
  destination?: string;
  address?: string;
  cooldown?: number;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<PublicSettings>({});
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [live, setLive] = useState<Record<string, LiveState>>({});
  const [online, setOnline] = useState<string[]>([]);
  const [latencies, setLatencies] = useState<Record<string, number | null>>({});
  const [networkLatencies, setNetworkLatencies] = useState<Record<string, NetworkLatency[]>>({});
  const [pingTasksActive, setPingTasksActive] = useState(false);
  const [connected, setConnected] = useState(false);
  const [demo, setDemo] = useState(false);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const [view, setView] = useState<ViewMode>('grid');
  const [sortMode, setSortMode] = useState<SortMode>('name-asc');
  const [selected, setSelected] = useState<NodeInfo | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [loginTab, setLoginTab] = useState<string>('password');
  const [session, setSession] = useState<{ loggedIn: boolean; username: string }>({ loggedIn: false, username: '' });

  const login = useNativePasswordLogin(async () => {
    setSession({ loggedIn: true, username: loginUsername || '岛民' });
    Notification.success({ message: '欢迎回来，岛民', description: '身份验证成功，正在前往管理后台。' });
    window.setTimeout(() => {
      window.location.href = '/admin/dashboard';
    }, 350);
  }, 'inline');
  const [backgroundVariant] = useState(() => {
    const previous = Number.parseInt(localStorage.getItem('animal-bg-variant') || '-1', 10);
    const next = Number.isFinite(previous) ? (previous + 1) % 4 : 0;
    localStorage.setItem('animal-bg-variant', String(next));
    return next;
  });
  const [appearance, setAppearance] = useState<Appearance>(() =>
    localStorage.getItem('appearance') === 'dark' ? 'dark' : 'light');

  useEffect(() => {
    let mounted = true;
    loadInitialData().then((data) => {
      if (!mounted) return;
      setSettings(data.settings); setNodes(data.nodes); setLive(data.live); setDemo(data.demo);
      if (data.demo) setOnline(Object.keys(data.live));
      window.setTimeout(() => setLoading(false), 650);
    });
    void loadSession().then((sess) => {
      if (mounted) setSession(sess);
    });
    return () => { mounted = false; };
  }, []);

  const configuredUpdateInterval = Number(settings.theme_settings?.data_update_interval);
  const updateIntervalSeconds = Number.isFinite(configuredUpdateInterval)
    ? Math.max(1, Math.min(60, configuredUpdateInterval)) : 3;

  useEffect(() => connectLive((nextOnline, nextLive) => {
    setOnline(nextOnline); setLive(nextLive); setDemo(false);
  }, setConnected, updateIntervalSeconds * 1000), [updateIntervalSeconds]);

  useEffect(() => {
    setSortMode(normalizeSortMode(settings.theme_settings?.default_sort));
  }, [settings.theme_settings?.default_sort]);

  const showNetworkLatency = settings.theme_settings?.show_network_latency === true;
  const networkLatencyNames = useMemo(() => (settings.theme_settings?.network_latency_order || '')
    .split(/[,，]/)
    .map((name) => name.trim())
    .filter(Boolean), [settings.theme_settings?.network_latency_order]);
  const showLatency = settings.theme_settings?.show_latency === true && !showNetworkLatency;

  useEffect(() => {
    if (!showLatency || !nodes.length || demo) {
      setLatencies({});
      setPingTasksActive(false);
      return;
    }
    let active = true;
    const refresh = async () => {
      const result = await loadPingLatencies(nodes.map((node) => node.uuid));
      if (active) {
        setLatencies(result.values);
        setPingTasksActive(result.hasTasks);
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [nodes, demo, showLatency]);

  useEffect(() => {
    if (!showNetworkLatency || !networkLatencyNames.length || !nodes.length || demo) {
      setNetworkLatencies({});
      return;
    }
    let active = true;
    const refresh = async () => {
      const values = await loadNetworkLatencies(nodes.map((node) => node.uuid), networkLatencyNames);
      if (active) setNetworkLatencies(values);
    };
    void refresh();
    const timer = window.setInterval(refresh, 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [nodes, demo, showNetworkLatency, networkLatencyNames.join('\u0000')]);

  useEffect(() => {
    document.documentElement.dataset.appearance = appearance;
    localStorage.setItem('appearance', appearance);
  }, [appearance]);

  useEffect(() => {
    document.body.classList.add('animal-cursor--force');
    return () => document.body.classList.remove('animal-cursor--force');
  }, []);

  const regions = useMemo(() => ['all', ...new Set(nodes.map((node) => regionCode(node.region)).filter((code) => code !== 'UNKNOWN'))], [nodes]);
  const visibleNodes = useMemo(() => nodes.filter((node) => {
    const text = `${node.name} ${node.region || ''} ${regionLabel(node.region)} ${node.group || ''}`.toLowerCase();
    return (group === 'all' || regionCode(node.region) === group) && text.includes(query.trim().toLowerCase());
  }).sort((left, right) => {
    const leftOnline = demo ? Boolean(live[left.uuid]) : online.includes(left.uuid);
    const rightOnline = demo ? Boolean(live[right.uuid]) : online.includes(right.uuid);
    if (settings.theme_settings?.offline_nodes_last !== false && leftOnline !== rightOnline) return leftOnline ? -1 : 1;
    const leftLive = live[left.uuid];
    const rightLive = live[right.uuid];
    let difference = 0;
    if (sortMode === 'name-desc') difference = right.name.localeCompare(left.name, 'zh-CN', { numeric: true, sensitivity: 'base' });
    else if (sortMode === 'cpu-desc') difference = (rightLive?.cpu?.usage || 0) - (leftLive?.cpu?.usage || 0);
    else if (sortMode === 'memory-desc') difference = percent(rightLive?.ram?.used, rightLive?.ram?.total || right.mem_total) - percent(leftLive?.ram?.used, leftLive?.ram?.total || left.mem_total);
    else if (sortMode === 'network-desc') difference = ((rightLive?.network?.down || 0) + (rightLive?.network?.up || 0)) - ((leftLive?.network?.down || 0) + (leftLive?.network?.up || 0));
    else difference = left.name.localeCompare(right.name, 'zh-CN', { numeric: true, sensitivity: 'base' });
    return difference || left.name.localeCompare(right.name, 'zh-CN', { numeric: true, sensitivity: 'base' });
  }), [nodes, group, query, sortMode, live, online, demo, settings.theme_settings?.offline_nodes_last]);
  const onlineCount = demo ? Object.keys(live).length : online.length;
  const liveValues = Object.values(live);
  const averageCpu = liveValues.length ? liveValues.reduce((sum, state) => sum + (state.cpu?.usage || 0), 0) / liveValues.length : 0;
  const totalDown = liveValues.reduce((sum, state) => sum + (state.network?.totalDown || 0), 0);
  const totalUp = liveValues.reduce((sum, state) => sum + (state.network?.totalUp || 0), 0);
  const speedDown = liveValues.reduce((sum, state) => sum + (state.network?.down || 0), 0);
  const speedUp = liveValues.reduce((sum, state) => sum + (state.network?.up || 0), 0);
  const current = selected ? live[selected.uuid] : undefined;
  const currentGpuStats = getGpuStats(selected || undefined, current);
  const theme = settings.theme_settings ?? {};
  const brandTitle = theme.brand_title?.trim() || '机机森友会';
  const brandSubtitle = theme.brand_subtitle?.trim() || '集合啦！';
  const brandLogo = theme.brand_logo_url?.trim() || 'https://wsrv.nl/?url=https%3A%2F%2Fi.mij.rip%2F2026%2F08%2F18%2F3b1499d288d87344ca7a7a0de8c1434d.png';
  const validBrandLogo = brandLogo && (/^data:image\/png(?:;base64)?,/i.test(brandLogo) || /\.png(?:$|[?#])/i.test(brandLogo));

  const oauthTitle = useMemo(() => {
    const provider = settings.oauth_provider;
    if (!provider || provider === 'generic') return 'OAuth';
    if (provider.toLowerCase() === 'github') return 'GitHub';
    return provider.charAt(0).toUpperCase() + provider.slice(1);
  }, [settings.oauth_provider]);

  useEffect(() => {
    document.title = brandTitle;
  }, [brandTitle]);

  useEffect(() => {
    const markPasskeyLogin = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('.km-passkey-login')) return;
      try {
        sessionStorage.setItem(PASSKEY_REDIRECT_KEY, String(Date.now()));
      } catch {
        // Storage may be unavailable in privacy-restricted browser contexts.
      }
    };
    document.addEventListener('click', markPasskeyLogin, true);
    return () => document.removeEventListener('click', markPasskeyLogin, true);
  }, []);

  useEffect(() => {
    if (loading) return;
    let shouldRedirect = false;
    try {
      const markedAt = Number(sessionStorage.getItem(PASSKEY_REDIRECT_KEY));
      if (Number.isFinite(markedAt) && Date.now() - markedAt <= PASSKEY_REDIRECT_MAX_AGE_MS) {
        shouldRedirect = true;
      }
      if (shouldRedirect) sessionStorage.removeItem(PASSKEY_REDIRECT_KEY);
    } catch {
      return;
    }
    if (!shouldRedirect) return;
    void loadSession().then((sess) => {
      if (sess.loggedIn && !window.location.pathname.startsWith('/admin')) {
        setSession(sess);
        window.location.assign('/admin/dashboard');
      }
    });
  }, [loading]);

  const isOtp = login.format.alphanumeric ||
    login.provider.includes('email') ||
    login.provider.includes('telegram') ||
    login.promptInfo?.method === 'notification_otp';
  const targetAddress = (login.promptInfo?.destination as string) ||
    (login.promptInfo?.address as string) ||
    (login.provider.includes('telegram') ? '绑定 Telegram' : '已绑定邮箱');

  useEffect(() => {
    if (login.challenge && isOtp) {
      setResendCooldown(60);
    }
  }, [login.challenge, isOtp]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const openResidentLogin = async () => {
    let currentSession = session;
    if (!currentSession.loggedIn) {
      currentSession = await loadSession();
      setSession(currentSession);
    }
    if (currentSession.loggedIn) {
      window.location.href = '/admin/dashboard';
      return;
    }
    if (settings.oauth_enable && settings.disable_password_login) {
      window.location.href = '/api/oauth';
      return;
    }
    void login.reset();
    setLoginTab(settings.disable_password_login ? (settings.oauth_enable ? 'oauth' : 'passkey') : 'password');
    setLoginOpen(true);
  };

  const triggerPasskeyLogin = () => {
    try {
      sessionStorage.setItem(PASSKEY_REDIRECT_KEY, String(Date.now()));
    } catch {
      // Storage may be unavailable in privacy-restricted browser contexts.
    }
    const pluginBtn = document.querySelector<HTMLButtonElement>(
      '.km-login-form button.km-passkey-login:not(.animal-passkey-trigger)'
    );
    if (pluginBtn) {
      pluginBtn.click();
    } else {
      Notification.info({
        message: '通行密钥验证',
        description: '请通过操作系统的安全密钥提示（Windows Hello / Touch ID）进行身份验证。',
      });
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || login.busy) return;
    const ok = await login.beginFactor();
    if (ok) {
      setResendCooldown(60);
    }
  };

  const handlePasswordLogin = async (values: LoginValues) => {
    const username = values.username?.trim() || '';
    const password = values.password || '';
    if (!username || !password) return;
    setLoginUsername(username);
    await login.start(username, password);
  };

  const handleTwoFactorSubmit = async () => {
    if (login.busy) return;
    if (!login.code.trim()) {
      login.setError('请输入验证码。');
      return;
    }
    if (!validOTP(login.code, login.format)) {
      login.setError(login.format.alphanumeric ? '通知验证码为 8 位字母与数字组合，请核对。' : '身份验证器动态码为 6 位数字，请核对。');
      return;
    }
    await login.verify();
  };

  const savePreferences = (values: { appearance?: string }) => {
    if (values.appearance === 'light' || values.appearance === 'dark') setAppearance(values.appearance);
    setDrawer(false);
    Notification.success({ message: '偏好已保存', description: '设置已保存在当前浏览器中。' });
  };

  return (
    <Cursor forceAll>
      <Loading active={loading} className="loading-screen" />
      <div className={`km-layout bg-variant-${backgroundVariant}`}>
        <header className="km-navbar">
          <div className="brand">
            {validBrandLogo ? <img className="brand-logo" src={brandLogo} alt="" /> : <Icon name="icon-helicopter" size={60} bounce />}
            <div className="brand-copy">
              <div className="brand-tiles" aria-label={brandTitle}>{[...brandTitle].map((char, index) => <Tag key={`${char}-${index}`} size="medium" color={BRAND_COLORS[index % BRAND_COLORS.length]} variant="solid">{char === ' ' ? '\u00a0' : char}</Tag>)}</div>
              <span>{brandSubtitle}</span>
            </div>
          </div>
          <div className="header-actions">
            <Tag color={connected ? 'app-green' : demo ? 'app-yellow' : 'app-red'} size="small">
              {connected ? '实时连接' : demo ? '预览数据' : '正在重连'}
            </Tag>
            <Button type="primary" size="small" icon={<Icon name="icon-design" size={19} />} onClick={() => setDrawer(true)}>设置</Button>
            <Button
              type="primary"
              size="small"
              className={`resident-btn ${session.loggedIn ? 'resident-btn--logged-in' : ''}`}
              icon={<Icon name="icon-variant" size={19} />}
              onClick={openResidentLogin}
              title={session.loggedIn ? `已登录为 ${session.username || '岛民'}，点击进入管理后台` : '岛民登录'}
            >
              {session.loggedIn ? (
                <span className="resident-btn-label">
                  <span className="resident-status-dot" />
                  {session.username && session.username !== 'Guest' ? session.username : '管理后台'}
                </span>
              ) : (
                '岛民'
              )}
            </Button>
            <Time type="hud" />
          </div>
        </header>

        <main className="km-main km-page-instance">
          {theme.show_dashboard !== false && (
            <section className="dashboard-section">
              <Title size="middle" color="app-yellow">监控概览</Title>
              <div className="stats-grid">
                <Card color="app-orange" pattern="app-orange"><Image className="summary-item-icon" src={item351} alt="" width={40} height={40} color="app-orange" preview={false} /><div><span>服务器</span><strong>{onlineCount} / {nodes.length}</strong></div></Card>
                <Card color="app-teal" pattern="app-teal"><Image className="summary-item-icon" src={item477} alt="" width={40} height={40} color="app-teal" preview={false} /><div><span>平均 CPU 使用率</span><strong>{formatPercent(averageCpu)}</strong></div></Card>
                <Card color="app-blue" pattern="app-blue"><Icon name="icon-miles" size={34} /><div className="summary-network"><span>实时网络速率</span><strong><i>↓ 下行</i><b>{formatSpeed(speedDown)}</b></strong><strong><i>↑ 上行</i><b>{formatSpeed(speedUp)}</b></strong></div></Card>
                <Card color="app-pink" pattern="app-pink"><Icon name="icon-critterpedia" size={34} /><div className="summary-network"><span>累计流量</span><strong><i>↓ 下行</i><b>{formatTrafficGB(totalDown)}</b></strong><strong><i>↑ 上行</i><b>{formatTrafficGB(totalUp)}</b></strong></div></Card>
              </div>
            </section>
          )}

          <Divider type="wave-yellow" />
          <section className="server-section km-instance-server-list">
            <div className="section-heading">
              <Title size="middle" color="app-teal">服务器列表</Title>
              <div className="filters">
                <Select options={SORT_OPTIONS} value={sortMode} onChange={(value) => setSortMode(value as SortMode)} />
                <Select options={regions.map((key) => ({ key, label: key === 'all' ? '全部地区' : regionLabel(key) }))} value={group} onChange={setGroup} />
                <Input className="server-search" value={query} onChange={(event) => setQuery(event.target.value)} allowClear onClear={() => setQuery('')} placeholder="搜索服务器…" prefix={<Icon name="icon-map" size={18} />} />
                <Radio size="small" value={view} onChange={(value) => setView(value as ViewMode)} options={[{ label: '卡片', value: 'grid' }, { label: '列表', value: 'list' }]} />
              </div>
            </div>
            {visibleNodes.length ? (
              <div className={`node-grid ${view === 'list' ? 'list-view' : ''}`}>
                {visibleNodes.map((node) => view === 'list'
                  ? <NodeListRow key={`${node.uuid}-${live[node.uuid]?.updated_at || ''}`} node={node} live={live[node.uuid]} online={demo ? Boolean(live[node.uuid]) : online.includes(node.uuid)} networkLatencies={showNetworkLatency ? networkLatencies[node.uuid] : []} onDetails={() => setSelected(node)} />
                  : <NodeCard key={`${node.uuid}-${live[node.uuid]?.updated_at || ''}`} node={node} live={live[node.uuid]} online={demo ? Boolean(live[node.uuid]) : online.includes(node.uuid)} latency={latencies[node.uuid]} networkLatencies={showNetworkLatency ? networkLatencies[node.uuid] : []} showLatency={showLatency && pingTasksActive} onDetails={() => setSelected(node)} />)}
              </div>
            ) : (
              <Card type="dashed" className="empty-state"><Icon name="icon-map" size={54} /><h2>这片岛屿上没有找到服务器</h2><Button type="primary" onClick={() => { setQuery(''); setGroup('all'); }}>清除筛选</Button></Card>
            )}
          </section>
        </main>

        {theme.show_footer !== false && (
          <footer className="km-footer">
            <Button type="primary" block className="footer-link-button" onClick={() => { window.location.href = 'https://github.com/imbigbomb/komari-animal-island'; }}>
              <span>{theme.footer_content || '每台服务器，都是这座岛上的好邻居。'}</span>
              <span>Powered by Komari Monitor.</span>
            </Button>
            {((theme.show_icp && theme.icp_number?.trim()) || (theme.show_police_filing && theme.police_filing_number?.trim())) && <div className="filing-links">
              {(theme.show_icp && theme.icp_number?.trim()) && <a href={theme.icp_url?.trim() || 'https://beian.miit.gov.cn/'} target="_blank" rel="noreferrer">{theme.icp_number}</a>}
              {(theme.show_police_filing && theme.police_filing_number?.trim()) && <a href={theme.police_filing_url?.trim() || undefined} target={theme.police_filing_url?.trim() ? '_blank' : undefined} rel="noreferrer"><img src={policeBadge} alt="" />{theme.police_filing_number}</a>}
            </div>}
            <Footer type="sea" />
          </footer>
        )}
      </div>

      <Modal
        open={Boolean(selected)}
        width="min(720px, calc(100vw - 48px))"
        className="detail-modal"
        maskStyle={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        title={selected && (
          <div className="detail-header">
            <div className="detail-heading-copy">
              <strong>{selected.name}</strong>
              <span>{selected.os || '未知系统版本'}</span>
            </div>
            <div className="detail-tags">
              <Tag color="app-green">{online.includes(selected.uuid) || demo ? '在线' : '离线'}</Tag>
              <Tag color="app-blue">{regionLabel(selected.region)}</Tag>
              <Tag color="app-blue">{selected.virtualization || '未知虚拟化'}</Tag>
              <Tag color="app-blue">{selected.arch || '未知架构'}</Tag>
              {currentGpuStats.deviceName && <Tag color="app-yellow">{currentGpuStats.deviceName}</Tag>}
            </div>
          </div>
        )}
        onClose={() => setSelected(null)}
        footer={<Button type="primary" onClick={() => setSelected(null)}>回到岛屿</Button>}
        typewriter={false}
      >
        {selected && (
          <div className="details">
            <div className="detail-copy">
              {selected.public_remark && <p>{selected.public_remark}</p>}
              <div className="detail-info-grid">
                <Card className={`detail-stat-card${hasBilling(selected) ? '' : ' detail-stat-card--full'}`} pattern="app-teal">
                  <div className="detail-grid">
                    {showLatency && pingTasksActive && (liveLatency(current) ?? latencies[selected.uuid]) != null && (
                      <div className="detail-grid-item"><span>延迟</span><strong>{liveLatency(current) ?? latencies[selected.uuid]} ms</strong></div>
                    )}
                    <div className="detail-grid-item"><span>负载</span><strong>{current?.load?.load1?.toFixed(2) || '—'}</strong></div>
                    <div className="detail-grid-item"><span>进程</span><strong>{current?.process ?? '—'}</strong></div>
                    <div className="detail-grid-item"><span>TCP / UDP</span><strong>{current?.connections?.tcp ?? '—'} / {current?.connections?.udp ?? '—'}</strong></div>
                    <div className="detail-grid-item"><span>运行时间</span><strong>{formatUptime(current?.uptime)}</strong></div>
                    {currentGpuStats.temperature !== undefined && (
                      <div className="detail-grid-item"><span>GPU 温度</span><strong>{currentGpuStats.temperature} °C</strong></div>
                    )}
                  </div>
                </Card>
                {hasBilling(selected) && (
                  <Card className="detail-stat-card detail-billing" pattern="app-teal">
                    <strong>{billingCycleLabel(Number(selected.billing_cycle))} {formatMoney(Number(selected.price))} {selected.currency || '—'}</strong>
                    <small>{renewalLabel(selected)}</small>
                    <span>剩余价值 {selected.currency || '—'}</span>
                    <Wallet value={remainingValue(selected)} size="small" />
                  </Card>
                )}
              </div>
            </div>
            <div className="detail-metrics">
              <Metric label="CPU" used={current?.cpu?.usage} total={100} />
              <Metric label="内存" used={current?.ram?.used} total={current?.ram?.total || selected.mem_total} />
              {currentGpuStats.hasGpu && <Metric label="GPU" used={currentGpuStats.usage} total={100} />}
              {currentGpuStats.hasGpuMem && <Metric label="显存" used={currentGpuStats.memoryUsed} total={currentGpuStats.memoryTotal} />}
              <Metric label="硬盘" used={current?.disk?.used} total={current?.disk?.total || selected.disk_total} />
              {selected && getTrafficQuotaInfo(selected, current) && (() => {
                const q = getTrafficQuotaInfo(selected, current)!;
                return (
                  <div className="detail-traffic-card" style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(255,255,255,0.7)', borderRadius: 10, border: '1px solid #d1cfc7' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <strong style={{ fontSize: 13, color: '#433d3c' }}>流量配额 ({q.mode === 'sum' ? '求和' : '取最大'})</strong>
                      {q.badgeText && <Tag color="app-blue" size="small" variant="soft">⟳ {q.badgeText}</Tag>}
                    </div>
                    <Metric label="已用配额" used={q.used} total={q.limit} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, color: '#666', marginTop: 6 }}>
                      {q.scheduleText && <div>重置周期：{q.scheduleText}</div>}
                      {q.nextReset && (
                        <div>下次重置：{q.nextReset.slice(0, 16).replace('T', ' ')}{q.remainingText ? `（还有 ${q.remainingText}）` : ''}</div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={loginOpen}
        width="min(500px, calc(100vw - 32px))"
        className="login-modal km-login-dialog"
        title="岛民身份验证"
        onClose={() => {
          if (!login.busy) {
            setLoginOpen(false);
            void login.reset();
          }
        }}
        footer={null}
        typewriter={false}
      >
        <div className="login-intro">
          <Typewriter speed={42} trigger={loginOpen}>
            <span>你好，欢迎来到 <strong className="login-brand-highlight">{brandTitle}</strong>！今天的天气真不错呢～</span>
          </Typewriter>
        </div>
        <div className="km-login-form">
          <Tabs
            className="login-tabs"
            activeKey={loginTab}
            onChange={(key) => {
              setLoginTab(key);
              login.setError('');
            }}
            leafAnimation
            items={[
              {
                key: 'password',
                label: '通行密码',
                children: (
                  !settings.disable_password_login ? (
                    login.pending ? (
                      <div className="login-tab-panel two-factor-step-panel">
                        <div className="login-method-badge">
                          <Icon name={isOtp ? 'icon-miles' : 'icon-critterpedia'} size={38} bounce />
                        </div>
                        <h3 className="login-method-heading">
                          {isOtp ? '一次性通知验证码' : '身份验证器安全验证'}
                        </h3>
                        <div className="login-method-text">
                          {isOtp ? (
                            <>
                              已验证账号密码。8 位通知验证码已发送至：
                              <br />
                              <span className="two-factor-target-tag">
                                {targetAddress || '绑定邮箱/TG私聊'}
                              </span>
                              <br />
                              <span className="two-factor-hint">验证码 3 分钟内有效，包含大写字母与数字：</span>
                            </>
                          ) : (
                            <>
                              已验证账号密码。未配置一次性通知渠道，请输入身份验证器（TOTP）的 6 位动态验证码：
                            </>
                          )}
                        </div>

                        <div className="two-factor-input-wrapper">
                          <Input
                            inputMode={login.format.alphanumeric ? 'text' : 'numeric'}
                            autoComplete="one-time-code"
                            placeholder={login.format.alphanumeric ? 'XXXXXXXX' : '000000'}
                            maxLength={login.format.length}
                            value={login.code}
                            className={login.format.alphanumeric ? 'two-factor-input--notification' : 'two-factor-input--totp'}
                            onChange={(e) => {
                              login.setCode(normalizeOTP(e.target.value, login.format));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void handleTwoFactorSubmit();
                              }
                            }}
                            shadow
                            disabled={login.busy}
                            autoFocus
                          />
                        </div>

                        {isOtp && (
                          <div className="two-factor-resend-bar">
                            <button
                              type="button"
                              className="two-factor-resend-btn"
                              disabled={login.busy || resendCooldown > 0}
                              onClick={handleResendOtp}
                            >
                              {resendCooldown > 0 ? `没有收到验证码？重新发送 (${resendCooldown}s)` : '没有收到验证码？重新发送'}
                            </button>
                          </div>
                        )}

                        {login.error && <div className="login-error" role="alert">{formatLoginError(login.error)}</div>}
                        <div className="two-factor-actions">
                          <Button
                            type="primary"
                            block
                            loading={login.busy}
                            disabled={login.busy || !validOTP(login.code, login.format)}
                            onClick={handleTwoFactorSubmit}
                          >
                            完成验证并上岛
                          </Button>
                          <Button
                            type="dashed"
                            block
                            disabled={login.busy}
                            onClick={() => void login.reset()}
                          >
                            返回修改账号密码
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Form layout="vertical" onFinish={(values) => void handlePasswordLogin(values as LoginValues)} requiredMark={false} className="login-tab-panel">
                        <FormItem label="岛民账号" name="username" rules={[{ required: true, message: '请输入岛民账号' }]}>
                          <Input autoComplete="username" placeholder="请输入账号" shadow disabled={login.busy} />
                        </FormItem>
                        <FormItem label="通行密码" name="password" rules={[{ required: true, message: '请输入通行密码' }]}>
                          <Input type="password" autoComplete="current-password" placeholder="请输入密码" shadow disabled={login.busy} />
                        </FormItem>
                        {login.error && <div className="login-error" role="alert">{formatLoginError(login.error)}</div>}
                        <FormItem className="login-submit-item">
                          <Button type="primary" htmlType="submit" block loading={login.busy}>上岛</Button>
                        </FormItem>
                      </Form>
                    )
                  ) : (
                    <div className="login-tab-panel login-method-disabled">
                      <p>当前站点已禁用密码登录，请选择通行密钥或第三方方式登岛。</p>
                    </div>
                  )
                ),
              },
              {
                key: 'passkey',
                label: '通行密钥',
                children: (
                  <div className="login-tab-panel login-method-card">
                    <div className="login-method-badge">
                      <Icon name="icon-diy" size={38} bounce />
                    </div>
                    <h3 className="login-method-heading">通行密钥快捷登岛</h3>
                    <p className="login-method-text">
                      支持使用 Windows Hello、Touch ID、Face ID 或 FIDO2 安全硬件密钥直接登岛，免去输入密码。
                    </p>
                    <button
                      type="button"
                      className="km-passkey-login animal-passkey-trigger"
                      onClick={triggerPasskeyLogin}
                      disabled={login.busy}
                    >
                      <span className="passkey-btn-leaf">🍃</span>
                      <span>通过通行密钥登录</span>
                    </button>
                  </div>
                ),
              },
              {
                key: 'oauth',
                label: `${oauthTitle} 登录`,
                children: (
                  <div className="login-tab-panel login-method-card">
                    <div className="login-method-badge">
                      <Icon name="icon-miles" size={38} bounce />
                    </div>
                    <h3 className="login-method-heading">{oauthTitle} 快捷登岛</h3>
                    <p className="login-method-text">
                      使用已授权绑定的 {oauthTitle} 账号完成验证，一键登岛。
                    </p>
                    <Button
                      type="primary"
                      block
                      disabled={login.busy || !settings.oauth_enable}
                      onClick={() => { window.location.href = '/api/oauth'; }}
                    >
                      {settings.oauth_enable ? `使用 ${oauthTitle} 账号登岛` : `站点未开启 ${oauthTitle} 登录`}
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </div>
      </Modal>

      <Drawer open={drawer} title="岛屿显示设置" onClose={() => setDrawer(false)} footer={null}>
        <Form layout="vertical" initialValues={{ appearance }} onFinish={savePreferences} requiredMark="optional">
          <FormItem label="外观" name="appearance"><Radio direction="vertical" options={[{ value: 'light', label: '白天岛屿' }, { value: 'dark', label: '夜间岛屿' }]} /></FormItem>
          <FormItem><Button type="primary" htmlType="submit" block loading={false}>保存偏好</Button></FormItem>
        </Form>
      </Drawer>
      <BackTop visibilityHeight={300} />
    </Cursor>
  );
}
