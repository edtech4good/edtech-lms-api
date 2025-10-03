import dotenv from 'dotenv';
import { address } from 'ip';
import { hostname } from 'os';
import winston from 'winston';
import { Config as modelconfig } from './models/config.model';
import { LoggerType } from './models/enums/loggertype.enum';
import { LoggerConfig } from "./models/loggerconfig.model";
import { Logger as internalLogger } from "./services/logger";
import { config as configValidator } from './validators';

dotenv.config();

// Default configuration for development
const defaultConfig = {
  fortyk: {
    api: {
      applicationapikey: process.env.APPLICATION_API_KEY || "your-256-character-api-key-here",
      accessexpirationminutes: parseInt(process.env.ACCESS_EXPIRATION_MINUTES || "60"),
      refreshexpirationminutes: parseInt(process.env.REFRESH_EXPIRATION_MINUTES || "1440"),
      changepasswordexpirationminutes: parseInt(process.env.CHANGE_PASSWORD_EXPIRATION_MINUTES || "30"),
      verifyemailexpirationminutes: parseInt(process.env.VERIFY_EMAIL_EXPIRATION_MINUTES || "60"),
      port: parseInt(process.env.PORT || "3000"),
      applicationsecret: process.env.APPLICATION_SECRET || "your-application-secret-here",
      serversynckey: process.env.SERVER_SYNC_KEY || "your-server-sync-key-here",
      serverip: process.env.SERVER_IP || address(),
      servername: process.env.SERVER_NAME || hostname(),
      applicationname: process.env.APPLICATION_NAME || "LMS-API",
      debug: process.env.NODE_ENV === 'development',
      database: {
        name: process.env.DB_NAME || "edtech_lms",
        user: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || "password",
        host: process.env.DB_HOST || "localhost",
        port: parseInt(process.env.DB_PORT || "3306")
      },
      smtp: {
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: parseInt(process.env.SMTP_PORT || "587"),
        username: process.env.SMTP_USER || "your-email@gmail.com",
        password: process.env.SMTP_PASS || "your-email-password",
        secure: process.env.SMTP_SECURE === 'true',
        requiretsl: process.env.SMTP_REQUIRE_TLS === 'true',
        emailfrom: process.env.SMTP_FROM || "your-email@gmail.com"
      },
      aws: {
        accesskeyid: process.env.AWS_ACCESS_KEY_ID || "your-aws-access-key",
        secretaccesskey: process.env.AWS_SECRET_ACCESS_KEY || "your-aws-secret-key",
        s3bucketname: process.env.AWS_S3_BUCKET || "your-s3-bucket-name",
        endpoint: process.env.AWS_ENDPOINT || "https://s3.amazonaws.com"
      },
      rpi: {
        RPIsecret: process.env.RPI_SECRET || "your-rpi-secret",
        cloud: process.env.RPI_CLOUD || "your-cloud-endpoint"
      }
    },
    ui: process.env.UI_URL || "http://localhost:3001"
  }
};

// Try to parse FORTYKAPICONFIG if provided, otherwise use default config
let configvalues;
try {
  const envConfig = process.env.FORTYKAPICONFIG ? JSON.parse(process.env.FORTYKAPICONFIG) : defaultConfig;
  const { value, error: valerrors } = configValidator.schema.prefs({ errors: { label: 'key' } }).validate(envConfig);
  
  if (valerrors) {
    console.warn(`Config validation warning: ${valerrors.message}. Using default configuration.`);
    configvalues = defaultConfig;
  } else {
    configvalues = value;
  }
} catch (error) {
  console.warn(`Error parsing FORTYKAPICONFIG: ${error.message}. Using default configuration.`);
  configvalues = defaultConfig;
}

const Config: modelconfig = <modelconfig>configvalues;

const buildLogger = (): winston.Logger => {
  const loggerConfig = new LoggerConfig();
  loggerConfig.APPLICATIONNAME = Config.fortyk.api.applicationname;
  loggerConfig.LOGGERTYPE = LoggerType.CONSOLE;
  loggerConfig.SERVERIP = Config.fortyk.api.serverip;
  loggerConfig.SERVERNAME = Config.fortyk.api.servername;
  loggerConfig.DEBUG = Config.fortyk.api.debug;
  return internalLogger.getlogger(loggerConfig);
};

const Logger = buildLogger();
export { Logger, Config };

