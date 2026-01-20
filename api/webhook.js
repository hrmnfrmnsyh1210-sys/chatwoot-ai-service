const { OpenAI } = require("openai");
const axios = require("axios");

// Konfigurasi axios dengan retry dan headers yang aman dari Cloudflare
const axiosInstance = axios.create({
  timeout: 30000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
    Connection: "keep-alive",
  },
});

// Retry logic untuk mengatasi rate limiting
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;

    if (!config || !config.retry) {
      config.retry = 0;
    }

    config.retry += 1;

    // Retry maksimal 3 kali dengan delay exponential
    if (
      config.retry <= 3 &&
      (error.response?.status === 429 || error.code === "ECONNABORTED")
    ) {
      const delayMs = Math.pow(2, config.retry - 1) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return axiosInstance(config);
    }

    return Promise.reject(error);
  },
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://ai.sumopod.com/v1",
});

module.exports = async (req, res) => {
  // Set CORS headers yang aman
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Hanya terima metode POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Validasi input
  if (!req.body) {
    return res.status(400).json({ error: "Request body is required" });
  }

  const data = req.body;

  // Filter: Hanya balas jika ada pesan masuk dari customer
  if (data.event === "message_created" && data.message_type === "incoming") {
    const conversationId = data.conversation?.id;
    const accountId = data.account?.id;
    const userMessage = data.content;

    // Validasi data
    if (!conversationId || !accountId || !userMessage) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      // 1. Tanya AI dengan timeout
      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: userMessage }],
      });

      const replyText = aiResponse.choices[0].message.content;

      // 2. Balas ke Chatwoot dengan headers aman
      await axiosInstance.post(
        `${process.env.CHATWOOT_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
        { content: replyText, message_type: "outgoing" },
        {
          headers: {
            api_access_token: process.env.CHATWOOT_TOKEN,
            "Content-Type": "application/json",
          },
        },
      );

      console.log(
        `✓ Message processed successfully for conversation ${conversationId}`,
      );
    } catch (error) {
      console.error(
        "Error:",
        error.response ? error.response.data : error.message,
      );
      // Jangan throw error, tetap return 200 agar webhook tidak di-retry
    }
  }

  return res.status(200).json({ status: "success" });
};
