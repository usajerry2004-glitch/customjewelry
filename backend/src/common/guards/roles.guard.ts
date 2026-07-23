import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PERMISSION_KEY } from '../decorators/permission.decorator';
import { UserRole } from '../../database/entities/user.entity';
import { Permission } from '../permissions';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;
    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;
    if (requiredRoles.some(role => user.role === role)) return true;

    // A route can also opt in via @RequiresPermission(...) — a per-user
    // override then grants access even when the role check above fails.
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredPermissions || requiredPermissions.length === 0) return false;
    const granted: string[] = user.extraPermissions || [];
    return requiredPermissions.some(p => granted.includes(p));
  }
}
