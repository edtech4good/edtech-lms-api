import { SetMetadata } from '@nestjs/common';
import { Permission } from 'src/models/enums/permissions.enum';

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);

/** Every permission listed is required (the plain `RequirePermissions` admits a caller holding any one of them). */
export const PERMISSIONS_ALL_KEY = 'permissions_all';
export const RequireAllPermissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_ALL_KEY, permissions);
