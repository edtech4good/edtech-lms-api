import { ApiProperty } from '@nestjs/swagger';
// import { IResponse } from 'src/models/IResponse';

export class RoleBase {
  @ApiProperty()
  roleid: string;
  @ApiProperty()
  rolename: string;

  constructor() {
    this.roleid = '';
    this.rolename = '';
  }
}

export class PermBase {
  @ApiProperty()
  permissiontitleid: string;
  @ApiProperty()
  permissiontitle: string;
  @ApiProperty()
  permissiondesc: string;

  constructor() {
    this.permissiontitleid = '';
    this.permissiontitle = '';
    this.permissiondesc = '';
  }
}

export class PermissionBase {
  @ApiProperty()
  permissiontitleid: string;
  @ApiProperty()
  permissiontitle: string;
  @ApiProperty()
  permissiondesc: string;

  constructor() {
    this.permissiontitleid = '';
    this.permissiontitle = '';
    this.permissiondesc = '';
  }
}

export class RolePermBase {
  @ApiProperty()
  permissionid: string;
  @ApiProperty()
  roleid: string;

  constructor() {
    this.permissionid = '';
    this.roleid = '';
  }
}

export interface TreeNode {
  title: string;
  key: string;
  expanded: boolean;
  children: Array<NodeLeaf>
}

export class TreeNode implements TreeNode {}

export interface NodeLeaf {
  title: string;
  key: string;
  isLeaf: boolean;
}
