import { cpus, freemem, totalmem } from "node:os";
import { statfs } from "node:fs/promises";

interface CpuSnapshot { idle: number; total: number }

export interface EdgeResourceMetrics {
  cpuUsedPercent: number | null;
  memoryUsedPercent: number | null;
  diskUsedPercent: number | null;
  diskFreeBytes: number | null;
  reasonCodes: string[];
}

export interface EdgeResourceSamplerDependencies {
  cpuSnapshot?: () => CpuSnapshot;
  memorySnapshot?: () => { free: number; total: number };
  diskSnapshot?: (path: string) => Promise<{ blocks: number; availableBlocks: number; blockSize: number }>;
}

/**
 * Measures host resource use from consecutive CPU ticks and filesystem stats.
 * The first CPU sample is intentionally unknown: a single cumulative CPU
 * counter cannot be converted into a meaningful utilization percentage.
 */
export class EdgeResourceSampler {
  private previousCpu: CpuSnapshot | undefined;

  constructor(private readonly dependencies: EdgeResourceSamplerDependencies = {}) {}

  async sample(diskPath: string): Promise<EdgeResourceMetrics> {
    const cpu = (this.dependencies.cpuSnapshot ?? readCpuSnapshot)();
    const previousCpu = this.previousCpu;
    this.previousCpu = cpu;
    const cpuUsedPercent = previousCpu && cpu.total > previousCpu.total
      ? round(100 * (1 - Math.max(0, cpu.idle - previousCpu.idle) / (cpu.total - previousCpu.total)))
      : null;
    const memory = (this.dependencies.memorySnapshot ?? (() => ({ free: freemem(), total: totalmem() })))();
    const memoryUsedPercent = memory.total > 0 ? round((1 - memory.free / memory.total) * 100) : null;
    let diskUsedPercent: number | null = null;
    let diskFreeBytes: number | null = null;
    const reasonCodes: string[] = [];
    if (cpuUsedPercent === null) reasonCodes.push("cpu_utilization_warming_up");
    if (memoryUsedPercent === null) reasonCodes.push("memory_utilization_unavailable");
    try {
      const disk = await (this.dependencies.diskSnapshot ?? readDiskSnapshot)(diskPath);
      if (disk.blocks > 0 && disk.availableBlocks >= 0 && disk.blockSize > 0) {
        diskUsedPercent = round(Math.min(100, Math.max(0, (1 - disk.availableBlocks / disk.blocks) * 100)));
        diskFreeBytes = disk.availableBlocks * disk.blockSize;
      } else {
        reasonCodes.push("disk_utilization_unavailable");
      }
    } catch {
      reasonCodes.push("disk_utilization_unavailable");
    }
    return { cpuUsedPercent, memoryUsedPercent, diskUsedPercent, diskFreeBytes, reasonCodes };
  }
}

function readCpuSnapshot(): CpuSnapshot {
  return cpus().reduce((summary, cpu) => {
    const times = cpu.times;
    const total = times.user + times.nice + times.sys + times.idle + times.irq;
    return { idle: summary.idle + times.idle, total: summary.total + total };
  }, { idle: 0, total: 0 });
}

async function readDiskSnapshot(path: string) {
  const stats = await statfs(path);
  return {
    blocks: Number(stats.blocks),
    availableBlocks: Number(stats.bavail),
    blockSize: Number(stats.bsize),
  };
}

function round(value: number) { return Math.round(value * 100) / 100; }
