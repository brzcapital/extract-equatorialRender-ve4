import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { config } from "./config/env-config.mjs";

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

    // 🔧 Aqui entrará a integração real com GPT (extração de dados)
    res.json({
      status: "ok",
      nome: fileName,
      mensagem: "Arquivo recebido com sucesso.",
    });
  } catch (error) {
    console.error("❌ Erro ao processar PDF:", error);
    res.status(500).json({ error: "Falha ao processar a fatura." });
  }
});

// ✅ Health check
app.get("/health", (req, res) => {
  res.json({ ok: true, versao: "vFINAL2" });
});

// ✅ Logs simulados
app.get("/logs", (req, res) =>

