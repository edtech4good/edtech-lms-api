import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PERMISSIONS_KEY } from "src/decorators/requirePermissions.decorator";
import { Permission, SUPERADMIN } from "src/models/enums/permissions.enum";

@Injectable()
export class CheckPermissionsGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const requiredPerms = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!requiredPerms) {
            return true;
        }
        const { user } = context.switchToHttp().getRequest();
        return requiredPerms.some((perm) => this.hasPermission(user.permissions ?? [], perm));
    }

    hasPermission(permissions: Array<string>, perm: string): boolean {
        let idx = permissions?.findIndex(p => p === perm);
        if(idx >= 0) return true;
        idx = permissions?.findIndex(p => p === SUPERADMIN);
        if(idx >= 0) return true;
        return false;
    }
}