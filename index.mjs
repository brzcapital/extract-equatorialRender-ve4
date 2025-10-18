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
    // Aqui entraria o processo real de extração via GPT
    console.log(`📄 Fatura recebida: ${fileName}`);

    res.json({ status: "ok", nome: fileName });
  } catch (error) {
    console.error("Erro ao processar PDF:", error);
    res.status(500).json({ error: "Falha ao processar a fatura." });
  }
});

// ✅ Health check
app.get("/health", (req, res) => {
  res.json({ ok: true, versao: "vFINAL" });
});

// ✅ Logs (simples por enquanto)
app.get("/logs", (req, res) => {
  res.json({ logs: ["Servidor ativo",
