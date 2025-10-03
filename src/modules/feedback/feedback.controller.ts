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

@ApiExtraModels(FeedbackCreateResponse)
@ApiTags("Feedback")
@Controller("feedback")
@ApiBearerAuth()
export class FeedbackController {
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
    // @RequirePermissions(Permission.CREATE_COUNTRY)
    @UseGuards(AccessGuard(TokenType.ACCESS))
    @HttpCode(HttpStatus.OK)
    async create(
        @Body() body: FeedbackRequest,
        @User() user: LmsUserToken
    ): Promise<any> {
        const data = await new FeedbackBusiness().createfeedback(body, user);
        return {
            error: false,
            data: data,
        };
    }

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
    async getall(@Body() body: IMultiPaging): Promise<FeedbackGetAllResponse> {
        const tempresult = await new FeedbackBusiness().getAllFeedbacks({
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
        @Param("feedbackid") feedbackid: string
    ): Promise<FeedbackCreateResponse> {
        const data = await new FeedbackBusiness().getfeedbackbyid(feedbackid);
        return {
            error: false,
            data: data ? data : undefined,
        };
    }
}
