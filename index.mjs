import express from "express";
import multer from "multer";
import fs from "fs";
import crypto from "crypto";
import path from "path";
import fetch from "node-fetch";
import { config } from "./config/env.mjs";

const app = express();
const PORT = process.env.PORT || 10000;
const upload = multer({ dest: "uploads/" });

// Função hash
function gerarHashPDF(caminho) {
  const data = fs.readFileSync(caminho);
  return crypto.createHash("sha256").update(data).digest("hex");
}

// Health
app.get("/health", (req, res) => res.json({ ok: true, versao: "vFINAL2" }));

// Logs
app.get("/logs", (req, res) => {
  const logPath = path.join("logs", "eventos.log");
  if (!fs.existsSync(logPath)) return res.status(404).json({ error: "Nenhum log encontrado." });
  res.type("text/plain").send(fs.readFileSync(logPath, "utf8"));
});

// Extração principal
app.post("/extract-structured", upload.single("fatura"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Arquivo PDF ausente." });

  const caminho = req.file.path;
  const hash_pdf = gerarHashPDF(caminho);

  try {
    const pdfData = fs.readFileSync(caminho).toString("base64");
    const body = {
      model: config.model_primary,
      input: [
        { role: "system", content: "Você é um extrator de dados de faturas Equatorial Goiás. Retorne JSON estruturado e confiável." },
        { role: "user", content: [{ type: "input_text", text: "Extraia todos os campos relevantes desta fatura:" }, { type: "input_file", data: pdfData }] }
      ],
      text: {
        format: {
          name: "extrator_equatorial",
          schema: {
            type: "object",
            properties: {
              unidade_consumidora: { type: "string" },
              total_a_pagar: { type: "number" },
              data_vencimento: { type: "string" },
              hash_pdf: { type: "string" },
              health_extracao: { type: "string" },
              tokens_gpt: { type: "number" },
              tokens_mes: { type: "number" }
            },
            required: ["unidade_consumidora", "total_a_pagar", "data_vencimento"]
          }
        }
      }
    };

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.api_key}`
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    if (!data?.output_text) throw new Error("GPT não retornou conteúdo válido.");

    const resultado = JSON.parse(data.output_text);
    resultado.hash_pdf = hash_pdf;
    resultado.health_extracao = "ok";
    resultado.tokens_gpt = data.usage?.total_tokens || 0;
    resultado.tokens_mes = data.usage?.prompt_tokens || 0;

    fs.appendFileSync("logs/eventos.log", `[OK] ${new Date().toISOString()} - ${hash_pdf}\n`);
    res.json(resultado);
  } catch (err) {
    fs.appendFileSync("logs/eventos.log", `[ERRO] ${new Date().toISOString()} - ${err.message}\n`);
    res.status(500).json({ error: "Falha ao processar a fatura." });
  }
});

app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));