import { Sequelize } from "sequelize";
import { Config } from "./../config"
export class dbinstance {
    constructor() {
        throw new Error('Use dbinstance.getdbinstance()');
    }
    private static sequelize: Sequelize;

    static getdbinstance() {
        if (!dbinstance.sequelize) {
            this.sequelize = new Sequelize(Config.fortyk.api.database.name, Config.fortyk.api.database.user, Config.fortyk.api.database.password, {
                host: Config.fortyk.api.database.host,
                port: Config.fortyk.api.database.port,
                dialect: 'mysql'
            });
        }
        return this.sequelize;
    }
}