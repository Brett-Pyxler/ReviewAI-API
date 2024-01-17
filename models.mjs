import { model, Schema } from "mongoose";
import { dfsARScrapesPost, dfsARScrapesGet } from "./dataforseo.mjs";
import { oaiCreateAndRun, oaiThreadRetrieve } from "./openai.mjs";
import OpenAI from "openai";

const cMembers = "members";
const cOrganizations = "organizations";
const cThreads = "threads";
const cMessages = "messages";
const cNotifications = "notifications";
const cAmazonAsins = "amazon_asins";
const cAmazonReviews = "amazon_reviews";
const cDataforseoARScrapes = "dataforseo_amazon_reviews";
const cDataforseoCallbackCaches = "dataforseo_callback_cache";
const cAsinEstimates = "amazon_asin_estimates";

const extractReviewId = (i) => /\/([A-Z0-9]{10,})/.exec(i)?.[1];

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
    organizations: [{ type: Schema.Types.ObjectId, ref: cOrganizations }],
    emailAddresses: [{ type: String }],
    emailAddressesLc: [{ type: String }],
    phoneNumbers: [{ type: String }],
    administrator: {
      fullAccess: { type: Boolean, default: false }
    },
    security: {
      passwordHash: { type: String }
    },
    sessions: [MemberSessionsSchema],
    // settings: { notifications, .. },
    // avatars: { image_100: { type: Object } }
    timestamps: {
      firstSeen: { type: Date },
      lastUpdate: { type: Date }
    }
  },
  {
    timestamps: true,
    toObject: { transform: memberTransform },
    toJSON: { transform: memberTransform }
  }
);

MembersSchema.pre("save", async function (next) {
  // email addresses
  if (this.isModified("emailAddresses emailAddressesLc")) {
    this.emailAddresses = this.emailAddresses.filter((x) => !!x?.trim).map((x) => x.trim());
    this.emailAddressesLc = this.emailAddresses.map((x) => x.toLowerCase());
  }
  // duplicates
  if (this.isModified("organizations")) {
    this.organizations = this.organizations.filter(filterDuplicates);
  }
  // organizations
  if (this.isModified("organizations")) {
    // append to organizations
    await Organizations.updateMany(
      //
      { _id: { $in: this.organizations } },
      { $addToSet: { members: this._id } }
    );
    // remove from organizations
    await Organizations.updateMany(
      //
      { _id: { $nin: this.organizations }, members: this._id },
      { $pull: { members: this._id } }
    );
  }
  // timestamps
  if (this.isModified()) this.timestamps.lastUpdate = new Date();
  next();
});

const Members = model(cMembers, MembersSchema);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Organizations

const OrganizationsSchema = new Schema({
  preferredName: { type: String },
  timestamps: {
    firstSeen: { type: Date, required: true },
    lastUpdate: { type: Date }
  },
  members: [{ type: Schema.Types.ObjectId, ref: cMembers }],
  asins: [{ type: Schema.Types.ObjectId, ref: cAmazonAsins }]
});

OrganizationsSchema.pre("save", async function (next) {
  // duplicates
  if (this.isModified("members")) {
    this.members = this.members.filter(filterDuplicates);
  }
  if (this.isModified("asins")) {
    this.asins = this.asins.filter(filterDuplicates);
  }
  next();
});

OrganizationsSchema.pre("save", async function (next) {
  // timestamps
  this.timestamps.lastUpdate = new Date();
  next();
});

const Organizations = model(cOrganizations, OrganizationsSchema);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Threads

const ThreadsSchema = new Schema(
  {
    title: { type: String },
    timestamps: {
      created: { type: Date, required: true }
    },
    organization: { type: Schema.Types.ObjectId, ref: cOrganizations },
    member: { type: Schema.Types.ObjectId, ref: cMembers }
  },
  { timestamps: true }
);

const Threads = model(cThreads, ThreadsSchema);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Messages

const MessagesSchema = new Schema(
  {
    message: { type: String, required: true },
    timestamps: {
      created: { type: Date, required: true }
    },
    member: { type: Schema.Types.ObjectId, ref: cMembers },
    thread: { type: Schema.Types.ObjectId, ref: cThreads }
  },
  { timestamps: true }
);

const Messages = model(cMessages, MessagesSchema);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Notifications

const NotificationsSchema = new Schema(
  {
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
  },
  { timestamps: true }
);

const Notifications = model(cNotifications, NotificationsSchema);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// AmazonAsins

function asinTransform(doc, ret, options) {
  delete ret.requests;
  return ret;
}

function resultSort([k1, v1], [k2, v2]) {
  // oldest to newest
  if (v1.updated < v2.updated) return 1;
  else if (v1.updated > v2.updated) return -1;
  return 0;
}

const AmazonAsinsSchema = new Schema(
  {
    asinId: {
      type: String,
      required: true,
      index: { unique: false }
    },
    title: { type: String },
    imageUrl: { type: String },
    imageAlt: { type: String },
    rating: {
      value: { type: String, default: null },
      votes_count: { type: String },
      rating_max: { type: String }
    },
    reviews: {
      total: { type: Number, default: 0 },
      // ^ total reviews as displayed by amazon
      critical: { type: Number, default: null },
      // ^ total reviews as displayed by amazon with critical filter
      counted: { type: Number, default: 0 },
      // ^ sum total of counted statuses
      count: {
        inactive: { type: Number, default: 0 },
        active: { type: Number, default: 0 },
        pending: { type: Number, default: 0 },
        refused: { type: Number, default: 0 },
        removed: { type: Number, default: 0 }
      }
    },
    dataforseo: {
      approved: { type: Boolean, default: false }
    },
    // openai: {
    //   approved: { type: Boolean, default: false }
    // },
    // google: {
    //   approved: { type: Boolean, default: false }
    // }
    timestamps: {
      firstSeen: { type: Date },
      lastUpdate: { type: Date }
    },
    queue: {
      idle: { type: Boolean, default: false },
      order: { type: Number, default: 1 }
    },
    requests: { type: Object, default: {} }
  },
  {
    timestamps: true,
    toObject: { transform: asinTransform },
    toJSON: { transform: asinTransform },
    methods: {
      async onTick() {
        console.log("AmazonAsinsSchema.onTick()", String(this?._id));
        let actions = 0;
        // initial information
        actions += await this.dfsARScrapesEnsure("initial-default-10", { reviewDepth: 10 });
        actions += await this.dfsARScrapesEnsure("initial-crtical-10", { reviewDepth: 10, filterByStar: "critical" });
        // if review count > 100:
        let moreReviews = this.requests?.["initial-default-10"]?.result?.reviews_count > 100;
        console.log({ moreReviews });
        if (moreReviews && this.asinId == "B07VWKKBPY") {
          // get reviews by stars
          for await (let star of ["one_star", "two_star", "three_star", "four_star", "five_star"]) {
            let starKey = `bystar-${star}-100`;
            actions += await this.dfsARScrapesEnsure(starKey, {
              reviewDepth: 100,
              filterByStar: star
            });
            let moreStars = this.requests?.[starKey]?.result?.reviews_count > 100;
            console.log({ moreStars });
            if (moreStars) {
              // additional by stars
              for await (let word of [
                "scent",
                "smell",
                "cologne",
                "smells",
                "product",
                "great",
                "really",
                "would",
                "again",
                "women"
              ]) {
                let wordKey = `bystar-${star}-${word}-100`;
                actions += await this.dfsARScrapesEnsure(wordKey, {
                  reviewDepth: 100,
                  filterByStar: star,
                  filterByKeyword: word
                });
              }
            }
          }
        }
        //
        if (this.dataforseo.approved) {
          // find normally visible reviews
          // i.e., what visitors would see
          actions += await this.dfsARScrapesEnsure("default-100", { reviewDepth: 100 });
          // find recent reviews
          // i.e., progressive updates
          actions += await this.dfsARScrapesEnsure("default-recent-100", { reviewDepth: 100, sortBy: "recent" });
          // find critical reviews
          // i.e., unfavorable reviews
          actions += await this.dfsARScrapesEnsure("critical-100", { reviewDepth: 100, filterByStar: "critical" });
        }
        //
        console.log("AmazonAsinsSchema.actions", actions);
        if (!actions) {
          this.queue.order = 0;
          await this.save();
        }
        return actions;
      },
      async dfsARScrapesEnsure(key, options) {
        console.log("AmazonAsinsSchema.requestEnsure()", String(this?._id), key);
        options.tag = key;
        if (this.requests?.[key]?.taskId && !this.requests?.[key]?.result?.asin) {
          try {
            Object.assign(this.requests[key], await dfsARScrapesGet(this.requests?.[key]?.taskId));
            this.markModified("requests");
            await this.save();
            await this.notifyRequestUpdated();
          } catch (err) {
            // todo: errors += 1;
            console.log(String(err));
          }
        } else if (!this.requests?.[key]?.taskId) {
          try {
            this.requests[key] = await dfsARScrapesPost(this.asinId, options);
            this.markModified("requests");
            await this.save();
          } catch (err) {
            console.log(String(err));
          }
        } else {
          return 0;
        }
        return 1;
      },
      async notifyRequestUpdated() {
        await this.populateFields();
        await this.populateReviews();
        await this.syncReviews();
      },
      async populateFields() {
        const doc = this;
        console.log("populateFields()", String(doc?._id));
        Object.entries(doc.requests)
          .filter(([k, v]) => v?.updated)
          .sort(resultSort)
          .map(([k, v]) => {
            console.log("kv", k);
            let isCritical = v?.task?.data?.filter_by_star == "critical";
            //
            if (v?.result?.title) {
              doc.title = v.result.title;
            }
            if (v?.result?.image?.image_url) {
              doc.imageUrl = v?.result?.image?.image_url;
            }
            if (v?.result?.image?.alt) {
              doc.imageAlt = v?.result?.image?.alt;
            }
            if (
              !isCritical &&
              (v?.result?.rating?.value || v?.result?.rating?.votes_count || v?.result?.rating?.rating_max)
            ) {
              doc.rating.value = v?.result?.rating?.value;
              doc.rating.votes_count = v?.result?.rating?.votes_count;
              doc.rating.rating_max = v?.result?.rating?.rating_max;
            }
            if (!isCritical && v?.result?.reviews_count) {
              doc.reviews.total = +v?.result?.reviews_count;
            }
            if (isCritical && v?.result?.reviews_count) {
              doc.reviews.critical = +v?.result?.reviews_count;
            }
          });
        await doc.save();
      },
      async populateReviews() {
        const doc = this;
        console.log("populateReviews()", String(doc?._id));
        try {
          await Promise.all(
            Object.entries(doc.requests)
              .filter(([k, v]) => v?.updated && Array.isArray(v?.result?.items))
              .sort(resultSort)
              .map(([k, v]) => {
                AmazonReviews.create(
                  v.result?.items?.map?.((item) =>
                    Object.assign({
                      gId: extractReviewId(item.url),
                      asinId: doc.asinId,
                      rawObject: item,
                      timestamps: { firstSeen: item.publication_date }
                    })
                  ),
                  { aggregateErrors: true }
                );
              })
          );
        } catch (err) {
          console.log("populateReviews.catch", err);
        }
      },
      async syncReviews() {
        let agg = await AmazonReviews.aggregate([
          { $match: { asinId: this.asinId } },
          { $group: { _id: "$status", count: { $sum: 1 } } }
        ]);
        this.reviews.counted = 0;
        for (let key of Object.keys(this.reviews.count)) {
          this.reviews.count[key] = 0;
        }
        for (let a of agg) {
          this.reviews.counted += a.count;
          this.reviews.count[a._id] = a.count;
        }
        await this.save();
      }
    }
  }
);

AmazonAsinsSchema.pre("save", async function (next) {
  // queue
  this.queue.idle = !!this.queue.order;
  // timestamps
  this.timestamps.lastUpdate = new Date();
  next();
});

const AmazonAsins = model(cAmazonAsins, AmazonAsinsSchema);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// AmazonReviews

function amazonReviewTransform(doc, ret, options) {
  ret.openai = {
    latest: {
      textContent: ret?.openai?.latest?.textContent,
      threatValue: ret?.openai?.latest?.threatValue
    }
  };
  return ret;
}

const AmazonReviewsSchema = new Schema(
  {
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
    openai: {
      latest: {
        // query
        assistantId: { type: Object },
        threadId: { type: Object },
        threadObject: { type: Object },
        // response
        threadMessages: { type: Object },
        responseObject: { type: Object },
        textContent: { type: String },
        //
        retryCount: { type: Number, default: 0 }
      },
      history: [{ type: Object }],
      threatValue: { type: Number, default: 0 }
      // ^ numeric value 0.0 (low) to 1.0 (high)
    },
    threatValue: { type: Number, default: 0 },
    // ^ sum of openai.threatValue and google.threatValue
    // todo: is there a use-case for asin ref?
    asin: { type: Schema.Types.ObjectId, ref: AmazonAsins },
    queue: {
      idle: { type: Boolean, default: false },
      order: { type: Number, default: 1 }
    }
  },
  {
    timestamps: true,
    toObject: { transform: amazonReviewTransform },
    toJSON: { transform: amazonReviewTransform },
    methods: {
      async onTick() {
        console.log("AmazonReviewsSchema.onTick()", String(this?._id));
        this.queue.order = 0;
        await this.save();
      },
      async openaiCheck() {
        const assistantId = "asst_tHyw4fctPkNN22LPJxZw9WrZ";
        if (this.openai?.latest?.retryCount >= 5) {
          return;
        }
        if (!this.openai?.latest?.threadId) {
          let r = await oaiCreateAndRun(this.rawObject?.review_text, assistantId, {
            gId: this.gId,
            asinId: this.asinId
          });
          if (r?.threadId) {
            this.openai.latest.assistantId = r?.assistantId;
            this.openai.latest.threadId = r?.threadId;
            this.openai.latest.threadObject = r?.threadObject;
            this.openai.history.push(r);
          } else {
            this.openai.latest.retryCount += 1;
          }
          await this.save();
          return true;
        }
        if (!this.openai?.latest?.textContent && this.openai?.latest?.threadId) {
          let r = await oaiThreadRetrieve(this.openai?.latest?.threadId, 1);
          if (r?.textContent) {
            this.openai.latest.threadMessages = r?.threadMessages;
            this.openai.latest.responseObject = r?.responseObject;
            this.openai.latest.textContent = r?.textContent;
            this.openai.history.push(r);
            // *** assistantId dependant result
            this.openai.threatValue = /^true/i.test(this.openai.latest.textContent) ? 0.0 : 1.0;
            this.threatValue = this.openai.threatValue /* this.google.threatValue */;
          } else {
            this.openai.latest.retryCount += 1;
          }
          await this.save();
          return true;
        }
      }
    }
  }
);

AmazonReviewsSchema.pre("save", async function (next) {
  // queue
  this.queue.idle = !!this.queue.order;
  // timestamps
  this.timestamps.lastUpdate = new Date();
  next();
});

AmazonReviewsSchema.post("save", async function (doc) {
  // AmazonAsins
  const asin = await AmazonAsins.findOne({ asinId: doc.asinId });
  await asin?.syncReviews?.();
});

const AmazonReviews = model(cAmazonReviews, AmazonReviewsSchema);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DataforseoCallbackCaches

const DataforseoCallbackCachesSchema = new Schema(
  {
    ip: { type: String },
    headers: { type: Object },
    query: { type: Object },
    body: { type: Object },
    timestamp: { type: Date }
  },
  {
    methods: {
      async notify() {
        const doc = this;
        if (!Array.isArray(doc?.body?.tasks)) return;
        for await (let task of doc.body.tasks) {
          const taskId = task?.id;
          if (!Array.isArray(task?.result)) continue;
          for await (let result of task.result) {
            const asinId = result?.asin;
            if (!asinId) continue;
            const asin = await AmazonAsins.findOne({ asinId });
            if (!asin?.requests) continue;
            let r = Object.entries(asin?.requests)
              .filter(([k, v]) => v?.taskId == taskId && !v?.result?.asin)
              .map(([k, v]) => {
                Object.assign(asin.requests[k], {
                  task,
                  response: doc.body,
                  result,
                  updated: result.datetime
                });
              });
            if (r.length) {
              console.log("DataforseoCallbackCachesSchema.notify()");
              await asin.save();
              await asin.notifyRequestUpdated();
            }
          }
        }
      }
    }
  }
);

DataforseoCallbackCachesSchema.post("save", async function (doc) {
  await doc.notify();
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
  // DataforseoARScrapes,
  DataforseoCallbackCaches,
  AsinEstimates
};
