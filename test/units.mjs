// https://www.npmjs.com/package/supertest
import request from "supertest";

// https://www.npmjs.com/package/expect.js
import expect from "expect.js";

import bcrypt from "bcrypt";

import { server, dbConnect, dbDisconnect } from "../index.mjs";

import { Organizations, Members, AmazonAsins, AmazonReviews } from "../models.mjs";

describe("Initial", function () {
  this.timeout(10 * 1000);
  before(async function () {
    await dbConnect();
  });
  after(async function () {
    await dbDisconnect();
  });
  it("Create a member", async function () {
    console.log(
      await Members.create({
        preferredName: "Test Admin Member",
        emailAddresses: ["kristopher@pyxler.com"],
        administrator: {
          fullAccess: true
        },
        security: {
          passwordHash: await bcrypt.hash("password", 10)
        }
      })
    );
  });
});

//         preferredName: "Test Admin Member",
//         organizations: [organization?._id],
//         emailAddresses: ["test@test.com"],
//         phoneNumbers: ["1231231234", "4251112222"],
//         administrator: {
//           fullAccess: true
//         },
//         security: {
//           passwordHash: await bcrypt.hash("password", 10)
//         }
//       });

// describe("Routes", function () {
//   it("should return status 404", function (done) {
//     request(server) //
//       .get("/404")
//       .expect(404, done);
//   });
// });

// describe("Modals", function () {
//   // increase timeout for database connection
//   this.timeout(10 * 1000);
//   // save instances for teardown
//   let organization, member, cookies, asin, reviews;
//   // console labeling
//   beforeEach(function () {
//     console.group(/* this.test.title */);
//   });
//   afterEach(function () {
//     console.groupEnd();
//   });
//   // database connection
//   before(async function () {
//     await dbConnect();
//   });
//   after(async function () {
//     // teardown
//     console.group();
//     if (organization?._id) {
//       console.log("organization.delete:", JSON.stringify(await Organizations.findByIdAndDelete(organization._id)));
//       organization = undefined;
//     }
//     if (member?._id) {
//       console.log("member.delete:", JSON.stringify(await Members.findByIdAndDelete(member._id)));
//       member = undefined;
//     }
//     if (asin?._id) {
//       console.log("asin.delete:", JSON.stringify(await AmazonAsins.findByIdAndDelete(asin._id)));
//       asin = undefined;
//     }
//     if (reviews) {
//       for (let review of reviews) {
//         console.log("review.delete:", JSON.stringify(await AmazonReviews.findByIdAndDelete(review._id)));
//       }
//       reviews = undefined;
//     }
//     console.groupEnd();
//     await dbDisconnect();
//   });

//   describe("Initial Administration", function () {
//     it("create asin", async function () {
//       asin = await AmazonAsins.create({
//         asinId: "A123456789",
//         timestamps: {
//           firstSeen: new Date()
//         }
//       });
//     });
//     it("create reviews", async function () {
//       reviews ??= [];
//       reviews.push(
//         await AmazonReviews.create({
//           gId: String(Math.random()),
//           asinId: asin.asinId,
//           status: "pending",
//           timestamps: {
//             firstSeen: new Date()
//           }
//         })
//       );
//       reviews.push(
//         await AmazonReviews.create({
//           gId: String(Math.random()),
//           asinId: asin.asinId,
//           status: "pending",
//           timestamps: {
//             firstSeen: new Date()
//           }
//         })
//       );
//       reviews.push(
//         await AmazonReviews.create({
//           gId: String(Math.random()),
//           asinId: asin.asinId,
//           status: "removed",
//           timestamps: {
//             firstSeen: new Date()
//           }
//         })
//       );
//     });
//     it("create organization", async function () {
//       organization = await Organizations.create({
//         preferredName: "Test Admin Organization",
//         asins: [asin?._id]
//       });
//     });
//     it("create member", async function () {
//       member = await Members.create({
//         preferredName: "Test Admin Member",
//         organizations: [organization?._id],
//         emailAddresses: ["test@test.com"],
//         phoneNumbers: ["1231231234", "4251112222"],
//         administrator: {
//           fullAccess: true
//         },
//         security: {
//           passwordHash: await bcrypt.hash("password", 10)
//         }
//       });
//     });
//   });

//   describe("Sessions", function () {
//     it("create session (empty login)", async function () {
//       const r = await request(server) //
//         .post("/api/auth")
//         .send({});
//       console.log(r.status, JSON.stringify(r.body));
//       expect(r.status).to.be(401);
//       expect(r.body.message).to.be.ok();
//     });
//     it("create session (bad password)", async function () {
//       const r = await request(server) //
//         .post("/api/auth")
//         .set("Accept", "application/json")
//         .send({ login: "test@test.com", pass: "badpassword" });
//       console.log(r.status, JSON.stringify(r.body));
//       expect(r.status).to.be(401);
//       expect(r.body.message).to.be.ok();
//     });
//     it("retrieve session (fail)", async function () {
//       const r = await request(server) //
//         .get("/api/auth");
//       console.log(r.status, JSON.stringify(r.body));
//       expect(r.status).not.to.be(200);
//     });
//     it("create a session", async function () {
//       const r = await request(server) //
//         .post("/api/auth")
//         .set("Accept", "application/json")
//         .send({ login: "test@test.com", pass: "password" });
//       console.log(r.status, JSON.stringify(r.body));
//       expect(r.status).to.be(200);
//       expect(r.body.preferredName).to.be("Test Admin Member");
//       expect(r.header["set-cookie"].length).to.be.ok();
//       cookies = r.header["set-cookie"];
//     });
//     it("retrieve session (okay)", async function () {
//       const r = await request(server) //
//         .get("/api/auth")
//         .set("Cookie", cookies);
//       console.log(r.status, JSON.stringify(r.body));
//       expect(r.status).to.be(200);
//       expect(r.body.preferredName).to.be("Test Admin Member");
//     });
//   });

//   describe("Asins", function () {
//     it("retrieve dashboard", async function () {
//       const r = await request(server) //
//         .get("/api/asins/overview")
//         .set("Cookie", cookies);
//       console.log(r.status, JSON.stringify(r.body));
//       expect(r.status).to.be(200);
//     });
//   });

//   describe("Sessions", function () {
//     it("delete a session (okay)", async function () {
//       const r = await request(server) //
//         .delete("/api/auth")
//         .set("Cookie", cookies);
//       console.log(r.status, JSON.stringify(r.body));
//       expect(r.status).to.be(200);
//     });
//     it("delete a session (fail)", async function () {
//       const r = await request(server) //
//         .delete("/api/auth")
//         .set("Cookie", cookies);
//       console.log(r.status, JSON.stringify(r.body));
//       expect(r.status).not.to.be(200);
//     });
//   });
// });
