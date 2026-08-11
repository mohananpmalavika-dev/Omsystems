/**
 * Personnel Authorization Repository
 * 
 * Manages personnel roles and authorizations for banking operations
 */

import { PersonnelAuthorization, BankingRole } from '../models/cash-van-session';
import { v4 as uuidv4 } from 'uuid';

export interface CreatePersonnelInput {
  identityId: string;
  tenantId: string;
  organizationId?: string;
  firstName: string;
  lastName: string;
  employeeId?: string;
  roles: BankingRole[];
  validFrom: Date;
  validUntil?: Date;
}

/**
 * Personnel Authorization Repository
 */
export class PersonnelAuthorizationRepository {
  private personnel = new Map<string, PersonnelAuthorization>();
  private identityIndex = new Map<string, string>(); // identityId -> personnelId (for quick lookup)

  /**
   * Create personnel authorization
   */
  async create(input: CreatePersonnelInput): Promise<PersonnelAuthorization> {
    const now = new Date();
    
    // Check if already exists
    const existing = this.identityIndex.get(input.identityId);
    if (existing) {
      throw new Error(`Personnel with identityId ${input.identityId} already exists`);
    }

    const personnel: PersonnelAuthorization = {
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
  async findByIdentityId(identityId: string): Promise<PersonnelAuthorization | null> {
    return this.personnel.get(identityId) || null;
  }

  /**
   * Find multiple personnel by identity IDs
   */
  async findByIdentityIds(identityIds: string[]): Promise<PersonnelAuthorization[]> {
    const result: PersonnelAuthorization[] = [];
    
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
  async findByRole(tenantId: string, role: BankingRole): Promise<PersonnelAuthorization[]> {
    const result: PersonnelAuthorization[] = [];

    for (const personnel of this.personnel.values()) {
      if (
        personnel.tenantId === tenantId &&
        personnel.active &&
        personnel.roles.includes(role)
      ) {
        result.push(personnel);
      }
    }

    return result;
  }

  /**
   * Check if identity has a specific role
   */
  async hasRole(identityId: string, role: BankingRole, checkValidity: boolean = true): Promise<boolean> {
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
  async getActiveRoles(identityId: string): Promise<BankingRole[]> {
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
  async update(identityId: string, updates: Partial<PersonnelAuthorization>): Promise<PersonnelAuthorization | null> {
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
  async addRole(identityId: string, role: BankingRole): Promise<PersonnelAuthorization | null> {
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
  async removeRole(identityId: string, role: BankingRole): Promise<PersonnelAuthorization | null> {
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
  async deactivate(identityId: string): Promise<PersonnelAuthorization | null> {
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
  async delete(identityId: string): Promise<boolean> {
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
  async clear(): Promise<void> {
    this.personnel.clear();
    this.identityIndex.clear();
  }
}

/**
 * Singleton instance
 */
let repository: PersonnelAuthorizationRepository | null = null;

export function getPersonnelAuthorizationRepository(): PersonnelAuthorizationRepository {
  if (!repository) {
    repository = new PersonnelAuthorizationRepository();
  }
  return repository;
}

export function setPersonnelAuthorizationRepository(repo: PersonnelAuthorizationRepository): void {
  repository = repo;
}
