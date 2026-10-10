import { NextRequest, NextResponse } from 'next/server';
import {
  requireAxProTenant,
  getHikvisionAxProIntegrationService,
  axProApiError,
} from '@/lib/backend/hikvision-axpro';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const tenantId = await requireAxProTenant(request);
    const data = await getHikvisionAxProIntegrationService().list(tenantId);
    return NextResponse.json({ data });
  } catch (error) {
    return axProApiError(error);
  }
}
