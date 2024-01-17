// https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html
// https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_dynamodb_code_examples.html
// https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/
const TableName = "Music";
const payload = {};

try {
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/PutItemCommand
  payload.PutItemCommand = "default";
  payload.PutItemCommand = await dynamoClient.send(
    new PutItemCommand({
      TableName: TableName,
      Item: {
        _id: { S: uuidv4() },
        // name: { S: body.name },
        // price: { S: body.price },
        ip: { S: req.ip },
        // headers: { M: req.headers },
        // datenew: { S: String(new Date()) },
        // dateepo: { N: Date.now() },
      },
    }),
  );
  // "PutItemCommand": {
  //   "$metadata": {
  //     "httpStatusCode": 200,
  //     "requestId": "OJKI..AAJG",
  //     "attempts": 1,
  //     "totalRetryDelay": 0
  //   }
  // }
} catch (err) {
  payload.PutItemCommand = String(err);
}

try {
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/ScanCommand
  payload.ScanCommand = "default";
  payload.ScanCommand = await dynamoClient.send(
    new ScanCommand({
      TableName: TableName,
    }),
  );
  // "ScanCommand": {
  //   "$metadata": {
  //     "httpStatusCode": 200,
  //     "requestId": "N5E4..AAJG",
  //     "attempts": 1,
  //     "totalRetryDelay": 0
  //   },
  //   "Count": 1,
  //   "Items": [
  //     {
  //       "_id": {
  //         "S": "cf2bb1ab-7968-49dc-a367-091975a49ef2"
  //       },
  //       "ip": {
  //         "S": "78.159.112.208"
  //       }
  //     }
  //   ],
  //   "ScannedCount": 1
  // }
} catch (err) {
  payload.ScanCommand = String(err);
}

try {
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/GetItemCommand
  payload.GetItemCommand = "default";
  payload.GetItemCommand = await dynamoClient.send(
    new GetItemCommand({
      Key: {
        Artist: {
          S: "Acme Band",
        },
        SongTitle: {
          S: "Happy Day",
        },
      },
      TableName: TableName,
    }),
  );
} catch (err) {
  payload.GetItemCommand = String(err);
}

try {
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/DeleteItemCommand
  payload.DeleteItemCommand = "default";
  payload.DeleteItemCommand = await dynamoClient.send(
    new DeleteItemCommand({
      TableName: TableName,
      Key: { id: req.body.id },
    }),
  );
} catch (err) {
  payload.DeleteItemCommand = String(err);
}

try {
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/UpdateItemCommand
  payload.UpdateItemCommand = "default";
  payload.UpdateItemCommand = await dynamoClient.send(
    new UpdateItemCommand({
      ExpressionAttributeNames: {
        "#AT": "AlbumTitle",
        "#Y": "Year",
      },
      ExpressionAttributeValues: {
        ":t": {
          S: "Louder Than Ever",
        },
        ":y": {
          N: "2015",
        },
      },
      Key: {
        Artist: {
          S: "Acme Band",
        },
        SongTitle: {
          S: "Happy Day",
        },
      },
      ReturnValues: "ALL_NEW",
      TableName: TableName,
      UpdateExpression: "SET #Y = :y, #AT = :t",
    }),
  );
} catch (err) {
  payload.UpdateItemCommand = String(err);
}
