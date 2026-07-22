import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { ComplianceRepository } from "../database/compliance-repository.js";
import { AuditRepository } from "../database/audit-repository.js";
import crypto from "node:crypto";

/**
 * Compliance Service - Orchestrates compliance assessments, control testing, and certificate generation
 */
export class ComplianceService {
  private complianceRepo: ComplianceRepository;
  private auditRepo: AuditRepository;

  constructor(private readonly pool: Pool) {
    this.complianceRepo = new ComplianceRepository(pool);
    this.auditRepo = new AuditRepository(pool);
  }

  // ============================================================================
  // COMPLIANCE ASSESSMENT
  // ============================================================================

  /**
   * Create and execute a compliance assessment for a branch
   */
  async createComplianceAssessment(input: {
    tenantId: string;
    frameworkId: string;
    branchNodeId?: string;
    assessmentPeriodStart: string;
    assessmentPeriodEnd: string;
    createdBy: string;
    runImmediately?: boolean;
  }) {
    // Create assessment record
    const assessment = await this.complianceRepo.createAssessment({
      tenantId: input.tenantId,
      frameworkId: input.frameworkId,
      branchNodeId: input.branchNodeId,
      assessmentPeriodStart: input.assessmentPeriodStart,
      assessmentPeriodEnd: input.assessmentPeriodEnd,
      status: 'incomplete',
      createdBy: input.createdBy,
    });

    if (input.runImmediately) {
      // Execute assessment asynchronously
      this.executeComplianceAssessment(assessment.id).catch((error) => {
        console.error('Failed to execute compliance assessment:', error);
      });
    }

    return assessment;
  }

  /**
   * Execute a compliance assessment by checking all controls
   */
  async executeComplianceAssessment(assessmentId: string) {
    const assessment = await this.complianceRepo.getAssessment(assessmentId);
    if (!assessment) {
      throw new Error('Assessment not found');
    }

    // Update status to in_progress (status is not part of ComplianceAssessmentStatus enum - using assessment execution)
    await this.complianceRepo.updateAssessment(assessmentId, {
      ...assessment,
      status: 'incomplete', // Keep as incomplete during execution
    });

    try {
      // Get all requirements for the framework
      const requirements = await this.complianceRepo.listComplianceRequirements(
        assessment.tenantId,
        { frameworkId: assessment.frameworkId, status: 'active' }
      );

      const results: any[] = [];

      // Assess each requirement
      for (const requirement of requirements) {
        const result = await this.assessRequirement(
          requirement.id,
          assessment.tenantId,
          assessment.branchNodeId,
          assessment.assessmentPeriodStart,
          assessment.assessmentPeriodEnd
        );
        results.push(result);
      }

      // Calculate overall compliance score
      const totalRequirements = results.length;
      const compliantRequirements = results.filter(r => r.compliant).length;
      const compliancePercentage = totalRequirements > 0 
        ? Math.round((compliantRequirements / totalRequirements) * 100) 
        : 0;

      // Generate summary
      const summary = {
        totalRequirements,
        compliantRequirements,
        nonCompliantRequirements: totalRequirements - compliantRequirements,
        compliancePercentage,
        criticalFindings: results.filter(r => r.findings?.some((f: any) => f.severity === 'critical')).length,
        highFindings: results.filter(r => r.findings?.some((f: any) => f.severity === 'high')).length,
        assessmentDate: new Date().toISOString(),
      };

      // Update assessment with results - map to valid ComplianceAssessmentStatus values
      const assessmentStatus: 'compliant' | 'exception' | 'non-compliant' | 'incomplete' = 
        compliancePercentage >= 90 ? 'compliant' : 
        compliancePercentage >= 70 ? 'exception' : 
        'non-compliant';
      
      await this.complianceRepo.updateAssessment(assessmentId, {
        ...assessment,
        status: assessmentStatus,
        summary,
        evidence: { results },
      });

      return {
        assessmentId,
        summary,
        results,
      };
    } catch (error) {
      // Mark assessment as failed - use 'non-compliant' as per ComplianceAssessmentStatus enum
      await this.complianceRepo.updateAssessment(assessmentId, {
        ...assessment,
        status: 'non-compliant',
        summary: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      throw error;
    }
  }

  /**
   * Assess a single requirement by checking its controls
   */
  private async assessRequirement(
    requirementId: string,
    tenantId: string,
    branchNodeId: string | undefined,
    periodStart: string,
    periodEnd: string
  ) {
    const requirement = await this.complianceRepo.getComplianceRequirement(requirementId);
    if (!requirement) {
      throw new Error('Requirement not found');
    }

    // Get all controls for this requirement
    const controls = await this.complianceRepo.listComplianceControls(tenantId, {
      requirementId,
    });

    const controlResults = [];
    let compliant = true;
    const findings: any[] = [];

    for (const control of controls) {
      // Check control implementation status
      if (control.implementationStatus !== 'implemented' && control.implementationStatus !== 'verified') {
        compliant = false;
        findings.push({
          controlId: control.id,
          controlName: control.controlName,
          issue: `Control not implemented (status: ${control.implementationStatus})`,
          severity: control.isMandatory ? 'high' : 'medium',
        });
        continue;
      }

      // Check if control testing is up to date
      if (control.testFrequencyDays && control.lastTestDate) {
        const lastTestDateValue = String(control.lastTestDate);
        const daysSinceTest = Math.floor(
          (new Date().getTime() - new Date(lastTestDateValue).getTime()) / (1000 * 60 * 60 * 24)
        );
        
        const testFrequency = Number(control.testFrequencyDays);
        if (daysSinceTest > testFrequency) {
          compliant = false;
          findings.push({
            controlId: control.id,
            controlName: control.controlName,
            issue: `Control testing overdue by ${daysSinceTest - testFrequency} days`,
            severity: 'medium',
          });
        }
      }

      // Get recent test results
      const tests = await this.complianceRepo.listComplianceTests(tenantId, {
        controlId: String(control.id),
      });

      const recentTests = tests.filter(t => {
        const testDate = new Date(String(t.testDate ?? ''));
        return testDate >= new Date(periodStart) && testDate <= new Date(periodEnd);
      });

      const failedTests = recentTests.filter(t => t.status === 'failed');
      if (failedTests.length > 0) {
        compliant = false;
        findings.push({
          controlId: control.id,
          controlName: control.controlName,
          issue: `${failedTests.length} failed test(s) in assessment period`,
          severity: 'high',
        });
      }

      controlResults.push({
        controlId: control.id,
        controlName: control.controlName,
        implementationStatus: control.implementationStatus,
        automated: control.automated,
        testsPerformed: recentTests.length,
        testsPassed: recentTests.filter(t => t.status === 'passed').length,
        testsFailed: failedTests.length,
      });
    }

    // Check evidence requirements
    if (requirement.evidenceRequired) {
      const evidence = await this.complianceRepo.listComplianceEvidence(tenantId, {
        requirementId,
      });

      const validatedEvidence = evidence.filter(e => e.validated);
      if (validatedEvidence.length === 0) {
        compliant = false;
        findings.push({
          requirementId,
          issue: 'No validated evidence found for requirement',
          severity: 'medium',
        });
      }
    }

    return {
      requirementId,
      requirementCode: requirement.requirementCode,
      requirementTitle: requirement.title,
      compliant,
      controlCount: controls.length,
      implementedControls: controls.filter(c => 
        c.implementationStatus === 'implemented' || c.implementationStatus === 'verified'
      ).length,
      findings,
      controlResults,
    };
  }

  // ============================================================================
  // CONTROL TESTING
  // ============================================================================

  /**
   * Execute automated control test
   */
  async testControl(input: {
    tenantId: string;
    controlId: string;
    testerId: string;
    testType: string;
    branchNodeId?: string;
  }) {
    const control = await this.complianceRepo.getComplianceControl(input.controlId);
    if (!control) {
      throw new Error('Control not found');
    }

    // Create test record
    const test = await this.complianceRepo.createComplianceTest({
      tenantId: input.tenantId,
      controlId: input.controlId,
      testName: `${control.controlName} - ${input.testType}`,
      testType: input.testType,
      testDate: new Date().toISOString(),
      status: 'in_progress',
    });

    try {
      // Execute test based on control type and test type
      let testResult;
      
      if (control.automated && control.continuousMonitoring) {
        testResult = await this.executeAutomatedTest(control, input.branchNodeId);
      } else {
        // Manual test - create test record for manual execution
        testResult = {
          status: 'not_started',
          message: 'Manual testing required',
        };
      }

      // Update test with results
      await this.complianceRepo.updateComplianceTest(String(test.id), {
        ...test,
        status: testResult.status === 'passed' ? 'passed' : testResult.status === 'failed' ? 'failed' : 'not_started' as any,
        findings: testResult.findings,
        passFail: testResult.status === 'passed',
        score: testResult.score,
        recommendations: testResult.recommendations,
      });

      // Update control test dates
      if (testResult.status === 'passed' || testResult.status === 'failed') {
        const testFreqDays = control.testFrequencyDays ? Number(control.testFrequencyDays) : 90;
        const nextTestDate = new Date();
        nextTestDate.setDate(nextTestDate.getDate() + testFreqDays);
        
        await this.complianceRepo.updateControlTestDates(input.controlId, {
          lastTestDate: new Date().toISOString(),
          nextTestDate: nextTestDate.toISOString(),
          effectivenessRating: testResult.status === 'passed' ? 5 : 2,
        });
      }

      return {
        testId: String(test.id),
        ...testResult,
      };
    } catch (error) {
      await this.complianceRepo.updateComplianceTest(String(test.id), {
        ...test,
        status: 'failed',
        findings: error instanceof Error ? error.message : 'Test execution failed',
      });
      throw error;
    }
  }

  /**
   * Execute automated control test based on control type
   */
  private async executeAutomatedTest(control: any, branchNodeId?: string) {
    // Determine test type based on control technical implementation
    const techImpl = control.technicalImplementation?.toLowerCase() || '';

    if (techImpl.includes('camera') || techImpl.includes('recording')) {
      return await this.testCameraControls(control, branchNodeId);
    } else if (techImpl.includes('retention') || techImpl.includes('storage')) {
      return await this.testRetentionControls(control, branchNodeId);
    } else if (techImpl.includes('access') || techImpl.includes('authentication')) {
      return await this.testAccessControls(control, branchNodeId);
    } else {
      return {
        status: 'not_applicable',
        message: 'Automated testing not available for this control type',
      };
    }
  }

  /**
   * Test camera-related controls (coverage, health, recording)
   */
  private async testCameraControls(control: any, branchNodeId?: string) {
    const tenantId = control.tenantId;
    
    // Get camera health summary
    const healthSummary = await this.auditRepo.getCameraHealthSummary(tenantId, branchNodeId);
    
    const totalCameras = parseInt(String(healthSummary.totalCameras ?? '0'));
    const healthyCameras = parseInt(String(healthSummary.healthyCameras ?? '0'));
    const recordingCameras = parseInt(String(healthSummary.recordingCameras ?? '0'));

    const findings: string[] = [];
    let passed = true;

    // Check if at least 95% of cameras are healthy
    if (totalCameras > 0) {
      const healthPercentage = (healthyCameras / totalCameras) * 100;
      if (healthPercentage < 95) {
        passed = false;
        findings.push(`Only ${healthPercentage.toFixed(1)}% of cameras are healthy (target: 95%)`);
      }

      const recordingPercentage = (recordingCameras / totalCameras) * 100;
      if (recordingPercentage < 98) {
        passed = false;
        findings.push(`Only ${recordingPercentage.toFixed(1)}% of cameras are recording (target: 98%)`);
      }
    }

    return {
      status: passed ? 'passed' : 'failed',
      findings: findings.join('; '),
      score: totalCameras > 0 ? (healthyCameras / totalCameras) * 100 : 0,
      recommendations: passed ? 'Camera health controls are effective' : 'Review camera health issues and implement corrective actions',
    };
  }

  /**
   * Test retention and storage controls
   */
  private async testRetentionControls(control: any, branchNodeId?: string) {
    const tenantId = control.tenantId;
    
    // Get storage health summary
    const storageSummary = await this.auditRepo.getStorageHealthSummary(tenantId, branchNodeId);
    
    const findings: string[] = [];
    let passed = true;

    const avgUtilization = parseFloat(String(storageSummary.avgUtilization ?? '0'));
    const minDaysUntilFull = parseInt(String(storageSummary.minDaysUntilFull ?? '999'));

    // Check storage utilization
    if (avgUtilization > 85) {
      passed = false;
      findings.push(`Storage utilization at ${avgUtilization.toFixed(1)}% (warning threshold: 85%)`);
    }

    // Check days until full
    if (minDaysUntilFull < 30) {
      passed = false;
      findings.push(`Storage will be full in ${minDaysUntilFull} days (minimum: 30 days)`);
    }

    // Get recent recording verification jobs
    const verificationJobs = await this.auditRepo.listRecordingVerificationJobs(
      tenantId,
      {
        branchNodeId,
        from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        to: new Date().toISOString(),
      }
    );

    const compliantJobs = verificationJobs.filter(j => j.verificationStatus === 'compliant');
    const complianceRate = verificationJobs.length > 0 
      ? (compliantJobs.length / verificationJobs.length) * 100 
      : 0;

    if (complianceRate < 95) {
      passed = false;
      findings.push(`Recording compliance rate at ${complianceRate.toFixed(1)}% (target: 95%)`);
    }

    return {
      status: passed ? 'passed' : 'failed',
      findings: findings.join('; '),
      score: complianceRate,
      recommendations: passed 
        ? 'Retention and storage controls are effective' 
        : 'Review storage capacity planning and recording verification failures',
    };
  }

  /**
   * Test access control compliance
   */
  private async testAccessControls(control: any, branchNodeId?: string) {
    const tenantId = control.tenantId;
    
    // Get video access summary for the last 30 days
    const accessSummary = await this.auditRepo.getVideoAccessSummary(tenantId, {
      from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      to: new Date().toISOString(),
    });

    const findings: string[] = [];
    let passed = true;

    const totalAccesses = parseInt(String(accessSummary.totalAccesses ?? '0'));
    const deniedAccesses = parseInt(String(accessSummary.deniedAccesses ?? '0'));
    const externalAccesses = parseInt(String(accessSummary.externalAccesses ?? '0'));

    // Check for unauthorized access attempts
    if (totalAccesses > 0) {
      const denialRate = (deniedAccesses / totalAccesses) * 100;
      if (denialRate > 5) {
        passed = false;
        findings.push(`High access denial rate: ${denialRate.toFixed(1)}% (threshold: 5%)`);
      }
    }

    // Check external access
    if (externalAccesses > 0) {
      findings.push(`${externalAccesses} external access events detected - review for policy compliance`);
    }

    return {
      status: passed ? 'passed' : 'failed',
      findings: findings.join('; '),
      score: passed ? 100 : 70,
      recommendations: passed 
        ? 'Access controls are effective' 
        : 'Review access denial patterns and external access policies',
    };
  }

  // ============================================================================
  // CERTIFICATE GENERATION
  // ============================================================================

  /**
   * Generate a compliance certificate with digital signature
   */
  async generateComplianceCertificate(input: {
    tenantId: string;
    assessmentId: string;
    issuedBy: string;
    expiryMonths?: number;
    includeExceptions?: boolean;
  }) {
    const assessment = await this.complianceRepo.getAssessment(input.assessmentId);
    if (!assessment) {
      throw new Error('Assessment not found');
    }

    // Get framework details
    const framework = await this.complianceRepo.getFramework(assessment.frameworkId);
    if (!framework) {
      throw new Error('Framework not found');
    }

    // Generate certificate number
    const certificateNumber = this.generateCertificateNumber(input.tenantId, framework.name);

    // Determine certificate status based on assessment
    let certificateStatus: 'compliant' | 'compliant_with_exceptions' | 'non_compliant';
    const compliancePercentage = Number(assessment.summary?.compliancePercentage ?? 0);
    
    if (compliancePercentage >= 95) {
      certificateStatus = 'compliant';
    } else if (compliancePercentage >= 70) {
      certificateStatus = 'compliant_with_exceptions';
    } else {
      certificateStatus = 'non_compliant';
    }

    // Calculate expiry date
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + (input.expiryMonths || 12));

    // Prepare certificate content
    const certificateContent = {
      certificateNumber,
      framework: framework.name,
      frameworkVersion: '1.0',
      assessmentPeriod: {
        start: assessment.assessmentPeriodStart,
        end: assessment.assessmentPeriodEnd,
      },
      branch: assessment.branchNodeId || 'Organization-wide',
      complianceScore: compliancePercentage,
      status: certificateStatus,
      summary: assessment.summary,
      issuedDate: new Date().toISOString(),
      expiryDate: expiryDate.toISOString(),
      issuedBy: input.issuedBy,
    };

    // Generate document hash
    const documentHash = this.generateDocumentHash(certificateContent);

    // Generate digital signature
    const signature = this.generateDigitalSignature(documentHash, input.issuedBy);

    // Create certificate record
    const certificate = await this.complianceRepo.createCertificate({
      tenantId: input.tenantId,
      assessmentId: input.assessmentId,
      certificateNumber,
      title: `${framework.name} Compliance Certificate`,
      status: certificateStatus,
      issuedBy: input.issuedBy,
      issuedAt: new Date().toISOString(),
      expiryDate: expiryDate.toISOString(),
      documentHash,
      signature,
      metadata: certificateContent,
    });

    // Create verification code
    const verificationCode = this.generateVerificationCode(certificate.id);
    const qrCodeUrl = await this.generateQRCode(verificationCode);

    await this.auditRepo.createCertificateVerification({
      certificateId: certificate.id,
      verificationCode,
      qrCodeUrl,
      issuedAt: new Date().toISOString(),
    });

    return {
      certificate,
      verificationCode,
      qrCodeUrl,
    };
  }

  /**
   * Verify a compliance certificate by verification code
   */
  async verifyCertificate(verificationCode: string) {
    const verification = await this.auditRepo.verifyCertificateByCode(verificationCode);
    
    if (!verification) {
      return {
        valid: false,
        message: 'Invalid verification code or certificate has been revoked',
      };
    }

    // Get certificate details
    const certificate = await this.complianceRepo.getCertificate(String(verification.certificateId));
    if (!certificate) {
      return {
        valid: false,
        message: 'Certificate not found',
      };
    }

    // Check if certificate has expired
    const now = new Date();
    const expiryDate = new Date(String(certificate.expiryDate ?? ''));
    
    if (now > expiryDate) {
      return {
        valid: false,
        expired: true,
        message: 'Certificate has expired',
        certificate: {
          certificateNumber: certificate.certificateNumber,
          expiryDate: certificate.expiryDate,
        },
      };
    }

    // Verify document hash
    const documentHashValid = this.verifyDocumentHash(
      certificate.metadata,
      certificate.documentHash
    );

    if (!documentHashValid) {
      return {
        valid: false,
        message: 'Certificate integrity check failed - document may have been tampered with',
      };
    }

    return {
      valid: true,
      certificate: {
        certificateNumber: certificate.certificateNumber,
        title: certificate.title,
        status: certificate.status,
        issuedAt: certificate.issuedAt,
        expiryDate: certificate.expiryDate,
        metadata: certificate.metadata,
      },
      verification: {
        verificationCode: verification.verificationCode,
        verificationCount: verification.verificationCount,
        lastVerifiedAt: verification.lastVerifiedAt,
      },
    };
  }

  /**
   * Revoke a certificate
   */
  async revokeCertificate(input: {
    certificateId: string;
    revokedBy: string;
    revocationReason: string;
  }) {
    // Get certificate verification
    const result = await this.pool.query(
      'SELECT id FROM compliance_certificate_verifications WHERE certificate_id = $1 AND revoked = false',
      [input.certificateId]
    );

    if (result.rows.length === 0) {
      throw new Error('Certificate verification not found or already revoked');
    }

    // Revoke the verification
    await this.auditRepo.revokeCertificateVerification(result.rows[0].id, {
      revokedBy: input.revokedBy,
      revocationReason: input.revocationReason,
    });

    // Certificate has been revoked through verification
    // No need to update assessment status as 'revoked' is not a valid ComplianceAssessmentStatus

    return {
      certificateId: input.certificateId,
      revoked: true,
      revokedAt: new Date().toISOString(),
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Generate unique certificate number
   */
  private generateCertificateNumber(tenantId: string, frameworkName: string): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // Format: CERT-{FRAMEWORK_CODE}-{YEAR}{MONTH}-{RANDOM}
    const frameworkCode = frameworkName
      .split(' ')
      .map(w => w[0])
      .join('')
      .toUpperCase()
      .substring(0, 4);
    
    return `CERT-${frameworkCode}-${year}${month}-${random}`;
  }

  /**
   * Generate SHA-256 hash of certificate content
   */
  private generateDocumentHash(content: any): string {
    const contentString = JSON.stringify(content, Object.keys(content).sort());
    return crypto.createHash('sha256').update(contentString).digest('hex');
  }

  /**
   * Generate digital signature for certificate
   */
  private generateDigitalSignature(documentHash: string, issuedBy: string): string {
    // In production, use proper private key signing
    // For now, create a verifiable signature using HMAC
    const secret = process.env.CERTIFICATE_SIGNING_SECRET || 'default-secret-change-in-production';
    const signatureData = `${documentHash}:${issuedBy}:${new Date().toISOString()}`;
    
    return crypto
      .createHmac('sha256', secret)
      .update(signatureData)
      .digest('hex');
  }

  /**
   * Verify document hash integrity
   */
  private verifyDocumentHash(content: any, expectedHash: string): boolean {
    const actualHash = this.generateDocumentHash(content);
    return actualHash === expectedHash;
  }

  /**
   * Generate unique verification code
   */
  private generateVerificationCode(certificateId: string): string {
    const random = crypto.randomBytes(16).toString('hex');
    const hash = crypto
      .createHash('sha256')
      .update(`${certificateId}:${random}`)
      .digest('hex')
      .substring(0, 24)
      .toUpperCase();
    
    // Format as groups of 4 for readability
    return hash.match(/.{1,4}/g)?.join('-') || hash;
  }

  /**
   * Generate QR code URL for verification
   */
  private async generateQRCode(verificationCode: string): Promise<string> {
    // In production, generate actual QR code image
    // For now, return verification URL
    const baseUrl = process.env.PUBLIC_URL || 'https://sentinel.aditi.com';
    return `${baseUrl}/compliance/verify?code=${verificationCode}`;
  }
}
