import type {
  RecorderDriver,
  RecorderDriverConfig,
  RecorderVendor,
} from "../domain/recorder-driver.types.js";
import { CpPlusRecorderDriver } from "../drivers/cpplus-recorder-driver.js";
import {
  DahuaRecorderDriver,
  HikvisionRecorderDriver,
  OnvifRecorderDriver,
} from "../drivers/vendor-recorder-drivers.js";

export class RecorderDriverFactoryService {
  private readonly driverCache = new Map<string, RecorderDriver>();

  createDriver(config: RecorderDriverConfig): RecorderDriver {
    const key = `${config.branchId}:${config.recorderId}`;
    const existing = this.driverCache.get(key);
    if (existing) return existing;

    let driver: RecorderDriver;

    switch (config.vendor) {
      case "CP_PLUS":
        driver = new CpPlusRecorderDriver(config);
        break;
      case "DAHUA":
        driver = new DahuaRecorderDriver(config);
        break;
      case "HIKVISION":
        driver = new HikvisionRecorderDriver(config);
        break;
      case "ONVIF":
      default:
        driver = new OnvifRecorderDriver(config);
        break;
    }

    this.driverCache.set(key, driver);
    return driver;
  }

  detectVendor(hint: string): RecorderVendor {
    const normalized = hint.toUpperCase();
    if (normalized.includes("CP PLUS") || normalized.includes("CPPLUS") || normalized.includes("CP-U")) {
      return "CP_PLUS";
    }
    if (normalized.includes("DAHUA") || normalized.includes("DHI-")) {
      return "DAHUA";
    }
    if (normalized.includes("HIKVISION") || normalized.includes("DS-7") || normalized.includes("DS-8")) {
      return "HIKVISION";
    }
    return "ONVIF";
  }
}

export const recorderDriverFactory = new RecorderDriverFactoryService();
