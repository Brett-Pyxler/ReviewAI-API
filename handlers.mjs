import {
  //
  AsinEstimates
} from "./models.mjs";

import {
  //
  amazonReviewsTaskCreate,
  amazonReviewsTaskRetrieve
} from "./dataforseo.mjs";

const asinPattern = /^[0-9A-Z]{10}$/;
const phonePattern = /^\d{3}\-\d{3}\-\d{4}$/;
const objectPatern = /^[a-z0-9]{24}$/;

function extractPattern(pattern) {
  return String(
    Array.from(arguments)
      .slice(1)
      .find((x) => pattern.test(x)) || ""
  );
}

async function asinTaskPost(req, res, next) {
  try {
    let asinId = extractPattern(
      asinPattern,
      req.body?.asin_id,
      req.body?.asinId,
      req.query?.asin_id,
      req.query?.asinId
    );

    if (!asinId) {
      throw new Error("invalid asinId");
    }

    let doc = await AsinEstimates.create({
      asinId: asinId,
      create: {
        timestamp: new Date(),
        request: {
          ip: req.ip,
          query: req.query,
          body: req.body,
          headers: req.headers
        }
      }
    });

    if (!doc?.asinId) {
      throw new Error("invalid database response");
    }

    return res.json({
      //
      asinId: doc.asinId,
      estimateId: doc._id
    });
  } catch (err) {
    res.status(500).json({ message: String(err) });
    console.debug(err);
  }
}

async function asinTaskGet(req, res, next) {
  try {
    let estimateId = extractPattern(
      objectPatern,
      req.body?.estimate_id,
      req.body?.estimateId,
      req.query?.estimate_id,
      req.query?.estimateId,
      req.params?.estimate_id,
      req.params?.estimateId
    );

    if (!estimateId) {
      throw new Error("invalid estimateId");
    }

    let doc = await AsinEstimates.findById({ _id: estimateId });

    if (!doc?.complete?.isComplete || doc?.complete?.metadata === null) {
      // estimate is incomplete
      let cache = await asinTaskCache(doc.asinId);
      if (cache) {
        // metadata cache is available
        doc.complete = Object.assign({}, cache.complete);
        doc.dataforseo = Object.assign({}, cache.dataforseo);
        doc.set("dataforseo.retrieve.response", "changed");
        await doc.save();
      } else if (!doc?.dataforseo?.taskId) {
        // dataforseo task is missing
        let ts = Date.now();
        let s = await amazonReviewsTaskCreate(doc.asinId, {
          // shallow depth for statistics
          reviewDepth: 10,
          // enable callback with estimateId
          searchOptions: `estimateId=${estimateId}`
        });
        let te = Date.now();
        // update estimate attributes
        doc.dataforseo.taskId = s?.tasks?.[0]?.id;
        doc.dataforseo.create.response = s;
        doc.dataforseo.create.timestamp = new Date();
        doc.dataforseo.create.timespan = te - ts;
        await doc.save();
      } else if (!doc?.dataforseo?.isComplete) {
        // dataforseo task is pending
        let ts = Date.now();
        let s = await amazonReviewsTaskRetrieve(doc.dataforseo.taskId);
        let te = Date.now();
        doc.dataforseo.retrieve.response = s;
        doc.dataforseo.retrieve.timestamp = new Date();
        doc.dataforseo.retrieve.timespan = te - ts;
        await doc.save();
      }
    }

    return res.json({
      //
      estimateId: doc._id,
      asinId: doc.asinId,
      complete: doc.complete
    });
  } catch (err) {
    res.status(500).json({ message: String(err) });
    console.debug(err);
  }
}

async function asinTaskPatchPhone(req, res, next) {
  try {
    let asinId = extractPattern(
      asinPattern,
      req.body?.asin_id,
      req.body?.asinId,
      req.query?.asin_id,
      req.query?.asinId
    );

    if (!asinId) {
      throw new Error("invalid asinId");
    }

    let estimateId = extractPattern(
      objectPatern,
      req.body?.estimate_id,
      req.body?.estimateId,
      req.query?.estimate_id,
      req.query?.estimateId
    );

    if (!estimateId) {
      throw new Error("invalid estimateId");
    }

    let phone = req.body?.phone;

    if (!phonePattern.test(phone)) {
      throw new Error("invalid phone");
    }

    let doc = await AsinEstimates.findById({ _id: estimateId });

    if (doc?.asinId != asinId) {
      throw new Error("inputs do not match");
    }

    doc.alerts.phone = phone;
    await doc.save();

    return res.json({});
  } catch (err) {
    res.status(500).json({ message: String(err) });
    console.debug(err);
  }
}

async function asinTaskCache(asinId) {
  // cache within 7 days
  let d = new Date();
  d.setDate(d.getDate() - 7);
  return await AsinEstimates.findOne(
    {
      // filter
      asinId,
      "complete.isComplete": true,
      "complete.timestamp": { $gte: d }
    },
    null,
    {
      // options
      sort: {
        "complete.timestamp": -1
      }
    }
  );
}

export {
  //
  asinTaskPost,
  asinTaskGet,
  asinTaskPatchPhone,
  asinTaskCache
};
