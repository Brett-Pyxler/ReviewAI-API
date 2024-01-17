import { GoogleGenerativeAI } from "@google/generative-ai";
import { HarmBlockThreshold, HarmCategory } from "@google/generative-ai";

let genAI, model;

async function aiGeminiTest() {
  try {
    genAI ??= new GoogleGenerativeAI(process.env.GOOGLEGEMINI_KEY);

    model ??= genAI.getGenerativeModel({
      model: "gemini-pro"
      // model: "gemini-pro-vision",
      // safetySettings: [
      //   {category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,},
      //   {category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,},
      //   {category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,},
      //   {category: HarmCategory.HARM_CATEGORY_HARASSMENT,threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,},
      // ],
    });

    let prompt =
      req.query?.prompt ||
      req.body?.prompt ||
      "Does this look store-bought or homemade?";

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    res.json({
      prompt,
      text
    });
  } catch (err) {
    res.json({ message: String(err) });
  }
}

export {
  //
  aiGeminiTest
};
