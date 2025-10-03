import { S3, config } from "aws-sdk"
import { Config } from "./../config"
/*import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { S3Client } from "@aws-sdk/client-s3";
*/
export class AWSService {
    private static updateAWSConfig = () => {
        config.update({
            accessKeyId: Config.fortyk.api.aws.accesskeyid,
            secretAccessKey: Config.fortyk.api.aws.secretaccesskey,
        });
    }
    static uploadS3 = (filename: string, buffer: Buffer) => {
        AWSService.updateAWSConfig();
        console.log("uploading to s3 ", Config.fortyk.api.aws.s3bucketname);
        return new S3({
                            endpoint: Config.fortyk.api.aws.endpoint,
                            s3ForcePathStyle: false,
                            credentials: {
                              accessKeyId: Config.fortyk.api.aws.accesskeyid,
                              secretAccessKey: Config.fortyk.api.aws.secretaccesskey,
                            },
                          }).upload({
            Bucket: Config.fortyk.api.aws.s3bucketname,
            Key: filename,
            ACL: "public-read",
            Body: buffer
        }).promise()
    }

    static preSignURL = async (filename: string) => {
        AWSService.updateAWSConfig();
        return new S3({
                            endpoint: Config.fortyk.api.aws.endpoint,
                            s3ForcePathStyle: false,
                            credentials: {
                              accessKeyId: Config.fortyk.api.aws.accesskeyid,
                              secretAccessKey: Config.fortyk.api.aws.secretaccesskey,
                            },
                          }).getSignedUrl('putObject', {
            Bucket: Config.fortyk.api.aws.s3bucketname,
            Key: filename,
            ACL: "public-read",
            Expires: 60 * 5,
        });
    }

    static getS3Object = (filename: string) => {
        AWSService.updateAWSConfig();
        // Get file data from S3
        const params = {
            Bucket : Config.fortyk.api.aws.s3bucketname,
            Key : filename,
            ACL: "public-read"
        };
        new S3({
                     endpoint: Config.fortyk.api.aws.endpoint,
                     s3ForcePathStyle: false,
                     credentials: {
                       accessKeyId: Config.fortyk.api.aws.accesskeyid,
                       secretAccessKey: Config.fortyk.api.aws.secretaccesskey,
                     },
                   }).getObject(params, function(err, data) {
            if (err) {
                // eslint-disable-next-line no-console
                console.log("Error", err);
            } else {
                // Write file data to a local file using fs module
                // eslint-disable-next-line no-console
                console.log(data.Body)
            }
        });
    }

    static uploadS3InFolder = (filename: string, buffer: Buffer, path: string) => {
        AWSService.updateAWSConfig();
        return new S3({
                endpoint: Config.fortyk.api.aws.endpoint,
                s3ForcePathStyle: false,
                credentials: {
                  accessKeyId: Config.fortyk.api.aws.accesskeyid,
                  secretAccessKey: Config.fortyk.api.aws.secretaccesskey,
                },
              }).upload({
            Bucket: Config.fortyk.api.aws.s3bucketname,
            Key: path + '/' +filename,
            ACL: "public-read",
            Body: buffer
        }).promise()
    }

    static checkExistS3Object = async (filename: string) => {
        AWSService.updateAWSConfig();
        const params = {
            Bucket: Config.fortyk.api.aws.s3bucketname,
            Key: filename, //if any sub folder-> path/of/the/folder.ext
            ACL: "public-read"
        }
        try {
            await new S3({
                               endpoint: Config.fortyk.api.aws.endpoint,
                               s3ForcePathStyle: false,
                               credentials: {
                                 accessKeyId: Config.fortyk.api.aws.accesskeyid,
                                 secretAccessKey: Config.fortyk.api.aws.secretaccesskey,
                               },
                             }).headObject(params).promise()
            return true
        } catch (err) {
            return false
        }
    }
}
