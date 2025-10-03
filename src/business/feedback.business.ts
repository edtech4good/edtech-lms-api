import { BadRequestException } from "@nestjs/common";
import { Op, WhereOptions } from "sequelize";
import { curriculums } from "src/models/data-models/curriculums";
import { feedbackAttributes, feedbacks } from "src/models/data-models/feedback";
import { schools } from "src/models/data-models/school";
import { schoolusers } from "src/models/data-models/schoolusers";
import { FeedBackS3Path } from "src/models/enums/feedback.enum";
import { FileMeta } from "src/models/filemeta.model";
import { IMultiPaging } from "src/models/IPaging";
import { LmsUserToken } from "src/models/token.model";
import {
  FeedbackData,
  FeedbackDataContent,
} from "src/modules/feedback/models/FeedbackBase";
import {
  FeedbackItem,
  FeedbackRequest,
  ImageMeta,
} from "src/modules/feedback/models/FeedbackRequest";
import { AWSService } from "src/services/aws.service";
import {
  buildCustomWhere,
  checkIfDuplicateExists,
  validateFileName,
} from "src/services/util.service";
import { v4 as uuidv4 } from "uuid";

interface IFileBuffer {
  filename: string;
  content: Buffer;
}

export class FeedbackBusiness {
  type_errors = ["rpi", "router", "tablet", "content", "app", "general"];
  createfeedback = async (temp: FeedbackRequest, user: LmsUserToken) => {
    const allbuffers: Array<IFileBuffer> = [];
    const feedbackData: FeedbackData = this.prepareData(temp);
    for await (const type_error of this.type_errors) {
      await this.validateFileNameWithAWSS3({
        imagesMeta: (temp[type_error] as FeedbackItem).images,
        dataContent: feedbackData[type_error],
        type_error,
        images: allbuffers,
        userid: user.schooluserid ?? "",
      });
    }
    const imagesname = [
      ...feedbackData.rpi.images,
      ...feedbackData.router.images,
      ...feedbackData.tablet.images,
      ...feedbackData.content.images,
      ...feedbackData.app.images,
      ...feedbackData.general.images,
    ];
    if (checkIfDuplicateExists(imagesname))
      throw new BadRequestException(
        "Duplicate file name, please check and rename your file!"
      );
    const dataInsertFeedback: feedbackAttributes = {
      feedbackid: uuidv4(),
      feedback: feedbackData,
      feedback3meta: [],
      image: imagesname,
      teachername: temp.teachername,
      curriculumid: temp.curriculumid,
      isdeleted: false,
      created_by: user.schooluserid,
    };
    const feedback3meta = [];
    for await (const filebuffer of allbuffers) {
      feedback3meta.push(
        await AWSService.uploadS3InFolder(
          filebuffer.filename,
          filebuffer.content,
          FeedBackS3Path
        )
      );
    }
    dataInsertFeedback.feedback3meta = feedback3meta;
    await feedbacks.create(dataInsertFeedback);
    return "feedback is created successfully!";
  };

  validateFileNameWithAWSS3 = async (returnData: {
    imagesMeta: Array<ImageMeta>;
    dataContent: FeedbackDataContent;
    type_error: string;
    images: Array<IFileBuffer>;
    userid: string;
  }) => {
    for await (const img of returnData.imagesMeta) {
      const filemeta: FileMeta = validateFileName(img.filename);
      img.filename =
        returnData.userid +
        "_" +
        returnData.type_error +
        "_" +
        Date.now() +
        "." +
        filemeta.fileext;
      const result = await AWSService.checkExistS3Object(
        FeedBackS3Path + "/" + img.filename
      );
      if (result)
        throw new BadRequestException(
          img.filename + " already exists, please rename your file!"
        );
      const filebuffer = Buffer.from(img.content, "base64");
      returnData.images.push({ filename: img.filename, content: filebuffer });
      returnData.dataContent.images.push(img.filename);
    }
  };

  prepareData = (temp: FeedbackRequest) => {
    return <FeedbackData>{
      rpi: {
        feedback: temp.rpi.feedback,
        selected_error: temp.rpi.selected_error,
        images: [],
      },
      router: {
        feedback: temp.router.feedback,
        selected_error: temp.router.selected_error,
        images: [],
      },
      tablet: {
        feedback: temp.tablet.feedback,
        selected_error: temp.tablet.selected_error,
        images: [],
      },
      content: {
        feedback: temp.content.feedback,
        selected_error: temp.content.selected_error,
        images: [],
      },
      app: {
        feedback: temp.app.feedback,
        selected_error: temp.app.selected_error,
        images: [],
      },
      general: {
        feedback: temp.general.feedback,
        selected_error: temp.general.selected_error,
        images: [],
      },
    };
  };

  getAllFeedbacks = async (paging: IMultiPaging) => {
    schoolusers.hasMany(feedbacks, {
      foreignKey: "created_by",
      sourceKey: "schooluserid",
    });
    feedbacks.belongsTo(schoolusers, {
      foreignKey: "created_by",
    });
    const where: WhereOptions<feedbackAttributes> = {
      isdeleted: false,
    };
    const whereUsage: any = {};
    const limit = paging.pagesize || 20;
    let offset = 0;
    if ((paging.pageindex || 1) > 1) {
      offset = limit * ((paging.pageindex || 1) - 1);
    }
    buildCustomWhere(paging.filter ?? [], {key: 'countryid', fields: '$schooluser.school.countryid$', where: where});
    buildCustomWhere(paging.filter ?? [], {key: 'schoolname', fields: '$schooluser.schoolname$', where: where});
    buildCustomWhere(paging.filter ?? [], {fields: 'startDate', where: whereUsage});
    buildCustomWhere(paging.filter ?? [], {fields: 'endDate', where: whereUsage});
    if(whereUsage.startDate) {
      const endDate = whereUsage.endDate ? whereUsage.endDate : new Date();
      where.created_at = {
          [Op.between] : [whereUsage.startDate, endDate]
      }
    }
    const allfeedbacks = await feedbacks.findAndCountAll({
      where,
      order: [["created_at", 'DESC']],
      limit,
      offset,
      attributes: [
        "feedbackid",
        "feedback",
        "image",
        "teachername",
        "created_at",
      ],
      include: [
        {
          model: schoolusers,
          required: true,
          attributes: ["schooluserid", "schoolname"],
          include: [
            {
              model: schools,
              required: true,
              attributes: ["schoolname", "countryid"],
            },
          ]
        },
        {
          model: curriculums,
          required: true,
          attributes: ["curriculumid", "curriculumname"],
        },
      ],
    });
    return allfeedbacks;
  };

  getfeedbackbyid = async (feedbackid: string) => {
    const fb = await feedbacks.findOne({
      where: { feedbackid, isdeleted: false },
      attributes: ["feedbackid", "feedback", "teachername"],
    });
    return fb;
  };

  getFeedbacks = async () => {
    const where: WhereOptions<feedbackAttributes> = {
      //isdeleted: false,
    };
    const order = ["created_at"];

    return await feedbacks.findAll({ where, order });
  };
}
