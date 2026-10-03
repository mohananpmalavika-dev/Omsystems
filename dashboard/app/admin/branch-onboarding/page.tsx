import { FieldVisual } from "@/components/field-visual";
import { AppLayout } from "@/components/app-layout";
import { DeviceManager } from "@/components/device-manager";
import styles from "./branch-onboarding.module.css";
import Link from "next/link";

export default function BranchOnboardingPage() {
  return (
    <AppLayout>
      <main className={styles.page}>
        <header className={(styles.header) + " workspace-heading"}>
          <p className={styles.eyebrow}>Branch setup</p>
          <h1>Branch camera onboarding</h1>
          <p>Connect a gateway, discover cameras and recorders, then approve verified devices.</p>
        <FieldVisual /></header>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <p>Already have an agent at HO, a regional office or a zone office? Connect branches over VPN using that installation.</p>
          <Link href="/admin/edge-agent-branches" className="btn-primary whitespace-nowrap">Connect to existing agent</Link>
        </div>
        <DeviceManager />
      </main>
    </AppLayout>
  );
}
