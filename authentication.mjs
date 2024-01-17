import jwt from "jsonwebtoken";
// import bcrypt from "bcrypt";

// const saltRounds = 10;
// user.passwordHash = await bcrypt.hash(password, saltRounds);
// const match = await bcrypt.compare(password, user.passwordHash);

// res.cookie('token', authTokenCreate({..}), { expires: new Date(Date.now() + 8 * 3600) })

function authTokenCreate(data) {
  return jwt.sign({ data }, process.env.JWT_SECRET || "secret", {
    expiresIn: "1h"
  });
}

function authTokenDecode(token) {
  return new Promise(function (resolve, reject) {
    jwt.verify(
      token,
      process.env.JWT_SECRET || "secret",
      function (err, decoded) {
        err ? reject(err) : resolve(decoded);
      }
    );
  });
}

async function authRouteDecode(req, res, next) {
  try {
    let token = req.query?.token || req.cookies?.token || null;
    req.auth = await authTokenDecode(token);
  } catch (err) {
    req.auth = undefined;
  }
}

async function authRouteRequire(req, res, next) {
  if (!req.auth) res.sendStatus(401);
  else await next();
}

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

export {
  authTokenCreate,
  authTokenDecode,
  authRouteDecode,
  authRouteRequire,
  authCreate,
  authRetrieve,
  authDelete,
  authUpdate
};
