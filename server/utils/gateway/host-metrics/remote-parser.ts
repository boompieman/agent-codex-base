import type { HostFilesystemMetrics, HostGpuMetrics } from "~~/shared/types";
import type { RawHostMetricsSample } from "./types";

const BYTES_PER_KIBIBYTE = 1_024;
const BYTES_PER_MEBIBYTE = 1_024 * 1_024;
const BYTES_PER_DISK_SECTOR = 512;
const EXCLUDED_BLOCK_DEVICE = /^(?:loop|ram|zram|dm-|md)/;
const EXCLUDED_FILESYSTEM =
  /^(?:tmpfs|devtmpfs|proc|sysfs|cgroup2?|overlay|squashfs|tracefs|debugfs|securityfs|pstore|configfs|fusectl|mqueue|hugetlbfs|autofs|binfmt_misc|nsfs)$/;

type Section = "cpu" | "load" | "mem" | "route" | "net" | "block" | "disk" | "fs" | "gpu";

interface SampleFrame {
  sampledAtMs: number;
  sections: Record<Section, string[]>;
}

export class HostMetricsRemoteParser {
  private buffer = "";
  private frame: SampleFrame | null = null;
  private section: Section | null = null;

  push(chunk: string) {
    this.buffer += chunk;
    const samples: RawHostMetricsSample[] = [];
    while (true) {
      const newline = this.buffer.indexOf("\n");
      if (newline < 0) break;
      const line = this.buffer.slice(0, newline).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newline + 1);
      const sample = this.consumeLine(line);
      if (sample !== null) samples.push(sample);
    }
    return samples;
  }

  private consumeLine(line: string) {
    if (line.startsWith("@@BEGIN\t")) {
      const sampledAtMs = Number(line.slice("@@BEGIN\t".length));
      if (!Number.isFinite(sampledAtMs)) throw new Error("Invalid host metrics timestamp");
      this.frame = { sampledAtMs, sections: emptySections() };
      this.section = null;
      return null;
    }
    if (line === "@@END") {
      const frame = this.frame;
      this.frame = null;
      this.section = null;
      return frame === null ? null : parseFrame(frame);
    }
    const marker = sectionForMarker(line);
    if (marker !== null) {
      this.section = marker;
      return null;
    }
    if (this.frame !== null && this.section !== null) {
      this.frame.sections[this.section].push(line);
    }
    return null;
  }
}

function emptySections(): Record<Section, string[]> {
  return { cpu: [], load: [], mem: [], route: [], net: [], block: [], disk: [], fs: [], gpu: [] };
}

function sectionForMarker(line: string): Section | null {
  switch (line) {
    case "@@CPU":
      return "cpu";
    case "@@LOAD":
      return "load";
    case "@@MEM":
      return "mem";
    case "@@ROUTE":
      return "route";
    case "@@NET":
      return "net";
    case "@@BLOCK":
      return "block";
    case "@@DISK":
      return "disk";
    case "@@FS":
      return "fs";
    case "@@GPU":
      return "gpu";
    default:
      return null;
  }
}

function parseFrame(frame: SampleFrame): RawHostMetricsSample {
  return {
    sampledAtMs: frame.sampledAtMs,
    cpu: parseCpu(frame.sections.cpu),
    loadAverage: parseLoad(frame.sections.load),
    memory: parseMemory(frame.sections.mem),
    network: parseNetwork(frame.sections.route, frame.sections.net),
    disk: parseDisk(frame.sections.block, frame.sections.disk),
    filesystems: parseFilesystems(frame.sections.fs),
    gpus: parseGpus(frame.sections.gpu),
  };
}

function parseCpu(lines: string[]) {
  const values = lines[0]?.trim().split(/\s+/).slice(1).map(Number) ?? [];
  if (values.length < 4 || values.some((value) => !Number.isFinite(value))) {
    throw new Error("Invalid /proc/stat CPU counters");
  }
  const total = values.slice(0, 8).reduce((sum, value) => sum + value, 0);
  return { total, idle: values[3]! + (values[4] ?? 0) };
}

function parseLoad(lines: string[]): [number, number, number] {
  const values = lines[0]?.trim().split(/\s+/).slice(0, 3).map(Number) ?? [];
  if (values.length !== 3 || values.some((value) => !Number.isFinite(value))) {
    throw new Error("Invalid /proc/loadavg response");
  }
  return [values[0]!, values[1]!, values[2]!];
}

function parseMemory(lines: string[]) {
  const values = new Map<string, number>();
  for (const line of lines) {
    const match = /^(MemTotal|MemAvailable):\s+(\d+)\s+kB$/.exec(line.trim());
    if (match !== null) values.set(match[1]!, Number(match[2]) * BYTES_PER_KIBIBYTE);
  }
  const totalBytes = values.get("MemTotal");
  const availableBytes = values.get("MemAvailable");
  if (totalBytes === undefined || availableBytes === undefined) {
    throw new Error("Invalid /proc/meminfo response");
  }
  return { totalBytes, availableBytes };
}

function parseNetwork(routeLines: string[], netLines: string[]) {
  const defaultInterfaces = new Set<string>();
  for (const line of routeLines.slice(1)) {
    const fields = line.trim().split(/\s+/);
    if (fields[1] === "00000000") defaultInterfaces.add(fields[0]!);
  }
  const counters = new Map<string, { receiveBytes: number; transmitBytes: number }>();
  for (const line of netLines) {
    const match = /^\s*([^:]+):\s*(.+)$/.exec(line);
    if (match === null) continue;
    const values = match[2]!.trim().split(/\s+/).map(Number);
    if (values.length < 9 || values.some((value) => !Number.isFinite(value))) continue;
    counters.set(match[1]!.trim(), { receiveBytes: values[0]!, transmitBytes: values[8]! });
  }
  const interfaces = [...(defaultInterfaces.size > 0 ? defaultInterfaces : counters.keys())]
    .filter((name) => name !== "lo" && counters.has(name))
    .sort();
  return interfaces.reduce(
    (total, name) => {
      const counter = counters.get(name)!;
      total.receiveBytes += counter.receiveBytes;
      total.transmitBytes += counter.transmitBytes;
      return total;
    },
    { receiveBytes: 0, transmitBytes: 0, interfaces },
  );
}

function parseDisk(blockLines: string[], diskLines: string[]) {
  const physicalDevices = new Set(
    blockLines
      .map((line) => line.trim())
      .filter((name) => name !== "" && !EXCLUDED_BLOCK_DEVICE.test(name)),
  );
  let readBytes = 0;
  let writeBytes = 0;
  for (const line of diskLines) {
    const fields = line.trim().split(/\s+/);
    if (!physicalDevices.has(fields[2] ?? "")) continue;
    const sectorsRead = Number(fields[5]);
    const sectorsWritten = Number(fields[9]);
    if (!Number.isFinite(sectorsRead) || !Number.isFinite(sectorsWritten)) continue;
    readBytes += sectorsRead * BYTES_PER_DISK_SECTOR;
    writeBytes += sectorsWritten * BYTES_PER_DISK_SECTOR;
  }
  return { readBytes, writeBytes };
}

function parseFilesystems(lines: string[]): HostFilesystemMetrics[] {
  const filesystems: HostFilesystemMetrics[] = [];
  for (const line of lines.slice(1)) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 7) continue;
    const [device, filesystemType, totalKiB, usedKiB, availableKiB] = fields;
    if (EXCLUDED_FILESYSTEM.test(filesystemType ?? "")) continue;
    const totalBytes = Number(totalKiB) * BYTES_PER_KIBIBYTE;
    const usedBytes = Number(usedKiB) * BYTES_PER_KIBIBYTE;
    const availableBytes = Number(availableKiB) * BYTES_PER_KIBIBYTE;
    if (![totalBytes, usedBytes, availableBytes].every(Number.isFinite) || totalBytes <= 0)
      continue;
    filesystems.push({
      device: device!,
      filesystemType: filesystemType!,
      mountPoint: fields.slice(6).join(" "),
      totalBytes,
      usedBytes,
      availableBytes,
      usagePercent: (usedBytes / totalBytes) * 100,
    });
  }
  return filesystems.sort((left, right) => left.mountPoint.localeCompare(right.mountPoint));
}

function parseGpus(lines: string[]): HostGpuMetrics[] {
  return lines.flatMap((line) => {
    const fields = line.split(/,\s*/);
    if (fields.length < 7) return [];
    const index = Number(fields[0]);
    const memoryUsedMiB = Number(fields[4]);
    const memoryTotalMiB = Number(fields[5]);
    if (
      !Number.isInteger(index) ||
      !Number.isFinite(memoryUsedMiB) ||
      !Number.isFinite(memoryTotalMiB)
    )
      return [];
    const memoryUsedBytes = memoryUsedMiB * BYTES_PER_MEBIBYTE;
    const memoryTotalBytes = memoryTotalMiB * BYTES_PER_MEBIBYTE;
    return [
      {
        index,
        uuid: fields[1]!.trim(),
        name: fields[2]!.trim(),
        utilizationPercent: nullableNumber(fields[3]),
        memoryUsedBytes,
        memoryTotalBytes,
        memoryUsagePercent: memoryTotalBytes > 0 ? (memoryUsedBytes / memoryTotalBytes) * 100 : 0,
        temperatureCelsius: nullableNumber(fields[6]),
      },
    ];
  });
}

function nullableNumber(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
