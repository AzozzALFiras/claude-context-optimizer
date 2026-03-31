//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync, existsSync } from 'fs';

type Platform = 'mac' | 'windows' | 'linux';

export class PlatformUtil {
  static getPlatform(): Platform {
    switch (process.platform) {
      case 'darwin': return 'mac';
      case 'win32':  return 'windows';
      default:       return 'linux';
    }
  }

  static getCacheDir(): string {
    const platform = PlatformUtil.getPlatform();
    let base: string;

    if (platform === 'windows') {
      base = process.env['APPDATA'] ?? join(homedir(), 'AppData', 'Roaming');
    } else {
      base = join(homedir(), '.claude');
    }

    const dir = join(base, 'context-optimizer');
    PlatformUtil.ensureDir(dir);
    return dir;
  }

  static getSessionDir(): string {
    const dir = join(PlatformUtil.getCacheDir(), 'sessions');
    PlatformUtil.ensureDir(dir);
    return dir;
  }

  static normalizePath(filePath: string): string {
    if (PlatformUtil.getPlatform() === 'windows') {
      return filePath.replace(/\\/g, '/');
    }
    return filePath;
  }

  static isAbsolutePath(filePath: string): boolean {
    if (PlatformUtil.getPlatform() === 'windows') {
      return /^[A-Za-z]:[/\\]/.test(filePath);
    }
    return filePath.startsWith('/');
  }

  private static ensureDir(dir: string): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}
