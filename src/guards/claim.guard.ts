import { Role } from './../models/enums';
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Key } from '../decorators/claim.decorator';

@Injectable()
export class ClaimsGuard implements CanActivate {
  constructor(private reflector: Reflector) { }

  canActivate(context: ExecutionContext): boolean {
    const requiredClaims = this.reflector.getAllAndOverride<Role[]>(Key, [context.getHandler(), context.getClass()]);
    if (!requiredClaims) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest();
    return requiredClaims.some(claim => user.lmsuserrole === claim);
  }
}
