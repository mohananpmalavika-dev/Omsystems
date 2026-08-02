"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Camera } from "lucide-react";
import { ModulePage, ModuleStatus } from "@/components/module-page";
import { cameraInventoryApi } from "@/lib/api-client";

export default function PrivacyCameraSelectorPage() {
  const [cameraOptions, setCameraOptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadCameras = async () => {
      setLoading(true);
      setError(null);

      try {
        const branchResponse = await cameraInventoryApi.listBranches("device:configure");
        const branchesWithCameras = await Promise.all(
          branchResponse.data.map(async (branch: any) => {
            const camerasResponse = await cameraInventoryApi.listByBranch(branch.id, "analytics:view");
            return camerasResponse.data.map((camera: any) => ({
              ...camera,
              branchName: branch.name,
            }));
          })
        );

        setCameraOptions(branchesWithCameras.flat());
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    void loadCameras();
  }, []);

  return (
    <ModulePage
      eyebrow="Privacy mapping"
      title="Camera purpose assignments"
      description="Select a camera to review its current lawful-purpose mapping and govern how its footage may be processed."
      icon={Camera}
      actionHref="/maintenance/privacy/purposes/new"
      actionLabel="Add purpose"
      count={cameraOptions.length}
      countLabel="cameras"
      loading={loading}
      error={error}
      empty={cameraOptions.length === 0}
      emptyTitle="No cameras available"
      emptyDescription="Cameras with privacy configuration permission will appear here for purpose assignment."
    >
        <div className="privacy-camera-groups">
          {(() => {
            const groups = cameraOptions.reduce((acc: Record<string, any[]>, camera) => {
              const branch = camera.branchName || "Unassigned branch";
              if (!acc[branch]) acc[branch] = [];
              acc[branch].push(camera);
              return acc;
            }, {} as Record<string, any[]>);

            return Object.entries(groups).map(([branchName, cameras]) => (
              <section className="privacy-camera-group" key={branchName}>
                <h2>{branchName}<span>{cameras.length} cameras</span></h2>
                <div className="privacy-camera-list">
                  {cameras.map((camera) => (
                    <Link
                      key={camera.id}
                      href={`/maintenance/privacy/cameras/${encodeURIComponent(camera.id)}/purposes`}
                      className="privacy-camera-row"
                    >
                      <span className="privacy-camera-icon"><Camera size={17} /></span>
                      <div><strong>{camera.name || camera.model || camera.id}</strong><p>{camera.vendor ? camera.vendor.toUpperCase() : "Unknown vendor"}</p></div>
                      <ModuleStatus value={camera.status} />
                    </Link>
                  ))}
                </div>
              </section>
            ));
          })()}
        </div>
    </ModulePage>
  );
}
