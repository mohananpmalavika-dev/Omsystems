import { ComponentDetailPage } from "@/components/operational-health/component-detail-page";
import { InternetFleetWidget } from "@/components/operational-health/internet-fleet-widget";
export default function Page() { return <div className="space-y-6"><InternetFleetWidget detailed/><ComponentDetailPage title="Branch internet health" component="network"/></div>; }
