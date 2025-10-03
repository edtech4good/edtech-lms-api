import { Config } from "./../config"

module.exports = {
  development: {
    username: Config.fortyk.api.database.user,
    password: Config.fortyk.api.database.password,
    database: Config.fortyk.api.database.name,
    host: Config.fortyk.api.database.host,
    port: Config.fortyk.api.database.port,
    dialect: "mysql",
    define: {
      timestamps: false
    },
    logging: false
  },
  test: {
    username: Config.fortyk.api.database.user,
    password: Config.fortyk.api.database.password,
    database: Config.fortyk.api.database.name,
    host: Config.fortyk.api.database.host,
    port: Config.fortyk.api.database.port,
    dialect: "mysql",
    define: {
      timestamps: false
    },
    logging: false
  },
  production: {
    username: Config.fortyk.api.database.user,
    password: Config.fortyk.api.database.password,
    database: Config.fortyk.api.database.name,
    host: Config.fortyk.api.database.host,
    port: Config.fortyk.api.database.port,
    dialect: "mysql",
    define: {
      timestamps: false
    },
    logging: false
  }
}
