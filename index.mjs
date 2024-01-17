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

// server.all("/api/signup", apiSignup);

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
    let wordMap = {};
    let docs = await AmazonReviews.find({ asinId: "B07VWKKBPY" });
    let total = docs.length;
    let invalid = 0;
    for await (let doc of docs) {
      let text = String(doc?.rawObject?.review_text || "");
      if (!text) invalid += 1;
      for (let word of text
        .split(/\b/g)
        .map((x) => x.toLowerCase())
        .filter((x) => /[a-z]/.test(x))
        .filter((x) => x.length >= 5)) {
        wordMap[word] ??= 0;
        wordMap[word] += 1;
      }
    }
    let _entries = Object.entries(wordMap).sort(([k1, v1], [k2, v2]) => (v1 < v2 ? -1 : v1 > v2 ? 1 : 0));
    _entries.map(([k, v]) => console.log(k, "=>", JSON.stringify(v)));
    console.log({ total, invalid });
    console.log(
      "top10:",
      Array.from(_entries)
        .reverse()
        .filter((kv, i) => i < 10)
        .map(([k, v]) => k)
    );
    process.exit();
  });
}

if (process.env.DFS_TEST) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  dbConnect().then(async function () {
    while (1) {
      let doc = await AmazonAsins.findOne({ asinId: "B07VWKKBPY" });
      // doc.dataforseo.approved = true;
      // await doc.save();
      let r = await doc.onTick();
      console.log({ r });
      if (!r) break;
      await sleep(10 * 1000);
    }
    for (let [k, v] of Object.entries(doc.requests)) {
      console.log(k, "rating:", JSON.stringify(v?.result?.rating), "reviews:", v?.result?.reviews_count);
    }
    process.exit();
  });
}

import nodemailer from "nodemailer";

if (process.env.MAIL_TEST) {
  let transporter = nodemailer.createTransport({
    service: "Outlook365",
    auth: {
      user: "noreply@pyxler.com",
      pass: process.env.EMAIL_PASSWORD
    }
  });
  transporter.sendMail(
    {
      from: "noreply <noreply@pyxler.com>",
      to: "kristopher@rawchemistry.com",
      subject: `testest ${Date.now()}`,
      text: "plaintext",
      html: "<b>html</b>"
    },
    function (error, success) {
      console.log({ error, success });
    }
  );
}
