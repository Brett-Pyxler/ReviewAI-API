import { model, Schema } from "mongoose";
import { dataforseoAmazonReviewsEnsure } from "./dataforseo.mjs";

const cMembers = "members";
const cOrganizations = "organizations";
const cThreads = "threads";
const cMessages = "messages";
const cNotifications = "notifications";
const cAmazonAsins = "amazon_asins";
const cAmazonReviews = "amazon_reviews";
const cDataforseoAmazonReviews = "dataforseo_amazon_reviews";
const cDataforseoCallbackCaches = "dataforseo_callback_cache";
const cAsinEstimates = "amazon_asin_estimates";

// Amazon Asin Design
//
// AmazonAsins are created through the frontpage estimate, admin add, and portal add methods.
// New entries invoke the dataforseoAmazonReviewsEnsure() function to scrape critical metadata.
//
// Dataforseo's callback updates the AmazonAsin, and creates AmazonReviews. Intensive {depth,sort}
// scans can be invoked at any time.

const filterDuplicates = (v, i, o) => o.findIndex((x) => String(x) == String(v)) == i;

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Members

function memberTransform(doc, ret, options) {
  delete ret.security;
  ret.sessions?.map?.((ptr) => {
    delete ptr.token;
  });
  return ret;
}

const MemberSessionsSchema = new Schema({
  token: { type: String },
  userAgent: { type: String },
  ipAddress: { type: String },
  timestamps: {
    firstSeen: { type: Date, required: true },
    lastSeen: { type: Date, required: true },
    lastUpdate: { type: Date, required: true }
  }
});

const MembersSchema = new Schema(
  {
    preferredName: { type: String },
    // ^ i.e., nickName, displayName
    organizations: [{ type: Schema.Types.ObjectId, ref: cOrganizations }],
    // ^ possiblity of multiple organizations
    emailAddresses: [{ type: String }],
    emailAddressesLc: [{ type: String }],
    phoneNumbers: [{ type: String }],
    administrator: {
      fullAccess: { type: Boolean, default: false }
    },
    security: {
      passwordHash: { type: String }
    },
    sessions: [MemberSessionsSchema]
    // settings: { notifications, .. },
    // avatars: { image_100: { type: Object } }
  },
  {
    toObject: { transform: memberTransform },
    toJSON: { transform: memberTransform }
  }
);

MembersSchema.pre("save", async function (next) {
  const doc = this;
  // email addresses
  if (doc.isModified("emailAddresses emailAddressesLc")) {
    doc.emailAddresses = doc.emailAddresses.filter((x) => !!x?.toLowerCase);
    doc.emailAddressesLc = doc.emailAddresses.map((x) => x.toLowerCase());
  }
  // duplicates
  if (doc.isModified("organizations")) {
    doc.organizations = doc.organizations.filter(filterDuplicates);
  }
  // organizations
  if (doc.isModified("organizations")) {
    // append to organizations
    await Organizations.updateMany(
      //
      { _id: { $in: doc.organizations } },
      { $addToSet: { members: doc._id } }
    );
    // remove from organizations
    await Organizations.updateMany(
      //
      { _id: { $nin: doc.organizations }, members: doc._id },
      { $pull: { members: doc._id } }
    );
  }
  next();
});

const Members = model(cMembers, MembersSchema);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Organizations

const OrganizationsSchema = new Schema({
  preferredName: { type: String },
  // ^ i.e., nickName, displayName
  members: [{ type: Schema.Types.ObjectId, ref: cMembers }],
  asins: [{ type: Schema.Types.ObjectId, ref: cAmazonAsins }]
});

OrganizationsSchema.pre("save", async function (next) {
  const doc = this;
  // duplicates
  if (doc.isModified("members")) {
    doc.members = doc.members.filter(filterDuplicates);
  }
  if (doc.isModified("asins")) {
    doc.asins = doc.asins.filter(filterDuplicates);
  }
  next();
});

const Organizations = model(cOrganizations, OrganizationsSchema);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Threads

const ThreadsSchema = new Schema({
  title: { type: String },
  timestamps: {
    created: { type: Date, required: true }
  },
  organization: { type: Schema.Types.ObjectId, ref: cOrganizations }
  // member: { type: Schema.Types.ObjectId, ref: cMembers }
  // thread: { type: Schema.Types.ObjectId, ref: 'threads' },
});

const Threads = model(cThreads, ThreadsSchema);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Messages

const MessagesSchema = new Schema({
  message: { type: String },
  priority: {
    type: String,
    enum: ["normal", "high"],
    default: "normal"
  },
  timestamps: {
    created: { type: Date, required: true }
  },
  organization: { type: Schema.Types.ObjectId, ref: cOrganizations },
  member: { type: Schema.Types.ObjectId, ref: cMembers },
  thread: { type: Schema.Types.ObjectId, ref: cThreads }
});

const Messages = model(cMessages, MessagesSchema);

const NotificationsSchema = new Schema({
  title: { type: String },
  message: { type: String },
  priority: {
    type: String,
    enum: ["normal", "high"],
    default: "normal"
  },
  timestamps: {
    created: { type: Date, required: true }
  },
  organization: { type: Schema.Types.ObjectId, ref: cOrganizations },
  member: { type: Schema.Types.ObjectId, ref: cMembers }
  // TODO: asinId
});

const Notifications = model(cNotifications, NotificationsSchema);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// AmazonAsins

const AmazonAsinsSchema = new Schema({
  asinId: {
    type: String,
    required: true,
    index: {
      unique: false
    }
  },
  title: { type: String },
  imageUrl: { type: String },
  timestamps: {
    firstSeen: { type: Date },
    lastUpdate: { type: Date }
  },
  reviews: {
    total: { type: Number, default: 0 },
    critical: { type: Number, default: null },
    count: {
      inactive: { type: Number, default: 0 },
      active: { type: Number, default: 0 },
      pending: { type: Number, default: 0 },
      refused: { type: Number, default: 0 },
      removed: { type: Number, default: 0 }
    }
  }
});

AmazonAsinsSchema.pre("save", async function (next) {
  const doc = this;
  // timestamps
  if (doc.isModified()) {
    doc.timestamps.lastUpdate = new Date();
  }
  next();
});

AmazonAsinsSchema.post("init", async function (doc) {
  if (doc?.reviews?.critical == null) {
    await dataforseoAmazonReviewsEnsure(doc?.asinId, {
      depth: 10,
      filterByStar: "critical"
    });
  }
});

const AmazonAsins = model(cAmazonAsins, AmazonAsinsSchema);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// AmazonReviews

const AmazonReviewsSchema = new Schema({
  gId: {
    type: String,
    required: true,
    index: {
      unique: true
    }
  },
  asinId: {
    type: String,
    required: true,
    index: {
      unique: false
    }
  },
  status: {
    type: String,
    enum: [
      "inactive", // not started
      "active", // before complaintId
      "pending", // after complaintId
      "refused", // complaint failure
      "removed" // complaint success
    ],
    default: "inactive"
  },
  rawObject: { type: Object },
  timestamps: {
    firstSeen: { type: Date, required: true },
    lastUpdate: { type: Date }
  },
  complaintId: {
    type: String,
    default: null
  },
  // todo: is there a use-case for asin ref?
  asin: { type: Schema.Types.ObjectId, ref: AmazonAsins }
});

AmazonReviewsSchema.pre("save", async function (next) {
  const doc = this;
  // timestamps
  if (doc.isModified()) {
    doc.timestamps.lastUpdate = new Date();
  }
  next();
});

async function syncAsinReviews(asinId) {
  let doc = await AmazonAsins.findOne({ asinId });
  let agg = await AmazonReviews.aggregate([
    {
      $match: {
        asinId
      }
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 }
      }
    }
  ]);

  doc.reviews.total = 0;

  for (let key of Object.keys(doc.reviews.count)) {
    doc.reviews.count[key] = 0;
  }

  for (let a of agg) {
    doc.reviews.total += a.count;
    doc.reviews.count[a._id] = a.count;
  }

  await doc.save();
}

AmazonReviewsSchema.post("save", async function (doc) {
  await syncAsinReviews(doc.asinId);
});

const AmazonReviews = model(cAmazonReviews, AmazonReviewsSchema);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DataforseoAmazonReviews

const DataforseoAmazonReviewsSchema = new Schema({
  request: {
    // http
    apiUrl: { type: String },
    fetchUrl: { type: String },
    body: { type: Object },
    params: { type: Object },
    response: { type: Object },
    // data
    options: { type: Object },
    optionsKey: { type: String, required: true, index: { unique: false } },
    // task
    asinId: { type: String, required: true },
    taskId: { type: String, required: true }
  },
  result: {
    response: { type: Object },
    complete: { type: Boolean, default: false },
    cache: { type: Schema.Types.ObjectId, ref: cDataforseoCallbackCaches }
  },
  // timestamps
  timestamps: {
    created: { type: Date, required: true },
    completed: { type: Date }
  }
});

const extractReviewId = (i) => /\/([A-Z0-9]{10,})/.exec(i)?.[1];

DataforseoAmazonReviewsSchema.pre("save", async function (next) {
  const doc = this;
  if (doc.isModified() && doc?.result?.complete) {
    // AmazonAsins
    const asinId = doc?.result?.response?.asin;
    if (doc?.result?.response?.title) {
      await AmazonAsins.updateOne({ asinId }, { $set: { title: doc?.result?.response?.title } });
    }
    if (doc?.result?.response?.image?.image_url) {
      await AmazonAsins.updateOne({ asinId }, { $set: { imageUrl: doc?.result?.response?.image?.image_url } });
    }
    if (doc?.result?.response?.reviews_count >= 0 && doc?.request?.options?.filterByStar == "critical") {
      await AmazonAsins.updateOne({ asinId }, { $set: { "reviews.critical": doc?.result?.response?.reviews_count } });
    }
    // AmazonReviews
    if (Array.isArray(doc?.result?.response?.items)) {
      for await (let item of doc.result.response.items) {
        let gId = extractReviewId(item?.url);
        let review = await AmazonReviews.findOne({ asinId, gId });
        // todo: update with newer information?
        if (!review) {
          try {
            review = await AmazonReviews.create({
              asinId,
              gId,
              rawObject: review,
              timestamps: {
                firstSeen: new Date()
              },
              asin: asin?._id
            });
          } catch (err) {
            console.error(err);
          }
        }
      }
    }
  }
  next();
});

// DataforseoAmazonReviewsSchema.post("save", async function (doc) {});

const DataforseoAmazonReviews = model(cDataforseoAmazonReviews, DataforseoAmazonReviewsSchema);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DataforseoCallbackCaches

const DataforseoCallbackCachesSchema = new Schema({
  ip: { type: String },
  headers: { type: Object },
  query: { type: Object },
  body: { type: Object },
  timestamp: { type: Date }
});

DataforseoCallbackCachesSchema.post("save", async function (doc) {
  if (Array.isArray(doc?.body?.tasks)) {
    for await (let task of doc.body.tasks) {
      if (Array.isArray(task?.result)) {
        for await (let result of task.result) {
          // must have an asin
          // must have a numeric reviews count
          // must have an image
          const complete = !!(result?.asin && result?.reviews_count >= 0 && result?.image?.image_url);
          if (!complete) continue;
          // ama
          const doc = await DataforseoAmazonReviews.findOne({
            "request.asinId": result?.asin,
            "request.taskId": task?.id
          });
          if (!doc || doc?.result?.completed) continue;
          doc.result.response = result;
          doc.result.complete = complete;
          doc.cache = doc?._id;
          doc.timestamps.completed = new Date(result?.datetime);
          await doc.save();
        }
      }
    }
  }
});

const DataforseoCallbackCaches = model(cDataforseoCallbackCaches, DataforseoCallbackCachesSchema);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// AsinEstimates

// const AsinEstimatesSchema = new Schema({
//   asinId: {
//     type: String,
//     index: {
//       unique: false
//     }
//   },
//   create: {
//     timestamp: { type: Date, default: null },
//     request: {
//       ip: { type: String },
//       query: { type: Object },
//       body: { type: Object },
//       headers: { type: Object },
//       cookies: { type: Object }
//     }
//   },
//   complete: {
//     isComplete: { type: Boolean, default: false },
//     metadata: { type: Object, default: null },
//     timestamp: { type: Date, default: null }
//   },
//   dataforseo: {
//     isComplete: { type: Boolean, default: false },
//     taskId: { type: String },
//     create: {
//       // request: { type: Object, default: null },
//       response: { type: Object, default: null },
//       timestamp: { type: Date, default: null },
//       timespan: { type: Number, default: null }
//     },
//     retrieve: {
//       // request: { type: Object, default: null },
//       response: { type: Object, default: null },
//       timestamp: { type: Date, default: null },
//       timespan: { type: Number, default: null }
//     },
//     callback: {
//       // request: { type: Object, default: null },
//       response: { type: Object, default: null },
//       timestamp: { type: Date, default: null }
//       // timespan: { type: Number, default: null }
//     }
//   },
//   alerts: {
//     isComplete: { type: Boolean, default: false },
//     phone: { type: String }
//   }
// });

// AsinEstimatesSchema.index(
//   {
//     //
//     asinId: 1,
//     "complete.isComplete": 1,
//     "complete.timestamp": -1
//   },
//   {
//     //
//     unique: false
//   }
// );

// AsinEstimatesSchema.index(
//   {
//     //
//     asinId: 1,
//     "complete.isComplete": 1,
//     "complete.timestamp": -1,
//     "dataforseo.create.response.tasks.data.filter_by_star": 1
//   },
//   {
//     //
//     unique: false
//   }
// );

// AsinEstimatesSchema.pre("save", async function (next) {
//   const doc = this;
//   // process responses
//   if (doc.isModified("dataforseo.retrieve.response dataforseo.callback.response")) {
//     let result = {};
//     // callback response?
//     if (!result?.asin) {
//       result = Object.assign({}, doc?.dataforseo?.callback?.response?.tasks?.[0]?.result?.[0]);
//     }
//     // retrieve respose?
//     if (!result?.asin) {
//       result = Object.assign({}, doc?.dataforseo?.retrieve?.response?.tasks?.[0]?.result?.[0]);
//     }
//     // prune reviews from metadata
//     doc.complete.metadata = Object.assign({}, result, {
//       items: undefined,
//       items_count: undefined
//     });
//     // determine completion
//     let isComplete = !!(result?.asin && result?.reviews_count >= 0 && result?.image?.image_url);
//     doc.dataforseo.isComplete = isComplete;
//     doc.complete.isComplete = isComplete;
//     doc.complete.timestamp = new Date();
//   }
//   // process alerts
//   if (!doc.alerts.isComplete && doc.complete.isComplete && doc.alerts.phone) {
//     // TODO: send twilio alert to ${doc.alerts.phone}
//     // doc.alerts.isComplete = true;
//   }
//   next();
// });

// const AsinEstimates = model(cAsinEstimates, AsinEstimatesSchema);

const AsinEstimates = null;

export {
  Members,
  Organizations,
  Threads,
  Messages,
  Notifications,
  AmazonAsins,
  AmazonReviews,
  DataforseoAmazonReviews,
  DataforseoCallbackCaches,
  AsinEstimates
};
