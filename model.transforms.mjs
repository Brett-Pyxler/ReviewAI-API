function memberTransform(doc, ret, options) {
  delete ret.security;
  ret.sessions?.map?.((ptr) => {
    delete ptr.token;
  });
  return ret;
}

function asinTransform(doc, ret, options) {
  delete ret.requests;
  return ret;
}

function amazonReviewTransform(doc, ret, options) {
  ret.openai = {
    latest: {
      textContent: ret?.openai?.latest?.textContent,
      threatValue: ret?.openai?.latest?.threatValue
    }
  };
  return ret;
}

function resultSort([k1, v1], [k2, v2]) {
  // oldest to newest
  if (v1.updated < v2.updated) return 1;
  else if (v1.updated > v2.updated) return -1;
  return 0;
}

const extractReviewId = (i) => /\/([A-Z0-9]{10,})/.exec(i)?.[1];

const filterDuplicates = (v, i, o) => o.findIndex((x) => String(x) == String(v)) == i;

export { memberTransform, asinTransform, amazonReviewTransform, resultSort, extractReviewId, filterDuplicates };
