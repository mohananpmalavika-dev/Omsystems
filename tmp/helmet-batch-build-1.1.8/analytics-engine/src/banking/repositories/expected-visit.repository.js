/**
 * Expected Visit Repository
 *
 * Manages scheduled cash van visits
 */
import { v4 as uuidv4 } from 'uuid';
/**
 * Expected Visit Repository
 */
export class ExpectedVisitRepository {
    visits = new Map();
    branchIndex = new Map(); // branchId -> Set<visitId>
    /**
     * Create a scheduled visit
     */
    async create(input) {
        const now = new Date();
        const visit = {
            id: `visit_${uuidv4().replace(/-/g, '')}`,
            tenantId: input.tenantId,
            branchId: input.branchId,
            expectedPlate: input.expectedPlate,
            expectedPlateRegex: input.expectedPlateRegex,
            providerId: input.providerId,
            providerName: input.providerName,
            expectedArrivalStart: input.expectedArrivalStart,
            expectedArrivalEnd: input.expectedArrivalEnd,
            expectedPersonnel: input.expectedPersonnel || [],
            status: 'scheduled',
            notes: input.notes,
            createdAt: now,
            updatedAt: now,
        };
        this.visits.set(visit.id, visit);
        if (!this.branchIndex.has(visit.branchId)) {
            this.branchIndex.set(visit.branchId, new Set());
        }
        this.branchIndex.get(visit.branchId).add(visit.id);
        return visit;
    }
    /**
     * Find visit by ID
     */
    async findById(visitId) {
        return this.visits.get(visitId) || null;
    }
    /**
     * Find matching visit for an observed vehicle
     */
    async findMatchingVisit(criteria) {
        const visitIds = this.branchIndex.get(criteria.branchId);
        if (!visitIds) {
            return null;
        }
        const tolerance = criteria.toleranceMinutes ?? 15;
        const earliest = new Date(criteria.timestamp.getTime() - tolerance * 60_000);
        const latest = new Date(criteria.timestamp.getTime() + tolerance * 60_000);
        for (const visitId of visitIds) {
            const visit = this.visits.get(visitId);
            if (!visit || visit.status !== 'scheduled') {
                continue;
            }
            // Check time window
            const withinTimeWindow = criteria.timestamp >= new Date(visit.expectedArrivalStart.getTime() - tolerance * 60_000) &&
                criteria.timestamp <= new Date(visit.expectedArrivalEnd.getTime() + tolerance * 60_000);
            if (!withinTimeWindow) {
                continue;
            }
            // Check plate if provided
            if (criteria.plate) {
                const normalizedPlate = this.normalizePlate(criteria.plate);
                if (visit.expectedPlate) {
                    if (this.normalizePlate(visit.expectedPlate) === normalizedPlate) {
                        return visit;
                    }
                }
                if (visit.expectedPlateRegex) {
                    // API validation constrains newly-created patterns. This guard also
                    // protects historical/imported records from malformed expressions.
                    try {
                        const regex = new RegExp(visit.expectedPlateRegex, 'i');
                        if (regex.test(normalizedPlate))
                            return visit;
                    }
                    catch {
                        continue;
                    }
                }
            }
            else {
                // No plate provided, match by time only
                return visit;
            }
        }
        return null;
    }
    /**
     * Find scheduled visits for a branch in a date range
     */
    async findByBranchAndDateRange(branchId, startDate, endDate) {
        const visitIds = this.branchIndex.get(branchId);
        if (!visitIds) {
            return [];
        }
        const visits = [];
        for (const visitId of visitIds) {
            const visit = this.visits.get(visitId);
            if (!visit) {
                continue;
            }
            if (visit.expectedArrivalStart <= endDate &&
                visit.expectedArrivalEnd >= startDate) {
                visits.push(visit);
            }
        }
        return visits.sort((a, b) => a.expectedArrivalStart.getTime() - b.expectedArrivalStart.getTime());
    }
    /**
     * Update visit
     */
    async update(visitId, updates) {
        const visit = this.visits.get(visitId);
        if (!visit) {
            return null;
        }
        Object.assign(visit, updates, {
            updatedAt: new Date(),
        });
        return visit;
    }
    /**
     * Mark visit as arrived
     */
    async markArrived(visitId, sessionId) {
        const visit = this.visits.get(visitId);
        if (!visit) {
            return null;
        }
        visit.status = 'arrived';
        visit.sessionId = sessionId;
        visit.updatedAt = new Date();
        return visit;
    }
    /**
     * Mark visit as completed
     */
    async markCompleted(visitId) {
        const visit = this.visits.get(visitId);
        if (!visit) {
            return null;
        }
        visit.status = 'completed';
        visit.updatedAt = new Date();
        return visit;
    }
    /**
     * Mark missed visits (past their expected arrival window)
     */
    async markMissedVisits() {
        const now = new Date();
        let marked = 0;
        for (const visit of this.visits.values()) {
            if (visit.status === 'scheduled' && visit.expectedArrivalEnd < now) {
                visit.status = 'missed';
                visit.updatedAt = now;
                marked++;
            }
        }
        return marked;
    }
    /**
     * Delete visit
     */
    async delete(visitId) {
        const visit = this.visits.get(visitId);
        if (!visit) {
            return false;
        }
        this.visits.delete(visitId);
        const branchVisits = this.branchIndex.get(visit.branchId);
        if (branchVisits) {
            branchVisits.delete(visitId);
        }
        return true;
    }
    /**
     * Normalize plate for comparison
     */
    normalizePlate(plate) {
        return plate.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    }
    /**
     * Clear all visits (for testing)
     */
    async clear() {
        this.visits.clear();
        this.branchIndex.clear();
    }
}
/**
 * Singleton instance
 */
let repository = null;
export function getExpectedVisitRepository() {
    if (!repository) {
        repository = new ExpectedVisitRepository();
    }
    return repository;
}
export function setExpectedVisitRepository(repo) {
    repository = repo;
}
