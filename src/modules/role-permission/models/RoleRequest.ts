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
export class PermissionRequest {
  @ApiProperty()
  permissiontitle: string;
  @ApiProperty()
  permissiondesc: string;

  constructor() {
    this.permissiontitle = "";
    this.permissiondesc = "";
  }
}

export class OnePermissionRequest {
  @ApiProperty()
  permissiontitle: string;
  @ApiProperty()
  permissiontitledesc: string;
  @ApiProperty()
  permissionname: string;
  @ApiProperty()
  permissiondesc: string;

  constructor() {
    this.permissiontitle = "";
    this.permissiontitledesc = "";
    this.permissionname = "";
    this.permissiondesc = "";
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
