import { AppLayout } from "@/components/app-layout";
import { DeviceManager } from "@/components/device-manager";

export default function BranchOnboardingPage() {
  return <AppLayout>
    <main className="admin-shell">
      <header className="admin-header">
        <div className="admin-title">
          <div>
            <h1>Branch camera onboarding</h1>
            <p>Enroll an unattended gateway, discover cameras and DVRs, then approve verified devices.</p>
          </div>
        </div>
      </header>
      <section className="admin-panel"><DeviceManager/></section>
    </main>
  </AppLayout>;
}

