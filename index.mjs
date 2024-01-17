import dotenv from "dotenv";

dotenv.config();

import mongoose from "mongoose";

import helmet from "helmet";

import serverless from "serverless-http";

import express from "express";

import cookieParser from "cookie-parser";

import { asinsOverviewLookup, asinsOverviewEnumerate, asinsOverviewGet } from "./handler.organizations.mjs";

import { dataforseoAmazonReviewsTaskCallback, dataforseoAmazonReviewsEnsure } from "./dataforseo.mjs";

import {
  adminSearch,
  adminCreateOrganization,
  adminOrganizationGet,
  adminOrganizationsEnumerate,
  adminMembersEnumerate,
  adminOrganizationAsinsAdd,
  adminOrganizationMembersAdd
} from "./handler.admin.mjs";

import { authLogin, authLogout, authRetrieve, authRouteDecode, authRouteRequire } from "./authentication.mjs";

import { AmazonAsins, DataforseoAmazonReviews, DataforseoCallbackCaches } from "./models.mjs";

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

// Asins

server.get("/api/asins/lookup/:id", authRouteRequire, asinsOverviewLookup);

server.get("/api/asins/enumerate", authRouteRequire, asinsOverviewEnumerate);

server.get("/api/asins/overview", authRouteRequire, asinsOverviewGet);

// server.get("/api/asins/insight", authRouteRequire, asinsInsightGet);

server.post("/api/admin/search", authRouteRequire, adminSearch);

server.post("/api/admin/organization/:id/asins/add", authRouteRequire, adminOrganizationAsinsAdd);

server.post("/api/admin/organization/:id/members/add", authRouteRequire, adminOrganizationMembersAdd);

server.get("/api/admin/organization/:id", authRouteRequire, adminOrganizationGet);

server.post("/api/admin/organization", authRouteRequire, adminCreateOrganization);

server.get("/api/admin/organizations/enumerate", authRouteRequire, adminOrganizationsEnumerate);

server.get("/api/admin/members/enumerate", authRouteRequire, adminMembersEnumerate);

server.all("/api/dataforseo/callback/data", dataforseoAmazonReviewsTaskCallback);

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

if (process.env.DEV) {
  dbConnect().then(function () {
    server.listen(3000, function () {
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

if (process.env.TESTEST) {
  dbConnect().then(async function () {
    // let doc = await DataforseoAmazonReviews.findById("6594d3dd91ba48f97505d34e");
    let doc = await AmazonAsins.findById("65941bd5b7af2a90f4ffc7d2");
    // let doc = await DataforseoCallbackCaches.findById("6594fd82d78088ce7e32e592");
    // let doc = await DataforseoCallbackCaches.findById("6594fd82d78088ce7e32e592");
    console.log("found", !!doc);
    console.log(doc);
    // if (doc?.reviews?.critical == null) {
    //   let arq = await dataforseoAmazonReviewsEnsure(doc?.asinId, {
    //     depth: 10,
    //     filterByStar: "critical"
    //   });
    //   console.log("arq", arq);
    //   if (arq?.result?.complete) {
    //     await arq.save();
    //   }
    // }
    // if (doc) console.log(await doc.save());
    // process.exit();
  });
}
