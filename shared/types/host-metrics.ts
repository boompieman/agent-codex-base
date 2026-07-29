export type HostMetricsCollectorStatus =
  | "waiting"
  | "collecting"
  | "disconnected"
  | "unsupported"
  | "error";

export interface HostCpuMetrics {
  usagePercent: number | null;
  loadAverage: [number, number, number];
}

export interface HostMemoryMetrics {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  usagePercent: number;
}

export interface HostNetworkMetrics {
  receiveBytesPerSecond: number | null;
  transmitBytesPerSecond: number | null;
  interfaces: string[];
}

export interface HostFilesystemMetrics {
  device: string;
  filesystemType: string;
  mountPoint: string;
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  usagePercent: number;
}

export interface HostDiskMetrics {
  readBytesPerSecond: number | null;
  writeBytesPerSecond: number | null;
  filesystems: HostFilesystemMetrics[];
}

export interface HostGpuMetrics {
  index: number;
  uuid: string;
  name: string;
  utilizationPercent: number | null;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  memoryUsagePercent: number;
  temperatureCelsius: number | null;
}

export interface HostMetricsSample {
  sampledAt: string;
  cpu: HostCpuMetrics;
  memory: HostMemoryMetrics;
  network: HostNetworkMetrics;
  disk: HostDiskMetrics;
  gpus: HostGpuMetrics[];
}

export interface HostMetricsSnapshot {
  hostId: number;
  status: HostMetricsCollectorStatus;
  message: string | null;
  samples: HostMetricsSample[];
}
