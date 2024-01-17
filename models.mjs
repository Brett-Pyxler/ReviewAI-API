import { model, Schema } from "mongoose";

const AccessLogSchema = new Schema({
  method: { type: String },
  url: { type: String },
  ip: { type: String },
  headers: { type: Object },
  query: { type: Object },
  body: { type: Object },
  timestamp: { type: Date },
  aws: { type: Object },
  num: { type: Number, default: 0 }
});

const AccessLogs = model("access_logs", AccessLogSchema);

const AsinEstimatesSchema = new Schema({
  asinId: {
    type: String,
    index: {
      unique: false
    }
  },
  create: {
    timestamp: { type: Date, default: null },
    request: {
      ip: { type: String },
      query: { type: Object },
      body: { type: Object },
      headers: { type: Object }
    }
  },
  complete: {
    isComplete: { type: Boolean, default: false },
    metadata: { type: Object, default: null },
    timestamp: { type: Date, default: null }
  },
  dataforseo: {
    isComplete: { type: Boolean, default: false },
    taskId: { type: String },
    create: {
      // request: { type: Object, default: null },
      response: { type: Object, default: null },
      timestamp: { type: Date, default: null },
      timespan: { type: Number, default: null }
    },
    retrieve: {
      // request: { type: Object, default: null },
      response: { type: Object, default: null },
      timestamp: { type: Date, default: null },
      timespan: { type: Number, default: null }
    },
    callback: {
      // request: { type: Object, default: null },
      response: { type: Object, default: null },
      timestamp: { type: Date, default: null }
      // timespan: { type: Number, default: null }
    }
  }
});

AsinEstimatesSchema.index(
  {
    //
    asinId: 1,
    "complete.isComplete": 1,
    "complete.timestamp": -1
  },
  {
    //
    unique: false
  }
);

AsinEstimatesSchema.pre("save", async function (next) {
  const doc = this;
  // process responses
  if (
    doc.isModified("dataforseo.retrieve.response") ||
    doc.isModified("dataforseo.callback.response")
  ) {
    let result = {};
    // callback response?
    if (!result?.asin) {
      result = Object.assign(
        {},
        doc.dataforseo.callback.response.tasks?.[0]?.result?.[0]
      );
    }
    // retrieve respose?
    if (!result?.asin) {
      result = Object.assign(
        {},
        doc.dataforseo.retrieve.response.tasks?.[0]?.result?.[0]
      );
    }
    // prune reviews from metadata
    doc.complete.metadata = Object.assign({}, result, {
      items: undefined,
      items_count: undefined
    });
    // determine completion
    let isComplete = !!(
      result?.asin &&
      result?.reviews_count >= 0 &&
      result?.image?.image_url
    );
    doc.dataforseo.isComplete = isComplete;
    doc.complete.isComplete = isComplete;
    doc.complete.timestamp = new Date();
  }
  await next();
});

const AsinEstimates = model("asin_estimates", AsinEstimatesSchema);

export {
  //
  AccessLogs,
  AsinEstimates
};
