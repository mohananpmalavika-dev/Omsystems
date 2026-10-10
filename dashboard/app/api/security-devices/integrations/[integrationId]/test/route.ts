import { NextRequest, NextResponse } from 'next/server';
import {
  requireAxProTenant,
  getHikvisionAxProIntegrationService,
  axProApiError,
} from '@/lib/backend/hikvision-axpro';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ integrationId: string }> },
) {
  try {
    const tenantId = await requireAxProTenant(request);
    const { integrationId } = await params;
    const data = await getHikvisionAxProIntegrationService().test(tenantId, integrationId);
    return NextResponse.json({ data }, { status: data.success ? 200 : 502 });
  } catch (error) {
    return axProApiError(error);
  }
}
