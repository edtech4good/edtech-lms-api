import { ApiProperty } from "@nestjs/swagger";

export class RoleRequest {
  @ApiProperty()
  rolename: string;

  @ApiProperty()
  permissionsid: [];

  constructor() {
    this.rolename = "";
    this.permissionsid = [];
  }
}
export class BindRolePermissionRequest {
  @ApiProperty()
  roleid: string;

  @ApiProperty()
  permissionsid: string[];

  constructor() {
    this.roleid = "";
    this.permissionsid = [];
  }
}

export class BindUserRolesRequest {
  @ApiProperty()
  lmsuserid: string;

  @ApiProperty()
  rolesid: string[];

  constructor() {
    this.lmsuserid = "";
    this.rolesid = [];
  }
}
