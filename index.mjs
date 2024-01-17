import dotenv from "dotenv";

dotenv.config();

import mongoose from "mongoose";

import { Access } from "./models.mjs";

import serverless from "serverless-http";

import express from "express";

const server = express();

server.enable("trust proxy");

server.disable("x-powered-by");

server.use(express.json());

server.use(express.urlencoded({ extended: true }));

server.all("*", async function (req, res, next) {
  let payload = {
    method: req.method,
    url: req.url,
    ip: req.ip,
    headers: req.headers,
    query: req.query,
    body: req.body,
    timestamp: new Date(),
    aws: {
      region: process.env.AWS_REGION,
      tz: process.env.TZ,
    },
  };
  payload.result = await Access.create(payload);
  payload.scan = await Access.find({}).exec();
  res.json(payload);
});

export const handler = async function (event, context) {
  global.mongoose_client = await mongoose.connect(
    process.env.MONGO_CONNECTION,
    {
      user: encodeURIComponent(process.env.MONGO_USERNAME),
      pass: encodeURIComponent(process.env.MONGO_PASSWORD),
    },
  );
  return serverless(server)(event, context);
};

if (process.env.EXEC_TEST) {
  handler()
    //
    .then(console.log)
    .catch(console.error)
    .then(process.exit);
}

if (process.env.CONN_TEST) {
  handler()
    //
    .then(async () => {
      console.log(
        await mongoose.connection.db.admin().command({
          listDatabases: 1,
        }),
      );
    })
    .catch(console.error)
    .then(process.exit);
}
