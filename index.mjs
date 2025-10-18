import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { config } from "./config/env-config.mjs";
import pkg from "openai";
const { OpenAI } = pkg;

const app = express();
const upload = multer({ dest: "uploads/" });

// ✅ Endpoint principal de extração
app.post("/extract-pdf", upload.single("fatura"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Arquivo PDF ausente." });
    }

    const fileName = req.file.originalname;
    console.log(`📄 Fatura recebida: ${fileName}`);

    // Aqui você pode chamar a função real de extração (GPT)
// 🚀 Importação dinâmica 100% compatível
const { OpenAI } = await import("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post("/extract-pdf", upload.single("fatura"), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ error: "Arquivo PDF ausente." });

    const filePath = path.join(process.cwd(), req.file.path);
    const fileData = fs.readFileSync(filePath);

    // Função para tentativa com fallback
    async function extractWithFallback() {
      try {
        // 🔹 Tentativa primária com GPT-4-Turbo
        return await openai.responses.create({
          model: "gpt-4-turbo",
          input: [
            {
              role: "system",
              content:
                "Você é um extrator especializado em faturas Equatorial Goiás. Leia o texto do PDF e retorne um JSON completo e consistente.",
            },
            {
              role: "user",
              content: fileData.toString("base64"),
            },
          ],
          modalities: ["text"],
          response_format: { type: "json_object" },
        });
      } catch (err) {
        console.warn("⚠️ GPT-4-Turbo falhou. Tentando fallback GPT-5...");
        // 🔹 Fallback automático
        return await openai.responses.create({
          model: "gpt-5",
          input: [
            {
              role: "system",
              content:
                "Você é um extrator avançado de faturas Equatorial Goiás. Gere um JSON completo com todos os campos.",
            },
            {
              role: "user",
              content: fileData.toString("base64"),
            },
          ],
          modalities: ["text"],
          response_format: { type: "json_object" },
        });
      }
    }

    const response = await extractWithFallback();
    const content = response.output?.[0]?.content?.[0]?.text || "{}";
    const parsed = JSON.parse(content);

    res.json({
      status: "ok",
      modelo_usado: response.model,
      dados_extraidos: parsed,
    });
  } catch (error) {
    console.error("❌ Erro na extração:", error);
    res.status(500).json({ error: "Falha ao processar a fatura." });
  }
});

 // ✅ Health check
app.get("/health", (req, res) => {
  res.json({ ok: true, versao: "vFINAL2" });
});

// ✅ Logs simulados
app.get("/logs", (req, res) => {
  try {
    const logsPath = path.join(process.cwd(), "server.log");
    if (fs.existsSync(logsPath)) {
      const logs = fs.readFileSync(logsPath, "utf-8");
      res.json({ logs: logs.split("\n").slice(-50) });
    } else {
      res.json({ error: "Nenhum log encontrado." });
    }
  } catch (e) {
    res.status(500).json({ error: "Erro ao ler logs." });
  }
});

// ✅ Listagem de rotas
app.get("/routes", (req, res) => {
  const routes = [];
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods),
      });
    }
  });
  res.json({ rotas: routes });
});

// ✅ Inicialização do servidor
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
