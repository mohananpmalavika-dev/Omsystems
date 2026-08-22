import type { FastifyInstance } from "fastify";
import type { ControlPlaneStore } from "../control-plane-store.js";

export interface VirtualGuardConfig {
  branchId: string;
  isArmed: boolean;
  schedule: {
    armTime: string; // e.g. "21:00"
    disarmTime: string; // e.g. "06:00"
    activeDays: number[]; // 0-6 (Sunday to Saturday)
  };
  autoTalkdown: {
    enabled: boolean;
    audioMessage: string;
    repeatCount: number;
    delaySeconds: number;
  };
  escalation: {
    triggerSiren: boolean;
    dispatchPoliceSms: boolean;
    callGuardOnDuty: boolean;
  };
}

export class VirtualGuardSchedulerService {
  private configs = new Map<string, VirtualGuardConfig>();

  constructor(private readonly store: ControlPlaneStore) {
    // Default configuration template
    this.configs.set("default", {
      branchId: "all",
      isArmed: true,
      schedule: {
        armTime: "21:00",
        disarmTime: "06:00",
        activeDays: [0, 1, 2, 3, 4, 5, 6],
      },
      autoTalkdown: {
        enabled: true,
        audioMessage: "Warning: You are trespassing in a secure bank zone. Central Surveillance and Police have been notified.",
        repeatCount: 2,
        delaySeconds: 1,
      },
      escalation: {
        triggerSiren: true,
        dispatchPoliceSms: true,
        callGuardOnDuty: true,
      },
    });
  }

  getBranchConfig(branchId: string): VirtualGuardConfig {
    return this.configs.get(branchId) ?? {
      ...this.configs.get("default")!,
      branchId,
    };
  }

  setBranchConfig(config: VirtualGuardConfig): void {
    this.configs.set(config.branchId, config);
  }

  isCurrentlyArmed(branchId: string): boolean {
    const config = this.getBranchConfig(branchId);
    if (!config.isArmed) return false;

    const now = new Date();
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    const currentMinutes = currentHour * 60 + currentMin;

    const [armH, armM] = config.schedule.armTime.split(":").map(Number);
    const [disarmH, disarmM] = config.schedule.disarmTime.split(":").map(Number);
    const armMinutes = (armH ?? 21) * 60 + (armM ?? 0);
    const disarmMinutes = (disarmH ?? 6) * 60 + (disarmM ?? 0);

    // Over-night window (e.g. 21:00 to 06:00)
    if (armMinutes > disarmMinutes) {
      return currentMinutes >= armMinutes || currentMinutes <= disarmMinutes;
    }
    return currentMinutes >= armMinutes && currentMinutes <= disarmMinutes;
  }

  async triggerNightIntrusionEvent(branchId: string, cameraId: string, detectionType: string) {
    const isArmed = this.isCurrentlyArmed(branchId);
    const config = this.getBranchConfig(branchId);

    return {
      triggeredAt: new Date().toISOString(),
      branchId,
      cameraId,
      detectionType,
      armedState: isArmed ? "ARMED_NIGHT" : "DISARMED_DAY",
      actionTaken: {
        talkdownBroadcasted: isArmed && config.autoTalkdown.enabled,
        message: config.autoTalkdown.audioMessage,
        p1AlertGenerated: isArmed,
        sirenTriggered: isArmed && config.escalation.triggerSiren,
        policeSmsDispatched: isArmed && config.escalation.dispatchPoliceSms,
      },
    };
  }
}
