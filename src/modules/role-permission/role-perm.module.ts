import { Module } from '@nestjs/common';
import { RolePermissionController } from './role-perm.controller';
@Module({
  controllers: [RolePermissionController],
})
export class RolePermModule { }
