import { databuildAttributes, databuild } from '../models/data-models/init-models';

export class DataBuildBusiness {
    createBuild = (build: databuildAttributes, lmsuserid: string, filename: string) => {
        build.builddate = new Date();
        build.buildname = filename;
        build.builduser = lmsuserid;
        return databuild.create(build);
    };

    getBuild = () => databuild.findAll({});

}
