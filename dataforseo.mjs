import {
  //
  AccessLogs,
  AsinEstimates
} from "./models.mjs";

async function amazonReviewsTaskCreate(asinId, options = {}) {
  const authUser = process.env.DATAFORSEO_USER;
  const authPass = process.env.DATAFORSEO_PASS;
  const authToken = Buffer.from(`${authUser}:${authPass}`).toString("base64");
  const authHeader = `Basic ${authToken}`;
  const callbackHost = process.env.DATAFORSEO_CBHN;

  let fetchUrl = new URL(
    "https://api.dataforseo.com/v3/merchant/amazon/reviews/task_post"
  );
  fetchUrl.searchParams.set("postback_data", "advanced");
  fetchUrl.searchParams.set(
    "postback_url",
    encodeURIComponent(
      `https://${callbackHost}/api/dataforseo/callback/data?id=$id&${
        options?.searchOptions ?? ""
      }`
    )
  );

  return fetch(fetchUrl.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader
    },
    body: JSON.stringify([
      {
        asin: asinId,
        language_code: options?.languageCode ?? "en_US",
        location_code: options?.locationCode ?? 2840,
        depth: options?.reviewDepth ?? 10,
        filter_by_star: options?.filterByStar, // "all_stars"
        reviewer_type: options?.reviewerType, // "all_reviews"
        sort_by: options?.sortBy, // "helpful"
        media_type: options?.mediaType // "all_contents
      }
    ])
  }).then((res) => res.json());
}

// amazonReviewsTaskCreate("B0023234HFD")
//     .then((e) => console.log(JSON.stringify(e)))
//     .catch(console.error)
//
// {"version": "0.1.20231117",
// "status_code": 20000,
// "status_message": "Ok.",
// "time": "0.0735 sec.",
// "cost": 0.00075,
// "tasks_count": 1,
// "tasks_error": 0,
// "tasks": [{
//     "id": "xx-xx-xx-xx-xx",
//     "status_code": 20100,
//     "status_message": "Task Created.",
//     "time": "0.0077 sec.",
//     "cost": 0.00075,
//     "result_count": 0,
//     "path": ["v3","merchant","amazon","reviews","task_post"],
//     "data": {
//       "api": "merchant",
//       "function": "reviews",
//       "se": "amazon",
//       "postback_data": "advanced",
//       "postback_url": "https://pyxler.com/api/dataforseo/callback/data?id=$id",
//       "language_code": "en_US",
//       "location_code": 2840,
//       "asin": "B0023234HFD",
//       "depth": 10,
//       "filter_by_star": "all_stars",
//       "reviewer_type": "all_reviews",
//       "sort_by": "helpful",
//       "media_type": "all_contents",
//       "se_type": "reviews",
//       "device": "desktop",
//       "os": "windows"
//     },
//     "result": null}]}

async function amazonReviewsTaskRetrieve(taskId) {
  const authUser = process.env.DATAFORSEO_USER;
  const authPass = process.env.DATAFORSEO_PASS;
  const authToken = Buffer.from(`${authUser}:${authPass}`).toString("base64");
  const authHeader = `Basic ${authToken}`;

  return fetch(
    `https://api.dataforseo.com/v3/merchant/amazon/reviews/task_get/advanced/${taskId}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader
      }
    }
  ).then((res) => res.json());
}

// console.log(JSON.stringify(await amazonReviewsTaskRetrieve("xx-xx-xx-xx-xx"),null,2));
//
// {"version": "0.1.20231117",
// "status_code": 20000,
// "status_message": "Ok.",
// "time": "0.0683 sec.",
// "cost": 0,
// "tasks_count": 1,
// "tasks_error": 1,
// "tasks": [{
//     "id": "xx-xx-xx-xx-xx",
//     "status_code": 40102,
//     "status_message": "No Search Results.",
//     "time": "0.0174 sec.",
//     "cost": 0,
//     "result_count": 0,
//     "path": [
//       "v3",
//       "merchant",
//       "amazon",
//       "reviews",
//       "task_get",
//       "advanced",
//       "xx-xx-xx-xx-xx"
//     ],
//     "data": {
//       "se_type": "reviews",
//       "api": "merchant",
//       "function": "reviews",
//       "se": "amazon",
//       "postback_data": "advanced",
//       "postback_url": "https://pyxler.com/api/dataforseo/callback/data?id=$id&",
//       "language_code": "en_US",
//       "location_code": 2840,
//       "asin": "xx",
//       "depth": 10,
//       "filter_by_star": "all_stars",
//       "reviewer_type": "all_reviews",
//       "sort_by": "helpful",
//       "media_type": "all_contents",
//       "device": "desktop",
//       "os": "windows"
//     },
//     "result": [
//       {
//         "asin": "xx",
//         "type": "reviews",
//         "se_domain": "amazon.com",
//         "location_code": 2840,
//         "language_code": "en_US",
//         "check_url": "https://www.amazon.com/product-reviews/..",
//         "datetime": "2023-12-14 09:13:20 +00:00",
//         "spell": null,
//         "title": null,
//         "image": null,
//         "rating": null,
//         "reviews_count": null,
//         "item_types": null,
//         "items_count": 0,
//         "items": null}]}]}

async function amazonReviewsTaskCallback(req, res, next) {
  try {
    if (req.query?.estimateId) {
      await AsinEstimates.findByIdAndUpdate(req.query?.estimateId, {
        $set: {
          "dataforseo.callback.response": Object.assign({}, req.body),
          "dataforseo.callback.timestamp": new Date()
        }
      });
    }
    return res.json({});
  } catch (err) {
    return res.json({ message: String(err) });
  }
}

export {
  //
  amazonReviewsTaskCreate,
  amazonReviewsTaskRetrieve,
  amazonReviewsTaskCallback
};
