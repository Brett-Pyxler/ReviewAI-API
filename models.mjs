import { model, Schema } from "mongoose";
import { flatten as flattenNotation } from "mongo-dot-notation";
import { memberTransform, asinTransform, amazonReviewTransform, resultSort, extractReviewId, filterDuplicates } from "./model.transforms.mjs";
import { dfsARScrapesPost, dfsARScrapesGet } from "./dataforseo.mjs";
import { oaiCreateAndRun, oaiThreadRetrieve } from "./openai.mjs";
import { queueRestart } from "./queue.mjs";
import OpenAI from "openai";

const flatten = (i) => flattenNotation(i).$set;

const cMembers = "members";
const cOrganizations = "organizations";
const cThreads = "threads";
const cMessages = "messages";
const cNotifications = "notifications";
const cAmazonAsins = "amazon_asins";
const cAmazonReviews = "amazon_reviews";
const cAmazonCases = "amazon_cases";
const cDataforseoARScrapes = "dataforseo_amazon_reviews";
const cDataforseoCallbackCaches = "dataforseo_callback_cache";
const cAsinEstimates = "amazon_asin_estimates";

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Members

const MemberSessionsSchema = new Schema(
  {
    token: { type: String },
    userAgent: { type: String },
    ipAddress: { type: String }
    // createdAt: ISODate("2024-01-15T10:33:33.132Z"),
    // updatedAt: ISODate("2024-01-15T10:33:33.132Z")
  },
  { timestamps: true }
);

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
    sessions: [MemberSessionsSchema]
    // createdAt: ISODate("2024-01-15T10:33:33.132Z"),
    // updatedAt: ISODate("2024-01-15T10:33:33.132Z")
  },
  {
    timestamps: true,
    toObject: { transform: memberTransform },
    toJSON: { transform: memberTransform }
  }
);

MembersSchema.pre("save", async function (next) {
  // email addresses
  this.emailAddresses = this.emailAddresses.filter((x) => !!x?.trim).map((x) => x.trim());
  this.emailAddressesLc = this.emailAddresses.map((x) => x.toLowerCase());
  // duplicates
  this.organizations = this.organizations.filter(filterDuplicates);
  // organizations
  // todo: convert to queue
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
  next();
});

const Members = model(cMembers, MembersSchema);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Organizations

const OrganizationsSchema = new Schema(
  {
    preferredName: { type: String },
    members: [{ type: Schema.Types.ObjectId, ref: cMembers }],
    asins: [{ type: Schema.Types.ObjectId, ref: cAmazonAsins }]
    // createdAt: ISODate("2024-01-15T10:33:33.132Z"),
    // updatedAt: ISODate("2024-01-15T10:33:33.132Z")
  },
  { timestamps: true }
);

OrganizationsSchema.pre("save", async function (next) {
  // duplicates
  this.members = this.members.filter(filterDuplicates);
  this.asins = this.asins.filter(filterDuplicates);
  next();
});

const Organizations = model(cOrganizations, OrganizationsSchema);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Threads

const ThreadsSchema = new Schema(
  {
    title: { type: String },
    organization: { type: Schema.Types.ObjectId, ref: cOrganizations },
    member: { type: Schema.Types.ObjectId, ref: cMembers }
    // createdAt: ISODate("2024-01-15T10:33:33.132Z"),
    // updatedAt: ISODate("2024-01-15T10:33:33.132Z")
  },
  { timestamps: true }
);

const Threads = model(cThreads, ThreadsSchema);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Messages

const MessagesSchema = new Schema(
  {
    message: { type: String, required: true },
    member: { type: Schema.Types.ObjectId, ref: cMembers },
    thread: { type: Schema.Types.ObjectId, ref: cThreads }
    // createdAt: ISODate("2024-01-15T10:33:33.132Z"),
    // updatedAt: ISODate("2024-01-15T10:33:33.132Z")
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
    transport: {
      type: String,
      enum: ["email" /* "sms", "app" */],
      default: "email"
    },
    priority: {
      type: String,
      enum: ["normal", "high"],
      default: "normal"
    },
    organization: { type: Schema.Types.ObjectId, ref: cOrganizations },
    member: { type: Schema.Types.ObjectId, ref: cMembers }
    // createdAt: ISODate("2024-01-15T10:33:33.132Z"),
    // updatedAt: ISODate("2024-01-15T10:33:33.132Z")
  },
  { timestamps: true }
);

const Notifications = model(cNotifications, NotificationsSchema);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// AmazonAsins

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
    requests: { type: Object, default: {} },
    requestsOnce: { type: Boolean, default: false },
    requestsPending: [String]
    // createdAt: ISODate("2024-01-15T10:33:33.132Z"),
    // updatedAt: ISODate("2024-01-15T10:33:33.132Z")
  },
  {
    timestamps: true,
    toObject: { transform: asinTransform },
    toJSON: { transform: asinTransform },
    methods: {
      async dfsARScrapesEnsures() {
        console.log("AmazonAsins", String(this._id), "dfsARScrapesEnsures()");
        // -- estimation stage
        // initial information (# total reviews)
        await this.dfsARScrapesEnsure(`initial-default-10`, { reviewDepth: 10, filterByStar: "all_stars" });
        // critical information (# critical reviews)
        await this.dfsARScrapesEnsure(`initial-critical-10`, { reviewDepth: 10, filterByStar: "critical" });
        // -- tracking stage
        if (this.dataforseo.approved) {
          // find normally visible reviews
          await this.dfsARScrapesEnsure(`default-100`, { reviewDepth: 100 });
          // if more than 100:
          let moreReviews = this.requests?.["initial-default-10"]?.result?.reviews_count > 100;
          if (this.dataforseo.approved && moreReviews) {
            // narrow by star filter
            const _sortbys = ["helpful", "recent"];
            const _filterbys = ["critical", "one_star", "two_star", "three_star", "four_star", "five_star"];
            for await (let _sortby of _sortbys) {
              for await (let _filterby of _filterbys) {
                let _key = `bystar-${_filterby}-sortby-${_sortby}-100`;
                await this.dfsARScrapesEnsure(_key, {
                  reviewDepth: 100,
                  filterByStar: _filterby,
                  sortBy: _sortby
                });
                // let moreStars = this.requests?.[_key]?.result?.reviews_count > 100;
              }
            }
          }
        }
      },
      async dfsARScrapesEnsure(key, options) {
        console.log("AmazonAsins", String(this._id), "dfsARScrapesEnsure()", key);
        options.tag = key;
        try {
          let _request = this.requests?.[key];
          let _taskId = _request?.taskId || _request?.task?.id;
          let _asin = _request?.result?.asin;
          let _processed = _request?.processed;
          if (_processed && this.requestsPending.includes(key)) {
            // remove from pending
            console.log("removing from pending!");
            await AmazonAsins.findByIdAndUpdate(this._id, {
              $pull: { requestsPending: key }
            });
          } else if (_processed) {
            // skip
          } else if (_taskId && _asin) {
            // try to process the results
            console.log("Process;");
            await this.notifyRequestUpdated();
            await AmazonAsins.findByIdAndUpdate(this._id, {
              $set: flatten({
                requests: {
                  [key]: {
                    processed: true
                  }
                }
              }),
              // $addToSet: { requestsPending: key }
              $pull: { requestsPending: key }
            });
          } else if (_taskId) {
            // try to get the results if a task is running
            console.log("Get;");
            let r = await dfsARScrapesGet(_taskId);
            await AmazonAsins.findByIdAndUpdate(this._id, {
              $set: flatten({
                requests: {
                  [key]: r
                }
              }),
              $addToSet: { requestsPending: key }
              // $pull: { requestsPending: key }
            });
            console.log("Get()", { key }, r?.task?.id, "=>", r?.result?.asin);
          } else {
            // try to create a task
            console.log("Post;");
            let r = await dfsARScrapesPost(this.asinId, options);
            await AmazonAsins.findByIdAndUpdate(this._id, {
              $set: flatten({
                requests: {
                  [key]: r
                }
              }),
              $addToSet: { requestsPending: key }
              // $pull: { requestsPending: key }
            });
            console.log("Post()", { key }, "=>", r?.taskId);
          }
        } catch (err) {
          // todo: this.queue.errors += 1;
          console.log(err);
        }
      },
      async notifyRequestUpdated() {
        console.log("AmazonAsins", String(this._id), "notifyRequestUpdated()");
        await this.populateFields();
        await this.populateReviews();
        await this.syncReviews();
      },
      async populateFields() {
        console.log("AmazonAsins", String(this._id), "populateFields()");
        const doc = this;
        let updateObject = {};
        // note: .updatedAt replaced .updated
        Object.entries(doc.requests)
          .filter(([k, v]) => v?.updatedAt || v?.updated)
          .sort(resultSort)
          .map(([k, v]) => {
            let isDefault = (!v?.task?.data?.filter_by_star || v?.task?.data?.filter_by_star == "all_stars") && !v?.task?.data?.filter_by_keyword;
            let isCritical = v?.task?.data?.filter_by_star == "critical" && !v?.task?.data?.filter_by_keyword;
            console.log("- kv", k, { isDefault, isCritical });
            // any
            if (v?.result?.title) {
              updateObject.title = v.result.title;
            }
            if (v?.result?.image?.image_url) {
              updateObject.imageUrl = v?.result?.image?.image_url;
            }
            if (v?.result?.image?.alt) {
              updateObject.imageAlt = v?.result?.image?.alt;
            }
            // default
            if (isDefault && !isCritical && v?.result?.rating?.value && v?.result?.rating?.votes_count && v?.result?.rating?.rating_max) {
              updateObject.rating ??= {};
              updateObject.rating.value = v?.result?.rating?.value;
              updateObject.rating.votes_count = v?.result?.rating?.votes_count;
              updateObject.rating.rating_max = v?.result?.rating?.rating_max;
            }
            if (isDefault && !isCritical && v?.result?.reviews_count) {
              updateObject.reviews ??= {};
              updateObject.reviews.total = +v?.result?.reviews_count;
            }
            // critical
            if (isCritical && v?.result?.reviews_count) {
              updateObject.reviews ??= {};
              updateObject.reviews.critical = +v?.result?.reviews_count;
            }
          });
        await AmazonAsins.findByIdAndUpdate(doc._id, {
          $set: flatten(updateObject)
        });
      },
      async populateReviews() {
        console.log("AmazonAsins", String(this._id), "populateReviews()");
        const doc = this;
        try {
          await Promise.all(
            Object.entries(doc.requests)
              // completed requests
              .filter(([k, v]) => (v?.updatedAt || v?.updated) && v?.result?.asin && Array.isArray(v?.result?.items))
              // oldest to newest
              .sort(resultSort)
              // upsert operation
              .map(([k, v]) =>
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
                )
              )
          );
        } catch (err) {
          console.log("populateReviews.catch", err);
        }
      },
      async syncReviews() {
        console.log("AmazonAsins", String(this._id), "syncReviews()");
        let updateObject = {};
        let agg = await AmazonReviews.aggregate([{ $match: { asinId: this.asinId } }, { $group: { _id: "$status", count: { $sum: 1 } } }]);
        updateObject.reviews ??= {};
        updateObject.reviews.count ??= {};
        updateObject.reviews.counted = 0;
        for (let key of Object.keys(this.reviews.count)) {
          updateObject.reviews.count[key] = 0;
        }
        for (let doc of agg) {
          // i.e., { _id: 'inactive', count: 209 }
          updateObject.reviews.counted += doc.count ?? 0;
          updateObject.reviews.count[doc._id] = doc.count ?? 0;
        }
        await AmazonAsins.findByIdAndUpdate(this._id, {
          $set: flatten(updateObject)
        });
      }
    }
  }
);

// AmazonAsinsSchema.pre("save", async function (next) {
//   next();
// });

AmazonAsinsSchema.post("save", async function (doc) {
  console.log("AmazonAsins.save()", String(doc._id));
});

AmazonAsinsSchema.index(
  // see queue.mjs
  { requestsOnce: 1 },
  { unique: false }
);

AmazonAsinsSchema.index(
  // see queue.mjs
  { requestsPending: 1 },
  { unique: false }
);

const AmazonAsins = model(cAmazonAsins, AmazonAsinsSchema);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// AmazonCases

const AmazonCasesSchema = new Schema({
  complaintId: { type: String },
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
  }
});

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// AmazonReviews

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
    cases: [AmazonCasesSchema],
    requestsOnce: { type: Boolean, default: false },
    requestsPending: [String]
    // createdAt: ISODate("2024-01-15T10:33:33.132Z"),
    // updatedAt: ISODate("2024-01-15T10:33:33.132Z")
  },
  {
    timestamps: true,
    toObject: { transform: amazonReviewTransform },
    toJSON: { transform: amazonReviewTransform },
    methods: {
      async openaiCheck() {
        const assistantId = "asst_tHyw4fctPkNN22LPJxZw9WrZ";
        console.log("AmazonReviews.openaiCheck()", String(this._id));
        try {
          if (this.openai?.latest?.retryCount >= 5) {
            console.log("retryCount");
            await AmazonReviews.findByIdAndUpdate(this._id, {
              $set: { requestsPending: [] }
            });
          } else if (!this.rawObject?.review_text) {
            console.log("!review_text");
            await AmazonReviews.findByIdAndUpdate(this._id, {
              $set: { requestsPending: [] }
            });
          } else if (this.openai?.latest?.textContent) {
            console.log("textContent");
            await AmazonReviews.findByIdAndUpdate(this._id, {
              $set: { requestsPending: [] }
            });
          } else if (this.openai?.latest?.threadId) {
            console.log("oaiThreadRetrieve()");
            let r = await oaiThreadRetrieve(this.openai?.latest?.threadId, 1);
            if (!r?.textContent) throw new Error("!textContent");
            let threatValue = /^true/i.test(r?.textContent) ? 0.0 : 1.0;
            await AmazonReviews.findByIdAndUpdate(this._id, {
              $set: {
                "openai.latest.threadMessages": r?.threadMessages,
                "openai.latest.responseObject": r?.responseObject,
                "openai.latest.textContent": r?.textContent,
                // *** assistantId dependant result
                "openai.threatValue": threatValue,
                threatValue: threatValue,
                // todo:
                requestsPending: [r?.threadId]
              },
              $push: { "openai.history": r }
              // $pull: { requestsPending: this.openai?.latest?.threadId }
            });
          } else {
            console.log("oaiCreateAndRun()");
            let r = await oaiCreateAndRun(this.rawObject?.review_text, assistantId, {
              gId: this.gId,
              asinId: this.asinId
            });
            if (!r?.threadId) throw new Error("!threadId");
            await AmazonReviews.findByIdAndUpdate(this._id, {
              $set: {
                "openai.latest.assistantId": r?.assistantId,
                "openai.latest.threadId": r?.threadId,
                "openai.latest.threadObject": r?.threadObject,
                // todo:
                requestsPending: [r?.threadId]
              },
              $push: { "openai.history": r }
              // $addToSet: { requestsPending: r?.threadId }
            });
          }
        } catch (err) {
          console.error(err);
          await AmazonReviews.findByIdAndUpdate(this._id, {
            $inc: { "openai.latest.retryCount": 1 }
          });
        }
      }
    }
  }
);

// AmazonReviewsSchema.pre("save", async function (next) {
//   // AmazonCases
//   // const statusOrder = ["inactive", "active", "pending", "refused", "removed"];
//   // this.status = this.cases.sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status))?.status || this.status;
//   next();
// });

AmazonReviewsSchema.post("save", async function (doc) {
  // AmazonAsins
  const asin = await AmazonAsins.findOne({ asinId: doc.asinId });
  await asin?.syncReviews?.();
});

AmazonReviewsSchema.index(
  // see queue.mjs
  { requestsOnce: 1 },
  { unique: false }
);

AmazonReviewsSchema.index(
  // see queue.mjs
  { requestsPending: 1 },
  { unique: false }
);

const AmazonReviews = model(cAmazonReviews, AmazonReviewsSchema);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DataforseoCallbackCaches

const DataforseoCallbackCachesSchema = new Schema(
  {
    ip: { type: String },
    headers: { type: Object },
    query: { type: Object },
    body: { type: Object }
    // createdAt: ISODate("2024-01-15T10:33:33.132Z"),
    // updatedAt: ISODate("2024-01-15T10:33:33.132Z")
  },
  {
    timestamps: true,
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
            // determine the request key
            let key = Object.entries(asin?.requests)
              .filter(([k, v]) => v?.taskId == taskId && !v?.result?.asin)
              .map(([k, v]) => k)?.[0];
            if (!key) continue;
            await AmazonAsins.findByIdAndUpdate(asin._id, {
              $set: flatten({
                requests: {
                  [key]: {
                    task,
                    response: doc.body,
                    result,
                    updatedAt: result.datetime
                  }
                }
              }),
              $addToSet: { requestsPending: key }
            });
            queueRestart();
          }
        }
      }
    }
  }
);

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
