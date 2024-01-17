import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { Members } from "./models.mjs";

process.env.JWT_SECRET ??= "secret";
// process.env.SALT_ROUNDS ??= 10;

// passwordHash = await bcrypt.hash(password, saltRounds);
// match = await bcrypt.compare(password, passwordHash);

function authTokenCreate(data) {
  return jwt.sign(data, process.env.JWT_SECRET);
}

function authTokenDecode(token) {
  return new Promise(function (resolve, reject) {
    jwt.verify(token, process.env.JWT_SECRET, function (err, decoded) {
      resolve(decoded);
    });
  });
}

async function authRouteDecode(req, res, next) {
  // decode
  req.auth = await authTokenDecode(req.query?.token || req.cookies?.token || null);
  next();
}

async function authRouteRequire(req, res, next) {
  try {
    // decode
    req.auth ??= await authTokenDecode(req.query?.token || req.cookies?.token || null);
    if (!req.auth?.memberId || !req.auth?.tokenId) {
      throw new Error("Unable to decode.");
    }
    // member
    req.member = await Members.findById(req.auth?.memberId);
    if (!req.member) {
      throw new Error("Unknown account.");
    }
    // session
    req.session = req.member.sessions.find((session) => session?.token == req.auth?.tokenId);
    if (!req.session) {
      throw new Error("Unknown session.");
    }
  } catch (err) {
    res
      .clearCookie("token")
      .status(401)
      .json({ message: String(err) });
    return;
  }

  try {
    // timestamp
    req.session.timestamps.lastSeen = new Date();
    await req.member.save();
  } catch (err) {
    res.status(500).json({ message: String(err) });
    return;
  }

  // success
  next();
}

async function authLogin(req, res, next) {
  try {
    // verification
    // if (req.auth) {
    //   throw new Error("Already authenticated.");
    // }
    const login = String(req.body?.login ?? "");
    const pass = String(req.body?.pass ?? "");
    if (!login || !pass) {
      throw new Error("Missing credentials.");
    }
    req.member = await Members.findOne({
      emailAddressesLc: login
      // $or: [{ emailAddressesLc: login }, { phoneNumbers: login }]
    });
    if (!req.member) {
      throw new Error("Unknown account.");
    }
    if (!req.member?.security?.passwordHash) {
      throw new Error("Password not set.");
    }
    const match = await bcrypt.compare(pass, req.member?.security?.passwordHash);
    if (!match) {
      throw new Error("Unknown password.");
    }
    // creation
    const memberId = String(req.member._id);
    const tokenId = uuidv4();
    const date = new Date();
    // database
    req.member.sessions.push({
      token: tokenId,
      userAgent: req.headers?.["user-agent"],
      ipAddress: req.ip,
      timestamps: {
        firstSeen: date,
        lastSeen: date,
        lastUpdate: date
      }
    });
    await req.member.save();
    // response
    res
      .cookie(
        "token",
        authTokenCreate({
          memberId,
          tokenId
        }),
        {
          // expires: new Date(Date.now() + 31 * 24 * 3600)
        }
      )
      .json({
        member: {
          _id: req?.member?._id,
          preferredName: req?.member?.preferredName,
          organizations: req?.member?.organizations,
          emailAddresses: req?.member?.emailAddresses,
          phoneNumbers: req?.member?.phoneNumbers,
          sessions: req?.member?.sessions,
          settings: req?.member?.settings,
          administrator: req?.member?.administrator
        }
      });
  } catch (err) {
    res.status(401).json({
      message: String(err)
    });
  }
}

async function authLogout(req, res, next) {
  try {
    req.member.sessions = req.member.sessions.filter((session) => session?.token != req.auth?.tokenId);
    await req.member.save();
    // response
    res.clearCookie("token").json({});
  } catch (err) {
    res.status(401).json({
      message: String(err)
    });
  }
}

async function authRetrieve(req, res, next) {
  try {
    // populate organizations
    await req.member.populate("organizations");
    // populate members
    await req.member.populate({
      path: "organizations.members",
      transform: (doc, _id) => {
        return {
          _id: doc?._id,
          preferredName: doc?.preferredName
        };
      }
    });
    // response
    res.set("Cache-Control", "no-store").json({
      member: {
        _id: req?.member?._id,
        preferredName: req?.member?.preferredName,
        organizations: req?.member?.organizations,
        emailAddresses: req?.member?.emailAddresses,
        phoneNumbers: req?.member?.phoneNumbers,
        sessions: req?.member?.sessions,
        settings: req?.member?.settings,
        administrator: req?.member?.administrator
      }
    });
  } catch (err) {
    res.status(401).json({ message: String(err) });
  }
}

export { authTokenCreate, authTokenDecode, authRouteDecode, authRouteRequire, authLogin, authLogout, authRetrieve };
