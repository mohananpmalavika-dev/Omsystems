import { NextRequest, NextResponse } from 'next/server';

const CONTROL_BFF_BASE = '/api/control';

interface WorkOrderRecord {
  id: string;
  tenantId: string;
  workOrderNumber: string;
  assetId?: string;
  branchNodeId?: string;
  problem: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  technician?: string;
  vendorId?: string;
  slaDueAt?: string;
  resolvedAt?: string;
  eta?: string;
  parts?: string[];
  cost?: number;
  rootCause?: string;
  actionTaken?: string;
  verification?: string;
  status: 'open' | 'assigned' | 'in_progress' | 'resolved' | 'closed';
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * GET /api/audit/maintenance
 * Get maintenance work orders and SLA audit summary
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const cameraId = searchParams.get('cameraId');
    const branchNodeId = searchParams.get('branchNodeId');
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const workType = searchParams.get('workType');
    const assignedTechnicianId = searchParams.get('assignedTechnicianId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const search = searchParams.get('search')?.trim().toLowerCase() ?? '';
    const slaStatus = searchParams.get('slaStatus');
    const summary = searchParams.get('summary') === 'true';

    const params = new URLSearchParams();
    if (cameraId) params.append('cameraId', cameraId);
    if (branchNodeId) params.append('branchNodeId', branchNodeId);
    if (status) params.append('status', status);
    if (priority) params.append('priority', priority);
    if (workType) params.append('workType', workType);
    if (assignedTechnicianId) params.append('assignedTechnicianId', assignedTechnicianId);
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    if (search) params.append('search', search);
    if (slaStatus) params.append('slaStatus', slaStatus);
    if (summary) params.append('summary', 'true');

    const query = params.toString();
    const url = new URL(`${CONTROL_BFF_BASE}/v1/maintenance/workorders${query ? `?${query}` : ''}`, request.nextUrl.origin);

    const authorization = request.headers.get('authorization');
    const sentinelSession = request.headers.get('x-sentinel-session');
    const response = await fetch(url, {
      headers: {
        cookie: request.headers.get('cookie') ?? '',
        ...(authorization ? { authorization } : {}),
        ...(sentinelSession ? { 'x-sentinel-session': sentinelSession } : {}),
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return proxyResponse(response);
    }

    const payload = await response.json();
    let workOrders: WorkOrderRecord[] = Array.isArray(payload?.data) ? payload.data : [];

    // Optional date range filtering on createdAt
    if (from) {
      const fromTime = Date.parse(from);
      if (!Number.isNaN(fromTime)) {
        workOrders = workOrders.filter((wo) => Date.parse(wo.createdAt) >= fromTime);
      }
    }
    if (to) {
      const toTime = Date.parse(to);
      if (!Number.isNaN(toTime)) {
        workOrders = workOrders.filter((wo) => Date.parse(wo.createdAt) <= toTime);
      }
    }

    // Optional text search filter
    if (search) {
      workOrders = workOrders.filter((wo) =>
        wo.workOrderNumber.toLowerCase().includes(search) ||
        wo.problem.toLowerCase().includes(search) ||
        (wo.assetId && wo.assetId.toLowerCase().includes(search)) ||
        (wo.technician && wo.technician.toLowerCase().includes(search)) ||
        (wo.rootCause && wo.rootCause.toLowerCase().includes(search))
      );
    }

    const now = Date.now();

    // Calculate SLA audit summary metrics
    if (summary) {
      const openOrders = workOrders.filter((wo) => !['resolved', 'closed'].includes(wo.status));
      const closedOrders = workOrders.filter((wo) => ['resolved', 'closed'].includes(wo.status));
      const urgentOrders = workOrders.filter((wo) => ['critical', 'high'].includes(wo.severity));

      const closedWithSla = closedOrders.filter((wo) => Boolean(wo.slaDueAt));
      const onTimeOrders = closedWithSla.filter((wo) => {
        const completedTime = wo.resolvedAt ? Date.parse(wo.resolvedAt) : (wo.updatedAt ? Date.parse(wo.updatedAt) : 0);
        return completedTime > 0 && completedTime <= Date.parse(wo.slaDueAt!);
      });
      const closedLateOrders = closedWithSla.filter((wo) => {
        const completedTime = wo.resolvedAt ? Date.parse(wo.resolvedAt) : (wo.updatedAt ? Date.parse(wo.updatedAt) : 0);
        return completedTime > Date.parse(wo.slaDueAt!);
      });
      const openBreachedOrders = openOrders.filter((wo) => wo.slaDueAt && Date.parse(wo.slaDueAt) < now);

      const evaluatedCount = closedWithSla.length + openBreachedOrders.length;
      const breachedCount = closedLateOrders.length + openBreachedOrders.length;
      const slaComplianceRate = evaluatedCount > 0 ? Math.round((onTimeOrders.length / evaluatedCount) * 100) : 100;

      const resolutionDurations = closedOrders
        .map((wo) => {
          const start = Date.parse(wo.createdAt);
          const end = wo.resolvedAt ? Date.parse(wo.resolvedAt) : Date.parse(wo.updatedAt);
          return end > start ? (end - start) / (1000 * 60 * 60) : null;
        })
        .filter((h): h is number => h !== null && !Number.isNaN(h));
      const avgResolutionHours = resolutionDurations.length > 0
        ? Math.round((resolutionDurations.reduce((a, b) => a + b, 0) / resolutionDurations.length) * 10) / 10
        : null;

      return NextResponse.json({
        data: {
          totalWorkOrders: workOrders.length,
          open: openOrders.length,
          assigned: workOrders.filter((wo) => wo.status === 'assigned').length,
          inProgress: workOrders.filter((wo) => wo.status === 'in_progress').length,
          resolved: workOrders.filter((wo) => wo.status === 'resolved').length,
          closed: workOrders.filter((wo) => wo.status === 'closed').length,
          critical: workOrders.filter((wo) => wo.severity === 'critical').length,
          high: workOrders.filter((wo) => wo.severity === 'high').length,
          urgent: urgentOrders.length,
          overdue: openBreachedOrders.length,
          breachedTotal: breachedCount,
          slaAssessed: evaluatedCount,
          slaOnTime: onTimeOrders.length,
          slaComplianceRate,
          avgResolutionHours,
        },
      });
    }

    // Filter by SLA status if requested
    if (slaStatus && slaStatus !== 'all') {
      workOrders = workOrders.filter((wo) => {
        const isClosed = ['resolved', 'closed'].includes(wo.status);
        if (slaStatus === 'no_sla') return !wo.slaDueAt;
        if (!wo.slaDueAt) return false;

        const dueTime = Date.parse(wo.slaDueAt);
        const finishTime = wo.resolvedAt ? Date.parse(wo.resolvedAt) : (wo.updatedAt ? Date.parse(wo.updatedAt) : 0);

        if (slaStatus === 'met') {
          return isClosed && finishTime > 0 && finishTime <= dueTime;
        }
        if (slaStatus === 'breached') {
          return (!isClosed && dueTime < now) || (isClosed && finishTime > dueTime);
        }
        if (slaStatus === 'in_sla') {
          return !isClosed && dueTime >= now;
        }
        return true;
      });
    }

    return NextResponse.json({ data: workOrders, total: workOrders.length });
  } catch (error) {
    console.error('Maintenance API error:', error);
    return NextResponse.json(
      { error: 'control_plane_unavailable', message: 'Unable to load maintenance work orders' },
      { status: 502 }
    );
  }
}

/**
 * POST /api/audit/maintenance
 * Create maintenance work order
 */
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'validation_error', message: 'A work-order payload is required' }, { status: 400 });
    }

    const url = new URL(`${CONTROL_BFF_BASE}/v1/maintenance/workorders`, request.nextUrl.origin);

    const authorization = request.headers.get('authorization');
    const sentinelSession = request.headers.get('x-sentinel-session');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: request.headers.get('cookie') ?? '',
        ...(authorization ? { authorization } : {}),
        ...(sentinelSession ? { 'x-sentinel-session': sentinelSession } : {}),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    return proxyResponse(response);
  } catch (error) {
    console.error('Create maintenance work order API error:', error);
    return NextResponse.json(
      { error: 'control_plane_unavailable', message: 'Unable to create maintenance work order' },
      { status: 502 }
    );
  }
}

async function proxyResponse(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return NextResponse.json(await response.json(), { status: response.status });
  }
  return new NextResponse(await response.text(), {
    status: response.status,
    headers: { 'content-type': contentType || 'text/plain; charset=utf-8' },
  });
}
