import { ApiProperty } from "@nestjs/swagger";
import { IPagingResult } from "src/models/IPagingResult";
import { IResponse } from "src/models/IResponse";
import { OrganisationBase } from "./OrganisationBase";

export class OrganisationCreateResponse extends IResponse<OrganisationBase> {
  @ApiProperty()
  data?: OrganisationBase;

  constructor() {
    super();
    this.data = undefined;
  }
}

export class OrganisationGetAllResponse extends IResponse<IPagingResult<OrganisationBase>> {
  @ApiProperty()
  data: IPagingResult<OrganisationBase> | undefined;

  constructor() {
    super();
  }
}
