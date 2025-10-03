import { ApiExtraModels, ApiProperty } from "@nestjs/swagger";
import { IResponse } from "src/models/IResponse";
import { PermBase, RoleBase, RolePermBase, TreeNode } from "./RoleBase";

export class PermCreateResponse extends IResponse<PermBase> {

  @ApiProperty()
  data?: PermBase;

  constructor() {
    super();
    this.data = undefined;
  }
}

export class RoleCreateResponse extends IResponse<RoleBase> {

  @ApiProperty()
  data?: RoleBase;

  constructor() {
    super();
    this.data = undefined;
  }
}

export class RolePermCreateResponse extends IResponse<Array<RolePermBase>> {
  @ApiProperty()
  data: Array<RolePermBase> | undefined;

  constructor() {
    super();
  }
}

@ApiExtraModels(PermBase)
export class PermissionGetAllResponse extends IResponse<Array<PermBase>> {
  @ApiProperty({ type: [PermBase] })
  data: Array<PermBase> | undefined;
  constructor() {
    super();
  }
}

@ApiExtraModels(TreeNode)
export class PermissionNodeGetAllResponse extends IResponse<Array<TreeNode>> {
  @ApiProperty({ type: [TreeNode] })
  data: Array<TreeNode> | undefined;
  constructor() {
    super();
  }
}

/*
{
  pageIndex: number;
  pageSize: number;
  sort: Array<{ key: string; value: 'ascend' | 'descend' | null }>;
  filter: Array<{ key: string; value: any | any[] }>;
}
*/
