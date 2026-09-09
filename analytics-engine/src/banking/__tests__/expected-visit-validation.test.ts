import { describe, expect, it } from 'vitest';
import { ExpectedVisitRepository } from '../repositories/expected-visit.repository.js';

describe('expected cash-van visits', () => {
  it('does not let a malformed imported plate pattern interrupt visit matching', async () => {
    const repository = new ExpectedVisitRepository();
    const start = new Date(Date.now() - 60_000);
    const end = new Date(Date.now() + 60_000);
    await repository.create({ tenantId: 'tenant-1', branchId: 'branch-1', expectedPlateRegex: '[', expectedArrivalStart: start, expectedArrivalEnd: end });

    await expect(repository.findMatchingVisit({ branchId: 'branch-1', plate: 'KA01AB1234', timestamp: new Date() })).resolves.toBeNull();
  });
});
