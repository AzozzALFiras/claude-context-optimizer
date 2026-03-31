//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

import { createHash } from 'crypto';
import { readFileSync, statSync } from 'fs';

export class HashUtil {
  static fromContent(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16);
  }

  static fromFile(filePath: string): string | null {
    try {
      const content = readFileSync(filePath, 'utf8');
      return HashUtil.fromContent(content);
    } catch {
      return null;
    }
  }

  static fromFileStat(filePath: string): string | null {
    try {
      const stat = statSync(filePath);
      // Fast hash from mtime + size — no file read needed
      return HashUtil.fromContent(`${stat.mtimeMs}:${stat.size}`);
    } catch {
      return null;
    }
  }

  static isChanged(filePath: string, cachedHash: string): boolean {
    const currentHash = HashUtil.fromFileStat(filePath);
    if (currentHash === null) return true;
    if (currentHash !== cachedHash) {
      // Stat changed — confirm with full hash
      const fullHash = HashUtil.fromFile(filePath);
      return fullHash !== cachedHash;
    }
    return false;
  }
}
