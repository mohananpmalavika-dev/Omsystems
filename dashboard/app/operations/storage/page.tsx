import { ComponentDetailPage } from "@/components/operational-health/component-detail-page";
import { HddFleetWidget } from "@/components/operational-health/hdd-fleet-widget";
export default function Page() {
  return <div className="space-y-6"><HddFleetWidget detailed /><ComponentDetailPage title="Storage and disk health" component="storage"/></div>;
}
