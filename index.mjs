import dotenv from "dotenv";

dotenv.config();

import mongoose from "mongoose";

import serverless from "serverless-http";

import express from "express";

import { AsinTaskPost, AsinTaskGet } from "./handlers.mjs";

const server = express();

server.enable("trust proxy");

server.disable("x-powered-by");

server.use(express.json());

server.use(express.urlencoded({ extended: true }));

server.post("/api/asin/estimate/task", AsinTaskPost);

server.get("/api/asin/estimate/task/:asinId", AsinTaskGet);

server.get("/api/asin/estimate/task", AsinTaskGet);

server.all("*", async function (req, res, next) {
  res.status(404).end();
});

export const handler = async function (event, context) {
  global.mongoose_client ??= await mongoose.connect(
    process.env.MONGO_CONNECTION,
    {
      user: encodeURIComponent(process.env.MONGO_USERNAME),
      pass: encodeURIComponent(process.env.MONGO_PASSWORD)
    }
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
          listDatabases: 1
        })
      );
    })
    .catch(console.error)
    .then(process.exit);
}

if (process.env.UNIT_TEST) {
  const _res = {
    json: function (e) {
      console.log(JSON.stringify(e, null, 2));
    },
    status: function (e) {
      return this;
    }
  };

  handler().then(() => {
    false &&
      AsinTaskPost(
        {
          query: { asinId: "A123456789" }
        },
        _res
      )
        .catch(console.error)
        .then(process.exit);

    false &&
      AsinTaskGet(
        {
          query: { estimateId: "6579a6443905549151a262fd" }
        },
        _res
      )
        .catch(console.error)
        .then(process.exit);
  });
}
