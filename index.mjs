import serverless from "serverless-http";
import express from "express";

const server = express();

server.all("*", function(req,res,next) {
	res.json({
		success: true,
		timestamp: new Date(),
		query: req.query,
		body: req.body,
		headers: req.headers,
	});
});

export const handler = serverless(server);
