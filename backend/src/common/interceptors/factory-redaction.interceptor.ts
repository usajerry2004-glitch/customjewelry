import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { UserRole } from '../../database/entities/user.entity';

const REDACTED_FIELDS = ['quotedCost', 'quoteOptions', 'customerFullName', 'storeName', 'customerEmail', 'phoneNumber'];
const REDACTED_ROLES: string[] = [UserRole.FACTORY_MANAGER, UserRole.FACTORY_VIEWER, UserRole.STONE_MANAGER];

// Recursively strips REDACTED_FIELDS from any order-shaped object (identified
// by a poNumber key) anywhere in the response — single order, {orders,total}
// lists, kanban columns, priority arrays — without each endpoint doing it.
function redact(value: any): any {
  if (Array.isArray(value)) return value.map(redact);
  if (value instanceof Date) return value;
  if (value && typeof value === 'object') {
    const clone: any = { ...value };
    if ('poNumber' in clone) {
      for (const field of REDACTED_FIELDS) delete clone[field];
    }
    for (const key of Object.keys(clone)) {
      const v = clone[key];
      if (v instanceof Date) continue;
      if (v && typeof v === 'object') clone[key] = redact(v);
    }
    return clone;
  }
  return value;
}

// Factory Manager and Stone Manager shouldn't see pricing or customer identity
// — applied at the controller level so it can't be bypassed by adding a new endpoint.
@Injectable()
export class FactoryRedactionInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const { user } = context.switchToHttp().getRequest();
    if (!REDACTED_ROLES.includes(user?.role)) return next.handle();
    return next.handle().pipe(map(redact));
  }
}
