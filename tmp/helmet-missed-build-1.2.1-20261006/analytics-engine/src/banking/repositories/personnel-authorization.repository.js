/**
 * Personnel Authorization Repository
 *
 * Manages personnel roles and authorizations for banking operations
 */
/**
 * Personnel Authorization Repository
 */
export class PersonnelAuthorizationRepository {
    personnel = new Map();
    identityIndex = new Map(); // identityId -> personnelId (for quick lookup)
    /**
     * Create personnel authorization
     */
    async create(input) {
        const now = new Date();
        // Check if already exists
        const existing = this.identityIndex.get(input.identityId);
        if (existing) {
            throw new Error(`Personnel with identityId ${input.identityId} already exists`);
        }
        const personnel = {
            identityId: input.identityId,
            tenantId: input.tenantId,
            organizationId: input.organizationId,
            firstName: input.firstName,
            lastName: input.lastName,
            employeeId: input.employeeId,
            roles: input.roles,
            validFrom: input.validFrom,
            validUntil: input.validUntil,
            active: true,
            createdAt: now,
            updatedAt: now,
        };
        this.personnel.set(personnel.identityId, personnel);
        this.identityIndex.set(personnel.identityId, personnel.identityId);
        return personnel;
    }
    /**
     * Find personnel by identity ID
     */
    async findByIdentityId(identityId) {
        return this.personnel.get(identityId) || null;
    }
    /**
     * Find multiple personnel by identity IDs
     */
    async findByIdentityIds(identityIds) {
        const result = [];
        for (const identityId of identityIds) {
            const personnel = this.personnel.get(identityId);
            if (personnel) {
                result.push(personnel);
            }
        }
        return result;
    }
    /**
     * Find personnel by role
     */
    async findByRole(tenantId, role) {
        const result = [];
        for (const personnel of this.personnel.values()) {
            if (personnel.tenantId === tenantId &&
                personnel.active &&
                personnel.roles.includes(role)) {
                result.push(personnel);
            }
        }
        return result;
    }
    /**
     * Check if identity has a specific role
     */
    async hasRole(identityId, role, checkValidity = true) {
        const personnel = this.personnel.get(identityId);
        if (!personnel || !personnel.active) {
            return false;
        }
        if (!personnel.roles.includes(role)) {
            return false;
        }
        if (checkValidity) {
            const now = new Date();
            if (personnel.validFrom > now) {
                return false;
            }
            if (personnel.validUntil && personnel.validUntil < now) {
                return false;
            }
        }
        return true;
    }
    /**
     * Get active roles for an identity
     */
    async getActiveRoles(identityId) {
        const personnel = this.personnel.get(identityId);
        if (!personnel || !personnel.active) {
            return [];
        }
        const now = new Date();
        if (personnel.validFrom > now) {
            return [];
        }
        if (personnel.validUntil && personnel.validUntil < now) {
            return [];
        }
        return personnel.roles;
    }
    /**
     * Update personnel
     */
    async update(identityId, updates) {
        const personnel = this.personnel.get(identityId);
        if (!personnel) {
            return null;
        }
        Object.assign(personnel, updates, {
            updatedAt: new Date(),
        });
        return personnel;
    }
    /**
     * Add role to personnel
     */
    async addRole(identityId, role) {
        const personnel = this.personnel.get(identityId);
        if (!personnel) {
            return null;
        }
        if (!personnel.roles.includes(role)) {
            personnel.roles.push(role);
            personnel.updatedAt = new Date();
        }
        return personnel;
    }
    /**
     * Remove role from personnel
     */
    async removeRole(identityId, role) {
        const personnel = this.personnel.get(identityId);
        if (!personnel) {
            return null;
        }
        personnel.roles = personnel.roles.filter(r => r !== role);
        personnel.updatedAt = new Date();
        return personnel;
    }
    /**
     * Deactivate personnel
     */
    async deactivate(identityId) {
        const personnel = this.personnel.get(identityId);
        if (!personnel) {
            return null;
        }
        personnel.active = false;
        personnel.updatedAt = new Date();
        return personnel;
    }
    /**
     * Delete personnel
     */
    async delete(identityId) {
        const exists = this.personnel.has(identityId);
        if (!exists) {
            return false;
        }
        this.personnel.delete(identityId);
        this.identityIndex.delete(identityId);
        return true;
    }
    /**
     * Clear all personnel (for testing)
     */
    async clear() {
        this.personnel.clear();
        this.identityIndex.clear();
    }
}
/**
 * Singleton instance
 */
let repository = null;
export function getPersonnelAuthorizationRepository() {
    if (!repository) {
        repository = new PersonnelAuthorizationRepository();
    }
    return repository;
}
export function setPersonnelAuthorizationRepository(repo) {
    repository = repo;
}
