import { DataforseoCallbackCaches } from "./models.mjs";

let authHeader = null;

function mkAuthHeader() {
  const authUser = process.env.DATAFORSEO_USER;
  const authPass = process.env.DATAFORSEO_PASS;
  const authToken = Buffer.from(`${authUser}:${authPass}`).toString("base64");
  return (authHeader = `Basic ${authToken}`);
}

async function dfsARScrapeCallback(req, res, next) {
  try {
    let doc = await DataforseoCallbackCaches.create({
      body: Object.assign({}, req.body),
      timestamp: new Date(),
      ip: req.ip,
      headers: Object.assign({}, req.headers),
      query: Object.assign({}, req.query)
    });
    await doc.notify();
    return res.json({});
  } catch (err) {
    return res.json({ message: String(err) });
  }
}

async function dfsARScrapesPost(asinId, options = {}) {
  const callbackHost = process.env.DATAFORSEO_CBHN;
  const callbackUrl = `https://${callbackHost}/api/dataforseo/callback/data?asinId=${asinId}`;

  const urlObj = new URL("https://api.dataforseo.com/v3/merchant/amazon/reviews/task_post");
  urlObj.searchParams.set("postback_data", "advanced");
  urlObj.searchParams.set("postback_url", encodeURIComponent(callbackUrl));

  const request = await (
    await fetch(urlObj.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: (authHeader ??= mkAuthHeader())
      },
      body: JSON.stringify([
        {
          // docs: https://docs.dataforseo.com/v3/merchant/amazon/reviews/task_post/?bash
          // note: ${reviews_count} adjusts for filterByStar
          asin: asinId,
          language_code: options?.languageCode ?? "en_US",
          location_code: options?.locationCode ?? 2840,
          depth: options?.reviewDepth ?? 10,
          filter_by_star: options?.filterByStar, // *all_stars critical one_star two_star three_star four_star five_star
          reviewer_type: options?.reviewerType, // *all_reviews avp_only_reviews
          sort_by: options?.sortBy, // *helpful recent
          media_type: options?.mediaType, // *all_contents media_reviews_only
          filter_by_keyword: options?.filterByKeyword
        }
      ])
    })
  ).json();

  const taskId = request?.tasks?.[0]?.id;

  if (!taskId || !/^2/.test(request?.tasks?.[0]?.status_code)) {
    throw new Error("Invalid response");
  }

  return {
    taskId,
    request,
    created: new Date()
  };
}

async function dfsARScrapesGet(taskId) {
  const response = await (
    await fetch(`https://api.dataforseo.com/v3/merchant/amazon/reviews/task_get/advanced/${taskId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: (authHeader ??= mkAuthHeader())
      }
    })
  ).json();

  await DataforseoCallbackCaches.create({
    body: Object.assign({}, response),
    timestamp: new Date()
    // ip: req.ip,
    // headers: Object.assign({}, req.headers),
    // query: Object.assign({}, req.query)
  });

  const task = response?.tasks?.[0];
  const result = task?.result?.[0];

  if (!result?.asin) {
    // {"status_code":20000,"status_message":"Ok.","tasks":[{"id":..,"status_code":40602,"status_message":"Task In Queue.",..}]}
    console.log(JSON.stringify(response));
    throw new Error("Incomplete response");
  }

  return {
    task,
    response,
    result,
    updated: result.datetime
  };
}

export { dfsARScrapeCallback, dfsARScrapesPost, dfsARScrapesGet };
