import { address } from "ip";
import {
  alternatives,
  boolean,
  number,
  object,
  string,
  ValidationError,
} from "joi";
import { hostname } from "os";
const schema = object()
  .keys({
    fortyk: object()
      .keys({
        api: object()
          .keys({
            accessexpirationminutes: number()
              .required()
              .description("accessexpirationminutes"),
            refreshexpirationminutes: number()
              .required()
              .description("refreshexpirationminutes"),
            changepasswordexpirationminutes: number()
              .required()
              .description("changepasswordexpirationminutes"),
            verifyemailexpirationminutes: number()
              .required()
              .description("verifyemailexpirationminutes"),
            applicationapikey: string()
              .required()
              .min(256)
              .max(256)
              .description("applicationapikey"),
            port: number().required().description("port"),
            applicationsecret: string()
              .required()
              .description("applicationsecret"),
            serversynckey: string().required().description("serversynckey"),
            serverip: string()
              .ip()
              .default(address())
              .description("applicationsecret"),
            servername: string().default(hostname()).description("servername"),
            applicationname: string()
              .default("LMS-API")
              .description("applicationname"),
            debug: boolean().required().description("debug"),
            database: object()
              .keys({
                name: string().required().description("name"),
                user: string().required().description("user"),
                password: string().required().description("password"),
                port: number().required().default(3306).description("port"),
                host: alternatives()
                  .try(string().uri(), string().ip(), string())
                  .required()
                  .description("host"),
              })
              .unknown(true),
            smtp: object()
              .keys({
                host: alternatives()
                  .try(string().uri(), string().ip(), string())
                  .required()
                  .description("host"),
                port: number().required().description("port"),
                username: string().required().description("username"),
                password: string().required().description("password"),
                secure: boolean().required().description("secure"),
                requiretsl: boolean().required().description("requiretsl"),
                emailfrom: string().email().required().description("emailfrom"),
              })
              .unknown(true),
            aws: object()
              .keys({
                accesskeyid: string().required().description("accesskeyid"),
                secretaccesskey: string()
                  .required()
                  .description("secretaccesskey"),
                s3bucketname: string().required().description("s3bucketname"),
              })
              .unknown(true),
            rpi: object()
              .keys({
                RPIsecret: string().required().description("RPIsecret"),
                cloud: string().required().description("cloud"),
              })
              .unknown(true),
          })
          .unknown(true),
        ui: alternatives()
          .try(string().uri(), string().ip(), string())
          .required()
          .description("ui"),
      })
      .unknown(true),
  })
  .unknown(true);

const validator = (
  config: any
): Promise<{ error: ValidationError; value: any }> =>
  schema.validateAsync(config, {
    abortEarly: false,
    allowUnknown: true,
  });

export { schema, validator };
