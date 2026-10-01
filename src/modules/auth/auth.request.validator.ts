import joi from 'joi';
import { RequestValidator } from '../../models/RequestValidator';
import { passwordvalidator } from '../../validators/custom.validator';
// import { isemailtaken } from '../../business/user.business';

// const isemailtakenhelper = async (value: string, helpers: CustomHelpers) => {
//     const data = await isemailtaken(value);
//     console.log(data);
//     return (await isemailtaken(value)) === false
//         ? value
//         : helpers.message({ 'any.base': 'Email already exists' });
// };


const login: RequestValidator = ({
  body: joi.object().keys({
    lmsusername: joi.string().required().email().message('Invalid Email'),
    lmsuserpassword: joi.string().custom(passwordvalidator).required(),
  }),
});

export const teacherlogin: RequestValidator = ({
  body: joi.object().keys({
    lmsusername: joi.string().required(),
    lmsuserpassword: joi.string().required(),
  }),
});

/** `organisationid` must be present: null is a real answer ("all organisations"), a missing key is not. */
const switchorganisation: RequestValidator = ({
  body: joi.object().keys({
    organisationid: joi.string().uuid().allow(null).required().label('Organisation ID'),
  }),
});

const refreshTokens: RequestValidator = ({
  query: joi.object().keys({
    refreshtoken: joi.string().required(),
  }),
});

const forgotPassword: RequestValidator = ({
  body: joi.object().keys({
    lmsusername: joi.string().required().email().message('Invalid Email'),
  }),
});
const sendverifyemail: RequestValidator = ({
  body: joi.object().keys({
    lmsusername: joi.string().required().email().message('Invalid Email'),
  }),
});

const changePassword: RequestValidator = ({
  query: joi.object().keys({
    changepasswordtoken: joi
      .string()
      .required(),
  }),
  body: joi.object().keys({
    lmsuserpassword: joi.string().required().custom(passwordvalidator),
  }),
});

const verifyEmail: RequestValidator = ({
  query: joi.object().keys({
    verifyemailtoken: joi.string().required(),
  }),
});

export { login, switchorganisation, refreshTokens, forgotPassword, changePassword, verifyEmail, sendverifyemail };

