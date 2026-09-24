/**
 * Patrol Optimization Engine
 * 
 * Generates optimal patrol routes based on predicted risk heat maps.
 * Uses greedy nearest-neighbor algorithm with priority weighting for route planning.
 * 
 * Features:
 * - Risk-based checkpoint prioritization
 * - Multi-officer route optimization
 * - Time-windowed scheduling
 * - Distance-aware routing
 * - Real-time route adjustment
 * - Patrol effectiveness tracking
 * 
 * Architecture:
 * - Risk Assessment: Identify high-risk zones from heat maps
 * - Checkpoint Selection: Select optimal patrol checkpoints
 * - Route Generation: Calculate efficient routes (TSP-like problem)
 * - Resource Allocation: Distribute officers across routes
 * - Real-time Updates: Adjust routes based on new incidents/anomalies
 * 
 * Algorithm: Greedy Nearest-Neighbor with Risk Priority Weighting
 */

import type { Pool } from 'pg';
import type { RiskHeatMap, RiskCell } from './security-risk-prediction-engine.js';

// =====================================================
// TYPES
// =====================================================

export interface PatrolCheckpoint {
  zoneId: string;
  location: { lat: number; lon: number };
  riskScore: number;
  priority: number; // 1-5 (5 = highest)
  estimatedDurationMinutes: number;
  requiredActions: string[];
}

export interface PatrolRoute {
  officerId?: string;
  checkpoints: Array<{
    zoneId: string;
    location: { lat: number; lon: number };
    arrivalTime: string; // HH:MM format
    durationMinutes: number;
    riskScore: number;
    priority: number;
    actions: string[];
  }>;
  totalDistanceMeters: number;
  totalDurationMinutes: number;
  riskCovered: number; // Sum of risk scores
}

export interface PatrolPlan {
  id: string;
  tenantId: string;
  branchId: string;
  planName: string;
  planType: 'proactive' | 'reactive' | 'routine' | 'emergency';
  plannedForDate: Date;
  shiftStartTime: string; // HH:MM
  shiftEndTime: string; // HH:MM
  optimizationObjective: 'minimize_risk' | 'maximize_coverage' | 'balanced' | 'rapid_response';
  totalRiskCovered: number;
  coveragePercentage: number;
  requiredOfficers: number;
  estimatedDurationMinutes: number;
  routes: PatrolRoute[];
  priorityZones: Array<{
    zoneId: string;
    riskScore: number;
    reason: string;
  }>;
  status: 'DRAFT' | 'APPROVED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  generatedAt: Date;
  metadata?: any;
}

interface OptimizationOptions {
  maxCheckpointsPerRoute: number;
  maxRouteDurationMinutes: number;
  minCheckpointDurationMinutes: number;
  maxCheckpointDurationMinutes: number;
  priorityRiskThreshold: number; // Risk score threshold for priority zones
  travelSpeedMetersPerMinute: number; // Average walking/driving speed
}

// =====================================================
// PATROL OPTIMIZATION ENGINE
// =====================================================

export class PatrolOptimizationEngine {
  private readonly db: Pool;
  private readonly options: OptimizationOptions;
  
  // Metrics
  private metrics = {
    totalPlansGenerated: 0,
    avgOptimizationTimeMs: 0,
    avgCoveragePercentage: 0,
    totalPatrolsCompleted: 0,
    avgEffectivenessScore: 0,
  };
  
  constructor(db: Pool, options?: Partial<OptimizationOptions>) {
    this.db = db;
    this.options = {
      maxCheckpointsPerRoute: options?.maxCheckpointsPerRoute ?? 8,
      maxRouteDurationMinutes: options?.maxRouteDurationMinutes ?? 240, // 4 hours
      minCheckpointDurationMinutes: options?.minCheckpointDurationMinutes ?? 5,
      maxCheckpointDurationMinutes: options?.maxCheckpointDurationMinutes ?? 15,
      priorityRiskThreshold: options?.priorityRiskThreshold ?? 70,
      travelSpeedMetersPerMinute: options?.travelSpeedMetersPerMinute ?? 60, // ~3.6 km/h walking
    };
  }
  
  // =====================================================
  // PATROL PLAN GENERATION
  // =====================================================
  
  /**
   * Generate optimized patrol plan based on risk heat map
   */
  async generatePatrolPlan(
    tenantId: string,
    branchId: string,
    heatMap: RiskHeatMap,
    plannedForDate: Date,
    shiftStartTime: string,
    shiftEndTime: string,
    availableOfficers: number,
    objective: PatrolPlan['optimizationObjective'] = 'balanced'
  ): Promise<PatrolPlan> {
    const startTime = Date.now();
    
    // Step 1: Extract high-risk checkpoints from heat map
    const checkpoints = this.extractCheckpoints(heatMap, objective);
    
    // Step 2: Prioritize checkpoints
    const prioritized = this.prioritizeCheckpoints(checkpoints, objective);
    
    // Step 3: Calculate shift duration
    const shiftDurationMinutes = this.calculateShiftDuration(shiftStartTime, shiftEndTime);
    
    // Step 4: Generate routes for available officers
    const routes = await this.generateRoutes(
      prioritized,
      availableOfficers,
      shiftStartTime,
      shiftDurationMinutes,
      objective
    );
    
    // Step 5: Calculate coverage metrics
    const totalRiskCovered = routes.reduce((sum, r) => sum + r.riskCovered, 0);
    const totalAvailableRisk = checkpoints.reduce((sum, c) => sum + c.riskScore, 0);
    const coveragePercentage = totalAvailableRisk > 0
      ? (totalRiskCovered / totalAvailableRisk) * 100
      : 0;
    
    // Step 6: Identify priority zones
    const priorityZones = prioritized
      .filter(cp => cp.priority >= 4)
      .map(cp => ({
        zoneId: cp.zoneId,
        riskScore: cp.riskScore,
        reason: this.getPriorityReason(cp),
      }));
    
    // Step 7: Create patrol plan
    const plan: PatrolPlan = {
      id: `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tenantId,
      branchId,
      planName: `${objective} Patrol - ${plannedForDate.toLocaleDateString()}`,
      planType: 'proactive',
      plannedForDate,
      shiftStartTime,
      shiftEndTime,
      optimizationObjective: objective,
      totalRiskCovered,
      coveragePercentage,
      requiredOfficers: routes.length,
      estimatedDurationMinutes: Math.max(...routes.map(r => r.totalDurationMinutes)),
      routes,
      priorityZones,
      status: 'DRAFT',
      generatedAt: new Date(),
    };
    
    // Store plan
    await this.storePlan(plan);
    
    // Update metrics
    this.metrics.totalPlansGenerated++;
    this.metrics.avgOptimizationTimeMs = 
      (this.metrics.avgOptimizationTimeMs + (Date.now() - startTime)) / 2;
    this.metrics.avgCoveragePercentage = 
      (this.metrics.avgCoveragePercentage + coveragePercentage) / 2;
    
    return plan;
  }
  
  /**
   * Extract patrol checkpoints from risk heat map
   */
  private extractCheckpoints(
    heatMap: RiskHeatMap,
    objective: string
  ): PatrolCheckpoint[] {
    const checkpoints: PatrolCheckpoint[] = [];
    
    // Filter cells based on objective
    let cells: RiskCell[];
    
    if (objective === 'minimize_risk') {
      // Focus on highest risk areas
      cells = heatMap.cells.filter((c: RiskCell) => c.riskLevel === 'critical' || c.riskLevel === 'high');
    } else if (objective === 'maximize_coverage') {
      // Include all areas with some risk
      cells = heatMap.cells.filter((c: RiskCell) => c.riskScore >= 20);
    } else if (objective === 'rapid_response') {
      // Only critical areas
      cells = heatMap.cells.filter((c: RiskCell) => c.riskLevel === 'critical');
    } else {
      // Balanced: medium risk and above
      cells = heatMap.cells.filter((c: RiskCell) => c.riskScore >= 40);
    }
    
    // Sort by risk score
    cells.sort((a, b) => b.riskScore - a.riskScore);
    
    // Convert to checkpoints
    for (const cell of cells) {
      const checkpoint: PatrolCheckpoint = {
        zoneId: cell.gridCellId,
        location: cell.centerPoint,
        riskScore: cell.riskScore,
        priority: this.calculatePriority(cell),
        estimatedDurationMinutes: this.calculateCheckpointDuration(cell),
        requiredActions: this.getRequiredActions(cell),
      };
      
      checkpoints.push(checkpoint);
    }
    
    return checkpoints;
  }
  
  private calculatePriority(cell: RiskCell): number {
    // Priority 1-5 based on risk level and contributing factors
    let priority = 1;
    
    if (cell.riskLevel === 'critical') priority = 5;
    else if (cell.riskLevel === 'high') priority = 4;
    else if (cell.riskLevel === 'medium') priority = 3;
    else priority = 2;
    
    // Boost priority for specific factors
    if (cell.contributingFactors.includes('recent_anomalies')) priority = Math.min(priority + 1, 5);
    if (cell.contributingFactors.includes('violence_prone_area')) priority = 5;
    if (cell.contributingFactors.includes('camera_blind_spot')) priority = Math.min(priority + 1, 5);
    
    return priority;
  }
  
  private calculateCheckpointDuration(cell: RiskCell): number {
    // Duration based on risk level and factors
    let duration = this.options.minCheckpointDurationMinutes;
    
    if (cell.riskLevel === 'critical') duration = 15;
    else if (cell.riskLevel === 'high') duration = 10;
    else if (cell.riskLevel === 'medium') duration = 7;
    else duration = 5;
    
    return Math.min(duration, this.options.maxCheckpointDurationMinutes);
  }
  
  private getRequiredActions(cell: RiskCell): string[] {
    const actions: string[] = ['Visual inspection', 'Check perimeter'];
    
    if (cell.contributingFactors.includes('camera_blind_spot')) {
      actions.push('Deploy mobile camera');
    }
    
    if (cell.contributingFactors.includes('recent_anomalies')) {
      actions.push('Investigate anomaly reports');
    }
    
    if (cell.riskComponents.intrusionRisk > 0.7) {
      actions.push('Check locks and barriers');
    }
    
    if (cell.riskComponents.violenceRisk > 0.7) {
      actions.push('Assess crowd behavior');
    }
    
    return actions;
  }
  
  /**
   * Prioritize checkpoints based on objective
   */
  private prioritizeCheckpoints(
    checkpoints: PatrolCheckpoint[],
    objective: string
  ): PatrolCheckpoint[] {
    const sorted = [...checkpoints];
    
    if (objective === 'minimize_risk') {
      // Sort by risk score descending
      sorted.sort((a, b) => b.riskScore - a.riskScore);
    } else if (objective === 'maximize_coverage') {
      // Sort by priority then risk
      sorted.sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return b.riskScore - a.riskScore;
      });
    } else if (objective === 'rapid_response') {
      // Critical only, sorted by risk
      sorted.sort((a, b) => b.riskScore - a.riskScore);
    } else {
      // Balanced: weighted score
      sorted.sort((a, b) => {
        const scoreA = a.riskScore * 0.6 + a.priority * 10;
        const scoreB = b.riskScore * 0.6 + b.priority * 10;
        return scoreB - scoreA;
      });
    }
    
    return sorted;
  }
  
  // =====================================================
  // ROUTE GENERATION
  // =====================================================
  
  /**
   * Generate optimal routes using greedy nearest-neighbor with priority weighting
   */
  private async generateRoutes(
    checkpoints: PatrolCheckpoint[],
    officerCount: number,
    startTime: string,
    shiftDurationMinutes: number,
    objective: string
  ): Promise<PatrolRoute[]> {
    const routes: PatrolRoute[] = [];
    const remaining = [...checkpoints];
    
    // Distribute checkpoints across officers
    for (let i = 0; i < officerCount; i++) {
      if (remaining.length === 0) break;
      
      const route = this.generateSingleRoute(
        remaining,
        startTime,
        shiftDurationMinutes,
        objective
      );
      
      if (route.checkpoints.length > 0) {
        routes.push(route);
        
        // Remove assigned checkpoints from remaining
        const assignedZones = new Set(route.checkpoints.map(cp => cp.zoneId));
        for (let j = remaining.length - 1; j >= 0; j--) {
          if (assignedZones.has(remaining[j]!.zoneId)) {
            remaining.splice(j, 1);
          }
        }
      }
    }
    
    return routes;
  }
  
  /**
   * Generate a single route using greedy nearest-neighbor algorithm
   */
  private generateSingleRoute(
    availableCheckpoints: PatrolCheckpoint[],
    startTime: string,
    maxDurationMinutes: number,
    objective: string
  ): PatrolRoute {
    const route: PatrolRoute = {
      checkpoints: [],
      totalDistanceMeters: 0,
      totalDurationMinutes: 0,
      riskCovered: 0,
    };
    
    if (availableCheckpoints.length === 0) return route;
    
    // Start with highest priority checkpoint
    let currentCheckpoint = availableCheckpoints[0]!;
    const visited = new Set<string>();
    const unvisited = [...availableCheckpoints];
    
    let currentTime = this.parseTime(startTime);
    
    // Add first checkpoint
    route.checkpoints.push({
      zoneId: currentCheckpoint.zoneId,
      location: currentCheckpoint.location,
      arrivalTime: this.formatTime(currentTime),
      durationMinutes: currentCheckpoint.estimatedDurationMinutes,
      riskScore: currentCheckpoint.riskScore,
      priority: currentCheckpoint.priority,
      actions: currentCheckpoint.requiredActions,
    });
    
    visited.add(currentCheckpoint.zoneId);
    route.totalDurationMinutes += currentCheckpoint.estimatedDurationMinutes;
    route.riskCovered += currentCheckpoint.riskScore;
    currentTime += currentCheckpoint.estimatedDurationMinutes;
    
    // Greedy nearest-neighbor with priority weighting
    while (route.checkpoints.length < this.options.maxCheckpointsPerRoute) {
      // Find best next checkpoint
      let bestCheckpoint: PatrolCheckpoint | null = null;
      let bestScore = -Infinity;
      
      for (const checkpoint of unvisited) {
        if (visited.has(checkpoint.zoneId)) continue;
        
        // Calculate distance from current location
        const distance = this.calculateDistance(
          currentCheckpoint.location,
          checkpoint.location
        );
        
        const travelTime = distance / this.options.travelSpeedMetersPerMinute;
        const totalTime = route.totalDurationMinutes + travelTime + checkpoint.estimatedDurationMinutes;
        
        // Check if adding this checkpoint exceeds time limit
        if (totalTime > maxDurationMinutes) continue;
        
        // Calculate score: balance priority, risk, and proximity
        const proximityScore = 1000 / (distance + 1); // Closer is better
        const riskScore = checkpoint.riskScore;
        const priorityScore = checkpoint.priority * 20;
        
        // Weighted score based on objective
        let score = 0;
        if (objective === 'minimize_risk') {
          score = riskScore * 0.7 + priorityScore * 0.2 + proximityScore * 0.1;
        } else if (objective === 'maximize_coverage') {
          score = proximityScore * 0.5 + riskScore * 0.3 + priorityScore * 0.2;
        } else if (objective === 'rapid_response') {
          score = priorityScore * 0.6 + proximityScore * 0.4;
        } else {
          // Balanced
          score = riskScore * 0.4 + priorityScore * 0.3 + proximityScore * 0.3;
        }
        
        if (score > bestScore) {
          bestScore = score;
          bestCheckpoint = checkpoint;
        }
      }
      
      // No more valid checkpoints
      if (!bestCheckpoint) break;
      
      // Add checkpoint to route
      const distance = this.calculateDistance(
        currentCheckpoint.location,
        bestCheckpoint.location
      );
      
      const travelTime = distance / this.options.travelSpeedMetersPerMinute;
      currentTime += travelTime;
      
      route.checkpoints.push({
        zoneId: bestCheckpoint.zoneId,
        location: bestCheckpoint.location,
        arrivalTime: this.formatTime(currentTime),
        durationMinutes: bestCheckpoint.estimatedDurationMinutes,
        riskScore: bestCheckpoint.riskScore,
        priority: bestCheckpoint.priority,
        actions: bestCheckpoint.requiredActions,
      });
      
      route.totalDistanceMeters += distance;
      route.totalDurationMinutes += travelTime + bestCheckpoint.estimatedDurationMinutes;
      route.riskCovered += bestCheckpoint.riskScore;
      
      visited.add(bestCheckpoint.zoneId);
      currentCheckpoint = bestCheckpoint;
      currentTime += bestCheckpoint.estimatedDurationMinutes;
    }
    
    return route;
  }
  
  // =====================================================
  // HELPER METHODS
  // =====================================================
  
  private calculateDistance(
    point1: { lat: number; lon: number },
    point2: { lat: number; lon: number }
  ): number {
    // Haversine formula for great-circle distance
    const R = 6371000; // Earth radius in meters
    const dLat = this.toRadians(point2.lat - point1.lat);
    const dLon = this.toRadians(point2.lon - point1.lon);
    
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(point1.lat)) *
        Math.cos(this.toRadians(point2.lat)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
  
  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
  
  private parseTime(timeStr: string): number {
    // Parse "HH:MM" to minutes since midnight
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours! * 60 + minutes!;
  }
  
  private formatTime(minutesSinceMidnight: number): string {
    const hours = Math.floor(minutesSinceMidnight / 60) % 24;
    const minutes = Math.floor(minutesSinceMidnight % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }
  
  private calculateShiftDuration(startTime: string, endTime: string): number {
    const start = this.parseTime(startTime);
    let end = this.parseTime(endTime);
    
    // Handle overnight shifts
    if (end < start) end += 24 * 60;
    
    return end - start;
  }
  
  private getPriorityReason(checkpoint: PatrolCheckpoint): string {
    if (checkpoint.riskScore >= 90) return 'Critical risk level';
    if (checkpoint.priority === 5) return 'High priority zone';
    if (checkpoint.riskScore >= 70) return 'Elevated risk level';
    return 'Moderate risk area';
  }
  
  // =====================================================
  // STORAGE
  // =====================================================
  
  private async storePlan(plan: PatrolPlan): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO patrol_plan 
         (id, tenant_id, branch_id, plan_name, plan_type, planned_for_date,
          shift_start_time, shift_end_time, optimization_objective, total_risk_covered,
          coverage_percentage, required_officers, estimated_duration_minutes, routes,
          priority_zones, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15::jsonb, $16, NOW(), NOW())`,
        [
          plan.id, plan.tenantId, plan.branchId, plan.planName, plan.planType,
          plan.plannedForDate, plan.shiftStartTime, plan.shiftEndTime,
          plan.optimizationObjective, plan.totalRiskCovered, plan.coveragePercentage,
          plan.requiredOfficers, plan.estimatedDurationMinutes, JSON.stringify(plan.routes),
          JSON.stringify(plan.priorityZones), plan.status,
        ]
      );
      
      // Store individual checkpoints
      for (const route of plan.routes) {
        for (let i = 0; i < route.checkpoints.length; i++) {
          const cp = route.checkpoints[i]!;
          await this.db.query(
            `INSERT INTO patrol_checkpoint
             (patrol_plan_id, checkpoint_index, zone_id, location, planned_arrival_time,
              planned_duration_minutes, predicted_risk_score, officer_id, status, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
            [
              plan.id, i, cp.zoneId, `POINT(${cp.location.lon} ${cp.location.lat})`,
              this.combineDateAndTime(plan.plannedForDate, cp.arrivalTime),
              cp.durationMinutes, cp.riskScore, route.officerId || null, 'PENDING',
            ]
          );
        }
      }
    } catch (error) {
      console.error('[PatrolOptimization] Failed to store plan:', error);
    }
  }
  
  private combineDateAndTime(date: Date, timeStr: string): Date {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const result = new Date(date);
    result.setHours(hours!, minutes!, 0, 0);
    return result;
  }
  
  // =====================================================
  // PUBLIC API
  // =====================================================
  
  async getPatrolPlan(patrolPlanId: string): Promise<PatrolPlan | null> {
    try {
      const result = await this.db.query(
        `SELECT * FROM patrol_plan WHERE id = $1`,
        [patrolPlanId]
      );
      
      if (result.rows.length === 0) return null;
      
      return this.hydratePlan(result.rows[0]);
    } catch (error) {
      console.error('[PatrolOptimization] Failed to get patrol plan:', error);
      return null;
    }
  }
  
  async getActivePlans(tenantId: string, branchId: string): Promise<PatrolPlan[]> {
    try {
      const result = await this.db.query(
        `SELECT * FROM patrol_plan
         WHERE tenant_id = $1 AND branch_id = $2
         AND status IN ('APPROVED', 'ACTIVE')
         AND planned_for_date >= CURRENT_DATE
         ORDER BY planned_for_date, shift_start_time`,
        [tenantId, branchId]
      );
      
      return result.rows.map(row => this.hydratePlan(row));
    } catch (error) {
      console.error('[PatrolOptimization] Failed to get active plans:', error);
      return [];
    }
  }
  
  async approvePlan(patrolPlanId: string, approvedBy: string): Promise<boolean> {
    try {
      await this.db.query(
        `UPDATE patrol_plan
         SET status = 'APPROVED', approved_by = $2, approved_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND status = 'DRAFT'`,
        [patrolPlanId, approvedBy]
      );
      return true;
    } catch (error) {
      console.error('[PatrolOptimization] Failed to approve plan:', error);
      return false;
    }
  }
  
  async startPatrol(patrolPlanId: string): Promise<boolean> {
    try {
      await this.db.query(
        `UPDATE patrol_plan
         SET status = 'ACTIVE', started_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND status = 'APPROVED'`,
        [patrolPlanId]
      );
      return true;
    } catch (error) {
      console.error('[PatrolOptimization] Failed to start patrol:', error);
      return false;
    }
  }
  
  async completePatrol(patrolPlanId: string, effectivenessScore: number): Promise<boolean> {
    try {
      await this.db.query(
        `UPDATE patrol_plan
         SET status = 'COMPLETED', completed_at = NOW(), 
             effectiveness_score = $2, updated_at = NOW()
         WHERE id = $1 AND status = 'ACTIVE'`,
        [patrolPlanId, effectivenessScore]
      );
      
      this.metrics.totalPatrolsCompleted++;
      this.metrics.avgEffectivenessScore = 
        (this.metrics.avgEffectivenessScore + effectivenessScore) / 2;
      
      return true;
    } catch (error) {
      console.error('[PatrolOptimization] Failed to complete patrol:', error);
      return false;
    }
  }
  
  private hydratePlan(row: any): PatrolPlan {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      planName: row.plan_name,
      planType: row.plan_type,
      plannedForDate: row.planned_for_date,
      shiftStartTime: row.shift_start_time,
      shiftEndTime: row.shift_end_time,
      optimizationObjective: row.optimization_objective,
      totalRiskCovered: parseFloat(row.total_risk_covered),
      coveragePercentage: parseFloat(row.coverage_percentage),
      requiredOfficers: row.required_officers,
      estimatedDurationMinutes: row.estimated_duration_minutes,
      routes: row.routes,
      priorityZones: row.priority_zones,
      status: row.status,
      generatedAt: row.created_at,
    };
  }
  
  getMetrics() {
    return this.metrics;
  }
}

/**
 * Factory function
 */
export function createPatrolOptimizationEngine(db: Pool): PatrolOptimizationEngine {
  return new PatrolOptimizationEngine(db);
}
