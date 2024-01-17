import { DataforseoAmazonReviews, DataforseoCallbackCaches, AsinEstimates } from "./models.mjs";

function sortedKV(i) {
  return Object.keys(i)
    .map((k) => `${k}:${i[k]}`)
    .sort()
    .join(",");
}

async function dataforseoAmazonReviewsEnsure(asinId, options = {}) {
  const authUser = process.env.DATAFORSEO_USER;
  const authPass = process.env.DATAFORSEO_PASS;
  const authToken = Buffer.from(`${authUser}:${authPass}`).toString("base64");
  const authHeader = `Basic ${authToken}`;
  const callbackHost = process.env.DATAFORSEO_CBHN;
  const apiUrl = "https://api.dataforseo.com/v3/merchant/amazon/reviews/task_post";

  const optionsKey = sortedKV(options);

  const maxAge = new Date();
  maxAge.setHours(maxAge.getHours() - 48);

  // cache

  let doc = await DataforseoAmazonReviews.findOne({
    "request.asinId": asinId,
    "request.optionsKey": optionsKey,
    "timestamps.created": { $gt: maxAge }
  });

  if (doc) return doc;

  // create

  const urlObj = new URL(apiUrl);
  urlObj.searchParams.set("postback_data", "advanced");
  urlObj.searchParams.set(
    "postback_url",
    encodeURIComponent(`https://${callbackHost}/api/dataforseo/callback/data?id=$id&${options?.searchOptions ?? ""}`)
  );

  const fetchUrl = urlObj.toString();
  const fetchParams = Object.fromEntries(urlObj.searchParams.entries());

  const bodyObj = [
    {
      // docs: https://docs.dataforseo.com/v3/merchant/amazon/reviews/task_post/?bash
      // note: ${reviews_count} adjusts for filterByStar
      asin: asinId,
      language_code: options?.languageCode ?? "en_US",
      location_code: options?.locationCode ?? 2840,
      depth: options?.reviewDepth ?? 10,
      filter_by_star: options?.filterByStar, // "all_stars" "critical"
      reviewer_type: options?.reviewerType, // "all_reviews"
      sort_by: options?.sortBy, // "helpful"
      media_type: options?.mediaType // "all_contents
    }
  ];

  const response = await (
    await fetch(fetchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader
      },
      body: JSON.stringify(bodyObj)
    })
  ).json();

  // { tasks: [{
  //       id: "01030526-7061-0415-0000-84b2b7a1e074",
  //       status_code: 40501, // failure
  //       status_code: 20100, // success
  //       status_message: "Task Created.",
  //       time: "0.0143 sec.",
  //       cost: 0.00075,
  //       result_count: 0

  const taskId = response?.tasks?.[0]?.id;

  if (
    // response must contain an id
    !taskId ||
    // response must begin with 2xx
    !/^2/.test(response?.tasks?.[0]?.status_code)
  ) {
    throw new Error("Invalid response");
  }

  doc = await DataforseoAmazonReviews.create({
    request: {
      apiUrl,
      fetchUrl,
      body: bodyObj,
      params: fetchParams,
      response,
      options,
      optionsKey,
      asinId,
      taskId
    },
    timestamps: {
      created: new Date()
    }
  });

  return doc;
}

// async function dataforseoAmazonReviewsTaskCreate(asinId, options = {}) {
//   const authUser = process.env.DATAFORSEO_USER;
//   const authPass = process.env.DATAFORSEO_PASS;
//   const authToken = Buffer.from(`${authUser}:${authPass}`).toString("base64");
//   const authHeader = `Basic ${authToken}`;
//   const callbackHost = process.env.DATAFORSEO_CBHN;

//   let fetchUrl = new URL("https://api.dataforseo.com/v3/merchant/amazon/reviews/task_post");
//   fetchUrl.searchParams.set("postback_data", "advanced");
//   fetchUrl.searchParams.set(
//     "postback_url",
//     encodeURIComponent(`https://${callbackHost}/api/dataforseo/callback/data?id=$id&${options?.searchOptions ?? ""}`)
//   );

//   return fetch(fetchUrl.toString(), {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//       Authorization: authHeader
//     },
//     body: JSON.stringify([
//       {
//         // docs: https://docs.dataforseo.com/v3/merchant/amazon/reviews/task_post/?bash
//         // note: ${reviews_count} adjusts for filterByStar
//         asin: asinId,
//         language_code: options?.languageCode ?? "en_US",
//         location_code: options?.locationCode ?? 2840,
//         depth: options?.reviewDepth ?? 10,
//         filter_by_star: options?.filterByStar, // "all_stars" "critical"
//         reviewer_type: options?.reviewerType, // "all_reviews"
//         sort_by: options?.sortBy, // "helpful"
//         media_type: options?.mediaType // "all_contents
//       }
//     ])
//   }).then((res) => res.json());
// }

// async function dataforseoAmazonReviewsTaskRetrieve(taskId) {
//   const authUser = process.env.DATAFORSEO_USER;
//   const authPass = process.env.DATAFORSEO_PASS;
//   const authToken = Buffer.from(`${authUser}:${authPass}`).toString("base64");
//   const authHeader = `Basic ${authToken}`;

//   return fetch(`https://api.dataforseo.com/v3/merchant/amazon/reviews/task_get/advanced/${taskId}`, {
//     method: "GET",
//     headers: {
//       "Content-Type": "application/json",
//       Authorization: authHeader
//     }
//   }).then((res) => res.json());
// }

async function dataforseoAmazonReviewsTaskCallback(req, res, next) {
  try {
    // process asin estimates
    // if (req.query?.estimateId) {
    //   await AsinEstimates.findByIdAndUpdate(req.query?.estimateId, {
    //     $set: {
    //       "dataforseo.callback.response": Object.assign({}, req.body),
    //       "dataforseo.callback.timestamp": new Date()
    //     }
    //   });
    // }
    // cache results for analysis
    await DataforseoCallbackCaches.create({
      ip: req.ip,
      headers: Object.assign({}, req.headers),
      query: Object.assign({}, req.query),
      body: Object.assign({}, req.body),
      timestamp: new Date()
    });
    //
    return res.json({});
  } catch (err) {
    return res.json({ message: String(err) });
  }
}

export {
  //
  dataforseoAmazonReviewsEnsure,
  // dataforseoAmazonReviewsTaskCreate,
  // dataforseoAmazonReviewsTaskRetrieve,
  dataforseoAmazonReviewsTaskCallback
};
