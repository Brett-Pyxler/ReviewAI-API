import {
  //
  AsinEstimates
} from "./models.mjs";

import {
  //
  dfsARScrapeCreate,
  dfsARScrapeRetrieve
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

async function asinEstimateTaskPost(req, res, next) {
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
          headers: req.headers,
          cookies: req.cookies
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

async function asinEstimateTaskGet(req, res, next) {
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
      let cache = await asinEstimateTaskCache(doc.asinId);
      if (cache) {
        // metadata cache is available
        doc.complete = Object.assign({}, cache.complete);
        doc.dataforseo = Object.assign({}, cache.dataforseo);
        doc.set("dataforseo.retrieve.response", "changed");
        await doc.save();
      } else if (!doc?.dataforseo?.taskId) {
        // dataforseo task is missing
        let ts = Date.now();
        let s = await dfsARScrapeCreate(doc.asinId, {
          // shallow depth for statistics
          reviewDepth: 10,
          // enable callback with estimateId
          searchOptions: `estimateId=${estimateId}`,
          // ensure ${reviews_count} refers to critical
          filterByStar: "critical"
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
        let s = await dfsARScrapeRetrieve(doc.dataforseo.taskId);
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

async function asinEstimateTaskPatchPhone(req, res, next) {
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

    return res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: String(err) });
    console.debug(err);
  }
}

async function asinEstimateTaskCache(asinId) {
  // cache within 7 days
  let d = new Date();
  d.setDate(d.getDate() - 7);
  return await AsinEstimates.findOne(
    {
      // filter
      asinId,
      "complete.isComplete": true,
      "complete.timestamp": { $gte: d },
      // require critical
      "dataforseo.create.response.tasks.data.filter_by_star": "critical"
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
  asinEstimateTaskPost,
  asinEstimateTaskGet,
  asinEstimateTaskPatchPhone,
  asinEstimateTaskCache
};

/*
db.asin_estimates.updateMany(
  {"dataforseo.create.response.tasks.data.filter_by_star":{$ne: "critical"}},
  {$set: {
    "dataforseo.isComplete": false,
    "dataforseo.taskId": "",
    "dataforseo.create.response": null,
    "dataforseo.retrieve.response": null,
    "dataforseo.callback.response": null,
    "complete.isComplete": false,
  }});
=> {acknowledged: true, insertedId: null, matchedCount: 98, modifiedCount: 98, upsertedCount: 0}
*/
