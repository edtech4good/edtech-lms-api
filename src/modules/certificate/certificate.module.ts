import { Module } from "@nestjs/common";
import { CertificateController, CertificateVerifyController } from "./certificate.controller";

@Module({
  controllers: [CertificateController, CertificateVerifyController],
})
export class CertificateModule {}
