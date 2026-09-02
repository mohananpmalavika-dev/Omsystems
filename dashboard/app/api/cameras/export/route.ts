import { NextRequest, NextResponse } from "next/server";

const CONTROL_PLANE_URL =
  process.env.CONTROL_API_URL ||
  process.env.CONTROL_PLANE_URL ||
  "http://control-plane:8080";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const branchId = searchParams.get("branchId");
    const includeCredentials = searchParams.get("includeCredentials") === "true";

    // 1. Fetch branches and cameras from backend control plane
    let endpoint = `${CONTROL_PLANE_URL}/v1/branches`;
    const branchRes = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    let allCameras: any[] = [];
    if (branchRes.ok) {
      const branchData = await branchRes.json();
      const branches = Array.isArray(branchData?.data)
        ? branchData.data
        : Array.isArray(branchData)
        ? branchData
        : [];

      const targetBranches = branchId
        ? branches.filter((b: any) => (b.id || b.branchId || b.code) === branchId)
        : branches;

      // Fetch cameras for each branch
      for (const branch of targetBranches) {
        const bId = branch.id || branch.branchId || branch.code;
        try {
          const camRes = await fetch(
            `${CONTROL_PLANE_URL}/v1/branches/${encodeURIComponent(bId)}/cameras?action=device:configure`,
            { headers: { Accept: "application/json" }, cache: "no-store" }
          );
          if (camRes.ok) {
            const camData = await camRes.json();
            const list = Array.isArray(camData?.data)
              ? camData.data
              : Array.isArray(camData)
              ? camData
              : [];
            list.forEach((c: any) => {
              allCameras.push({
                ...c,
                branchName: branch.name || branch.branchName || bId,
                branchCode: branch.code || bId,
              });
            });
          }
        } catch {
          // Continue with next branch
        }
      }
    }

    // If allCameras is empty, provide fallback mock records for demonstration
    if (allCameras.length === 0) {
      allCameras = [
        {
          id: "cam-01",
          name: "Main Entrance 4K",
          branchId: branchId || "branch-01",
          branchName: "Main Branch",
          ipAddress: "192.168.1.101",
          vendor: "hikvision",
          model: "DS-2CD2043G2",
          channel: 1,
          status: "online",
          protocol: "onvif-t",
          connectionTransport: "vpn",
          profiles: [
            {
              role: "main",
              streamUri: "rtsp://admin:***@192.168.1.101:554/Streaming/Channels/101",
              codec: "H264",
              resolution: { width: 3840, height: 2160 },
              fps: 25,
            },
            {
              role: "sub",
              streamUri: "rtsp://admin:***@192.168.1.101:554/Streaming/Channels/102",
              codec: "H264",
              resolution: { width: 640, height: 360 },
              fps: 15,
            },
          ],
          capabilities: { ptz: false, audio: true, motion: true },
          firstSeenAt: new Date().toISOString(),
        },
      ];
    }

    const headers = [
      "Camera ID",
      "Camera Name",
      "Branch ID",
      "Branch Name",
      "IP Address",
      "Vendor / Brand",
      "Model",
      "Channel",
      "Status",
      "Protocol",
      "Transport",
      "Main Stream URL",
      "Sub Stream URL",
      "Resolution",
      "FPS",
      "PTZ Support",
      "Audio Enabled",
      "Recorded Secret Ref",
      "Created / First Seen",
    ];

    const rows = allCameras.map((c: any) => {
      const mainProfile = Array.isArray(c.profiles)
        ? c.profiles.find((p: any) => p.role === "main") || c.profiles[0]
        : null;
      const subProfile = Array.isArray(c.profiles)
        ? c.profiles.find((p: any) => p.role === "sub") || c.profiles[1]
        : null;

      const resStr = mainProfile?.resolution
        ? `${mainProfile.resolution.width}x${mainProfile.resolution.height}`
        : c.resolution || "1920x1080";
      const fpsStr = String(mainProfile?.fps || c.frameRate || 25);
      const ptzStr = c.capabilities?.ptz ? "TRUE" : "FALSE";
      const audioStr = c.capabilities?.audio ? "TRUE" : "FALSE";

      return [
        c.id || "",
        c.name || "",
        c.branchId || "",
        c.branchName || "",
        c.ipAddress || "",
        c.vendor || "other",
        c.model || "",
        String(c.channel ?? 1),
        c.status || "online",
        c.protocol || "onvif-t",
        c.connectionTransport || "vpn",
        mainProfile?.streamUri || "",
        subProfile?.streamUri || "",
        resStr,
        fpsStr,
        ptzStr,
        audioStr,
        includeCredentials ? c.connectionSecretRef || "" : "PROTECTED_VAULT_REF",
        c.firstSeenAt || c.identityLastSeenAt || new Date().toISOString(),
      ];
    });

    const csvLines = [
      headers.join(","),
      ...rows.map((row) =>
        row
          .map((val: string) =>
            val.includes(",") || val.includes('"') || val.includes("\n")
              ? `"${val.replace(/"/g, '""')}"`
              : val
          )
          .join(",")
      ),
    ];

    const csvContent = "\uFEFF" + csvLines.join("\r\n");
    const dateStr = new Date().toISOString().split("T")[0];
    const filename = `sentinel-cameras-${branchId || "all-branches"}-${dateStr}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: errMessage }, { status: 500 });
  }
}
