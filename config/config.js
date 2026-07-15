/**
 * Sequelize CLI database config (reads edtech-lms-api/.env).
 * @see https://sequelize.org/docs/v6/other-topics/migrations/
 */
require('dotenv').config();

const base = {
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'edtech_lms',
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  dialect: 'mysql',
};

module.exports = {
  development: { ...base },
  test: { ...base },
  production: { ...base },
};
