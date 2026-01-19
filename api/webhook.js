const { OpenAI } = require("openai");
const axios = require("axios");

// Konfigurasi AI menggunakan variabel lingkungan
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://ai.sumopod.com/v1",
});

module.exports = async (req, res) => {
  // Hanya menerima metode POST dari Chatwoot
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const data = req.body;

  // Filter: Hanya proses jika ada pesan masuk dari customer
  if (data.event === "message_created" && data.message_type === "incoming") {
    const conversationId = data.conversation.id;
    const accountId = data.account.id;
    const userMessage = data.content;

    try {
      // 1. Mendapatkan respon dari AI
      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Kamu adalah asisten pintar yang ramah." },
          { role: "user", content: userMessage },
        ],
        max_tokens: 500,
      });

      const replyText = aiResponse.choices[0].message.content;

      // 2. Mengirim balik ke Chatwoot dengan Header tambahan untuk Cloudflare
      await axios.post(
        `${process.env.CHATWOOT_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
        {
          content: replyText,
          message_type: "outgoing",
        },
        {
          headers: {
            api_access_token: process.env.CHATWOOT_TOKEN,
            "Content-Type": "application/json",
            // User-Agent ini penting untuk mengelabui filter bot dasar pada Cloudflare
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        },
      );

      console.log(`Berhasil membalas pesan di percakapan: ${conversationId}`);
    } catch (error) {
      // Log detail error jika Cloudflare memblokir lagi
      if (error.response) {
        console.error(
          "Chatwoot API Error:",
          error.response.status,
          error.response.data,
        );
      } else {
        console.error("AI Error:", error.message);
      }
    }
  }

  // Selalu beri respon 200 ke Chatwoot agar webhook tidak dianggap gagal oleh mereka
  return res.status(200).json({ status: "received" });
};
