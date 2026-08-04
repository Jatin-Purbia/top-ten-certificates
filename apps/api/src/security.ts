import { CanActivate, ExecutionContext, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Request } from 'express';
import type { AdminRole } from '@pathey/types';
import { Store } from './store.js';

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES, roles);
export type AdminRequest = Request & { admin: { id: string; role: AdminRole } };

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(Store) private readonly store: Store,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) return true;
    const req = context.switchToHttp().getRequest<AdminRequest>();
    let userId: string;
    if (this.store.demo && req.header('x-demo-admin')) userId = req.header('x-demo-admin')!;
    else {
      const token = req.header('authorization')?.replace(/^Bearer\s+/i, '');
      if (!token || !process.env.SUPABASE_JWT_ISSUER) throw new UnauthorizedException('Administrator session required');
      try {
        const issuer = process.env.SUPABASE_JWT_ISSUER.replace(/\/$/, '');
        const { payload } = await jwtVerify(token, createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)), { issuer });
        userId = payload.sub!;
      } catch { throw new UnauthorizedException('Administrator session expired'); }
    }
    const role = await this.store.roleFor(userId);
    if (!role) throw new UnauthorizedException('Administrator is inactive');
    const allowed = this.reflector.getAllAndOverride<AdminRole[]>(ROLES, [context.getHandler(), context.getClass()]);
    if (allowed && !allowed.includes(role)) throw new ForbiddenException('Insufficient permissions');
    req.admin = { id: userId, role };
    return true;
  }
}

@Injectable()
export class ClaimRateLimiter {
  private attempts = new Map<string, { count: number; resetAt: number }>();
  check(key: string) { const now=Date.now(), entry=this.attempts.get(key);if(!entry||entry.resetAt<now){this.attempts.set(key,{count:1,resetAt:now+15*60_000});return;}entry.count++;if(entry.count>8)throw new HttpException('Too many attempts. Please try again later.',HttpStatus.TOO_MANY_REQUESTS); }
  clear(key:string){this.attempts.delete(key);}
}
