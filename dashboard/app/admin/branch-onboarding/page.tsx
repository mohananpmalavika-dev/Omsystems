import { FieldVisual } from "@/components/field-visual";
import { AppLayout } from "@/components/app-layout";
import { DeviceManager } from "@/components/device-manager";
import styles from "./branch-onboarding.module.css";

export default function BranchOnboardingPage() {
  return (
    <AppLayout>
      <main className={styles.page}>
        <header className={(styles.header) + " workspace-heading"}>
          <p className={styles.eyebrow}>Branch setup</p>
          <h1>Branch camera onboarding</h1>
          <p>Connect a gateway, discover cameras and recorders, then approve verified devices.</p>
        <FieldVisual /></header>
        <DeviceManager />
      </main>
    </AppLayout>
  );
}
