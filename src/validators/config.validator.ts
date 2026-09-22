import { address } from "ip";
import Joi, { ValidationError } from "joi";
import { hostname } from "os";
const schema = Joi.object()
  .keys({
    fortyk: Joi.object()
      .keys({
        api: Joi.object()
          .keys({
            accessexpirationminutes: Joi.number()
              .required()
              .description("accessexpirationminutes"),
            refreshexpirationminutes: Joi.number()
              .required()
              .description("refreshexpirationminutes"),
            changepasswordexpirationminutes: Joi.number()
              .required()
              .description("changepasswordexpirationminutes"),
            verifyemailexpirationminutes: Joi.number()
              .required()
              .description("verifyemailexpirationminutes"),
            applicationapikey: Joi.string()
              .required()
              .min(256)
              .max(256)
              .description("applicationapikey"),
            port: Joi.number().required().description("port"),
            applicationsecret: Joi.string()
              .required()
              .description("applicationsecret"),
            serversynckey: Joi.string().required().description("serversynckey"),
            serverip: Joi.string()
              .ip()
              .default(address())
              .description("applicationsecret"),
            servername: Joi.string().default(hostname()).description("servername"),
            applicationname: Joi.string()
              .default("LMS-API")
              .description("applicationname"),
            debug: Joi.boolean().required().description("debug"),
            database: Joi.object()
              .keys({
                name: Joi.string().required().description("name"),
                user: Joi.string().required().description("user"),
                password: Joi.string().required().description("password"),
                port: Joi.number().required().default(3306).description("port"),
                host: Joi.alternatives()
                  .try(Joi.string().uri(), Joi.string().ip(), Joi.string())
                  .required()
                  .description("host"),
              })
              .unknown(true),
            smtp: Joi.object()
              .keys({
                host: Joi.alternatives()
                  .try(Joi.string().uri(), Joi.string().ip(), Joi.string())
                  .required()
                  .description("host"),
                port: Joi.number().required().description("port"),
                username: Joi.string().required().description("username"),
                password: Joi.string().required().description("password"),
                secure: Joi.boolean().required().description("secure"),
                requiretsl: Joi.boolean().required().description("requiretsl"),
                emailfrom: Joi.string().email().required().description("emailfrom"),
              })
              .unknown(true),
            aws: Joi.object()
              .keys({
                accesskeyid: Joi.string().required().description("accesskeyid"),
                secretaccesskey: Joi.string()
                  .required()
                  .description("secretaccesskey"),
                s3bucketname: Joi.string().required().description("s3bucketname"),
              })
              .unknown(true),
            rpi: Joi.object()
              .keys({
                RPIsecret: Joi.string().required().description("RPIsecret"),
                cloud: Joi.string().required().description("cloud"),
              })
              .unknown(true),
          })
          .unknown(true),
        ui: Joi.alternatives()
          .try(Joi.string().uri(), Joi.string().ip(), Joi.string())
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
