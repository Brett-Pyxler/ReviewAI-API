import { model, Schema } from "mongoose";

const AccessSchema = new Schema({
  method: { type: String },
  url: { type: String },
  ip: { type: String },
  headers: { type: Object },
  query: { type: Object },
  body: { type: Object },
  timestamp: { type: Date },
  aws: { type: Object },
});

const Access = model("access_logs", AccessSchema);

export { Access };
