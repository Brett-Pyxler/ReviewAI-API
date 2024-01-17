const serverless = require('serverless-http');
const express = require('express');

const server = express();

server.all("*", function(req,res,next) {
	res.json({
		success: true,
		timestamp: new Date(),
	});
});

const handler = serverless(server);

module.exports.handler = async (event, context) => {
	const result = await handler(event, context);
	return result;
};
