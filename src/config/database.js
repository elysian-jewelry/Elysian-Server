import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const sequelize = new Sequelize(
  process.env.MYSQL_DB,
  process.env.MYSQL_USER,
  process.env.MYSQL_PASSWORD,
  {
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT, // Make sure this is set!
    dialect: 'mysql',
    dialectOptions: {
      multipleStatements: true, // <-- add this
    },
    logging: console.log,
  }
);

export default sequelize;
