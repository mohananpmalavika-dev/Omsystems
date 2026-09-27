import { describe, expect, it, vi } from "vitest";
vi.mock("../../edge-agent/src/monitoring/recorder-probe.js", () => ({ probeRecorder: vi.fn() }));
import { probeRecorder } from "../../edge-agent/src/monitoring/recorder-probe.js";
import { RecorderHealthCollector } from "../../edge-agent/src/monitoring/recorder-health-collector.js";

const config = { id: "recorder-1", name: "Recorder", host: "fixture.invalid", port: 80, vendor: "cp-plus", deviceType: "dvr", archiveRetention: { lookbackDays: 90, maxResults: 100, continuityGapSeconds: 30, channels: [{ cameraId: "camera-1", channel: 1 }] } } as const;
describe("recorder collector evidence", () => {
  it("preserves an observed offline result", async () => {
    const result = { metrics: { reachable: false, status: "offline" }, hddStatus: [], reasonCodes: ["connection_failed"], archiveEvidence: [], channelHealth: [] };
    vi.mocked(probeRecorder).mockResolvedValue(result);
    expect(await new RecorderHealthCollector().collect({ ...config, archiveRetention: { ...config.archiveRetention, channels: [...config.archiveRetention.channels] } })).toEqual(result);
  });
  it("does not invent HDD, channel or archive health on a thrown probe", async () => {
    vi.mocked(probeRecorder).mockRejectedValue(new Error("offline"));
    const result = await new RecorderHealthCollector().collect({ ...config, archiveRetention: { ...config.archiveRetention, channels: [...config.archiveRetention.channels] } });
    expect(result.metrics).toMatchObject({ reachable: false, status: "unknown", recordingStatus: "unknown" });
    expect(result.hddStatus).toEqual([]);
    expect(result.channelHealth).toEqual([]);
    expect(result.archiveEvidence[0]).toMatchObject({ status: "unavailable", oldestContinuousAt: null, newestPlayableAt: null, coverageComplete: false, playbackVerified: false });
  });
});
