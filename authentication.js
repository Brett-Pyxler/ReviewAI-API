async function authCreate(req, res, next) {
  try {
    res.json({});
  } catch (err) {
    res.json({});
  }
}

async function authRetrieve(req, res, next) {
  try {
    res.json({});
  } catch (err) {
    res.json({});
  }
}

async function authDelete(req, res, next) {
  try {
    res.json({});
  } catch (err) {
    res.json({});
  }
}

async function authUpdate(req, res, next) {
  await next();
}

export { authCreate, authRetrieve, authDelete, authUpdate };
