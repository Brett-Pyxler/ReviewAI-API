import { isValidObjectId } from "mongoose";
import { Organizations, Members, AmazonAsins, AmazonReviews } from "./models.mjs";

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
    const response = await AmazonReviews.find({ asinId });
    // response
    res.json({ enumerate: response });
  } catch (err) {
    res.status(401).json({ message: String(err) });
  }
}

function cleanObject(i) {
  return Object.fromEntries(Object.entries(i).filter((x) => x[1] != undefined));
}

async function asinsReviewsPaginate(req, res, next) {
  try {
    // options
    const asinId = req.params?.id || null;
    const status = String(req.query?.status || req.body?.status || "") || undefined;
    const limit = Math.max(20, Math.min(100, parseInt(+req.query?.perPage || +req.body?.perPage || 20, 10)));
    const page = Math.max(1, parseInt(+req.query?.page || +req.body?.page || 1, 10));
    const skip = (page - 1) * limit;
    // query
    const filter = cleanObject({ asinId, status });
    const count = await AmazonReviews.countDocuments(filter);
    const pages = Math.ceil(count / limit || 0);
    // aggregate
    const response = await AmazonReviews.find(filter).skip(skip).limit(limit);
    // response
    res.json({
      reviews: response,
      paginate: {
        count,
        limit,
        page,
        skip,
        pages
      }
    });
  } catch (err) {
    res.status(401).json({ message: String(err) });
  }
}

async function apiSearch(req, res, next) {
  // note: organizations and members are disabled because the portal cannot render them (yet).
  try {
    const pattern = req.query?.pattern ?? req.body?.pattern ?? null;
    // // find organizations
    // let orgs = await Organizations.find({
    //   preferredName: { $regex: pattern, $options: "i" },
    //   _id: { $in: req.member.organizations }
    // }).exec();
    // // find members
    // let mems = await Members.find({
    //   preferredName: { $regex: pattern, $options: "i" },
    //   organizations: { $in: req.member.organizations }
    // })
    //   .populate("organizations")
    //   .exec();
    // find asins
    let asins = await AmazonAsins.find({
      $or: [{ title: { $regex: pattern, $options: "i" } }, { asinId: { $regex: pattern, $options: "i" } }]
    }).exec();
    // response
    res.json({
      search: []
        // .concat(orgs.map((ptr) => Object.assign(ptr.toJSON(), { model: "Organizations" })))
        // .concat(mems.map((ptr) => Object.assign(ptr.toJSON(), { model: "Members" })))
        .concat(asins.map((ptr) => Object.assign(ptr.toJSON(), { model: "Asins" })))
    });
  } catch (err) {
    res.status(401).json({ message: String(err) });
  }
}

async function apiVersion(req, res, next) {
  try {
    res.json({
      version: ["GITHUB_SERVER_URL", "GITHUB_REPOSITORY", "GITHUB_SHA"].reduce(
        (o, c, i) => Object.assign(o, { [c]: process.env[c] }),
        {}
      )
    });
  } catch (err) {
    res.status(401).json({ message: String(err) });
  }
}

export {
  asinsOverviewLookup,
  asinsOverviewEnumerate,
  asinsOverviewGet,
  asinsInsightsGet,
  asinsReviewsEnumerate,
  asinsReviewsPaginate,
  apiSearch,
  apiVersion
};
