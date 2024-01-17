import { DataforseoAmazonReviews, DataforseoCallbackCaches, AsinEstimates } from "./models.mjs";

let authHeader = null;

function mkAuthHeader() {
  const authUser = process.env.DATAFORSEO_USER;
  const authPass = process.env.DATAFORSEO_PASS;
  const authToken = Buffer.from(`${authUser}:${authPass}`).toString("base64");
  return (authHeader = `Basic ${authToken}`);
}

function sortedKV(i) {
  return Object.keys(i)
    .map((k) => `${k}:${i[k]}`)
    .sort()
    .join(",");
}

async function dataforseoAmazonReviewsCache(asinId, optionsKey, maxAge) {
  return await DataforseoAmazonReviews.findOne({
    "request.asinId": asinId,
    "request.optionsKey": optionsKey,
    "timestamps.created": { $gt: maxAge }
  });
}

async function dataforseoAmazonReviewsCheck(taskId) {
  try {
    authHeader ??= mkAuthHeader();
    await DataforseoCallbackCaches.create({
      timestamp: new Date(),
      body: await (
        await fetch(`https://api.dataforseo.com/v3/merchant/amazon/reviews/task_get/advanced/${taskId}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader
          }
        })
      ).json()
    });
  } catch (err) {
    console.error(err);
  }
  return null;
}

async function dataforseoAmazonReviewsEnsure(asinId, options = {}) {
  const callbackHost = process.env.DATAFORSEO_CBHN;
  const optionsKey = sortedKV(options);

  const maxAge = new Date();
  maxAge.setHours(maxAge.getHours() - 48);

  let reviewRequest;

  // cache
  reviewRequest = await dataforseoAmazonReviewsCache(asinId, optionsKey, maxAge);

  // check
  if (reviewRequest?.request?.taskId && !reviewRequest?.result?.complete) {
    await dataforseoAmazonReviewsCheck(reviewRequest?.request?.taskId);
  }

  if (reviewRequest) return reviewRequest;

  // create
  const urlObj = new URL("https://api.dataforseo.com/v3/merchant/amazon/reviews/task_post");
  urlObj.searchParams.set("postback_data", "advanced");
  const callbackUrl = `https://${callbackHost}/api/dataforseo/callback/data?id=$id&${options?.searchOptions ?? ""}`;
  urlObj.searchParams.set("postback_url", encodeURIComponent(callbackUrl));

  authHeader ??= mkAuthHeader();

  const response = await (
    await fetch(urlObj.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader
      },
      body: JSON.stringify([
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
      ])
    })
  ).json();

  const taskId = response?.tasks?.[0]?.id;

  if (
    // response must contain an id
    !taskId ||
    // response must begin with 2xx
    !/^2/.test(response?.tasks?.[0]?.status_code)
  ) {
    throw new Error("Invalid response");
  }

  reviewRequest = await DataforseoAmazonReviews.create({
    request: {
      params: Object.fromEntries(urlObj.searchParams.entries()),
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

  return reviewRequest;
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
  dataforseoAmazonReviewsCache,
  dataforseoAmazonReviewsCheck,
  dataforseoAmazonReviewsEnsure,
  // dataforseoAmazonReviewsTaskCreate,
  // dataforseoAmazonReviewsTaskRetrieve,
  dataforseoAmazonReviewsTaskCallback
};
