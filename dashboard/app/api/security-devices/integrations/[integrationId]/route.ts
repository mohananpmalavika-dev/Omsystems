import { NextRequest, NextResponse } from 'next/server';
import { requireAxProTenant, getHikvisionAxProIntegrationService, axProApiError } from '@/lib/backend/hikvision-axpro';
import { AxProError } from '../../../../../../src/security-devices/integrations/hikvision/axpro/errors';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ integrationId: string }> }) {
  try {
    const tenantId = await requireAxProTenant(request);
    const { integrationId } = await params;
    const body = await request.json();
    if (typeof body?.enabled !== 'boolean') throw new AxProError('AXPRO_CONFIG_INVALID', 'enabled must be a boolean', 400);
    const data = await getHikvisionAxProIntegrationService().setEnabled(tenantId, integrationId, body.enabled);
    return NextResponse.json({ data });
  } catch (error) { return axProApiError(error); }
}
