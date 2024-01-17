import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";

const generationConfig = {
  temperature: 0.9,
  topK: 1,
  topP: 1,
  maxOutputTokens: 2048
  // maxOutputTokens: 100,
};

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
  }
];

let genAI, model;

async function aiGeminiTest(req, res, next) {
  try {
    genAI ??= new GoogleGenerativeAI(process.env.GOOGLEGEMINI_KEY);

    model ??= genAI.getGenerativeModel({
      // model: "gemini-pro-vision",
      model: "gemini-pro",
      safetySettings
    });

    let prompt = req.query?.prompt || req.body?.prompt || "Does this look store-bought or homemade?";

    let result, text, image, chat;

    let mode = req.query?.mode || req.body?.mode || "text";

    // text:
    if (mode == "text") {
      result = await model.generateContent(prompt);
      text = result.response.text();
    }

    // image:
    if (mode == "image") {
      image = {
        inlineData: {
          data: Buffer.from(fs.readFileSync("cookie.png")).toString("base64"),
          mimeType: "image/png"
        }
      };
      result = await model.generateContent([prompt, image]);
      text = result.response.text();
    }

    // alt:
    if (mode == "alt") {
      // result = await model.generateContent({
      //   contents: [
      //     {
      //       role: "user",
      //       ports: [{ text: "What color is red?" }]
      //     },
      //     {
      //       role: "user",
      //       ports: [{ text: "What color is blue?" }]
      //     },
      //     {
      //       role: "user",
      //       ports: [{ text: prompt }]
      //     }
      //   ],
      //   generationConfig,
      //   safetySettings
      // });

      chat = model.startChat({
        history: [
          {
            role: "user",
            parts: "Hello, I have 2 dogs in my house."
          },
          {
            role: "model",
            parts: "Great to meet you. What would you like to know?"
          }
        ]
        // ,generationConfig
      });

      result = await chat.sendMessage(prompt);
      text = result.response.text();
    }

    //
    res.json({
      prompt,
      text,
      result
      // note: chat._apiKey is exposed
      // chat
    });
  } catch (err) {
    res.json({ message: String(err) });
  }
}

export {
  //
  aiGeminiTest
};

/*
 {"prompt": "How many paws are in my house?",
  "text": "If you have two dogs in your house, and each dog has four paws, then you have a total of **eight paws** in your house.\n\n```\nNumber of dogs = 2\nNumber of paws per dog = 4\nTotal number of paws = 2 dogs * 4 paws/dog = 8 paws\n```\n\nFun fact: Dogs are often referred to as \"four-legged friends\" because of the four paws that help them walk, run, and play.",
  "result": {
    "response": {
      "candidates": [{
          "index": 0,
          "finishReason": "STOP",
          "content": {"parts": [{
            "role": "model"
            "text": "If you have two dogs in your house, and each dog has four paws, then you have a total of **eight paws** in your house.\n\n```\nNumber of dogs = 2\nNumber of paws per dog = 4\nTotal number of paws = 2 dogs * 4 paws/dog = 8 paws\n```\n\nFun fact: Dogs are often referred to as \"four-legged friends\" because of the four paws that help them walk, run, and play."}],
          },
          "safetyRatings": [ .. ]}],
      "promptFeedback": { "safetyRatings": [ .. ] }
    }
  },
  "chat": {
    "model": "gemini-pro",
    "params": {
      "history": [
        {"role": "user","parts": "Hello, I have 2 dogs in my house."},
        {"role": "model","parts": "Great to meet you. What would you like to know?"}]},
    "_history": [
      {"role": "user","parts": [{
        "text": "Hello, I have 2 dogs in my house."}]},
      {"role": "model","parts": [{
        "text": "Great to meet you. What would you like to know?"}]},
      {"role": "user","parts": [{
        "text": "How many paws are in my house?"}]},
      {"role": "model","parts": [{
        "text": "If you have two dogs in your house, and each dog has four paws, then you have a total of **eight paws** in your house.\n\n```\nNumber of dogs = 2\nNumber of paws per dog = 4\nTotal number of paws = 2 dogs * 4 paws/dog = 8 paws\n```\n\nFun fact: Dogs are often referred to as \"four-legged friends\" because of the four paws that help them walk, run, and play."}]}
    ],
    "_apiKey": ".."}}
*/
