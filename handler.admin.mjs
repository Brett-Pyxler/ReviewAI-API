import { isValidObjectId } from "mongoose";
import bcrypt from "bcrypt";
import { Organizations, Members, AmazonAsins } from "./models.mjs";
import { dfsARScrapesEnsure } from "./dataforseo.mjs";

const asinPattern = /^[0-9A-Z]{10}$/;

// async function Stub(req, res, next) {
//   try {
//     const var1 = req.query?.var1 ?? req.body?.var1 ?? null;
//     const var2 = req.params?.var2 || null;
//     // response
//     res.json({});
//   } catch (err) {
//     res.status(401).json({ message: String(err) });
//   }
// }

async function adminSearch(req, res, next) {
  try {
    const pattern = req.query?.pattern ?? req.body?.pattern ?? null;
    // find organizations
    let orgs = await Organizations.find({
      preferredName: { $regex: pattern, $options: "i" }
    }).exec();
    // find members
    let mems = await Members.find({
      preferredName: { $regex: pattern, $options: "i" }
    })
      .populate("organizations")
      .exec();
    // find asins
    let asins = await AmazonAsins.find({
      $or: [{ title: { $regex: pattern, $options: "i" } }, { asinId: { $regex: pattern, $options: "i" } }]
    }).exec();
    // response
    res.json({
      search: []
        .concat(orgs.map((ptr) => Object.assign(ptr.toJSON(), { model: "Organizations" })))
        .concat(mems.map((ptr) => Object.assign(ptr.toJSON(), { model: "Members" })))
        .concat(asins.map((ptr) => Object.assign(ptr.toJSON(), { model: "Asins" })))
    });
  } catch (err) {
    res.status(401).json({ message: String(err) });
  }
}

async function adminOrganizationCreate(req, res, next) {
  try {
    const preferredName = req.query?.preferredName || req.body?.preferredName || null;
    if (!req.member?.administrator?.fullAccess) {
      throw new Error("Permission denied.");
    }
    if (!preferredName) {
      throw new Error("Invalid inputs.");
    }
    let response = await Organizations.create({
      preferredName
    });
    // response
    res.json({
      organization: response
    });
  } catch (err) {
    res.status(401).json({ message: String(err) });
  }
}

async function adminOrganizationGet(req, res, next) {
  try {
    const id = req.params?.id || null;
    if (!req.member?.administrator?.fullAccess) {
      throw new Error("Permission denied.");
    }
    if (!id) {
      throw new Error("Invalid inputs.");
    }
    let response = await Organizations.findById(id).populate("members").populate("asins");
    // response
    res.json({
      organization: response
    });
  } catch (err) {
    res.status(401).json({ message: String(err) });
  }
}

async function adminOrganizationsEnumerate(req, res, next) {
  try {
    if (!req.member?.administrator?.fullAccess) {
      throw new Error("Permission denied.");
    }
    let response = await Organizations.find({}).select({
      _id: 1,
      preferredName: 1
    });
    // response
    res.json({
      enumerate: response
    });
  } catch (err) {
    res.status(401).json({ message: String(err) });
  }
}

async function adminMembersEnumerate(req, res, next) {
  try {
    if (!req.member?.administrator?.fullAccess) {
      throw new Error("Permission denied.");
    }
    let response = await Members.find({}).select({
      _id: 1,
      preferredName: 1
    });
    // response
    res.json({
      enumerate: response
    });
  } catch (err) {
    res.status(401).json({ message: String(err) });
  }
}

async function adminOrganizationMembersAdd(req, res, next) {
  try {
    const organizationId = req.params?.id || null;
    const memberId = req.body?.memberId || null;
    if (!req.member?.administrator?.fullAccess) {
      throw new Error("Permission denied.");
    }
    if (!isValidObjectId(organizationId) || !isValidObjectId(memberId)) {
      throw new Error("Invalid inputs.");
    }
    let response = await Members.findById(memberId);
    if (!response) {
      throw new Error("Unknown member.");
    }
    response.organizations.push(organizationId);
    await response.save();
    // response
    res.json({});
  } catch (err) {
    res.status(401).json({ message: String(err) });
  }
}

async function adminOrganizationAsinsAdd(req, res, next) {
  try {
    const organizationId = req.params?.id || null;
    const asinId = req.body?.asinId || null;
    if (!req.member?.administrator?.fullAccess) {
      throw new Error("Permission denied.");
    }
    if (!isValidObjectId(organizationId)) {
      throw new Error("Invalid inputs.");
    }
    if (!asinPattern.test(asinId)) {
      throw new Error("Invalid inputs.");
    }
    let response = await Organizations.findById(organizationId);
    if (!response) {
      throw new Error("Unknown organization.");
    }
    let asin = await AmazonAsins.findOne({
      asinId
    });
    asin ??= await AmazonAsins.create({
      asinId,
      timestamps: {
        firstSeen: new Date()
      }
    });
    if (!asin) {
      throw new Error("Unknown asin.");
    }
    response.asins.push(asin._id);
    await response.save();
    // dataforseo
    await dfsARScrapesEnsure(asinId, {
      reviewDepth: 10,
      filterByStar: "critical"
    });
    // response
    res.json({});
  } catch (err) {
    res.status(401).json({ message: String(err) });
  }
}

async function adminMemberGet(req, res, next) {
  try {
    const memberId = req.params?.id || null;
    if (!req.member?.administrator?.fullAccess) {
      throw new Error("Permission denied.");
    }
    let response = await Members.findById(memberId);
    if (!response) {
      throw new Error("Unknown member.");
    }
    // populate
    await response.populate("organizations");
    // response
    res.json({ member: response });
  } catch (err) {
    res.status(401).json({ message: String(err) });
  }
}

async function adminAmazonAsinGet(req, res, next) {
  try {
    const asinId = req.params?.id || null;
    if (!req.member?.administrator?.fullAccess) {
      throw new Error("Permission denied.");
    }
    let response = await AmazonAsins.findById(asinId);
    if (!response) {
      throw new Error("Unknown asin.");
    }
    // response
    res.json({ asin: response });
  } catch (err) {
    res.status(401).json({ message: String(err) });
  }
}

async function adminMemberChangePassword(req, res, next) {
  try {
    const memberId = req.params?.id || null;
    const pass = req.body?.pass ?? null;
    if (!req.member?.administrator?.fullAccess) {
      throw new Error("Permission denied.");
    }
    let response = await Members.findById(memberId);
    if (!response) {
      throw new Error("Unknown member.");
    }
    response.security.passwordHash = await bcrypt.hash(pass, process.env.SALT_ROUNDS ?? 10);
    await response.save();
    // response
    res.json({});
  } catch (err) {
    res.status(401).json({ message: String(err) });
  }
}

export {
  adminSearch,
  adminOrganizationCreate,
  adminOrganizationMembersAdd,
  adminOrganizationAsinsAdd,
  adminOrganizationsEnumerate,
  adminOrganizationGet,
  adminMemberChangePassword,
  adminMembersEnumerate,
  adminMemberGet,
  adminAmazonAsinGet
};
