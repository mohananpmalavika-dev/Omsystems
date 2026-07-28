import { ComponentDetailPage } from "@/components/operational-health/component-detail-page";
import { RetentionFleetWidget } from "@/components/operational-health/retention-fleet-widget";
export default function Page() { return <div className="space-y-6"><RetentionFleetWidget detailed/><ComponentDetailPage title="Recording and retention health" component="recording"/></div>; }
