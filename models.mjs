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

const AsinEstimates = model("asin_estimates", AsinEstimatesSchema);

export {
  //
  AccessLogs,
  AsinEstimates
};
