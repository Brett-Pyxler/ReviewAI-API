import OpenAI from "openai";

// Promise.all(docs.map((doc) => doc.openaiCheck()))
// .then((e) => console.log(".then", e))
// .catch((e) => console.log(".catch", e));
// // .catch RateLimitError: 429 You've exceeded the 60 request/min rate limit, please slow down and try again.

// try { .. } catch (err) {
//   if (err instanceof OpenAI.RateLimitError) { .. }
// }

let openai;

async function oaiListAssistants() {
  openai ??= new OpenAI({ apiKey: process.env.OPENAI_KEY });
  return await openai.beta.assistants.list({ order: "desc", limit: "20" });
  // .data: [{id, name, description, model, ..}]
}

async function oaiFindAssistant(name) {
  openai ??= new OpenAI({ apiKey: process.env.OPENAI_KEY });
  const myAssistants = await openai.beta.assistants.list({ order: "desc", limit: "20" });
  return myAssistants.data.filter((x) => x.name == name)?.[0]?.id;
}

async function oaiCreateAndRun(textContent, assistantId, metadata = {}) {
  openai ??= new OpenAI({ apiKey: process.env.OPENAI_KEY });
  assistantId ??= await oaiFindAssistant("Review Analyzer");
  // ^ "asst_tH[..]Z"
  const threadObject = await openai.beta.threads.createAndRun({
    assistant_id: assistantId,
    thread: { messages: [{ role: "user", content: textContent }] }
  });
  const threadId = threadObject?.thread_id;
  // ^ "thread_ed[..]O"
  return { assistantId, threadId, threadObject };
}

async function oaiThreadRetrieve(threadId, limit = 1) {
  openai ??= new OpenAI({ apiKey: process.env.OPENAI_KEY });
  const threadMessages = await openai.beta.threads.messages.list(threadId, { order: "desc", limit });
  // ^ .data: [{"id":"msg_UQ[..]m","object":"thread.message","created_at":..,"thread_id":"thread_ed[..]O",
  //     "role":"user","content":[{"type":"text","text":{"value":"The product smells strange.","annotations":[]}}],
  //     "file_ids":[],"assistant_id":null,"run_id":null,"metadata":{}}]
  // ^ .data: [{"id":"msg_UQ[..]m","object":"thread.message","created_at":..,"thread_id":"thread_ed[..]O",
  //     "role":"assistant","content":[{"type":"text","text":{"value":"FALSE","annotations":[]}}],
  //     "file_ids":[],"assistant_id":"asst_tH[..]Z","run_id":"run_Vg[..]Y","metadata":{}}]
  const responseObject = threadMessages.data.find((x) => x.role == "assistant");
  const textContent = responseObject?.content?.[0]?.text?.value;
  return { threadMessages, responseObject, textContent };
}

export { oaiFindAssistant, oaiListAssistants, oaiCreateAndRun, oaiThreadRetrieve };
