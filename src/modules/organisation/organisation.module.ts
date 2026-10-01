import { Module } from "@nestjs/common";
import { OrganisationController } from "./organisation.controller";

@Module({
  controllers: [OrganisationController],
})
export class OrganisationModule {}
