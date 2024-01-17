import { AmazonAsins, AmazonReviews } from "./models.mjs";

const timers = {
  AmazonAsins: { model: AmazonAsins },
  AmazonReviews: { model: AmazonReviews }
};

async function queueBegin() {
  for (let name in timers) {
    timers[name].timerId = setTimeout(queueTick, 0, name);
  }
}

async function queueTick(name) {
  let docs;
  try {
    docs = await timers[name].model
      .find({ "queue.order": { $ne: 0 } })
      .sort({ "queue.order": 1 })
      .limit(5);
    for await (let doc of docs) {
      try {
        doc.onTick();
      } catch (err) {
        console.log("onTick.catch", name, String(doc?._id));
      }
    }
  } catch (err) {
    console.error("queueTick.catch", name, err);
  } finally {
    timers[name].timerId = setTimeout(queueTick, docs?.length ? 5000 : 60000, name);
  }
}

async function queueSoon(name) {
  clearTimeout(timers[name].timerId);
  timers[name].timerId = setTimeout(queueTick, 0, name);
}

export { queueBegin, queueSoon };
