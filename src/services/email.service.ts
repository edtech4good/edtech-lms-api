import { createTransport, TransportOptions } from 'nodemailer';
import { Config, Logger } from '../config';
//import voca from "voca"
const transporter = <TransportOptions>{
  host: Config.fortyk.api.smtp.host,
  port: Config.fortyk.api.smtp.port,
  secure: Config.fortyk.api.smtp.secure,
  requireTLS: Config.fortyk.api.smtp.requiretsl,
  auth: {
    user: Config.fortyk.api.smtp.username,
    pass: Config.fortyk.api.smtp.password,
  },
  logger: Config.fortyk.api.debug,
};
const transport = createTransport(transporter);
/* istanbul ignore next */
if (Config.fortyk.api.debug == true) {
  transport
    .verify()
    .then(() => Logger.info('Connected to email server'))
    .catch(() => Logger.warn('Unable to connect to email server. Make sure you have configured the SMTP options in .env'));
}

const sendemail = async (to: string, subject: string, text: string) => {
  const msg = {
    from: Config.fortyk.api.smtp.emailfrom,
    to,
    subject,
    //text: voca.stripBom(voca.stripTags(text)),
    html: text
  };
  await transport.sendMail(msg);
};

const sendchangepasswordemail = async (to: string, token: string) => {
  const subject = 'Reset password';
  // replace this url with the link to the reset password page of your front-end app
  const changePasswordUrl = `${Config.fortyk.ui}/auth/changepassword/${token}`;
  const text = `Dear user,<br>
To reset your password, click on this link: ${changePasswordUrl} <br>
If you did not request any password resets, then ignore this email.`;
  await sendemail(to, subject, text);
};

const sendverificationemail = async (to: string, token: string) => {
  const subject = 'Email Verification';
  // replace this url with the link to the email verification page of your front-end app
  const verificationEmailUrl = `${Config.fortyk.ui}/auth/verify/${token}`;
  const text = `Dear user,<br>
To verify your email, click on this link: ${verificationEmailUrl} <br>
If you did not create an account, then ignore this email.`;
  await sendemail(to, subject, text);
};

export { transport, sendemail, sendchangepasswordemail, sendverificationemail };
