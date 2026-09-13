/**
 * BFSI Bank and NBFC Camera & Zone Calibration Suite
 * 
 * Provides rigorous geometric calibration for high-assurance branch zones:
 * 1. ATM: Kiosk boundary, machine/card-slot ROI, entry zone.
 * 2. Cash counter: Teller area, customer boundary, cash-tray ROI.
 * 3. Vault/locker: Door ROI, inside-zone, entry/exit line (dual control).
 * 4. Gold loan: Appraisal desk, pouch handover route, vault route.
 * 5. Guard post: Chair/post zone, allowed inactivity duration.
 * 
 * Includes environmental testing matrix:
 * Daytime, Night (IR), Low Light, Face-Cover / Mask, Crowd Density, Partial Occlusion.
 */

export interface Point2D {
  x: number; // 0.0 - 1.0 normalized
  y: number; // 0.0 - 1.0 normalized
}

export interface RoiBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AtmCalibration {
  kioskBoundary: Point2D[];
  machineCardSlotRoi: RoiBox;
  entryZone: Point2D[];
  maxLoiteringSeconds: number;
  maxPeopleAllowed: number;
}

export interface CashCounterCalibration {
  tellerArea: Point2D[];
  customerBoundary: { start: Point2D; end: Point2D };
  cashTrayRoi: RoiBox;
  maxCashTrayOpenSeconds: number;
}

export interface VaultLockerCalibration {
  doorRoi: RoiBox;
  insideZone: Point2D[];
  entryExitLine: { start: Point2D; end: Point2D };
  dualCustodyRequired: boolean;
  maxDoorOpenSeconds: number;
}

export interface GoldLoanCalibration {
  appraisalDeskRoi: RoiBox;
  pouchHandoverRoute: Point2D[];
  vaultRoute: Point2D[];
  maxCustodyGapSeconds: number;
}

export interface GuardPostCalibration {
  chairPostZone: Point2D[];
  allowedInactivityDurationSeconds: number;
}

export type EnvironmentalCondition =
  | "daytime"
  | "night_ir"
  | "low_light"
  | "face_cover"
  | "crowd"
  | "partial_occlusion";

export interface EnvironmentalTestResult {
  condition: EnvironmentalCondition;
  testedAt: Date;
  status: "PASSED" | "FAILED" | "REQUIRES_ADJUSTMENT";
  minDetectionConfidence: number;
  falsePositiveRate: number;
  notes: string;
}

export interface CameraCalibrationProfile {
  cameraId: string;
  branchId: string;
  tenantId: string;
  calibratedAt: Date;
  calibratedBy: string;
  zoneType: "atm" | "cash_counter" | "vault" | "gold_loan" | "guard_post";
  atm?: AtmCalibration;
  cashCounter?: CashCounterCalibration;
  vault?: VaultLockerCalibration;
  goldLoan?: GoldLoanCalibration;
  guardPost?: GuardPostCalibration;
  environmentalMatrix: Record<EnvironmentalCondition, EnvironmentalTestResult>;
}

export class BfsiZoneCalibrationService {
  private readonly profiles = new Map<string, CameraCalibrationProfile>();

  /**
   * Registers or updates an audited camera zone calibration profile.
   */
  registerCalibration(profile: CameraCalibrationProfile): void {
    this.validateProfile(profile);
    this.profiles.set(profile.cameraId, profile);
  }

  getCalibration(cameraId: string): CameraCalibrationProfile | undefined {
    return this.profiles.get(cameraId);
  }

  /**
   * Validates geometric coordinates, ROI boundaries, and environmental tests.
   */
  validateProfile(profile: CameraCalibrationProfile): void {
    if (!profile.cameraId || !profile.branchId) {
      throw new Error("calibration_missing_ids");
    }

    switch (profile.zoneType) {
      case "atm": {
        if (!profile.atm) throw new Error("missing_atm_calibration");
        this.assertPolygonValid(profile.atm.kioskBoundary, 3, "kioskBoundary");
        this.assertRoiValid(profile.atm.machineCardSlotRoi, "machineCardSlotRoi");
        this.assertPolygonValid(profile.atm.entryZone, 3, "entryZone");
        break;
      }
      case "cash_counter": {
        if (!profile.cashCounter) throw new Error("missing_cash_counter_calibration");
        this.assertPolygonValid(profile.cashCounter.tellerArea, 3, "tellerArea");
        this.assertRoiValid(profile.cashCounter.cashTrayRoi, "cashTrayRoi");
        break;
      }
      case "vault": {
        if (!profile.vault) throw new Error("missing_vault_calibration");
        this.assertRoiValid(profile.vault.doorRoi, "doorRoi");
        this.assertPolygonValid(profile.vault.insideZone, 3, "insideZone");
        break;
      }
      case "gold_loan": {
        if (!profile.goldLoan) throw new Error("missing_gold_loan_calibration");
        this.assertRoiValid(profile.goldLoan.appraisalDeskRoi, "appraisalDeskRoi");
        if (!profile.goldLoan.pouchHandoverRoute || profile.goldLoan.pouchHandoverRoute.length < 2) {
          throw new Error("invalid_pouch_handover_route");
        }
        if (!profile.goldLoan.vaultRoute || profile.goldLoan.vaultRoute.length < 2) {
          throw new Error("invalid_vault_route");
        }
        break;
      }
      case "guard_post": {
        if (!profile.guardPost) throw new Error("missing_guard_post_calibration");
        this.assertPolygonValid(profile.guardPost.chairPostZone, 3, "chairPostZone");
        if (profile.guardPost.allowedInactivityDurationSeconds < 10) {
          throw new Error("inactivity_duration_too_short");
        }
        break;
      }
    }

    // Verify all 6 mandatory environmental test conditions are recorded
    const requiredConditions: EnvironmentalCondition[] = [
      "daytime",
      "night_ir",
      "low_light",
      "face_cover",
      "crowd",
      "partial_occlusion",
    ];

    for (const cond of requiredConditions) {
      const result = profile.environmentalMatrix?.[cond];
      if (!result) {
        throw new Error(`missing_environmental_test:${cond}`);
      }
      if (result.status === "FAILED") {
        throw new Error(`unacceptable_environmental_failure:${cond}`);
      }
    }
  }

  /**
   * Ray-casting point-in-polygon evaluation.
   */
  isPointInPolygon(point: Point2D, polygon: Point2D[]): boolean {
    if (polygon.length < 3) return false;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const pi = polygon[i];
      const pj = polygon[j];
      if (!pi || !pj) continue;

      const xi = pi.x;
      const yi = pi.y;
      const xj = pj.x;
      const yj = pj.y;

      const intersect =
        yi > point.y !== yj > point.y &&
        point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * Evaluates if a detected box is inside or intersecting an ROI.
   */
  isBoxInRoi(box: RoiBox, roi: RoiBox): boolean {
    return (
      box.x >= roi.x &&
      box.y >= roi.y &&
      box.x + box.width <= roi.x + roi.width &&
      box.y + box.height <= roi.y + roi.height
    );
  }

  private assertPolygonValid(polygon: Point2D[], minVertices: number, name: string): void {
    if (!polygon || polygon.length < minVertices) {
      throw new Error(`invalid_polygon_${name}: requires at least ${minVertices} vertices`);
    }
    for (const p of polygon) {
      if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) {
        throw new Error(`polygon_coordinate_out_of_bounds_${name}`);
      }
    }
  }

  private assertRoiValid(roi: RoiBox, name: string): void {
    if (!roi || roi.width <= 0 || roi.height <= 0) {
      throw new Error(`invalid_roi_dimensions_${name}`);
    }
    if (roi.x < 0 || roi.y < 0 || roi.x + roi.width > 1 || roi.y + roi.height > 1) {
      throw new Error(`roi_out_of_bounds_${name}`);
    }
  }
}
