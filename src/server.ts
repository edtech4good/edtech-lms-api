import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { Config, Logger, isLocalEnv } from './config';
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
  // Swagger (/docs and /docs-json) is a full map of the API surface — every
  // route, param and DTO. Useful locally, an anonymous recon aid in production.
  // Mounted only in local dev, gated on the same isLocalEnv the secret guard
  // and CORS use. To expose it in production later, put it behind auth instead.
  if (isLocalEnv) {
    const config = new DocumentBuilder().setTitle('Fortyk API').setDescription('Fortyk API').setVersion("1.0.0").addBearerAuth().build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  } else {
    Logger.info('Swagger /docs disabled (production)');
  }
  // CORS: an allowlist in production, permissive in local dev.
  //
  // Auth here is a Bearer token, not a cookie, so this is defence in depth
  // rather than the only thing standing between a site and the API. Production
  // origins come from CORS_ORIGINS (comma-separated) plus the admin UI's
  // UI_URL. Requests with no Origin header — the Expo native app,
  // server-to-server proxying, curl and health checks — are always allowed;
  // CORS only governs browser cross-origin requests.
  //
  // Local dev reflects any origin: the admin UI (4200), Expo web (8081/19006)
  // and physical devices on LAN IPs all move around, and dev machines are not
  // the threat model. Gated on the same isLocalEnv the secret guard uses.
  const allowedOrigins = new Set<string>(
    [
      ...(process.env.CORS_ORIGINS ?? '').split(','),
      process.env.UI_URL ?? '',
    ]
      .map((o) => o.trim())
      .filter(Boolean)
  );
  if (!isLocalEnv && allowedOrigins.size === 0) {
    Logger.warn(
      'CORS: no allowed origins configured (set CORS_ORIGINS and/or UI_URL). ' +
        'Browser clients will be blocked; no-Origin requests still work.'
    );
  }
  Logger.info(
    `CORS: ${
      isLocalEnv
        ? 'local dev — reflecting any origin'
        : `allowlist [${[...allowedOrigins].join(', ') || '(none)'}]`
    }`
  );
  app.enableCors({
    origin: isLocalEnv
      ? true
      : (origin, callback) => {
          // No Origin header (native app, server-to-server, curl): allow.
          if (!origin) return callback(null, true);
          return callback(null, allowedOrigins.has(origin));
        },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Accept-Language',
      'Cache-Control',
      'TIMEOFFSET',
    ],
  });
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
