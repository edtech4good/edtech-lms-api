import { ApiProperty } from "@nestjs/swagger";
import { IPagingResult } from "src/models/IPagingResult";
import { IResponse } from "src/models/IResponse";
import { FeedbackBase } from "./FeedbackBase";

export class FeedbackCreateResponse extends IResponse<FeedbackBase> {

    @ApiProperty()
    data?: FeedbackBase;

    constructor() {
        super();
        this.data = undefined;
    }
}

export class CountryAllResponse extends IResponse<Array<FeedbackBase>> {

    @ApiProperty()
    data?: Array<FeedbackBase>;

    constructor() {
        super();
        this.data = undefined;
    }
}

export class FeedbackGetAllResponse extends IResponse<IPagingResult<FeedbackBase>> {
    @ApiProperty()
    data: IPagingResult<FeedbackBase> | undefined;

    constructor() {
        super();
    }
}
