import dotenv from "dotenv";

dotenv.config();

import mongoose from "mongoose";

import bcrypt from "bcrypt";

import helmet from "helmet";

import serverless from "serverless-http";

import express from "express";

import cookieParser from "cookie-parser";

import { authLogin, authLogout, authRetrieve, authRouteDecode, authRouteRequire } from "./authentication.mjs";

import { Members, Organizations, AmazonAsins, AmazonReviews, DataforseoCallbackCaches } from "./models.mjs";

import { oaiCreateAndRun, oaiThreadRetrieve } from "./openai.mjs";

import { dfsARScrapeCallback } from "./dataforseo.mjs";

import { queueBegin } from "./queue.mjs";

import {
  asinsOverviewLookup,
  asinsOverviewEnumerate,
  asinsOverviewGet,
  asinsInsightsGet,
  asinsReviewsEnumerate,
  asinsReviewsPaginate,
  apiSearch,
  apiVersion
} from "./handler.portal.mjs";

import {
  adminSearch,
  adminOrganizationCreate,
  adminOrganizationMembersAdd,
  adminOrganizationAsinsAdd,
  adminOrganizationsEnumerate,
  adminOrganizationGet,
  adminMemberChangePassword,
  adminMembersEnumerate,
  adminMemberGet,
  adminAmazonAsinGet
} from "./handler.admin.mjs";

export const server = express();

server.enable("trust proxy");

server.disable("x-powered-by");

server.use(helmet());

server.use(cookieParser());

server.use(express.json());

server.use(express.urlencoded({ extended: true }));

server.use(async function (req, res, next) {
  console.log(req.method, req.url);
  next();
});
// Authentication

server
  .post("/api/auth", authRouteDecode, authLogin)
  .get("/api/auth", authRouteRequire, authRetrieve)
  .delete("/api/auth", authRouteRequire, authLogout);

// Public

server.all("/api/dataforseo/callback/data", dfsARScrapeCallback);

// Generic

server.post("/api/search", authRouteRequire, apiSearch);

server.all("/api/version", apiVersion);

// Organizations

// Members

// Asins

server.get("/api/asin/:id/reviews", authRouteRequire, asinsReviewsPaginate);

// server.get("/api/asin/:id/reviews", authRouteRequire, asinsReviewsEnumerate);

server.get("/api/asin/:id", authRouteRequire, asinsOverviewLookup);

server.get("/api/asins/enumerate", authRouteRequire, asinsOverviewEnumerate);

server.get("/api/asins/overview", authRouteRequire, asinsOverviewGet);

server.get("/api/asins/insights", authRouteRequire, asinsInsightsGet);

// Admin

server.post("/api/admin/search", authRouteRequire, adminSearch);

server.post("/api/admin/organization/:id/asins/add", authRouteRequire, adminOrganizationAsinsAdd);

server.post("/api/admin/organization/:id/members/add", authRouteRequire, adminOrganizationMembersAdd);

server.get("/api/admin/organization/:id", authRouteRequire, adminOrganizationGet);

server.post("/api/admin/organization", authRouteRequire, adminOrganizationCreate);

server.get("/api/admin/organizations/enumerate", authRouteRequire, adminOrganizationsEnumerate);

server.patch("/api/admin/member/:id/password", authRouteRequire, adminMemberChangePassword);

server.get("/api/admin/members/enumerate", authRouteRequire, adminMembersEnumerate);

server.get("/api/admin/member/:id/", authRouteRequire, adminMemberGet);

server.get("/api/admin/asin/:id/", authRouteRequire, adminAmazonAsinGet);

// OLD:

// server.patch("/api/asin/estimate/task/phone", asinEstimateTaskPatchPhone);

// server.post("/api/asin/estimate/task", asinEstimateTaskPost);

// server.get("/api/asin/estimate/task/:estimateId", asinEstimateTaskGet);

// server.get("/api/asin/estimate/task", asinEstimateTaskGet);

// server.all("/api/ai/gemini/test", aiGeminiTest);

server.all("*", async function (req, res, next) {
  res.status(404).end();
});

export const dbConnect = async function () {
  global.mongoose_client ??= await mongoose.connect(process.env.MONGO_CONNECTION, {
    user: encodeURIComponent(process.env.MONGO_USERNAME),
    pass: encodeURIComponent(process.env.MONGO_PASSWORD)
  });
};

export const dbDisconnect = async function () {
  await global.mongoose_client?.disconnect?.();
  global.mongoose_client = null;
};

export const handler = async function (event, context) {
  await dbConnect();
  return serverless(server)(event, context);
};

if (process.env.LISTEN) {
  dbConnect().then(function () {
    server.listen(3000, function () {
      queueBegin();
      console.log("listen()", this.address());
    });
  });
}

if (process.env.DEV) {
  dbConnect().then(function () {
    server.listen(3000, function () {
      queueBegin();
      console.log("listen()", this.address());
    });
  });
}

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
        //
        await mongoose.connection.db.admin().command({
          listDatabases: 1
        })
      );
      console.log(
        //
        await mongoose.connection.db.listCollections().toArray()
      );
    })
    .catch(console.error)
    .then(process.exit);
}

if (process.env.SETUP) {
  dbConnect().then(async function () {
    let org = await Organizations.create({
      preferredName: "Setup"
    });
    let mem = await Members.create({
      preferredName: "Setup",
      organizations: [org._id],
      administrator: {
        fullAccess: true
      },
      security: {
        passwordHash: await bcrypt.hash("password", process.env.SALT_ROUNDS ?? 10)
      }
    });
    console.log("done.");
    process.exit();
  });
}

if (process.env.WORD_TEST) {
  dbConnect().then(async function () {
    let words = {};
    let docs = await AmazonReviews.find({});
    for await (let doc of docs) {
      for (let word of doc?.rawObject?.review_text
        .split(/\b/g)
        .map((x) => x.toLowerCase())
        .filter((x) => /[a-z]/.test(x))
        .filter((x) => x.length > 1)) {
        words[word] ??= 0;
        words[word] += 1;
      }
    }
    for (let word of Object.keys(words)) {
      console.log(words[word], ":", JSON.stringify(word));
    }
    process.exit();
  });
}
