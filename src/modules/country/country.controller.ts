import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiExtraModels, ApiParam, ApiQuery, ApiResponse, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { CountryBusiness } from 'src/business/country.business';
import { RequirePermissions } from 'src/decorators/requirePermissions.decorator';
import { User } from 'src/decorators/user.decorator';
import { AccessGuard } from 'src/guards/access.guard';
import { CheckPermissionsGuard } from 'src/guards/checkPermission.guard';
import { BusinessValidationInterceptor, SchemaValidationInterceptor } from 'src/interceptors';
import { countriesAttributes } from 'src/models/data-models/countries';
import { Role, TokenType } from 'src/models/enums';
import { Permission } from 'src/models/enums/permissions.enum';
import { IPaging } from 'src/models/IPaging';
import { ResponseBoolean } from 'src/models/ResponseBoolean';
import { LmsUserToken } from 'src/models/token.model';
import { DeleteCountry, EditCountry } from './country.business.validator';
import { createcountry, deletecountry, showallcountry, showcountry, updatecountry } from './country.request.validator';
import { CountryBase } from './models/CountryBase';
import { CountryRequest } from './models/CountryRequest';
import { CountryAllResponse, CountryCreateResponse, CountryGetAllResponse } from './models/CountryResponse';

@ApiExtraModels(CountryBase)
@ApiExtraModels(CountryCreateResponse)
@ApiTags("Country")
@Controller("country")
@ApiBearerAuth()
export class CountryController {

    @Get('all')
    @ApiResponse({
      status: 200,
      description: "Fetched countries successfully",
    })
    @ApiResponse({
      status: 400,
      description: "Error fetching countries",
    })
    @ApiResponse({
      status: 500,
      description: "Server error",
    })
    @UseGuards(AccessGuard(TokenType.ACCESS))
    @ApiQuery({ name: "country", required: false, type: 'string' })
    @HttpCode(HttpStatus.OK)
    async getAllCountries(
      @Query("country") countryname: string = '',
      @User() user: LmsUserToken,
    ): Promise<any> {
      const data = await new CountryBusiness().getCountriesWithFilter(countryname, user);
      return {
          data: data,
          error: false,
      };
    }

    @Get(":countryid")
    @ApiResponse({
        status: 200,
        description: "Country fetch successfully",
        schema: { $ref: getSchemaPath(CountryCreateResponse) },
    })
    @ApiResponse({
        status: 400,
        description: "Error while fetching country",
    })
    @UseInterceptors(
        new SchemaValidationInterceptor(showcountry),
        // new BusinessValidationInterceptor([EditSchool])
    )
    @HttpCode(HttpStatus.OK)
    @ApiParam({ name: `countryid`, type: "string", required: true })
    @RequirePermissions(Permission.VIEW_COUNTRY)
    @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
    @ApiBearerAuth()
    async get(
        @Param("countryid") countryid: string
    ): Promise<CountryCreateResponse> {
        const data = await new CountryBusiness().getcountrybyid(countryid);
        return {
            error: false,
            data: data ? data : undefined,
        };
    }

    @Get("")
    @ApiResponse({
        status: 200,
        description: "Country fetch successfully",
        schema: { $ref: getSchemaPath(CountryAllResponse) },
    })
    @ApiResponse({
        status: 400,
        description: "Error while fetching country",
    })
    @HttpCode(HttpStatus.OK)
    // Role.teacher reads: feeds the country filter on the report screens.
    @UseGuards(AccessGuard(TokenType.ACCESS, Role.apikey, Role.superadmin, Role.admin, Role.teacher))
    @ApiBearerAuth()
    async getAll(): Promise<CountryAllResponse> {
        const data = await new CountryBusiness().getAllcountries();
        return {
            error: false,
            data: data ? data : undefined,
        };
    }

    @Post("")
    @ApiResponse({
        status: 200,
        description: "Countries fetch successfully",
        schema: { $ref: getSchemaPath(CountryGetAllResponse) },
    })
    @ApiResponse({
        status: 400,
        description: "Error while fetching country",
    })
    @ApiResponse({
        status: 500,
        description: "Server error",
    })
    @UseInterceptors(new SchemaValidationInterceptor(showallcountry))
    @ApiBody({ required: false, type: IPaging })
    @RequirePermissions(Permission.VIEW_COUNTRY)
    @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
    @HttpCode(HttpStatus.OK)
    async getall(@Body() body: IPaging): Promise<CountryGetAllResponse> {
        const tempresult = await new CountryBusiness().getcountryall({
            pageindex: body?.pageindex || 0,
            pagesize: body?.pagesize || 0,
            filter: body?.filter || [],
        });
        return <CountryGetAllResponse>{
            error: false,
            data: {
                data: tempresult.rows,
                total: tempresult.count,
                pageindex: body?.pageindex || 0,
                pagesize: body?.pagesize || 0,
            },
        };
    }

    @Post("create")
    @ApiResponse({
        status: 200,
        description: "Country created successfully",
        schema: { $ref: getSchemaPath(CountryCreateResponse) },
    })
    @ApiResponse({
        status: 400,
        description: "Error while creating Country",
    })
    @ApiResponse({
        status: 500,
        description: "Server error",
    })
    @UseInterceptors(
        new SchemaValidationInterceptor(createcountry),
        // new BusinessValidationInterceptor([CreateStandard])
    )
    @RequirePermissions(Permission.CREATE_COUNTRY)
    @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
    @HttpCode(HttpStatus.OK)
    async create(
        @Body() body: CountryRequest,
        @User() user: LmsUserToken
    ): Promise<CountryCreateResponse> {
        const temp: countriesAttributes = {
            countryname: body.countryname,
            countryid: "",
            expectedusage: body.expectedusage,
            isdeleted: false,
        };

        const data = await new CountryBusiness().createcountry(temp, user);
        return {
            error: false,
            data: data,
        };
    }

    @Put(":countryid")
    @ApiResponse({
        status: 200,
        description: "Country fetch successfully",
        schema: { $ref: getSchemaPath(CountryCreateResponse) },
    })
    @ApiResponse({
        status: 400,
        description: "Error while fetching country",
    })
    @UseInterceptors(
        new SchemaValidationInterceptor(updatecountry),
        new BusinessValidationInterceptor([EditCountry])
    )
    @RequirePermissions(Permission.UPDATE_COUNTRY)
    @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
    @HttpCode(HttpStatus.OK)
    @ApiParam({ name: `countryid`, type: "string", required: true })
    @ApiBearerAuth()
    async update(
        @Param("countryid") countryid: string,
        @Body() body: CountryRequest,
        @User() user: LmsUserToken
    ): Promise<CountryCreateResponse> {
        const data = await new CountryBusiness().updatecountryName(<countriesAttributes>{
            countryid: countryid,
            countryname: body.countryname,
            expectedusage: body.expectedusage
        }, user);
        return {
            error: false,
            data: data ? data : undefined,
        };
    }

    @Delete(":countryid")
    @ApiResponse({
        status: 200,
        description: "country deleted successfully",
        schema: { $ref: getSchemaPath(ResponseBoolean) },
    })
    @ApiResponse({
        status: 400,
        description: "Error while deleting country",
    })
    @ApiResponse({
        status: 500,
        description: "Server error",
    })
    @UseInterceptors(
        new SchemaValidationInterceptor(deletecountry),
        new BusinessValidationInterceptor([DeleteCountry])
    )
    @RequirePermissions(Permission.DELETE_COUNTRY)
    @UseGuards(AccessGuard(TokenType.ACCESS), CheckPermissionsGuard)
    @HttpCode(HttpStatus.OK)
    @ApiParam({ name: `countryid`, type: "string", required: true })
    async delete(
        @Param("countryid") countryid: string,
        @User() user: LmsUserToken
    ): Promise<ResponseBoolean> {
        await new CountryBusiness().deletecountry(countryid, user);
        return {
            error: false,
            data: true,
        };
    }
}
