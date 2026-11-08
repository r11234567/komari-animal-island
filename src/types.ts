export interface NodeInfo {
  uuid: string;
  name: string;
  region?: string;
  group?: string;
  virtualization?: string;
  arch?: string;
  os?: string;
  cpu_name?: string;
  cpu_cores?: number;
  gpu_name?: string;
  mem_total?: number;
  swap_total?: number;
  disk_total?: number;
  public_remark?: string;
  price?: number;
  billing_cycle?: number;
  auto_renewal?: boolean;
  currency?: string;
  expired_at?: string | null;
  traffic_limit?: number;
  traffic_limit_type?: 'sum' | 'max' | string;
  traffic_reset_day?: number;
  traffic_reset_time?: string;
  traffic_reset_timezone?: string;
  traffic_next_reset?: string;
  traffic_accounting?: {
    resetDay?: number;
    resetTime?: string;
    resetTimezone?: string;
    cycleStart?: string;
    nextReset?: string;
    usedUpBytes?: number;
    usedDownBytes?: number;
    billableBytes?: number;
    countingType?: string;
    cycleAvailable?: boolean;
  };
}

export interface GpuDevice {
  name?: string;
  memory_total?: number;
  memory_used?: number;
  utilization?: number;
  temperature?: number;
}

export interface LiveState {
  cpu?: { usage?: number };
  ram?: { total?: number; used?: number };
  swap?: { total?: number; used?: number };
  disk?: { total?: number; used?: number };
  network?: { up?: number; down?: number; totalUp?: number; totalDown?: number };
  gpu?: {
    count?: number;
    usage?: number;
    average_usage?: number;
    total_memory?: number;
    used_memory?: number;
    devices?: GpuDevice[];
    detailed_info?: GpuDevice[];
  };
  load?: { load1?: number; load5?: number; load15?: number };
  connections?: { tcp?: number; udp?: number };
  uptime?: number;
  process?: number;
  ping?: Record<string, number>;
  updated_at?: string;
}

export interface PublicSettings {
  sitename?: string;
  description?: string;
  disable_password_login?: boolean;
  oauth_enable?: boolean;
  oauth_provider?: string;
  theme_settings?: {
    show_dashboard?: boolean;
    show_footer?: boolean;
    show_latency?: boolean;
    show_network_latency?: boolean;
    network_latency_order?: string;
    data_update_interval?: number;
    offline_nodes_last?: boolean;
    default_sort?: string;
    show_icp?: boolean;
    icp_number?: string;
    icp_url?: string;
    show_police_filing?: boolean;
    police_filing_number?: string;
    police_filing_url?: string;
    footer_content?: string;
    brand_title?: string;
    brand_subtitle?: string;
    brand_logo_url?: string;
  };
}

