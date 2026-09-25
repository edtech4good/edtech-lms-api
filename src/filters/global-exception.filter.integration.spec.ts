import { Body, Controller, INestApplication, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json } from 'express';
import request from 'supertest';
import { GlobalExceptionFilter } from './global-exception.filter';
import { Config, Logger } from '../config';

@Controller('probe')
class ProbeController {
  @Post('echo')
  echo(@Body() body: any) {
    return { error: false, data: body };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

/**
 * Exercises the REAL pipeline (Express body-parser + Nest's routing +
 * GlobalExceptionFilter), not just the filter's catch() called directly -
 * per docs/testing-and-verification.md, "verify against the real thing".
 * This is how a body-parser SyntaxError (malformed/oversized JSON) actually
 * reaches the filter, which unit tests calling .catch() by hand can't prove.
 */
describe('GlobalExceptionFilter (integration, real Express pipeline)', () => {
  let app: INestApplication;
  let originalDebug: boolean;

  beforeAll(async () => {
    originalDebug = Config.fortyk.api.debug;
    Config.fortyk.api.debug = false;
    app = await NestFactory.create<NestExpressApplication>(ProbeModule, { logger: false });
    app.use(json({ limit: '1kb' }));
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    Config.fortyk.api.debug = originalDebug;
    await app.close();
  });

  it('malformed JSON never leaks the raw body text (which may contain a password fragment) into the response', async () => {
    const res = await request(app.getHttpServer())
      .post('/probe/echo')
      .set('Content-Type', 'application/json')
      .send('not json at all hunter2 secretvalue');

    expect(res.status).toBe(400);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('secretvalue');
    expect(res.body.code).toBe('INVALID_INPUT');
    // The generic message, not Node's own JSON.parse error text (position-only
    // today, but that is a V8 implementation detail, not a stable contract -
    // this line is what actually proves the dedicated entity.parse.failed
    // branch ran, not just that this V8's parse-error message happens to be
    // safe).
    expect(res.body.errormessage).toBe("The request body isn't valid.");
  });

  it('malformed JSON is never logged with the raw body text either', async () => {
    const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => Logger as any);
    const errorSpy = jest.spyOn(Logger, 'error').mockImplementation(() => Logger as any);

    await request(app.getHttpServer())
      .post('/probe/echo')
      .set('Content-Type', 'application/json')
      .send('{"lmsuserpassword": "hunter2", not valid json');

    const allCalls = [...warnSpy.mock.calls, ...errorSpy.mock.calls];
    expect(allCalls.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(allCalls);
    expect(serialized).not.toContain('hunter2');
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('an oversized JSON body maps to FILE_REJECTED/INVALID_INPUT at 413, not a raw 500', async () => {
    const bigPayload = JSON.stringify({ data: 'x'.repeat(5000) });
    const res = await request(app.getHttpServer())
      .post('/probe/echo')
      .set('Content-Type', 'application/json')
      .send(bigPayload);

    expect(res.status).toBe(413);
  });

  it('a valid request still passes through the filter untouched', async () => {
    const res = await request(app.getHttpServer())
      .post('/probe/echo')
      .set('Content-Type', 'application/json')
      .send({ hello: 'world' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ error: false, data: { hello: 'world' } });
  });

  it('logs the route template, not the raw URL with query string', async () => {
    const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => Logger as any);
    const errorSpy = jest.spyOn(Logger, 'error').mockImplementation(() => Logger as any);

    await request(app.getHttpServer())
      .post('/probe/echo?secret=shouldnotleak')
      .set('Content-Type', 'application/json')
      .send('not json at all');

    const allCalls = [...warnSpy.mock.calls, ...errorSpy.mock.calls];
    const meta: any = (allCalls[0] as any[] | undefined)?.[1];
    expect(meta?.route).not.toContain('secret');
    expect(meta?.route).not.toContain('?');
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('the reference in the logged metadata matches the reference returned to the client', async () => {
    const errorSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => Logger as any);

    const res = await request(app.getHttpServer())
      .post('/probe/echo')
      .set('Content-Type', 'application/json')
      .send('not json at all');

    const meta: any = (errorSpy.mock.calls[0] as any[] | undefined)?.[1];
    expect(meta?.reference).toBe(res.body.reference);
    errorSpy.mockRestore();
  });
});
