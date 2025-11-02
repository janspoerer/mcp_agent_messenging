/**
 * Agent naming system using German names
 */

import { AsyncLock } from './async-lock.js';

const GERMAN_NAMES = [
  'Hans', 'Friedrich', 'Karl', 'Wilhelm', 'Otto',
  'Heinrich', 'Hermann', 'Ernst', 'Paul', 'Werner',
  'Walter', 'Franz', 'Josef', 'Ludwig', 'Georg',
  'Klaus', 'Günter', 'Dieter', 'Helmut', 'Jürgen',
  'Gerhard', 'Wolfgang', 'Horst', 'Manfred', 'Bernd',
  'Greta', 'Frieda', 'Margarete', 'Emma', 'Anna',
  'Liesel', 'Helga', 'Gertrud', 'Ingrid', 'Monika',
  'Ursula', 'Brigitte', 'Christa', 'Renate', 'Petra',
  'Sabine', 'Heike', 'Katrin', 'Claudia', 'Stefanie',
  'Anke', 'Ute', 'Beate', 'Karin', 'Martina'
];

/**
 * Manages assignment of unique German names to agents
 */
export class AgentNamer {
  private usedNames: Set<string> = new Set();
  private nameIndex: number = 0;
  private lock: AsyncLock = new AsyncLock();

  /**
   * Assigns a unique German name to an agent
   * Uses random selection to reduce collision probability across multiple processes
   * @returns A unique German name
   * @throws Error if all names are exhausted
   */
  async assignName(): Promise<string> {
    return this.lock.runExclusive(async () => {
      if (this.usedNames.size >= GERMAN_NAMES.length) {
        // Start reusing names with numeric suffixes
        const baseName = GERMAN_NAMES[this.nameIndex % GERMAN_NAMES.length];
        const suffix = Math.floor(this.nameIndex / GERMAN_NAMES.length) + 1;
        const name = `${baseName}${suffix}`;
        this.usedNames.add(name);
        this.nameIndex++;
        return name;
      }

      // Use random selection instead of sequential to reduce collision probability
      // when multiple processes start simultaneously
      const availableNames = GERMAN_NAMES.filter(name => !this.usedNames.has(name));
      const randomIndex = Math.floor(Math.random() * availableNames.length);
      const name = availableNames[randomIndex];

      this.usedNames.add(name);
      return name;
    });
  }

  /**
   * Registers a name as being used (by another instance)
   * @param name The name to register as used
   */
  async registerUsedName(name: string): Promise<void> {
    return this.lock.runExclusive(async () => {
      this.usedNames.add(name);
    });
  }

  /**
   * Releases a name back to the pool
   * @param name The name to release
   */
  async releaseName(name: string): Promise<void> {
    return this.lock.runExclusive(async () => {
      this.usedNames.delete(name);
    });
  }

  /**
   * Gets all currently used names
   * @returns Array of used names
   */
  getUsedNames(): string[] {
    return Array.from(this.usedNames);
  }

  /**
   * Checks if a name is currently in use
   * @param name The name to check
   * @returns True if the name is in use
   */
  isNameUsed(name: string): boolean {
    return this.usedNames.has(name);
  }
}
