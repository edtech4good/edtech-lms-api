export interface Config {
  fortyk: Fortyk;
}

export interface Fortyk {
  api: API;
  ui: string;
}

export interface API {
  applicationapikey: string;
  accessexpirationminutes: number;
  refreshexpirationminutes: number;
  changepasswordexpirationminutes: number;
  verifyemailexpirationminutes: number;
  serverip: string;
  servername: string;
  applicationname: string;
  port: number;
  applicationsecret: string;
  debug: boolean;
  database: Database;
  smtp: SMTP;
  aws: AWS;
  rpi: RPI;
  serversynckey: string;
}

export interface AWS {
  accesskeyid: string;
  secretaccesskey: string;
  s3bucketname: string;
  endpoint: string;
}

export interface Database {
  name: string;
  user: string;
  password: string;
  host: string;
  port: number;
}

export interface RPI {
  RPIsecret: string;
  cloud: string;
}

export interface SMTP {
  host: string;
  port: number;
  username: string;
  password: string;
  secure: boolean;
  requiretsl: boolean;
  emailfrom: string;
}
