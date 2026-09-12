import { AudioStreamMonitoringWorkspace } from "@/components/audio-stream-monitoring-workspace";

export const metadata = {
  title: "Audio Stream Monitoring | Sentinel Grid",
  description: "Hardware channel audio decoding, ITU-R BS.1770 level metering, and acoustic anomaly detection.",
};

export default function AudioStreamMonitoringPage() {
  return (
    <div className="w-full">
      <AudioStreamMonitoringWorkspace />
    </div>
  );
}
