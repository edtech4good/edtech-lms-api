/* eslint-disable @typescript-eslint/no-explicit-any */
import { ValidationError, ValidationErrorItem } from 'joi';
import { DocumentTagBusiness } from 'src/business';
import { IRequest } from 'src/models/IRequest';

export const CreateDocumentTag = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new DocumentTagBusiness().isexistsdocumentTagName({
    documenttagname: data.documenttagname,
    documenttagid: '',
    isdeleted: false,
  });
  if (tagexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: [''],
      type: '',
    };
    erroritem.message = 'Document tag already exists';
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const EditDocumentTag = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new DocumentTagBusiness().isexistsdocumentTagID(data.documenttagid);
  if (!tagexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: [''],
      type: '',
    };
    erroritem.message = 'Invalid document tag id';
    error.details.push(erroritem);
    return [error];
  } else {
    const tagexistsnew = await new DocumentTagBusiness().isexistsdocumentTagName({
      documenttagname: data.documenttagname,
      documenttagid: data.documenttagid,
      isdeleted: false,
    });
    if (tagexistsnew) {
      const error = new ValidationError('Validation', {}, {});
      error.details = [];
      const erroritem: ValidationErrorItem = {
        message: '',
        path: [''],
        type: '',
      };
      erroritem.message = 'Document tag already exists';
      error.details.push(erroritem);
      return [error];
    }
  }
  return [];
};
export const DeleteDocumentTag = async (request: IRequest, data: any): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new DocumentTagBusiness().isexistsdocumentTagID(data.documenttagid);
  if (!tagexists) {
    const error = new ValidationError('Validation', {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: '',
      path: [''],
      type: '',
    };
    erroritem.message = 'Invalid document tag id';
    error.details.push(erroritem);
    return [error];
  }
  return [];
};
