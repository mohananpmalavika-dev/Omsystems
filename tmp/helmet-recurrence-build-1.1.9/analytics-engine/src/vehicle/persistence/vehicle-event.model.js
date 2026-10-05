/**
 * Vehicle Event Data Model
 * Represents a finalized vehicle sighting with all enriched metadata
 */
export class DefaultVehicleEventFactory {
    create(params) {
        const { track, plate, color, context } = params;
        const id = `${context.tenantId}_${track.trackId}_${Date.now()}`;
        const now = new Date();
        const durationSeconds = track.lastSeenAt && track.firstSeenAt
            ? (track.lastSeenAt.getTime() - track.firstSeenAt.getTime()) / 1000
            : 0;
        const lastPosition = track.positions?.[track.positions.length - 1];
        return {
            id,
            tenantId: context.tenantId,
            siteId: context.siteId,
            cameraId: context.cameraId,
            trackId: track.trackId,
            occurredAt: track.lastSeenAt || now,
            firstSeenAt: track.firstSeenAt || now,
            lastSeenAt: track.lastSeenAt || now,
            durationSeconds,
            vehicleType: track.vehicleType || 'unknown',
            vehicleConfidence: track.detectionConfidence || 0,
            color: color?.color,
            colorConfidence: color?.confidence,
            rawPlateText: plate?.rawPlate,
            normalizedPlate: plate?.plate,
            plateDetectionConfidence: plate?.confidence?.detection,
            ocrConfidence: plate?.confidence?.ocr,
            plateConfidence: plate?.confidence?.final,
            plateStatus: plate?.status,
            vehicleBoundingBox: lastPosition?.boundingBox,
            metadata: {
                observationCount: track.positions?.length || 0,
                plateObservations: track.plateObservations?.length || 0,
                colorObservations: track.colorObservations?.length || 0,
                alternativePlates: plate?.alternatives,
                reIdFeature: track.reIdFeature,
                globalVehicleId: track.globalVehicleId,
            },
            createdAt: now,
        };
    }
}
