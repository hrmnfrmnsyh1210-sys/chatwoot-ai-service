const { OpenAI } = require("openai");
const axios = require("axios");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://ai.sumopod.com/v1",
});

module.exports = async (req, res) => {
  // Hanya terima metode POST
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const data = req.body;

  // Filter: Hanya balas jika ada pesan masuk dari customer
  if (data.event === "message_created" && data.message_type === "incoming") {
    const conversationId = data.conversation.id;
    const accountId = data.account.id;
    const userMessage = data.content;

    try {
      // 1. Tanya AI
      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: userMessage }],
      });

      const replyText = aiResponse.choices[0].message.content;

      // 2. Balas ke Chatwoot
      await axios.post(
        `${process.env.CHATWOOT_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
        { content: replyText, message_type: "outgoing" },
        { headers: { api_access_token: process.env.CHATWOOT_TOKEN } },
      );
    } catch (error) {
      console.error(
        "Error:",
        error.response ? error.response.data : error.message,
      );
    }
  }

  return res.status(200).json({ status: "success" });
};
