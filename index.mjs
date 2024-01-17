import {
  DynamoDB,
  DynamoDBClient,
  ScanCommand,
  PutItemCommand,
  GetItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
} from "@aws-sdk/client-dynamodb";

import { S3Client } from "@aws-sdk/client-s3";

import serverless from "serverless-http";

import express from "express";

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-west-2",
});

const server = express();

server.enable("trust proxy");

server.disable("x-powered-by");

server.use(express.json());

server.use(express.urlencoded({ extended: true }));

server.all("*", async function (req, res, next) {
  let payload = {
    success: true,
    timestamp: new Date(),
    request: {
      method: req.method,
      url: req.url,
    },
    ip: req.ip,
    query: req.query,
    body: req.body,
    headers: req.headers,
    aws: {
      region: process.env.AWS_REGION,
      tz: process.env.TZ,
    },
  };

  // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html
  // https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_dynamodb_code_examples.html
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/
  const TableName = "Music";

  try {
    // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/ScanCommand
    payload.ScanCommand = "default";
    payload.ScanCommand = await dynamoClient.send(
      new ScanCommand({
        TableName: TableName,
      }),
    );
  } catch (err) {
    payload.ScanCommand = String(err);
  }

  //   try {
  //     // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/PutItemCommand
  //     payload.PutItemCommand = "default";
  //     payload.PutItemCommand = await dynamoClient.send(
  //       new PutItemCommand({
  //         TableName: TableName,
  //         Item: {
  //           name: { S: body.name },
  //           price: { S: body.price },
  //           id: { S: uuidv4() },
  //         },
  //       }),
  //     );
  //   } catch (err) {
  //     payload.PutItemCommand = String(err);
  //   }

  //   try {
  //     // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/GetItemCommand
  //     payload.GetItemCommand = "default";
  //     payload.GetItemCommand = await dynamoClient.send(
  //       new GetItemCommand({
  //         Key: {
  //           Artist: {
  //             S: "Acme Band",
  //           },
  //           SongTitle: {
  //             S: "Happy Day",
  //           },
  //         },
  //         TableName: TableName,
  //       }),
  //     );
  //   } catch (err) {
  //     payload.GetItemCommand = String(err);
  //   }

  //   try {
  //     // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/DeleteItemCommand
  //     payload.DeleteItemCommand = "default";
  //     payload.DeleteItemCommand = await dynamoClient.send(
  //       new DeleteItemCommand({
  //         TableName: TableName,
  //         Key: { id: req.body.id },
  //       }),
  //     );
  //   } catch (err) {
  //     payload.DeleteItemCommand = String(err);
  //   }

  //   try {
  //     // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/UpdateItemCommand
  //     payload.UpdateItemCommand = "default";
  //     payload.UpdateItemCommand = await dynamoClient.send(
  //       new UpdateItemCommand({
  //         ExpressionAttributeNames: {
  //           "#AT": "AlbumTitle",
  //           "#Y": "Year",
  //         },
  //         ExpressionAttributeValues: {
  //           ":t": {
  //             S: "Louder Than Ever",
  //           },
  //           ":y": {
  //             N: "2015",
  //           },
  //         },
  //         Key: {
  //           Artist: {
  //             S: "Acme Band",
  //           },
  //           SongTitle: {
  //             S: "Happy Day",
  //           },
  //         },
  //         ReturnValues: "ALL_NEW",
  //         TableName: TableName,
  //         UpdateExpression: "SET #Y = :y, #AT = :t",
  //       }),
  //     );
  //   } catch (err) {
  //     payload.UpdateItemCommand = String(err);
  //   }

  res.json(payload);
});

export const handler = serverless(server);

if (process.env.TEST) {
  handler().then(console.log).catch(console.log);
}
