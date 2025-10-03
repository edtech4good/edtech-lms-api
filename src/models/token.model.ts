export interface Token {
  token?: string;
  userid?: string;
  tokentype?: string;
}

export interface LmsUserToken {
  lmsusername: string;
  lmsuserrole: string;
  lmsuserid: string;
  firstname: string;
  lastname: string;
  schooluserid?: string;
  schoolusername?: string;
  schooluserrole?: string;
  schoolname?: string;
  countries?: Array<string>;
  schools?: Array<string>;
}
