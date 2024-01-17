import serverless from "serverless-http";
import express from "express";

const server = express();

server.enable("trust proxy");

server.disable("x-powered-by");

server.use(express.json());

server.use(express.urlencoded({ extended: true }));

server.all("*", function(req,res,next) {
	res.json({
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
	});
});

export const handler = serverless(server);
