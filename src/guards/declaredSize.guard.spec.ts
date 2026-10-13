import http from "http";
import { Controller, ExecutionContext, INestApplication, PayloadTooLargeException, Module, Post, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FileInterceptor, NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { declaresMoreThanFits, MULTIPART_OVERHEAD_ALLOWANCE, UploadLimits } from "src/constants/upload-limits";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { DeclaredSizeGuard } from "./declaredSize.guard";

const LIMIT = 1000;
const handler = jest.fn((file?: Express.Multer.File) => ({ error: false, data: file?.size }));

/** An upload route built as the document upload is: the declared-size guard ahead of multer's interceptor. */
@Controller("probe")
class ProbeController {
  @Post("upload")
  @UseGuards(DeclaredSizeGuard(LIMIT))
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: LIMIT, files: 1 } }))
  upload(@UploadedFile() file: Express.Multer.File) {
    return handler(file);
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe("declaresMoreThanFits", () => {
  const cap = UploadLimits.DOCUMENT_UPLOAD.fileSize;
  it("the allowance for a multipart body's own text is 64 KiB", () => {
    expect(MULTIPART_OVERHEAD_ALLOWANCE).toBe(64 * 1024);
  });
  it.each([
    ["a body of exactly the limit plus the allowance", String(cap + MULTIPART_OVERHEAD_ALLOWANCE), false],
    ["a body one byte over that", String(cap + MULTIPART_OVERHEAD_ALLOWANCE + 1), true],
    ["201 MB", String(201 * 1024 * 1024), true],
    ["a file at the limit with a few KiB of fields", String(cap + 5 * 1024), false],
    ["a small body", "1234", false],
    ["zero", "0", false],
    ["no header", undefined, false],
    ["an empty header", "", false],
    ["a header that is not a plain number", "1e12", false],
    ["a negative number", "-1", false],
    ["a number with a sign", "+999999999999", false],
    ["a number with more digits than a size can have", "9".repeat(30), true],
  ])("%s", (_name, header, refused) => {
    expect(declaresMoreThanFits(header, cap)).toBe(refused);
  });
  it("is measured against the limit it is given", () => {
    expect(declaresMoreThanFits(String(LIMIT + MULTIPART_OVERHEAD_ALLOWANCE + 1), LIMIT)).toBe(true);
    expect(declaresMoreThanFits(String(LIMIT + MULTIPART_OVERHEAD_ALLOWANCE), LIMIT)).toBe(false);
  });
});

describe("DeclaredSizeGuard, called directly", () => {
  const run = (contentLength: string | undefined) => {
    const request = { headers: contentLength === undefined ? {} : { "content-length": contentLength }, resume: jest.fn() };
    const guard = new (DeclaredSizeGuard(LIMIT))();
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
    return { request, call: () => guard.canActivate(context) };
  };
  it("refuses with a 413 and drains the unread body, so a caller still sending is not cut off", () => {
    const { request, call } = run(String(LIMIT + MULTIPART_OVERHEAD_ALLOWANCE + 1));
    expect(call).toThrow(PayloadTooLargeException);
    expect(request.resume).toHaveBeenCalledTimes(1);
  });
  it.each([[String(LIMIT + MULTIPART_OVERHEAD_ALLOWANCE)], ["10"], [undefined]])("lets %s through and touches nothing", (header) => {
    const { request, call } = run(header);
    expect(call()).toBe(true);
    expect(request.resume).not.toHaveBeenCalled();
  });
});

describe("an upload route behind DeclaredSizeGuard (real Express, multer and exception filter)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(ProbeModule, { logger: false });
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => handler.mockClear());

  const over = String(LIMIT + MULTIPART_OVERHEAD_ALLOWANCE + 1);

  it("a Content-Length over the limit is a 413 before the body is read: a body multer would call malformed never gets that far", async () => {
    const res = await request(app.getHttpServer())
      .post("/probe/upload")
      .set("Connection", "close")
      .set("Content-Type", "multipart/form-data") // no boundary: multer alone answers 400
      .set("Content-Length", over)
      .send("tiny");
    expect([res.status, res.body.code]).toEqual([413, "FILE_REJECTED"]);
    expect(handler).not.toHaveBeenCalled();
  });

  it("without the header's excess the same malformed body reaches multer (400), which shows the 413 above came from the guard", async () => {
    const res = await request(app.getHttpServer()).post("/probe/upload").set("Connection", "close").set("Content-Type", "multipart/form-data").send("tiny");
    expect(res.status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
  });

  it("a Content-Length within the allowance is left to multer: a file within the limit is accepted", async () => {
    const res = await request(app.getHttpServer()).post("/probe/upload").set("Connection", "close").attach("file", Buffer.alloc(LIMIT / 2, 1), "a.bin");
    expect([res.status, res.body.data]).toEqual([201, LIMIT / 2]);
  });

  it("with no Content-Length (a chunked body) multer's own limit is the backstop: 413", async () => {
    const boundary = "xBOUNDARYx";
    const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`;
    const tail = `\r\n--${boundary}--\r\n`;
    await app.listen(0, "127.0.0.1");
    const { port } = app.getHttpServer().address() as { port: number };
    const sent: { status?: number; body?: string } = {};
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port, method: "POST", path: "/probe/upload", headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "Transfer-Encoding": "chunked", Connection: "close" } },
        (res) => {
          let body = "";
          res.on("data", (d) => (body += d));
          res.on("end", () => {
            sent.status = res.statusCode;
            sent.body = body;
            resolve();
          });
        }
      );
      req.on("error", reject);
      req.write(head);
      req.write("a".repeat(LIMIT + 1));
      req.end(tail);
    });
    expect([sent.status, JSON.parse(sent.body ?? "{}").code]).toEqual([413, "FILE_REJECTED"]);
    expect(handler).not.toHaveBeenCalled();
  });
});
