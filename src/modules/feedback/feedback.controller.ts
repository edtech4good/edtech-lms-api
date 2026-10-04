import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiExtraModels, ApiParam, ApiResponse, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { FeedbackBusiness } from 'src/business/feedback.business';
import { RequirePermissions } from 'src/decorators/requirePermissions.decorator';
import { User } from 'src/decorators/user.decorator';
import { AccessGuard } from 'src/guards/access.guard';
import { CheckPermissionsGuard } from 'src/guards/checkPermission.guard';
import { SchemaValidationInterceptor } from 'src/interceptors';
import { TokenType } from 'src/models/enums';
import { Permission } from 'src/models/enums/permissions.enum';
import { IMultiPaging } from 'src/models/IPaging';
import { LmsUserToken } from 'src/models/token.model';
import { showfeedback } from './feedback.request.validator';
import { FeedbackRequest } from './models/FeedbackRequest';
import { FeedbackCreateResponse, FeedbackGetAllResponse } from './models/FeedbackResponse';
import { OrgPolicy } from "src/decorators/orgPolicy.decorator";
import { Org, OrgContext } from "src/decorators/org.decorator";
import { findOwnedCurriculum } from "src/business/content-scope";

@ApiExtraModels(FeedbackCreateResponse)
@ApiTags("Feedback")
@Controller("feedback")
@ApiBearerAuth()
export class FeedbackController {
    @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
    @Post("create")
    @ApiResponse({
        status: 200,
        description: "Feedback created successfully",
        // schema: { $ref: getSchemaPath(CountryCreateResponse) },
    })
    @ApiResponse({
        status: 400,
        description: "Error while creating feedback",
    })
    @ApiResponse({
        status: 500,
        description: "Server error",
    })
    @ApiBody({ type: FeedbackRequest })
    @RequirePermissions(Permission.CREATE_FEEDBACK)
    @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
    @HttpCode(HttpStatus.OK)
    async create(
        @Body() body: FeedbackRequest,
        @User() user: LmsUserToken,
        @Org() org: OrgContext
    ): Promise<any> {
        // the curriculum the feedback is about is the caller's, or not found: nothing is written and nothing is uploaded
        await findOwnedCurriculum(org, body.curriculumid);
        const data = await new FeedbackBusiness(org).createfeedback(body, user);
        return {
            error: false,
            data: data,
        };
    }

    @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
    @Post("")
    @ApiResponse({
        status: 200,
        description: "Feedbacks fetch successfully",
        schema: { $ref: getSchemaPath(FeedbackGetAllResponse) },
    })
    @ApiResponse({
        status: 400,
        description: "Error while fetching feedback",
    })
    @ApiResponse({
        status: 500,
        description: "Server error",
    })
    // @UseInterceptors(new SchemaValidationInterceptor(showallfeedback))
    @ApiBody({ required: false, type: IMultiPaging })
    @RequirePermissions(Permission.VIEW_FEEDBACK)
    @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
    @HttpCode(HttpStatus.OK)
    async getall(@Body() body: IMultiPaging, @Org() org: OrgContext): Promise<FeedbackGetAllResponse> {
        const tempresult = await new FeedbackBusiness(org).getAllFeedbacks({
            pageindex: body?.pageindex || 0,
            pagesize: body?.pagesize || 0,
            filter: body?.filter || [],
        });
        return {
            error: false,
            data: {
                data: tempresult.rows,
                total: tempresult.count,
                pageindex: body?.pageindex || 0,
                pagesize: body?.pagesize || 0,
            },
        };
    }

    @OrgPolicy("owned", { enforcedBy: "src/modules/content-scope.leak.spec.ts" })
    @Get(":feedbackid")
    @ApiResponse({
        status: 200,
        description: "Feedback fetch successfully",
        schema: { $ref: getSchemaPath(FeedbackCreateResponse) },
    })
    @ApiResponse({
        status: 400,
        description: "Error while fetching feedback",
    })
    @UseInterceptors(
        new SchemaValidationInterceptor(showfeedback),
        // new BusinessValidationInterceptor([EditSchool])
    )
    @HttpCode(HttpStatus.OK)
    @ApiParam({ name: `feedbackid`, type: "string", required: true })
    @RequirePermissions(Permission.VIEW_FEEDBACK)
    @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
    @ApiBearerAuth()
    async get(
        @Param("feedbackid") feedbackid: string,
        @Org() org: OrgContext
    ): Promise<FeedbackCreateResponse> {
        const data = await new FeedbackBusiness(org).getfeedbackbyid(feedbackid);
        return {
            error: false,
            data: data ? data : undefined,
        };
    }
}
