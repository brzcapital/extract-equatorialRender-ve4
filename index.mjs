import express from "express";
import multer from "multer";
import fs from "fs";
import morgan from "morgan";
import path from "path";
import fetch from "node-fetch";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { fileURLToPath } from "url";
import { PORT, OPENAI_API_KEY, MODELOS, LOG_FILE } from "./config/env.mjs";

// === configuração base ===
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const upload = multer({ dest: "uploads/" });
app.use(express.json());
app.use(morgan("dev"));

// === utilitário: extrair texto do PDF ===
async function extrairTextoPDF(buffer) {
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let texto = "";
  const numPaginas = Math.min(pdf.numPages, 1); // lê só a 1ª página
  for (let i = 1; i <= numPaginas; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    texto += content.items.map((it) => it.str).join(" ") + "\n";
  }
  return texto.trim();
}

// === utilitário: gerar log local ===
function registrarLog(tipo, data) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    tipo,
    ...data
  };
  let logs = [];
  if (fs.existsSync(LOG_FILE)) {
    logs = JSON.parse(fs.readFileSync(LOG_FILE, "utf8") || "[]");
  }
  logs.push(logEntry);
  fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
}

// === health check ===
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    versao: "vE4-full",
    models: MODELOS,
    data: new Date().toISOString()
  });
});

// === rota principal de extração ===
app.post("/extract-structured", upload.single("fatura"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Arquivo PDF ausente." });
    }

    const buffer = fs.readFileSync(req.file.path);
    const texto = await extrairTextoPDF(buffer);

    // chamada GPT opcional
    const prompt = `
Você é um extrator de dados de faturas Equatorial Goiás.
Retorne JSON com os campos estruturados principais:
unidade_consumidora, total_a_pagar, data_vencimento,
uc_geradora, ciclo_geracao, saldo_kwh, beneficio_tarifario_liquido,
observacoes, informacoes_para_o_cliente.
Texto base:
${texto}
    `.trim();

    const modeloPrimario = MODELOS[1]; // gpt-5
    const modeloBackup = MODELOS[0]; // gpt-4o

    let respostaGPT;
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: modeloPrimario,
          input: [{ role: "user", content: prompt }],
          text: { format: { type: "json_object" } }
        })
      });
      respostaGPT = await response.json();
      if (!respostaGPT.output_text) throw new Error("Falha GPT primário");
    } catch (err) {
      const fallback = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: modeloBackup,
          input: [{ role: "user", content: prompt }],
          text: { format: { type: "json_object" } }
        })
      });
      respostaGPT = await fallback.json();
    }

    registrarLog("extracao", {
      arquivo: req.file.originalname,
      modelo: respostaGPT.model || modeloPrimario,
      sucesso: !!respostaGPT.output_text
    });

    res.json({
      status: "ok",
      nome: req.file.originalname,
      extracao: respostaGPT.output_text || "Sem retorno válido"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Falha ao processar a fatura." });
  }
});

// === logs ===
app.get("/logs", (req, res) => {
  try {
    if (!fs.existsSync(LOG_FILE)) {
      return res.status(404).json({ error: "Nenhum log encontrado." });
    }
    const logs = JSON.parse(fs.readFileSync(LOG_FILE, "utf8") || "[]");
    res.json({ total: logs.length, logs });
  } catch (err) {
    res.status(500).json({ error: "Erro ao ler logs." });
  }
});

// === inicialização ===
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

