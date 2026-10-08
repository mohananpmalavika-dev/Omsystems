/**
 * CCTV Enrollment API Routes
 * 
 * Allows enrolling employees directly from CCTV footage
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Pool } from 'pg';
import { CCTVEnrollmentService, type CCTVEnrollmentInput } from '../face/cctv-enrollment.service.js';
import type { FaceRecognitionService } from '../face/face-recognition.service.js';
import type { FaceEnrollmentService } from '../face/face-enrollment.service.js';

const validateFrameSchema = z.object({
  cameraId: z.string().uuid(),
  timestamp: z.string().datetime(),
  
  // Frame data (base64 encoded)
  frameData: z.string().min(100),
  frameWidth: z.number().int().positive(),
  frameHeight: z.number().int().positive(),
  
  // Face bounding box
  faceBoundingBox: z.object({
    x: z.number().min(0),
    y: z.number().min(0),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
});

const enrollFromCCTVSchema = z.object({
  watchlistId: z.string().uuid(),
  employeeName: z.string().trim().min(2).max(255),
  employeeId: z.string().trim().max(100).optional(),
  
  // CCTV frame details
  cameraId: z.string().uuid(),
  videoTimestamp: z.string().datetime(),
  frameData: z.string().min(100), // base64 encoded
  frameWidth: z.number().int().positive(),
  frameHeight: z.number().int().positive(),
  
  // Face location
  faceBoundingBox: z.object({
    x: z.number().min(0),
    y: z.number().min(0),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  
  metadata: z.record(z.unknown()).optional(),
});

const batchEnrollSchema = z.object({
  enrollments: z.array(enrollFromCCTVSchema).min(1).max(50),
});

export async function registerCCTVEnrollmentRoutes(
  app: FastifyInstance,
  db: Pool,
  recognitionService: FaceRecognitionService,
  enrollmentService: FaceEnrollmentService,
) {
  const cctvEnrollmentService = new CCTVEnrollmentService(
    db,
    recognitionService,
    enrollmentService,
  );

  /**
   * POST /api/v1/face/cctv/validate-frame
   * 
   * Validate if a CCTV frame is suitable for enrollment
   * Returns quality score and recommendations
   */
  app.post('/api/v1/face/cctv/validate-frame', async (request, reply) => {
    try {
      const user = (request as any).user;
      if (!user) {
        return reply.code(401).send({ error: 'unauthorized' });
      }

      const body = validateFrameSchema.parse(request.body);

      // Decode base64 frame data
      const frameBuffer = Buffer.from(body.frameData, 'base64');

      // Validate frame
      const validation = await cctvEnrollmentService.validateCCTVFrame(
        frameBuffer,
        body.frameWidth,
        body.frameHeight,
        body.faceBoundingBox as CCTVEnrollmentInput['faceBoundingBox'],
      );

      return {
        success: true,
        validation: {
          suitable: validation.suitable,
          quality: Math.round(validation.quality * 100), // Percentage
          qualityGrade: getQualityGrade(validation.quality),
          reasons: validation.reasons,
          recommendations: validation.recommendations || [],
        },
        thresholds: {
          minimum: 65, // 65% minimum for CCTV
          recommended: 80, // 80%+ recommended
        },
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          success: false,
          error: 'validation_error',
          details: error.errors,
        });
      }

      app.log.error({ error }, '[CCTVEnrollment] Frame validation failed');
      return reply.code(500).send({
        success: false,
        error: 'validation_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/face/cctv/enroll
   * 
   * Enroll an employee from CCTV footage
   */
  app.post('/api/v1/face/cctv/enroll', async (request, reply) => {
    try {
      const user = (request as any).user;
      if (!user) {
        return reply.code(401).send({ error: 'unauthorized' });
      }

      const body = enrollFromCCTVSchema.parse(request.body);

      // Decode frame data
      const frameBuffer = Buffer.from(body.frameData, 'base64');

      // Enroll from CCTV
      const result = await cctvEnrollmentService.enrollFromCCTV({
        tenantId: user.tenantId,
        watchlistId: body.watchlistId,
        employeeName: body.employeeName,
        employeeId: body.employeeId,
        cameraId: body.cameraId,
        videoTimestamp: new Date(body.videoTimestamp),
        frameBuffer,
        frameWidth: body.frameWidth,
        frameHeight: body.frameHeight,
        faceBoundingBox: body.faceBoundingBox as CCTVEnrollmentInput['faceBoundingBox'],
        metadata: body.metadata,
        actorId: user.id,
      });

      if (!result.success) {
        return reply.code(400).send({
          success: false,
          error: 'enrollment_failed',
          message: result.error,
          validation: {
            suitable: result.validation.suitable,
            quality: Math.round(result.validation.quality * 100),
            reasons: result.validation.reasons,
            recommendations: result.validation.recommendations,
          },
        });
      }

      return {
        success: true,
        data: {
          personId: result.personId,
          embeddingId: result.embeddingId,
          quality: Math.round(result.quality! * 100),
          qualityGrade: getQualityGrade(result.quality!),
        },
        message: `${body.employeeName} enrolled successfully from CCTV footage`,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          success: false,
          error: 'validation_error',
          details: error.errors,
        });
      }

      app.log.error({ error }, '[CCTVEnrollment] Enrollment failed');
      return reply.code(500).send({
        success: false,
        error: 'enrollment_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/face/cctv/batch-enroll
   * 
   * Enroll multiple employees from CCTV footage
   * Useful for orientation videos with multiple people
   */
  app.post('/api/v1/face/cctv/batch-enroll', async (request, reply) => {
    try {
      const user = (request as any).user;
      if (!user) {
        return reply.code(401).send({ error: 'unauthorized' });
      }

      const body = batchEnrollSchema.parse(request.body);

      const inputs = body.enrollments.map((enrollment) => ({
        tenantId: user.tenantId,
        watchlistId: enrollment.watchlistId,
        employeeName: enrollment.employeeName,
        employeeId: enrollment.employeeId,
        cameraId: enrollment.cameraId,
        videoTimestamp: new Date(enrollment.videoTimestamp),
        frameBuffer: Buffer.from(enrollment.frameData, 'base64'),
        frameWidth: enrollment.frameWidth,
        frameHeight: enrollment.frameHeight,
        faceBoundingBox: enrollment.faceBoundingBox as CCTVEnrollmentInput['faceBoundingBox'],
        metadata: enrollment.metadata,
        actorId: user.id,
      }));

      const results = await cctvEnrollmentService.batchEnrollFromCCTV(inputs);

      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      return {
        success: true,
        summary: {
          total: results.length,
          successful: successful.length,
          failed: failed.length,
        },
        results: results.map((result, index) => ({
          employeeName: body.enrollments[index].employeeName,
          success: result.success,
          personId: result.personId,
          quality: result.quality ? Math.round(result.quality * 100) : undefined,
          error: result.error,
        })),
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          success: false,
          error: 'validation_error',
          details: error.errors,
        });
      }

      app.log.error({ error }, '[CCTVEnrollment] Batch enrollment failed');
      return reply.code(500).send({
        success: false,
        error: 'batch_enrollment_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/v1/face/cctv/enrollment-guidelines
   * 
   * Get guidelines for best CCTV enrollment results
   */
  app.get('/api/v1/face/cctv/enrollment-guidelines', async (request, reply) => {
    return {
      success: true,
      guidelines: {
        malayalam: {
          title: 'CCTV-യിൽ നിന്ന് Face Enrollment - മാർഗ്ഗനിർദ്ദേശങ്ങൾ',
          requirements: [
            '✓ മുഖം നേരെ camera-യ്ക്ക് നോക്കണം (വശത്തേക്ക് തിരിയാതെ)',
            '✓ തല നേരെ വയ്ക്കണം (മുകളിലേക്കോ താഴേക്കോ കുനിയാതെ)',
            '✓ മുഖം വ്യക്തമായി കാണണം (മാസ്ക്, കണ്ണട ഒഴിവാക്കുക)',
            '✓ നല്ല വെളിച്ചമുള്ള സമയം തിരഞ്ഞെടുക്കുക',
            '✓ മുഖം കുറഞ്ഞത് 80 pixels വലുപ്പമുണ്ടാകണം',
            '✓ വ്യക്തമായ ഫ്രെയിം (blur ഇല്ലാത്തത്) തിരഞ്ഞെടുക്കുക',
            '✓ നീങ്ങുന്ന സമയത്തല്ല, നിശ്ചലമായി നിൽക്കുമ്പോൾ',
          ],
          tips: [
            '💡 Camera-യോട് 2-4 മീറ്റർ അകലത്തിൽ നിൽക്കുക',
            '💡 സാധാരണ office വെളിച്ചം മതിയാകും',
            '💡 HD camera-കൾ better quality നൽകും',
            '💡 Validation API ഉപയോഗിച്ച് quality ചെക്ക് ചെയ്യുക',
          ],
        },
        english: {
          title: 'CCTV Face Enrollment - Best Practices',
          requirements: [
            '✓ Face should be looking directly at camera',
            '✓ Head should be upright (no tilting)',
            '✓ Face should be fully visible (no mask, sunglasses)',
            '✓ Choose frames with good lighting',
            '✓ Face should be at least 80 pixels in size',
            '✓ Select clear, non-blurry frames',
            '✓ Person should be stationary, not moving',
          ],
          tips: [
            '💡 Maintain 2-4 meters distance from camera',
            '💡 Normal office lighting is sufficient',
            '💡 HD cameras provide better quality',
            '💡 Use validation API to check quality first',
          ],
        },
        technicalRequirements: {
          minQuality: 65,
          recommendedQuality: 80,
          minFaceSize: 80,
          maxYaw: 30,
          maxPitch: 25,
          maxRoll: 25,
        },
      },
    };
  });

  app.log.info('[CCTVEnrollment] Routes registered');
}

function getQualityGrade(quality: number): string {
  if (quality >= 0.90) return 'excellent';
  if (quality >= 0.80) return 'good';
  if (quality >= 0.70) return 'acceptable';
  if (quality >= 0.65) return 'marginal';
  return 'poor';
}
