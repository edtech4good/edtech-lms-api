import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { Config, Logger } from './config';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { initModels } from './models/data-models/init-models';
import { dbinstance } from "./services/dbservice"
//import { TestApp } from "./test"
async function bootstrap() {
  initModels(dbinstance.getdbinstance());
  // await dbinstance.getdbinstance().sync();

  /*
  const app1 = new TestApp();
  app1.run().catch(err => console.error(err));
*/

  Logger.info('Connected to DB');
  const app = await NestFactory.create(AppModule);
  //app.setGlobalPrefix("api");
  const config = new DocumentBuilder().setTitle('Fortyk API').setDescription('Fortyk API').setVersion("1.0.0").addBearerAuth().build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
  app.enableCors();
  app.use(json({ limit: '50mb' }));
  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.listen(Config.fortyk.api.port);

  Logger.info(`Application is running on: ${await app.getUrl()}`);
  const exitHandler = async () => {
    if (app) {
      await app.close();
      Logger.info('Server closed');
      process.exit(1);
    } else {
      process.exit(1);
    }
  };

  const unexpectedErrorHandler = (error: unknown) => {
    Logger.error(error);
    exitHandler();
  };

  process.on('uncaughtException', unexpectedErrorHandler);
  process.on('unhandledRejection', unexpectedErrorHandler);

  process.on('SIGTERM', () => {
    Logger.info('SIGTERM received');
    if (app) {
      app.close();
    }
  });
}
bootstrap();
