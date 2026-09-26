import { Sequelize, Transaction } from "sequelize";
import { Config, Logger } from "./../config"
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

/**
 * Rolls back a transaction without letting a second failure mask the first.
 * If `commit()` itself rejected, Sequelize has already marked the transaction
 * finished and `rollback()` throws "has been finished with state: commit" —
 * which would replace the caller's real error.
 */
export async function rollbackQuietly(tnx: Transaction): Promise<void> {
    try {
        await tnx.rollback();
    } catch (e) {
        Logger.error("transaction rollback failed", { error: e });
    }
}