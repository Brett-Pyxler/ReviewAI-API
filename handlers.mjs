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

    let r = await AsinEstimates.create({
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

    if (!r?.asinId) {
      throw new Error("invalid database response");
    }

    return res.json({ asinId: r.asinId, estimateId: r._id });
  } catch (err) {
    res.status(500).json({ message: String(err) });
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

    let r = await AsinEstimates.findById({ _id: estimateId });

    if (!r?.complete?.timestamp) {
      // estimate is incomplete

      if (!r?.dataforseo?.taskId) {
        // dataforseo task is missing
        let s = await amazonReviewsTaskCreate(r.asinId, {
          // shallow depth for statistics
          reviewDepth: 10,
          // enable callback with estimateId
          searchOptions: `estimateId=${estimateId}`
        });
        // update estimate attributes
        r.dataforseo.taskId = s?.tasks?.[0]?.id;
        r.dataforseo.create.response = s;
        r.dataforseo.create.timestamp = new Date();
        await r.save();
      } else if (!r?.dataforseo?.isComplete) {
        // dataforseo task is pending
        let s = await amazonReviewsTaskRetrieve(r.dataforseo.taskId);
        r.dataforseo.retrieve.response = s;
        r.dataforseo.retrieve.timestamp = new Date();
        await r.save();
        // TODO: isComplete?
      }
    }

    return res.json({
      estimateId: r._id,
      asinId: r.asinId,
      complete: r.complete
    });
  } catch (err) {
    res.status(500).json({ message: String(err) });
  }
}

export {
  //
  asinTaskPost,
  asinTaskGet
};
