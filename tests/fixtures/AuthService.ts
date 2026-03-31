// Sample TypeScript file for testing smart_read and function_extractor
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../models/User';
import { UserSession } from '../models/UserSession';
import * as bcrypt from 'bcrypt';

export interface AuthResult {
  token: string;
  refreshToken: string;
  user: Omit<User, 'passwordHash'>;
  expiresAt: number;
}

export class AuthError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'AuthError';
  }
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserSession)
    private readonly sessionRepo: Repository<UserSession>,
    private readonly jwtService: JwtService,
  ) {}

  // ── Irrelevant to auth: User management ─────────────────────────────────

  async getAllUsers(): Promise<User[]> {
    return this.userRepo.find({ order: { createdAt: 'DESC' } });
  }

  async getUserById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async updateUserProfile(id: string, data: Partial<User>): Promise<User> {
    await this.userRepo.update(id, data);
    const updated = await this.userRepo.findOne({ where: { id } });
    if (!updated) throw new AuthError('User not found', 'USER_NOT_FOUND');
    return updated;
  }

  async deleteUser(id: string): Promise<void> {
    await this.userRepo.delete(id);
  }

  async countActiveUsers(): Promise<number> {
    return this.userRepo.count({ where: { isActive: true } });
  }

  async getUsersByRole(role: string): Promise<User[]> {
    return this.userRepo.find({ where: { role } });
  }

  async exportUsers(): Promise<string> {
    const users = await this.getAllUsers();
    return JSON.stringify(users.map(u => ({ id: u.id, email: u.email, role: u.role })));
  }

  // ── Core authentication ───────────────────────────────────────────────────

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.userRepo.findOne({ where: { email: email.toLowerCase() } });
    if (!user) throw new AuthError('Invalid credentials', 'INVALID_CREDENTIALS');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new AuthError('Invalid credentials', 'INVALID_CREDENTIALS');

    if (!user.isActive) throw new AuthError('Account disabled', 'ACCOUNT_DISABLED');

    const token        = this.jwtService.sign({ userId: user.id, role: user.role }, { expiresIn: '1h' });
    const refreshToken = this.jwtService.sign({ userId: user.id }, { expiresIn: '7d' });
    const expiresAt    = Date.now() + 60 * 60 * 1000;

    await this.sessionRepo.save({ userId: user.id, token, refreshToken, expiresAt });

    const { passwordHash: _, ...safeUser } = user;
    return { token, refreshToken, user: safeUser, expiresAt };
  }

  async validateToken(token: string): Promise<User | null> {
    try {
      const payload = this.jwtService.verify(token) as { userId: string };
      const session = await this.sessionRepo.findOne({ where: { token, isRevoked: false } });
      if (!session || session.expiresAt < Date.now()) return null;
      return this.userRepo.findOne({ where: { id: payload.userId, isActive: true } });
    } catch {
      return null;
    }
  }

  async logout(token: string): Promise<void> {
    await this.sessionRepo.update({ token }, { isRevoked: true });
  }

  async refreshTokens(refreshToken: string): Promise<AuthResult> {
    const payload = this.jwtService.verify(refreshToken) as { userId: string };
    const user    = await this.userRepo.findOne({ where: { id: payload.userId, isActive: true } });
    if (!user) throw new AuthError('User not found', 'USER_NOT_FOUND');

    await this.sessionRepo.update({ refreshToken }, { isRevoked: true });
    return this.login(user.email, ''); // re-issue via login
  }

  // ── Irrelevant to auth: Audit logging ────────────────────────────────────

  async getAuditLog(userId: string): Promise<UserSession[]> {
    return this.sessionRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async clearExpiredSessions(): Promise<number> {
    const result = await this.sessionRepo.delete({ expiresAt: new Date(Date.now()) });
    return result.affected ?? 0;
  }

  async getRevokedTokenCount(): Promise<number> {
    return this.sessionRepo.count({ where: { isRevoked: true } });
  }

  async getSessionStats(): Promise<{ active: number; expired: number; revoked: number }> {
    const [active, expired, revoked] = await Promise.all([
      this.sessionRepo.count({ where: { isRevoked: false } }),
      this.sessionRepo.count({ where: { expiresAt: new Date(Date.now()) } }),
      this.sessionRepo.count({ where: { isRevoked: true } }),
    ]);
    return { active, expired, revoked };
  }
}
