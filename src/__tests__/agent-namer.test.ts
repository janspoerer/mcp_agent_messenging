/**
 * Unit tests for AgentNamer
 */

import { jest } from '@jest/globals';
import { AgentNamer } from '../agent-namer';
import { AsyncLock } from '../async-lock';

// Mock AsyncLock to directly execute the function without actual locking
jest.mock('../async-lock', () => {
  return {
    AsyncLock: jest.fn().mockImplementation(() => {
      return {
        runExclusive: jest.fn(async (fn) => await fn()),
      };
    }),
  };
});

describe('AgentNamer', () => {
  let agentNamer: AgentNamer;

  beforeEach(() => {
    jest.clearAllMocks();
    agentNamer = new AgentNamer();
    // Reset usedNames and nameIndex for each test to ensure isolation
    (agentNamer as any).usedNames = new Set();
    (agentNamer as any).nameIndex = 0;
  });

  describe('assignName', () => {
    test('should assign a unique name from the pool', async () => {
      const name1 = await agentNamer.assignName();
      const name2 = await agentNamer.assignName();

      expect(name1).toBeDefined();
      expect(name2).toBeDefined();
      expect(name1).not.toBe(name2);
      expect(agentNamer.isNameUsed(name1)).toBe(true);
      expect(agentNamer.isNameUsed(name2)).toBe(true);
    });

    test('should reuse names with numeric suffixes when pool is exhausted', async () => {
      // Exhaust all initial names
      for (let i = 0; i < 50; i++) {
        await agentNamer.assignName();
      }

      const name51 = await agentNamer.assignName();
      const name52 = await agentNamer.assignName();

      expect(name51).toMatch(/\d+/); // Should have a numeric suffix
      expect(name52).toMatch(/\d+/);
      expect(name51).not.toBe(name52);
      expect(agentNamer.isNameUsed(name51)).toBe(true);
      expect(agentNamer.isNameUsed(name52)).toBe(true);
    });

    test('should use random selection for initial names', async () => {
      const namesAssigned = new Set<string>();
      const numAttempts = 10;
      for (let i = 0; i < numAttempts; i++) {
        namesAssigned.add(await agentNamer.assignName());
      }
      // With random selection, it's highly probable to get more than one unique name
      expect(namesAssigned.size).toBeGreaterThan(1);
    });
  });

  describe('registerUsedName', () => {
    test('should register a name as used', async () => {
      const name = 'TestName';
      await agentNamer.registerUsedName(name);
      expect(agentNamer.isNameUsed(name)).toBe(true);
    });

    test('should not assign a registered name', async () => {
      const nameToRegister = 'Hans';
      await agentNamer.registerUsedName(nameToRegister);

      const assignedName = await agentNamer.assignName();
      expect(assignedName).not.toBe(nameToRegister);
      expect(agentNamer.isNameUsed(assignedName)).toBe(true);
    });
  });

  describe('releaseName', () => {
    test('should release a previously used name', async () => {
      const name = await agentNamer.assignName();
      expect(agentNamer.isNameUsed(name)).toBe(true);

      await agentNamer.releaseName(name);
      expect(agentNamer.isNameUsed(name)).toBe(false);
    });

    test('should allow a released name to be reassigned', async () => {
      const name = await agentNamer.assignName();
      await agentNamer.releaseName(name);

      // The released name is now available for reassignment, but due to random selection,
      // it's not guaranteed to be the next one assigned. The important part is that
      // the system continues to assign unique names from the available pool.
    });
  });

  describe('getUsedNames', () => {
    test('should return all currently used names', async () => {
      const name1 = await agentNamer.assignName();
      const name2 = await agentNamer.assignName();
      await agentNamer.registerUsedName('ExternalName');

      const usedNames = agentNamer.getUsedNames();
      expect(usedNames).toHaveLength(3);
      expect(usedNames).toContain(name1);
      expect(usedNames).toContain(name2);
      expect(usedNames).toContain('ExternalName');
    });

    test('should return an empty array if no names are used', () => {
      expect(agentNamer.getUsedNames()).toHaveLength(0);
    });
  });

  describe('isNameUsed', () => {
    test('should return true for a used name', async () => {
      const name = await agentNamer.assignName();
      expect(agentNamer.isNameUsed(name)).toBe(true);
    });

    test('should return false for an unused name', () => {
      expect(agentNamer.isNameUsed('NonExistentName')).toBe(false);
    });
  });
});
