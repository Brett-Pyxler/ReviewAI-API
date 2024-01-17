import { model, Schema } from "mongoose";
import { dfsARScrapesEnsure } from "./dataforseo.mjs";
import { oaiCreateAndRun, oaiThreadRetrieve } from "./openai.mjs";

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

// Amazon Asin Design
//
// AmazonAsins are created through the frontpage estimate, admin add, and portal add methods.
// New entries invoke the dfsARScrapesEnsure() function to scrape critical metadata.
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
    doc.emailAddresses = doc.emailAddresses.filter((x) => !!x?.trim).map((x) => x.trim());
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

const AmazonAsinsSchema = new Schema(
  {
    asinId: {
      type: String,
      required: true,
      index: {
        unique: false
      }
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
    // dataforseo: {
    //   approved: { type: Boolean, default: false }
    // },
    // openai: {
    //   approved: { type: Boolean, default: false }
    // },
    // google: {
    //   approved: { type: Boolean, default: false }
    // }
    timestamps: {
      firstSeen: { type: Date },
      lastUpdate: { type: Date }
    }
  },
  {
    methods: {
      async notifyDataforseoARScrapes(reviewRequest) {
        await this.populateFields();
      },
      async populateFields() {
        let needSaved = false;

        // basic
        const _basic = await DataforseoARScrapes.findOne({
          "request.asinId": this.asinId,
          "result.complete": true,
          "result.task.data.filter_by_star": { $ne: "critical" }
        }).sort({
          "timestamps.completed": -1
        });
        const basic = _basic?.result?.response;

        // critical
        const _critical = await DataforseoARScrapes.findOne({
          "request.asinId": this.asinId,
          "result.complete": true,
          "result.task.data.filter_by_star": "critical"
        }).sort({
          "timestamps.completed": -1
        });
        const critical = _critical?.result?.response;
        const reviewRequest = basic || critical;

        // generic [either]
        if (reviewRequest?.title && reviewRequest?.title != this.title) {
          this.title = reviewRequest?.title;
          needSaved = true;
        }

        if (reviewRequest?.image?.image_url && reviewRequest?.image?.image_url != this.imageUrl) {
          this.imageUrl = reviewRequest?.image?.image_url;
          needSaved = true;
        }

        if (reviewRequest?.image?.alt && reviewRequest?.image?.alt != this.imageAlt) {
          this.imageAlt = reviewRequest?.image?.alt;
          needSaved = true;
        }

        // ratings [basic]
        if (
          (basic?.rating?.value && basic?.rating?.value != this.rating.value) ||
          (basic?.rating?.votes_count && basic?.rating?.votes_count != this.rating.votes_count) ||
          (basic?.rating?.rating_max && basic?.rating?.rating_max != this.rating.rating_max)
        ) {
          this.rating.value = basic?.rating?.value;
          this.rating.votes_count = basic?.rating?.votes_count;
          this.rating.rating_max = basic?.rating?.rating_max;
          needSaved = true;
        }

        // reviews [basic]
        if (
          //
          basic?.reviews_count &&
          basic?.reviews_count >= 0 &&
          basic?.reviews_count != this.reviews.total
        ) {
          this.reviews.total = +basic?.reviews_count;
          needSaved = true;
        }

        // reviews [critical]
        if (
          //
          critical?.reviews_count &&
          critical?.reviews_count >= 0 &&
          critical?.reviews_count != this.reviews.critical
        ) {
          this.reviews.critical = +critical?.reviews_count;
          needSaved = true;
        }

        //
        if (needSaved) {
          await this.save();
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
      },
      async devScan() {
        let r;
        // find normally visible reviews
        // i.e., what visitors would see
        await dfsARScrapesEnsure(this.asinId, {
          reviewDepth: 100
        });
        // find recent reviews
        // i.e., progressive updates
        await dfsARScrapesEnsure(this.asinId, {
          reviewDepth: 100,
          sortBy: "recent"
        });
        // find critical reviews
        // i.e., unfavorable reviews
        await dfsARScrapesEnsure(this.asinId, {
          reviewDepth: 100,
          filterByStar: "critical"
        });
      },
      async recoverAmazonReviews() {
        let docs = await DataforseoARScrapes.find({
          "request.asinId": this?.asinId,
          "reviews.populated": { $ne: true }
        });
        for await (let doc of docs) {
          await doc.populateReviews();
        }
      }
    }
  }
);

AmazonAsinsSchema.pre("save", async function (next) {
  const doc = this;
  // timestamps
  if (doc.isModified()) {
    doc.timestamps.lastUpdate = new Date();
  }
  next();
});

AmazonAsinsSchema.post("init", async function (doc) {
  if (doc?.rating?.value == null) {
    // basic
    await dfsARScrapesEnsure(doc?.asinId, {
      reviewDepth: 10
    });
  }
  if (doc?.reviews?.critical == null) {
    // critical
    await dfsARScrapesEnsure(doc?.asinId, {
      reviewDepth: 10,
      filterByStar: "critical"
    });
  }
  // recovery
  await doc.recoverAmazonReviews();
});

const AmazonAsins = model(cAmazonAsins, AmazonAsinsSchema);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// AmazonReviews

function amazonReviewTransform(doc, ret, options) {
  ret.openai = Object.assign({
    latest: {
      textContent: ret?.openai?.latest?.textContent
    }
  });
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
      history: [{ type: Object }]
    },
    // todo: is there a use-case for asin ref?
    asin: { type: Schema.Types.ObjectId, ref: AmazonAsins }
  },
  {
    toObject: { transform: amazonReviewTransform },
    toJSON: { transform: amazonReviewTransform },
    methods: {
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
  const doc = this;
  // timestamps
  if (doc.isModified()) {
    doc.timestamps.lastUpdate = new Date();
  }
  next();
});

AmazonReviewsSchema.post("save", async function (doc) {
  // AmazonAsins
  const asin = await AmazonAsins.findOne({ asinId: this.asinId });
  await asin?.syncReviews?.();
});

const AmazonReviews = model(cAmazonReviews, AmazonReviewsSchema);

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// DataforseoARScrapes

const extractReviewId = (i) => /\/([A-Z0-9]{10,})/.exec(i)?.[1];

const DataforseoARScrapesSchema = new Schema(
  {
    request: {
      // http
      // apiUrl: { type: String },
      // fetchUrl: { type: String },
      // body: { type: Object },
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
      task: { type: Object },
      response: { type: Object },
      complete: { type: Boolean, default: false },
      cache: { type: Schema.Types.ObjectId, ref: cDataforseoCallbackCaches }
    },
    reviews: {
      populated: { type: Boolean, default: false }
      // ^ used to recover unpopulated AmazonReviews
    },
    // timestamps
    timestamps: {
      created: { type: Date, required: true },
      completed: { type: Date }
    }
  },
  {
    methods: {
      async notifyCallbackCache(cache) {
        await this.populateResponse();
        await this.populateReviews();
      },
      async populateResponse() {
        if (!this.result.complete) {
          // query
          const cache = await DataforseoCallbackCaches.findOne({
            "body.tasks.id": this.request.taskId,
            "body.tasks.result.asin": this.request.asinId
          }).sort({ "body.tasks.result.datetime": -1 });
          const task = cache?.body?.tasks?.[0];
          const response = task?.result?.[0];
          // update
          this.result.task = task;
          this.result.response = response;
          this.result.complete = true; // result.asin exists
          this.result.cache = cache?._id;
          this.timestamps.completed = response?.datetime;
          this.markModified("result");
          await this.save();
        }
      },
      async populateReviews() {
        if (this.result.complete && !this.reviews.populated) {
          // AmazonReviews
          if (Array.isArray(this?.result?.response?.items)) {
            const firstSeen = this.timestamps.completed;
            const asinId = this.request.asinId;
            // note: gId index causes duplicate errors
            await AmazonReviews.create(
              this.result.response.items.map((item) =>
                Object.assign({
                  asinId,
                  gId: extractReviewId(item?.url),
                  rawObject: item,
                  timestamps: { firstSeen }
                })
              ),
              { aggregateErrors: true }
            );
          }
          this.reviews.populated = true;
          await this.save();
        }
      }
    }
  }
);

DataforseoARScrapesSchema.post("save", async function (doc) {
  // AmazonAsins
  if (this.isModified()) {
    const asin = await AmazonAsins.findOne({ asinId: doc.request.asinId });
    await asin?.notifyDataforseoARScrapes?.(doc);
  }
});

const DataforseoARScrapes = model(cDataforseoARScrapes, DataforseoARScrapesSchema);

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
          // DataforseoARScrapes
          if (result?.asin && task?.id) {
            const review = await DataforseoARScrapes.findOne({
              "request.asinId": result?.asin,
              "request.taskId": task?.id
            });
            await review?.notifyCallbackCache?.(doc);
          }
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
  DataforseoARScrapes,
  DataforseoCallbackCaches,
  AsinEstimates
};
