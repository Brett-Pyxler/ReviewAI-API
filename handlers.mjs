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
    res.json({ status: 500, message: String(err) });
  }
}

async function asinTaskGet(req, res, next) {
  let debug = [];
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

    debug.push(`estimateId: ${estimateId}`);

    if (!estimateId) {
      throw new Error("invalid estimateId");
    }

    let r = await AsinEstimates.findById({ _id: estimateId });

    debug.push(`complete.timestamp: ${r?.complete?.timestamp}`);
    if (!r?.complete?.timestamp) {
      // estimate is incomplete

      debug.push(`taskId: ${r?.dataforseo?.taskId}`);
      debug.push(`isComplete: ${r?.dataforseo?.isComplete}`);
      if (!r?.dataforseo?.taskId) {
        // dataforseo task is missing
        debug.push("!taskId");
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
        debug.push("!isComplete");
        let s = await amazonReviewsTaskRetrieve(r.dataforseo.taskId);
        debug.push(s);
        r.dataforseo.retrieve.response = s;
        r.dataforseo.retrieve.timestamp = new Date();
        await r.save();
        // ascertain completion
        const result = Object.assign(
          {},
          r.dataforseo.retrieve.response.tasks?.[0]?.result?.[0]
        );
        debug.push(result);
        r.complete.metadata = Object.assign({}, result, {
          items: undefined,
          items_count: undefined
        });
        debug.push(r.complete.metadata);
        r.complete.timestamp = new Date();
        r.dataforseo.isComplete = !!(
          result?.reviews_count >= 0 &&
          result?.title &&
          result?.image?.image_url
        );
        await r.save();
      }
    }

    return res.json({
      estimateId: r._id,
      asinId: r.asinId,
      complete: r.complete,
      debug: debug
    });
  } catch (err) {
    res.json({ status: 500, message: String(err), debug: debug });
  }
}

export {
  //
  asinTaskPost,
  asinTaskGet
};
