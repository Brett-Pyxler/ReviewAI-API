import { AsinEstimates } from "./models.mjs";

const asinPattern = /^[0-9A-Z]{10}$/;

const objectPatern = /^[a-z0-9]{24}$/;

function extractPattern(pattern) {
  return String(
    Array.from(arguments)
      .slice(1)
      .find((x) => pattern.test(x)) || ""
  );
}

async function AsinTaskPost(req, res, next) {
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

async function AsinTaskGet(req, res, next) {
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

    console.log(r.save);

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
  AsinTaskPost,
  AsinTaskGet
};
