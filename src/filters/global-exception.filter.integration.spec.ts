import { Body, Controller, Get, INestApplication, Module, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FileInterceptor } from '@nestjs/platform-express';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json } from 'express';
import request from 'supertest';
import Transport from 'winston-transport';
import { GlobalExceptionFilter } from './global-exception.filter';
import { Config, Logger } from '../config';

@Controller('probe')
class ProbeController {
  @Post('echo')
  echo(@Body() body: any) {
    return { error: false, data: body };
  }

  @Get('item/:id')
  item(@Param('id') id: string) {
    return { error: false, data: id };
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10, files: 1 } }))
  upload(@UploadedFile() file: Express.Multer.File) {
    return { error: false, data: file?.size };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

/**
 * Captures what the REAL winston Logger (src/config.ts, not a jest mock)
 * emits, after its formats have run, so a leak through `message`, `stack`
 * or any metadata key shows up exactly as it would in the console log.
 */
class CaptureTransport extends Transport {
  public lines: string[] = [];

  log(info: any, callback: () => void) {
    this.lines.push(JSON.stringify(info));
    callback();
  }
}

/**
 * Exercises the REAL pipeline (Express body-parser + Nest routing + multer +
 * GlobalExceptionFilter + the real winston logger), not the filter's catch()
 * called by hand.
 */
describe('GlobalExceptionFilter (integration, real Express pipeline and real logger)', () => {
  let app: INestApplication;
  let originalDebug: boolean;
  let capture: CaptureTransport;

  beforeAll(async () => {
    originalDebug = Config.fortyk.api.debug;
    Config.fortyk.api.debug = false;
    app = await NestFactory.create<NestExpressApplication>(ProbeModule, { logger: false });
    app.use(json({ limit: '1kb' }));
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    capture = new CaptureTransport();
    Logger.add(capture);
  });

  afterEach(() => {
    Logger.remove(capture);
  });

  afterAll(async () => {
    Config.fortyk.api.debug = originalDebug;
    await app.close();
  });

  const logged = () => capture.lines.join('\n');

  it('malformed JSON body "hunter2pass": neither the response nor the real log contains it', async () => {
    const res = await request(app.getHttpServer())
      .post('/probe/echo')
      .set('Content-Type', 'application/json')
      .send('hunter2pass');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INPUT');
    expect(res.body.errormessage).toBe("The request body isn't valid.");
    expect(JSON.stringify(res.body)).not.toContain('hunter2pass');
    expect(capture.lines.length).toBe(1);
    expect(logged()).not.toContain('hunter2pass');
  });

  it('unknown route with a query token: 404 NOT_FOUND, route template logged, no path/query in response or log', async () => {
    const res = await request(app.getHttpServer()).get('/nope/route?token=QUERYTOKEN');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(JSON.stringify(res.body)).not.toContain('QUERYTOKEN');
    expect(capture.lines.length).toBe(1);
    expect(logged()).not.toContain('QUERYTOKEN');
    expect(JSON.parse(capture.lines[0]).metadata.route).toBe('/nope/route');
  });

  it('bad %-encoding in a path param (URIError): generic INVALID_INPUT, param never echoed or logged', async () => {
    const res = await request(app.getHttpServer()).get('/probe/item/%E0%A4%AFsecretparam%FF');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INPUT');
    expect(JSON.stringify(res.body)).not.toContain('secretparam');
    expect(logged()).not.toContain('secretparam');
  });

  it('an oversized JSON body is FILE_REJECTED 413, not a 500', async () => {
    const res = await request(app.getHttpServer())
      .post('/probe/echo')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ data: 'x'.repeat(5000) }));

    expect(res.status).toBe(413);
    expect(res.body.code).toBe('FILE_REJECTED');
  });

  it('an upload over the multer size limit is FILE_REJECTED 413', async () => {
    const res = await request(app.getHttpServer())
      .post('/probe/upload')
      .attach('file', Buffer.from('this is more than ten bytes'), 'big.txt');

    expect(res.status).toBe(413);
    expect(res.body.code).toBe('FILE_REJECTED');
  });

  it('an upload in an unexpected multipart field is FILE_REJECTED 400, field name not logged', async () => {
    const res = await request(app.getHttpServer())
      .post('/probe/upload')
      .attach('secretfieldname', Buffer.from('tiny'), 'a.txt');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('FILE_REJECTED');
    expect(logged()).not.toContain('secretfieldname');
  });

  it('a valid request passes through untouched and logs nothing', async () => {
    const res = await request(app.getHttpServer())
      .post('/probe/echo')
      .set('Content-Type', 'application/json')
      .send({ hello: 'world' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ error: false, data: { hello: 'world' } });
    expect(capture.lines.length).toBe(0);
  });

  it('the reference logged server-side equals the reference returned to the client', async () => {
    const res = await request(app.getHttpServer())
      .post('/probe/echo')
      .set('Content-Type', 'application/json')
      .send('not json at all');

    expect(JSON.parse(capture.lines[0]).metadata.reference).toBe(res.body.reference);
  });
});
