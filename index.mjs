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

    // Aqui você pode chamar a função real de extração (GPT)
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
