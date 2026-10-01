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
  /**
   * Staff (lmsusers) access tokens only. The organisation the token acts in,
   * or null for none. For an organisation's staff it is their organisation;
   * for a platform user it is null until they act as an organisation. A
   * validated staff token always carries this claim (JwtAccessStrategy refuses
   * one that lacks it); school-user tokens do not have it.
   */
  organisationid?: string | null;
  /**
   * Staff access tokens only: true for a platform user (no organisation, holds
   * Super Admin), including while acting as an organisation. PlatformGuard
   * reads this and nothing else.
   */
  isplatform?: boolean;
}
