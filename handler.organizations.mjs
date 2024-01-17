import { isValidObjectId } from "mongoose";
import { AmazonAsins, AmazonReviews } from "./models.mjs";

async function asinsOverviewLookup(req, res, next) {
  try {
    // find
    let doc;
    if (isValidObjectId(req.params.id)) {
      doc = await AmazonAsins.findById(req.params.id);
    } else {
      doc = await AmazonAsins.findOne({ asinId: req.params.id });
    }
    // response
    res.json({
      lookup: doc
    });
  } catch (err) {
    res.status(401).json({ message: String(err) });
  }
}

async function asinsOverviewEnumerate(req, res, next) {
  try {
    // populate
    await req.member.populate("organizations");
    // aggregate
    const asins = req.member.organizations.reduce((o, c, i) => o.concat(c.asins), []);
    const response = await AmazonAsins.find({
      _id: { $in: asins }
    })
      .sort({ title: -1 })
      .exec();
    // response
    res.json({
      enumerate: response
    });
  } catch (err) {
    res.status(401).json({ message: String(err) });
  }
}

async function asinsOverviewGet(req, res, next) {
  try {
    // populate
    await req.member.populate("organizations");
    await req.member.populate("organizations.asins");
    // summarize
    let objects = req.member.organizations.reduce((o, c, i) => o.concat(c.asins), []);
    let dupes = {};
    let response = {
      asins: {
        total: 0
      },
      reviews: {
        total: 0,
        count: {}
      }
    };
    for (let object of objects) {
      if (dupes[object.asinId]) continue;
      dupes[object.asinId] = true;
      //
      response.asins.total += 1;
      response.reviews.total += object.reviews?.total ?? 0;
      //
      for (let key of Object.keys(object.reviews.count)) {
        response.reviews.count[key] ??= 0;
        response.reviews.count[key] += object.reviews?.count?.[key] ?? 0;
      }
    }
    // response
    res.json({
      overview: response
    });
  } catch (err) {
    res.status(401).json({ message: String(err) });
  }
}

async function asinsInsightsGet(req, res, next) {
  try {
    // populate
    await req.member.populate("organizations");
    await req.member.populate("organizations.asins");
    // summarize
    let objects = req.member.organizations.reduce((o, c, i) => o.concat(c.asins), []);
    // response
    res.json({
      insights: objects
    });
  } catch (err) {
    res.status(401).json({ message: String(err) });
  }
}

async function asinsReviewsEnumerate(req, res, next) {
  try {
    const asinId = req.params?.id || null;
    // aggregate
    let response = await AmazonReviews.find({
      asinId
    });
    // response
    res.json({ enumerate: response });
  } catch (err) {
    res.status(401).json({ message: String(err) });
  }
}

export { asinsOverviewLookup, asinsOverviewEnumerate, asinsOverviewGet, asinsInsightsGet, asinsReviewsEnumerate };
