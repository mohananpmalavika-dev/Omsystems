import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const timeRange = searchParams.get("timeRange") || "7d";
  const groupBy = searchParams.get("groupBy") || "branch"; // organization, zone, region, area, branch, date, time
  const organization = searchParams.get("organization") || "all";
  const zone = searchParams.get("zone") || "all";
  const region = searchParams.get("region") || "all";
  const area = searchParams.get("area") || "all";
  const branchId = searchParams.get("branchId") || "all";
  const shift = searchParams.get("shift") || "all";
  const startDate = searchParams.get("startDate") || "";
  const endDate = searchParams.get("endDate") || "";

  // Multiplier or baseline shifts depending on timeRange
  const multiplier = timeRange === "today" ? 0.2 : timeRange === "7d" ? 1 : timeRange === "30d" ? 4.2 : 12.5;

  // Master Branch Directory with full hierarchy
  const MASTER_BRANCHES = [
    {
      id: "br-01",
      name: "Ernakulam Main Branch",
      area: "Kochi Metro Area",
      region: "Kerala Region",
      zone: "South Zone",
      organization: "OmSystems Financial Corp",
      cameras: 36,
      online: 36,
      uptime: 99.8,
      p1Threats: 0,
      totalAlerts: Math.round(18 * multiplier),
      footfall: Math.round(3840 * multiplier),
      avgWaitMin: 4.2,
      attendancePercent: 98.2,
      slaPercent: 99.4,
      retentionDays: 94,
      status: "Optimal",
    },
    {
      id: "br-02",
      name: "Kozhikode Central Branch",
      area: "Calicut Urban Area",
      region: "Kerala Region",
      zone: "South Zone",
      organization: "OmSystems Financial Corp",
      cameras: 32,
      online: 32,
      uptime: 99.5,
      p1Threats: 1,
      totalAlerts: Math.round(24 * multiplier),
      footfall: Math.round(3120 * multiplier),
      avgWaitMin: 4.8,
      attendancePercent: 96.5,
      slaPercent: 98.8,
      retentionDays: 92,
      status: "Optimal",
    },
    {
      id: "br-03",
      name: "Trivandrum City Branch",
      area: "Trivandrum Urban Area",
      region: "Kerala Region",
      zone: "South Zone",
      organization: "OmSystems Financial Corp",
      cameras: 40,
      online: 39,
      uptime: 99.2,
      p1Threats: 0,
      totalAlerts: Math.round(21 * multiplier),
      footfall: Math.round(2950 * multiplier),
      avgWaitMin: 4.5,
      attendancePercent: 97.1,
      slaPercent: 98.2,
      retentionDays: 91,
      status: "Optimal",
    },
    {
      id: "br-04",
      name: "Thrissur Round Branch",
      area: "Thrissur Cultural Area",
      region: "Kerala Region",
      zone: "South Zone",
      organization: "OmSystems Financial Corp",
      cameras: 28,
      online: 27,
      uptime: 98.9,
      p1Threats: 1,
      totalAlerts: Math.round(29 * multiplier),
      footfall: Math.round(2640 * multiplier),
      avgWaitMin: 5.6,
      attendancePercent: 95.8,
      slaPercent: 97.4,
      retentionDays: 90,
      status: "Good",
    },
    {
      id: "br-05",
      name: "Kottayam Baker Jn Branch",
      area: "Kottayam Central Area",
      region: "Kerala Region",
      zone: "South Zone",
      organization: "OmSystems Financial Corp",
      cameras: 24,
      online: 23,
      uptime: 98.4,
      p1Threats: 0,
      totalAlerts: Math.round(16 * multiplier),
      footfall: Math.round(2180 * multiplier),
      avgWaitMin: 4.9,
      attendancePercent: 94.2,
      slaPercent: 97.8,
      retentionDays: 89,
      status: "Good",
    },
    {
      id: "br-06",
      name: "Chennai T-Nagar Branch",
      area: "Chennai Central Area",
      region: "Tamil Nadu Region",
      zone: "South Zone",
      organization: "Krypton Global NBFC",
      cameras: 44,
      online: 43,
      uptime: 99.4,
      p1Threats: 0,
      totalAlerts: Math.round(32 * multiplier),
      footfall: Math.round(4120 * multiplier),
      avgWaitMin: 5.1,
      attendancePercent: 97.5,
      slaPercent: 98.9,
      retentionDays: 93,
      status: "Optimal",
    },
    {
      id: "br-07",
      name: "Coimbatore Cross-Cut Branch",
      area: "Coimbatore West Area",
      region: "Tamil Nadu Region",
      zone: "South Zone",
      organization: "Krypton Global NBFC",
      cameras: 28,
      online: 27,
      uptime: 98.6,
      p1Threats: 1,
      totalAlerts: Math.round(22 * multiplier),
      footfall: Math.round(2450 * multiplier),
      avgWaitMin: 5.3,
      attendancePercent: 96.0,
      slaPercent: 97.2,
      retentionDays: 90,
      status: "Good",
    },
    {
      id: "br-08",
      name: "Bengaluru MG Road Branch",
      area: "Bengaluru Central Area",
      region: "Karnataka Region",
      zone: "South Zone",
      organization: "Krypton Global NBFC",
      cameras: 48,
      online: 48,
      uptime: 99.9,
      p1Threats: 0,
      totalAlerts: Math.round(35 * multiplier),
      footfall: Math.round(4890 * multiplier),
      avgWaitMin: 3.8,
      attendancePercent: 98.9,
      slaPercent: 99.6,
      retentionDays: 95,
      status: "Optimal",
    },
    {
      id: "br-09",
      name: "Bengaluru Whitefield Branch",
      area: "Bengaluru Tech Area",
      region: "Karnataka Region",
      zone: "South Zone",
      organization: "Krypton Global NBFC",
      cameras: 34,
      online: 33,
      uptime: 98.8,
      p1Threats: 0,
      totalAlerts: Math.round(26 * multiplier),
      footfall: Math.round(3200 * multiplier),
      avgWaitMin: 4.4,
      attendancePercent: 97.0,
      slaPercent: 98.1,
      retentionDays: 91,
      status: "Good",
    },
    {
      id: "br-10",
      name: "Mumbai BKC Flagship",
      area: "Mumbai BKC Area",
      region: "Maharashtra Region",
      zone: "West Zone",
      organization: "Apex Retail Logistics",
      cameras: 60,
      online: 59,
      uptime: 99.6,
      p1Threats: 0,
      totalAlerts: Math.round(45 * multiplier),
      footfall: Math.round(5400 * multiplier),
      avgWaitMin: 3.6,
      attendancePercent: 98.4,
      slaPercent: 99.2,
      retentionDays: 94,
      status: "Optimal",
    },
    {
      id: "br-11",
      name: "Pune FC Road Branch",
      area: "Pune Shivaji Area",
      region: "Maharashtra Region",
      zone: "West Zone",
      organization: "Apex Retail Logistics",
      cameras: 32,
      online: 30,
      uptime: 97.4,
      p1Threats: 1,
      totalAlerts: Math.round(28 * multiplier),
      footfall: Math.round(2800 * multiplier),
      avgWaitMin: 6.2,
      attendancePercent: 93.8,
      slaPercent: 96.5,
      retentionDays: 88,
      status: "Warning",
    },
    {
      id: "br-12",
      name: "Delhi Connaught Place Branch",
      area: "Delhi CP Area",
      region: "Delhi NCR Region",
      zone: "North Zone",
      organization: "OmSystems Financial Corp",
      cameras: 52,
      online: 51,
      uptime: 99.1,
      p1Threats: 0,
      totalAlerts: Math.round(39 * multiplier),
      footfall: Math.round(4600 * multiplier),
      avgWaitMin: 4.7,
      attendancePercent: 97.2,
      slaPercent: 98.4,
      retentionDays: 92,
      status: "Optimal",
    },
    {
      id: "br-13",
      name: "Kolkata Park Street Branch",
      area: "Kolkata Central Area",
      region: "West Bengal Region",
      zone: "East Zone",
      organization: "Krypton Global NBFC",
      cameras: 36,
      online: 34,
      uptime: 96.9,
      p1Threats: 2,
      totalAlerts: Math.round(41 * multiplier),
      footfall: Math.round(3300 * multiplier),
      avgWaitMin: 7.1,
      attendancePercent: 92.5,
      slaPercent: 95.4,
      retentionDays: 85,
      status: "Warning",
    },
  ];

  // Filter master branches based on active criteria
  let filteredBranches = MASTER_BRANCHES;
  if (organization !== "all") {
    filteredBranches = filteredBranches.filter((b) => b.organization === organization);
  }
  if (zone !== "all") {
    filteredBranches = filteredBranches.filter((b) => b.zone === zone);
  }
  if (region !== "all") {
    filteredBranches = filteredBranches.filter((b) => b.region === region);
  }
  if (area !== "all") {
    filteredBranches = filteredBranches.filter((b) => b.area === area);
  }
  if (branchId !== "all") {
    filteredBranches = filteredBranches.filter((b) => b.id === branchId || b.name === branchId);
  }

  // Multi-Dimensional Rollup Generator
  const generateRollup = (dimensionKey: "organization" | "zone" | "region" | "area" | "name") => {
    const map = new Map<string, any>();

    for (const b of filteredBranches) {
      const key = b[dimensionKey];
      if (!map.has(key)) {
        map.set(key, {
          dimension: key,
          branchCount: 0,
          totalCameras: 0,
          onlineCameras: 0,
          uptimeSum: 0,
          p1Threats: 0,
          totalAlerts: 0,
          footfall: 0,
          waitMinSum: 0,
          attendanceSum: 0,
          slaSum: 0,
          retentionDaysSum: 0,
        });
      }
      const item = map.get(key);
      item.branchCount += 1;
      item.totalCameras += b.cameras;
      item.onlineCameras += b.online;
      item.uptimeSum += b.uptime;
      item.p1Threats += b.p1Threats;
      item.totalAlerts += b.totalAlerts;
      item.footfall += b.footfall;
      item.waitMinSum += b.avgWaitMin;
      item.attendanceSum += b.attendancePercent;
      item.slaSum += b.slaPercent;
      item.retentionDaysSum += b.retentionDays;
    }

    return Array.from(map.values()).map((r) => ({
      dimension: r.dimension,
      branchCount: r.branchCount,
      totalCameras: r.totalCameras,
      onlineCameras: r.onlineCameras,
      uptimePercent: Number((r.uptimeSum / r.branchCount).toFixed(1)),
      p1Threats: r.p1Threats,
      totalAlerts: r.totalAlerts,
      footfall: r.footfall,
      avgWaitMin: Number((r.waitMinSum / r.branchCount).toFixed(1)),
      attendancePercent: Number((r.attendanceSum / r.branchCount).toFixed(1)),
      slaPercent: Number((r.slaSum / r.branchCount).toFixed(1)),
      retentionDays: Number((r.retentionDaysSum / r.branchCount).toFixed(1)),
      complianceStatus: (r.retentionDaysSum / r.branchCount) >= 90 && (r.slaSum / r.branchCount) >= 97 ? "Compliant" : "Attention",
    }));
  };

  // Date-wise Breakdown (last 7 or 14 days)
  const dateWiseBreakdown = [
    { dimension: "11 Sep 2026", footfall: Math.round(17200 * multiplier * 0.14), alerts: 34, p1Threats: 0, uptimePercent: 99.4, slaPercent: 98.8, attendancePercent: 97.8 },
    { dimension: "12 Sep 2026", footfall: Math.round(18500 * multiplier * 0.14), alerts: 42, p1Threats: 1, uptimePercent: 99.2, slaPercent: 98.2, attendancePercent: 98.1 },
    { dimension: "13 Sep 2026", footfall: Math.round(19100 * multiplier * 0.14), alerts: 38, p1Threats: 0, uptimePercent: 98.9, slaPercent: 97.9, attendancePercent: 96.9 },
    { dimension: "14 Sep 2026", footfall: Math.round(16800 * multiplier * 0.14), alerts: 29, p1Threats: 0, uptimePercent: 99.5, slaPercent: 99.1, attendancePercent: 97.4 },
    { dimension: "15 Sep 2026", footfall: Math.round(20400 * multiplier * 0.14), alerts: 51, p1Threats: 2, uptimePercent: 98.4, slaPercent: 96.8, attendancePercent: 95.8 },
    { dimension: "16 Sep 2026", footfall: Math.round(19800 * multiplier * 0.14), alerts: 46, p1Threats: 1, uptimePercent: 98.7, slaPercent: 97.4, attendancePercent: 96.7 },
    { dimension: "17 Sep 2026 (Today)", footfall: Math.round(18420 * multiplier * 0.14), alerts: 39, p1Threats: 1, uptimePercent: 99.1, slaPercent: 98.5, attendancePercent: 97.6 },
  ];

  // Time-wise Breakdown (Hourly & Shifts)
  const timeWiseBreakdown = [
    { dimension: "Shift C: 00:00 - 04:00 (Off-Hours)", shift: "Night", alerts: 14, p1Threats: 1, footfall: 120, avgWaitMin: 1.0, slaPercent: 99.5, attendancePercent: 100 },
    { dimension: "Shift C: 04:00 - 08:00 (Early Dawn)", shift: "Night", alerts: 19, p1Threats: 0, footfall: 340, avgWaitMin: 1.5, slaPercent: 99.2, attendancePercent: 98.5 },
    { dimension: "Shift A: 08:00 - 12:00 (Morning Peak)", shift: "Shift A", alerts: 82, p1Threats: 1, footfall: 7450, avgWaitMin: 6.2, slaPercent: 97.4, attendancePercent: 97.8 },
    { dimension: "Shift A: 12:00 - 16:00 (Afternoon)", shift: "Shift A", alerts: 94, p1Threats: 2, footfall: 8900, avgWaitMin: 7.8, slaPercent: 96.8, attendancePercent: 96.4 },
    { dimension: "Shift B: 16:00 - 20:00 (Evening Closing)", shift: "Shift B", alerts: 68, p1Threats: 1, footfall: 4200, avgWaitMin: 4.8, slaPercent: 97.9, attendancePercent: 97.1 },
    { dimension: "Shift B: 20:00 - 24:00 (Lockdown / Night)", shift: "Shift B", alerts: 32, p1Threats: 1, footfall: 210, avgWaitMin: 1.2, slaPercent: 98.8, attendancePercent: 99.0 },
  ];

  // Dynamic grouping selector result
  let activeMasterMatrix: any[] = [];
  if (groupBy === "organization") {
    activeMasterMatrix = generateRollup("organization");
  } else if (groupBy === "zone") {
    activeMasterMatrix = generateRollup("zone");
  } else if (groupBy === "region") {
    activeMasterMatrix = generateRollup("region");
  } else if (groupBy === "area") {
    activeMasterMatrix = generateRollup("area");
  } else if (groupBy === "date") {
    activeMasterMatrix = dateWiseBreakdown;
  } else if (groupBy === "time") {
    activeMasterMatrix = timeWiseBreakdown;
  } else {
    // Default: branch-wise
    activeMasterMatrix = filteredBranches.map((b) => ({
      dimension: b.name,
      area: b.area,
      region: b.region,
      zone: b.zone,
      organization: b.organization,
      branchCount: 1,
      totalCameras: b.cameras,
      onlineCameras: b.online,
      uptimePercent: b.uptime,
      p1Threats: b.p1Threats,
      totalAlerts: b.totalAlerts,
      footfall: b.footfall,
      avgWaitMin: b.avgWaitMin,
      attendancePercent: b.attendancePercent,
      slaPercent: b.slaPercent,
      retentionDays: b.retentionDays,
      complianceStatus: b.retentionDays >= 90 && b.slaPercent >= 97 ? "Compliant" : "Attention",
    }));
  }

  // Grand summary for current filtered view
  const summary = {
    totalBranches: filteredBranches.length,
    totalCameras: filteredBranches.reduce((acc, b) => acc + b.cameras, 0),
    onlineCameras: filteredBranches.reduce((acc, b) => acc + b.online, 0),
    avgUptime: Number((filteredBranches.reduce((acc, b) => acc + b.uptime, 0) / (filteredBranches.length || 1)).toFixed(1)),
    totalP1Threats: filteredBranches.reduce((acc, b) => acc + b.p1Threats, 0),
    totalAlerts: filteredBranches.reduce((acc, b) => acc + b.totalAlerts, 0),
    totalFootfall: filteredBranches.reduce((acc, b) => acc + b.footfall, 0),
    avgWaitMin: Number((filteredBranches.reduce((acc, b) => acc + b.avgWaitMin, 0) / (filteredBranches.length || 1)).toFixed(1)),
    avgAttendance: Number((filteredBranches.reduce((acc, b) => acc + b.attendancePercent, 0) / (filteredBranches.length || 1)).toFixed(1)),
    avgSla: Number((filteredBranches.reduce((acc, b) => acc + b.slaPercent, 0) / (filteredBranches.length || 1)).toFixed(1)),
    avgRetentionDays: Number((filteredBranches.reduce((acc, b) => acc + b.retentionDays, 0) / (filteredBranches.length || 1)).toFixed(1)),
  };

  // Distinct filter options for dropdowns
  const filterOptions = {
    organizations: Array.from(new Set(MASTER_BRANCHES.map((b) => b.organization))),
    zones: Array.from(new Set(MASTER_BRANCHES.map((b) => b.zone))),
    regions: Array.from(new Set(MASTER_BRANCHES.map((b) => b.region))),
    areas: Array.from(new Set(MASTER_BRANCHES.map((b) => b.area))),
    branches: MASTER_BRANCHES.map((b) => ({ id: b.id, name: b.name })),
  };

  return NextResponse.json({
    success: true,
    data: {
      groupBy,
      summary,
      matrix: activeMasterMatrix,
      filterOptions,
      dateWiseBreakdown,
      timeWiseBreakdown,
      allBranches: filteredBranches,
      metadata: {
        generatedAt: new Date().toISOString(),
        timeRange,
        organization,
        zone,
        region,
        area,
        branchId,
        shift,
        startDate,
        endDate,
      },
    },
  });
}
