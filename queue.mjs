import { Members, Organizations, AmazonAsins, AmazonReviews } from "./models.mjs";

let timerId;

async function queueTick() {
  console.log("queueTick()");
  if (timerId) timerId = clearInterval(timerId);
  let docs;
  let docCount = 0;
  try {
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // AmazonAsins
    docs = await AmazonAsins.find({
      $or: [
        // initial requests
        { requestsOnce: false },
        // pending requests
        { requestsPending: { $exists: true, $ne: [] } }
      ]
    }).limit(5);
    docCount += docs?.length ?? 0;
    console.log("queueTick.AmazonAsins:", docs?.length ?? 0);
    for await (let doc of docs) {
      console.log("queueTick.AmazonAsins:", String(doc?._id));
      await doc.dfsARScrapesEnsures();
      if (!doc.requestsOnce) {
        await AmazonAsins.findByIdAndUpdate(doc._id, {
          $set: { requestsOnce: true }
        });
      }
    }
    ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // AmazonReviews
    docs = await AmazonReviews.find({
      $or: [
        // initial requests
        { requestsOnce: false },
        // pending requests
        { requestsPending: { $exists: true, $ne: [] } }
      ]
    }).limit(5);
    docCount += docs?.length ?? 0;
    console.log("queueTick.AmazonReviews:", docs?.length ?? 0);
    for await (let doc of docs) {
      console.log("queueTick.AmazonReviews:", String(doc?._id));
      await doc.openaiCheck();
      if (!doc.requestsOnce) {
        await AmazonReviews.findByIdAndUpdate(doc._id, {
          $set: { requestsOnce: true }
        });
      }
    }
  } catch (err) {
    console.error("queueTick.catch", err);
  } finally {
    if (timerId) {
      console.log("queueTick.warn: timerId set elsewhere");
      return;
    }
    let wait = docCount ? 5000 : 60000;
    console.log("queueTick.wait", wait);
    timerId = setTimeout(queueTick, wait);
  }
}

function queueRestart() {
  console.log("queueRestart()");
  if (timerId) timerId = clearInterval(timerId);
  timerId = setTimeout(queueTick, 0);
}

async function queueBegin() {
  // await AmazonAsins.updateMany({}, { $set: { requestsOnce: false } });
  // await AmazonReviews.updateMany({}, { $set: { requestsOnce: false } });
  console.log("queueBegin()");
  timerId = setTimeout(queueTick, 0);
}

export { queueRestart, queueBegin };
