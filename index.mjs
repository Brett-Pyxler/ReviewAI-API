import dotenv from "dotenv";

dotenv.config();

import mongoose from "mongoose";

import serverless from "serverless-http";

import express from "express";

import cookieParser from "cookie-parser";

import {
  //
  // dataforseoAmazonReviewsTaskCreate,
  // dataforseoAmazonReviewsTaskRetrieve,
  dataforseoAmazonReviewsTaskCallback
} from "./dataforseo.mjs";

import {
  //
  asinEstimateTaskPost,
  asinEstimateTaskGet,
  asinEstimateTaskPatchPhone
} from "./handlers.mjs";

import {
  //
  AsinEstimates
} from "./models.mjs";

import {
  //
  authCreate,
  authDelete,
  authRetrieve
} from "./authentication";

const server = express();

server.enable("trust proxy");

server.disable("x-powered-by");

server.use(cookieParser());

server.use(express.json());

server.use(express.urlencoded({ extended: true }));

server.all(
  //
  "/api/dataforseo/callback/data",
  dataforseoAmazonReviewsTaskCallback
);

server.patch(
  //
  "/api/asin/estimate/task/phone",
  asinEstimateTaskPatchPhone
);

server.post(
  //
  "/api/asin/estimate/task",
  asinEstimateTaskPost
);

server.get(
  //
  "/api/asin/estimate/task/:estimateId",
  asinEstimateTaskGet
);

server.get(
  //
  "/api/asin/estimate/task",
  asinEstimateTaskGet
);

server.post(
  //
  "/api/auth",
  authCreate
);

server.delete(
  //
  "/api/auth",
  authDelete
);

server.all(
  //
  "/api/auth",
  authRetrieve
);

server.all(
  //
  "*",
  async function (req, res, next) {
    res.status(404).end();
  }
);

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
      AsinEstimates.findById("657b0907fa51cc529a481c7a").then(function (doc) {
        doc.set("dataforseo.retrieve.response", "changed");
        doc.save().then(function () {
          console.log("saved");
          process.exit();
        });
      });

    false &&
      asinEstimateTaskPost(
        {
          query: { asinId: "A123456789" }
        },
        _res
      )
        .catch(console.error)
        .then(process.exit);

    false &&
      asinEstimateTaskGet(
        {
          query: { estimateId: "657c1d2f603b41a97208c1a6" }
        },
        _res
      )
        .catch(console.error)
        .then(process.exit);
  });
}
