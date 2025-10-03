/* eslint-disable @typescript-eslint/no-explicit-any */
import { ValidationError, ValidationErrorItem } from 'joi';
import { DocumentBusiness } from 'src/business';
import { IRequest } from 'src/models/IRequest';

export const CreateDocument = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new DocumentBusiness().isexistsdocumentName({
    documentname: data.documentname,
    documentid: '',
    isdeleted: false,
    documenttypeid: -1,
    lastupdated: new Date(),
  });
  if (tagexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: [''],
      type: '',
    };
    erroritem.message = 'Document already exists';
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const EditDocument = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new DocumentBusiness().isexistsdocumentID(data.documentid);
  if (!tagexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: [''],
      type: '',
    };
    erroritem.message = 'Invalid document id';
    error.details.push(erroritem);
    return [error];
  } else {
    const tagexistsnew = await new DocumentBusiness().isexistsdocumentName({
      documentname: data.documentname,
      documentid: data.documentid,
      isdeleted: false,
      documenttypeid: -1,
      lastupdated: new Date(),
    });
    if (tagexistsnew) {
      const error = new ValidationError('Validation', {}, {});
      error.details = [];
      const erroritem: ValidationErrorItem = {
        message: '',
        path: [''],
        type: '',
      };
      erroritem.message = 'Document already exists';
      error.details.push(erroritem);
      return [error];
    }
  }
  return [];
};
export const DeleteDocument = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new DocumentBusiness().isexistsdocumentID(data.documentid);
  if (!tagexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: [''],
      type: '',
    };
    erroritem.message = 'Invalid document id';
    error.details.push(erroritem);
    return [error];
  }
  return [];
};
