import { ApiProperty } from "@nestjs/swagger";
import { IPagingResult } from "src/models/IPagingResult";
import { IResponse } from "src/models/IResponse";
import { CountryBase } from "./CountryBase";

export class CountryCreateResponse extends IResponse<CountryBase> {

    @ApiProperty()
    data?: CountryBase;

    constructor() {
        super();
        this.data = undefined;
    }
}

export class CountryAllResponse extends IResponse<Array<CountryBase>> {

    @ApiProperty()
    data?: Array<CountryBase>;

    constructor() {
        super();
        this.data = undefined;
    }
}

export class CountryGetAllResponse extends IResponse<IPagingResult<CountryBase>> {
    @ApiProperty()
    data: IPagingResult<CountryBase> | undefined;

    constructor() {
        super();
    }
}
