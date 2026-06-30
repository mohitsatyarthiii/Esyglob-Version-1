import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../users/user.schema';
import { MaybeAuthenticatedRequest } from './request.types';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<MaybeAuthenticatedRequest>();
    const roles = request.user?.roles ?? [];

    if (!requiredRoles.some(role => roles.includes(role))) {
      throw new ForbiddenException('You do not have permission to access this resource.');
    }

    return true;
  }
}
