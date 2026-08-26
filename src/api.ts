import { timestampDate, timestampFromDate } from '@bufbuild/protobuf/wkt';
import { AgentStatus } from '@komari/proto/komari/browser/v1/browser_pb';
import type {
  AgentSummary,
  GetPublicInfoResponse,
} from '@komari/proto/komari/browser/v1/browser_pb';
import type { PingStat } from '@komari/proto/komari/metrics/v1/metrics_pb';
import type { AgentReport } from '@komari/proto/komari/report/v1/report_pb';
import { browser, metrics } from './connect';
import { mockLive, mockNodes, mockSettings } from './mock';
import type { LiveState, NodeInfo, PublicSettings } from './types';

const PING_WINDOW_HOURS = 1;
const RECONNECT_DELAY_MS = 2000;

/** protobuf 的 uint64 在 TS 里是 bigint，主题各处按 number 计算。 */
const asNumber = (value?: bigint) => Number(value ?? 0n);

const publicSettingsOf = (info: GetPublicInfoResponse): PublicSettings => ({
  sitename: info.siteName,
  description: info.siteDescription,
  disable_password_login: info.disablePasswordLogin,
  oauth_enable: info.oauthEnabled,
  oauth_provider: info.oauthProvider,
  theme_settings: (info.themeSettings ?? {}) as PublicSettings['theme_settings'],
});

const nodeInfoOf = (agent: AgentSummary): NodeInfo => {
  const basic = agent.basicInfo;
  return {
    uuid: agent.agentId,
    name: agent.name,
    region: basic?.region,
    group: basic?.group,
    virtualization: basic?.virtualization,
    arch: basic?.architecture,
    os: basic?.os,
    cpu_name: basic?.cpuName,
    cpu_cores: basic?.cpuCores,
    mem_total: asNumber(basic?.memoryTotalBytes),
    swap_total: asNumber(basic?.swapTotalBytes),
    disk_total: asNumber(basic?.diskTotalBytes),
    public_remark: basic?.publicRemark,
    price: basic?.price,
    // 一次性付费在数据模型里是负周期，无符号的 billing_cycle_days 装不下，
    // 服务端改用独立标志下发，这里还原成主题各处沿用的 -1。
    billing_cycle: basic?.billingOneTime ? -1 : basic?.billingCycleDays,
    auto_renewal: basic?.autoRenewal,
    currency: basic?.currency,
    expired_at: basic?.expiresAt ? timestampDate(basic.expiresAt).toISOString() : null,
  };
};

/**
 * AgentReport 转实时状态。
 *
 * 不填 ping：状态推送只带主机自身的指标，逐任务延迟由 GetPingStats 提供，
 * 界面已有「实时延迟 ?? 轮询延迟」的取值顺序，留空即自动落到后者。
 */
const liveStateOf = (report?: AgentReport): LiveState => {
  const resources = report?.resources;
  // Agent 会额外上报一条名为 aggregate 的汇总项；没有时退回第一块网卡/磁盘。
  const network = report?.networkInterfaces.find((item) => item.name === 'aggregate')
    ?? report?.networkInterfaces[0];
  const disk = report?.disks.find((item) => item.mountPoint === 'aggregate') ?? report?.disks[0];
  return {
    cpu: { usage: resources?.cpuPercent ?? 0 },
    ram: {
      used: asNumber(resources?.memoryUsedBytes),
      total: asNumber(report?.system?.memoryTotalBytes),
    },
    swap: {
      used: asNumber(resources?.swapUsedBytes),
      total: asNumber(resources?.swapTotalBytes),
    },
    disk: { used: asNumber(disk?.usedBytes), total: asNumber(disk?.totalBytes) },
    network: {
      up: asNumber(network?.bytesSentPerSecond),
      down: asNumber(network?.bytesReceivedPerSecond),
      totalUp: asNumber(network?.bytesSent),
      totalDown: asNumber(network?.bytesReceived),
    },
    load: {
      load1: resources?.loadAverage[0] ?? 0,
      load5: resources?.loadAverage[1] ?? 0,
      load15: resources?.loadAverage[2] ?? 0,
    },
    connections: {
      tcp: asNumber(resources?.tcpConnectionCount),
      udp: asNumber(resources?.udpConnectionCount),
    },
    uptime: report?.system?.uptime ? Number(report.system.uptime.seconds) : 0,
    process: asNumber(resources?.processCount),
    updated_at: report?.observedAt ? timestampDate(report.observedAt).toISOString() : '',
  };
};

export async function loadInitialData() {
  try {
    const [info, list] = await Promise.all([
      browser.getPublicInfo({}),
      browser.listAgents({}),
    ]);
    return {
      settings: publicSettingsOf(info),
      nodes: list.agents.map(nodeInfoOf),
      live: {} as Record<string, LiveState>,
      demo: false,
    };
  } catch {
    return { settings: mockSettings, nodes: mockNodes, live: mockLive, demo: true };
  }
}

/**
 * 当前访客的登录态。
 *
 * 登录与 OAuth 本身仍走 REST：前者需要服务端写下会话 Cookie，后者是浏览器跳转，
 * 都不是 RPC 能表达的形态。
 */
export async function loadSession() {
  try {
    const session = await browser.getSession({});
    return { loggedIn: session.loggedIn, username: session.username };
  } catch {
    // 拿不到会话状态时按未登录处理，登录弹窗仍可用。
    return { loggedIn: false, username: '' };
  }
}

export type NetworkLatency = { taskId: number; name: string; latency: number | null };

/** 服务端已算好统计量，均值缺失时退到最近一次采样。 */
const statLatency = (stat: PingStat) => {
  for (const candidate of [stat.average, stat.latest]) {
    if (candidate !== undefined && Number.isFinite(candidate) && candidate >= 0) return candidate;
  }
  return null;
};

/** 一次取回全部节点的延迟统计，替代过去按节点逐个请求历史记录。 */
const loadPingStats = async (nodeIds: string[]) => {
  const end = new Date();
  const start = new Date(end.getTime() - PING_WINDOW_HOURS * 3_600_000);
  const response = await metrics.getPingStats({
    agentIds: nodeIds,
    startTime: timestampFromDate(start),
    endTime: timestampFromDate(end),
  });
  return response.stats;
};

export async function loadPingLatencies(nodeIds: string[]) {
  const empty = Object.fromEntries(nodeIds.map((uuid) => [uuid, null])) as Record<string, number | null>;

  let hasTasks = true;
  try {
    const tasks = await metrics.listPingTasks({});
    hasTasks = tasks.tasks.length > 0;
  } catch {
    // 拿不到公开任务列表时不下「没有任务」的结论，继续尝试读统计。
    hasTasks = true;
  }
  if (!hasTasks) return { values: empty, hasTasks: false };

  try {
    const totals = new Map<string, { sum: number; count: number }>();
    for (const stat of await loadPingStats(nodeIds)) {
      const latency = statLatency(stat);
      if (latency === null) continue;
      const bucket = totals.get(stat.agentId) ?? { sum: 0, count: 0 };
      bucket.sum += latency;
      bucket.count += 1;
      totals.set(stat.agentId, bucket);
    }
    const values = { ...empty };
    for (const [uuid, bucket] of totals) values[uuid] = Math.round(bucket.sum / bucket.count);
    return { values, hasTasks: true };
  } catch {
    return { values: empty, hasTasks: true };
  }
}

export async function loadNetworkLatencies(nodeIds: string[], taskNames: string[]) {
  const normalizedNames = [...new Set(taskNames.map((name) => name.trim()).filter(Boolean))];
  if (!normalizedNames.length) return {} as Record<string, NetworkLatency[]>;

  try {
    const byNode = new Map<string, Map<string, PingStat>>();
    for (const stat of await loadPingStats(nodeIds)) {
      const name = stat.name.trim();
      if (!name) continue;
      const tasks = byNode.get(stat.agentId) ?? new Map<string, PingStat>();
      // 同名任务保留先到的一条，与过去按名字查找的行为一致。
      if (!tasks.has(name)) tasks.set(name, stat);
      byNode.set(stat.agentId, tasks);
    }
    // 配置里写了但服务端没有对应任务的名字直接跳过，不占位。
    return Object.fromEntries(nodeIds.map((uuid) => {
      const tasks = byNode.get(uuid);
      const values = normalizedNames.flatMap<NetworkLatency>((name) => {
        const stat = tasks?.get(name);
        if (!stat) return [];
        const latency = statLatency(stat);
        return [{
          taskId: Number(stat.taskId),
          name,
          latency: latency === null ? null : Math.round(latency),
        }];
      });
      return [uuid, values] as const;
    })) as Record<string, NetworkLatency[]>;
  } catch {
    return Object.fromEntries(nodeIds.map((uuid) => [uuid, []])) as Record<string, NetworkLatency[]>;
  }
}

export function connectLive(
  onData: (online: string[], live: Record<string, LiveState>) => void,
  onStatus: (connected: boolean) => void,
  requestedInterval = 3000,
) {
  if (!location.protocol.startsWith('http')) return () => undefined;

  // WatchAgentStatus 由服务端推送，主题设置里的「更新间隔」因此改为约束渲染频率：
  // 节点较多时每条事件都触发一次重渲染会明显掉帧。
  const flushInterval = Math.max(1000, Math.min(60000, requestedInterval));
  const online = new Set<string>();
  const live: Record<string, LiveState> = {};

  let stopped = false;
  let controller: AbortController | undefined;
  let flushTimer: number | undefined;
  let pending = false;
  let afterEventId = '';

  const flush = () => {
    flushTimer = undefined;
    if (stopped || !pending) return;
    pending = false;
    onData([...online], { ...live });
  };

  const scheduleFlush = () => {
    pending = true;
    if (flushTimer === undefined) flushTimer = window.setTimeout(flush, flushInterval);
  };

  const wait = (ms: number) => new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, ms);
    if (stopped) {
      window.clearTimeout(timer);
      resolve();
    }
  });

  // 页面不可见时断开流，恢复可见再重连：后台标签页没有渲染需求，
  // 也不必让服务端一直为它推送。
  const waitUntilVisible = () => document.hidden
    ? new Promise<void>((resolve) => {
      const onVisible = () => {
        if (document.hidden && !stopped) return;
        document.removeEventListener('visibilitychange', onVisible);
        resolve();
      };
      document.addEventListener('visibilitychange', onVisible);
    })
    : Promise.resolve();

  const watch = async () => {
    while (!stopped) {
      await waitUntilVisible();
      if (stopped) return;
      controller = new AbortController();
      try {
        for await (const event of browser.watchAgentStatus(
          { agentIds: [], afterEventId },
          { signal: controller.signal, timeoutMs: 0 },
        )) {
          if (stopped) return;
          const agent = event.agent;
          if (!agent) continue;
          // 记住事件位点，重连时不必从头重放。
          afterEventId = agent.eventId || afterEventId;
          if (agent.status === AgentStatus.ONLINE) online.add(agent.agentId);
          else online.delete(agent.agentId);
          live[agent.agentId] = liveStateOf(event.latestReport);
          onStatus(true);
          scheduleFlush();
        }
      } catch {
        if (stopped) return;
        onStatus(false);
      }
      if (stopped) return;
      await wait(RECONNECT_DELAY_MS);
    }
  };

  const handleVisibility = () => {
    if (document.hidden) controller?.abort(new DOMException('Hidden', 'AbortError'));
  };

  document.addEventListener('visibilitychange', handleVisibility);
  void watch();

  return () => {
    stopped = true;
    if (flushTimer !== undefined) window.clearTimeout(flushTimer);
    controller?.abort(new DOMException('Unmounted', 'AbortError'));
    document.removeEventListener('visibilitychange', handleVisibility);
  };
}
