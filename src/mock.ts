import type { LiveState, NodeInfo, PublicSettings } from './types';

export const mockSettings: PublicSettings = {
  sitename: '狸克的服务器岛',
  description: '一座安静运行、随时可见的服务器小岛',
  oauth_enable: true,
  oauth_provider: 'github',
  theme_settings: { show_dashboard: true, show_footer: true, show_latency: false },
};

export const mockNodes: NodeInfo[] = [
  {
    uuid: 'demo-japan', name: 'Japan AWS Lightsail', region: 'JP', group: '亚洲',
    virtualization: 'kvm', arch: 'amd64', os: 'Debian 12', cpu_name: 'Intel Xeon',
    cpu_cores: 2, mem_total: 442.5 * 1024 ** 2, disk_total: 19.6 * 1024 ** 3,
    traffic_limit: 100 * 1_000_000_000,
    traffic_limit_type: 'sum',
    traffic_reset_day: 1,
    traffic_reset_time: '00:00:00',
    traffic_reset_timezone: 'Asia/Tokyo',
    traffic_next_reset: '2026-12-01T00:00:00+09:00',
  },
  {
    uuid: 'demo-singapore', name: 'Singapore Oracle Arm', region: 'SG', group: '亚洲',
    virtualization: 'kvm', arch: 'arm64', os: 'Ubuntu 24.04', cpu_name: 'Ampere Altra',
    cpu_cores: 4, mem_total: 11.6 * 1024 ** 3, disk_total: 96.8 * 1024 ** 3,
    gpu_name: 'NVIDIA RTX 4090',
    traffic_limit: 500 * 1_000_000_000,
    traffic_limit_type: 'max',
    traffic_reset_day: 15,
    traffic_reset_time: '04:00:00',
    traffic_reset_timezone: 'Asia/Singapore',
    traffic_next_reset: '2026-11-15T04:00:00+08:00',
  },
  {
    uuid: 'demo-germany', name: 'Frankfurt Cloud', region: 'DE', group: '欧洲',
    virtualization: 'kvm', arch: 'amd64', os: 'Alpine Linux', cpu_name: 'AMD EPYC',
    cpu_cores: 2, mem_total: 2 * 1024 ** 3, disk_total: 40 * 1024 ** 3,
    traffic_limit: 1000 * 1_000_000_000,
    traffic_limit_type: 'sum',
    traffic_reset_day: 28,
    traffic_reset_time: '12:00:00',
    traffic_reset_timezone: 'Europe/Berlin',
    traffic_next_reset: '2026-11-28T12:00:00+01:00',
  },
];

export const mockLive: Record<string, LiveState> = {
  'demo-japan': { cpu: { usage: 14 }, ram: { total: 442.5 * 1024 ** 2, used: 225.5 * 1024 ** 2 }, swap: { total: 0, used: 0 }, disk: { total: 19.6 * 1024 ** 3, used: 1.8 * 1024 ** 3 }, network: { up: 1300, down: 483, totalUp: 64.7 * 1_000_000_000, totalDown: 65.4 * 1_000_000_000 }, load: { load1: .18, load5: .14, load15: .11 }, connections: { tcp: 32, udp: 5 }, uptime: 9 * 86400 + 2 * 3600 + 48 * 60, process: 83, updated_at: new Date().toISOString() },
  'demo-singapore': {
    cpu: { usage: 8 },
    ram: { total: 11.6 * 1024 ** 3, used: 717.9 * 1024 ** 2 },
    swap: { total: 0, used: 0 },
    disk: { total: 96.8 * 1024 ** 3, used: 11.9 * 1024 ** 3 },
    gpu: {
      count: 1,
      usage: 35,
      average_usage: 35,
      total_memory: 24 * 1024 ** 3,
      used_memory: 8.6 * 1024 ** 3,
      devices: [{
        name: 'NVIDIA RTX 4090',
        utilization: 35,
        memory_used: 8.6 * 1024 ** 3,
        memory_total: 24 * 1024 ** 3,
        temperature: 54,
      }],
    },
    network: { up: 80400, down: 5400, totalUp: 2.7 * 1_000_000_000, totalDown: 2.7 * 1_000_000_000 },
    load: { load1: .07, load5: .04, load15: .01 },
    connections: { tcp: 59, udp: 4 },
    uptime: 6 * 86400 + 7 * 3600 + 35 * 60,
    process: 104,
    updated_at: new Date().toISOString()
  },
};
