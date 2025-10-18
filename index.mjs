import fs from "fs";
import path from "path";
import crypto from "crypto";
import express from "express";
import multer from "multer";
import morgan from "morgan";
import fetch from "node-fetch";
let pdfParse;
(async () => {
  const mod = await import("pdf-parse");
  pdfParse = mod.default || mod;
})();
import {
  PORT,
  OPENAI_API_KEY,
  MODELOS,
  MAX_OUTPUT_TOKENS,
  SCHEMA_NAME,
  LOG_FILE
} from "./config/env.mjs";

// -----------------------------
// Utils
// -----------------------------
const app = express();
app.use(express.json({ limit: "20mb" }));
app.use(morgan("tiny"));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 } // 20 MB
});

// Estado em memória
let TOKEN_ACUM_MES = 0;

// Log simples em arquivo
function appendLog(entry) {
  try {
    const linha = JSON.stringify({ ts: new Date().toISOString(), ...entry });
    fs.appendFileSync(LOG_FILE, linha + "\n", "utf-8");
    // atualiza acumulado se houver usage
    if (entry?.usage?.total_tokens) TOKEN_ACUM_MES += entry.usage.total_tokens;
  } catch (e) {
    // ignora erro de log para não quebrar a request
  }
}

// Normalizações
function onlyDigits(str) {
  if (!str) return null;
  const d = String(str).replace(/\D+/g, "");
  return d.length ? d : null;
}
function toYesNo(val) {
  if (typeof val === "boolean") return val ? "yes" : "no";
  if (val == null) return "no";
  const s = String(val).toLowerCase();
  return /^(true|yes|sim|y)$/i.test(s) ? "yes" : "no";
}
function fixNumber(n) {
  if (n == null || n === "") return null;
  if (typeof n === "number") return n;
  const s = String(n).trim().replace(/\./g, "").replace(",", ".");
  const f = parseFloat(s);
  return Number.isFinite(f) ? f : null;
}
function ddmmyyyy(str) {
  // mantemos como string dd/mm/aaaa; se vier em outro formato, retorna null
  if (!str) return null;
  const m = String(str).match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  return m ? `${m[1]}/${m[2]}/${m[3]}` : null;
}
function monthRef(str) {
  // aceita "SET/2025" ou "SET/25"; normaliza para SET/2025 quando possível
  if (!str) return null;
  const m = String(str).match(/^([A-Z]{3})\/(\d{2}|\d{4})$/i);
  if (!m) return str;
  let ano = m[2];
  if (ano.length === 2) {
    const yy = parseInt(ano, 10);
    ano = (yy < 50 ? 2000 + yy : 1900 + yy).toString();
  }
  return `${m[1].toUpperCase()}/${ano}`;
}
function positiveOrNull(n) {
  const f = fixNumber(n);
  return f == null ? null : Math.abs(f);
}

// Hash do PDF
function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// -----------------------------
// JSON Schema rígido
// -----------------------------
const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    unidade_consumidora: { type: "string" },
    total_a_pagar: { type: "number" },
    data_vencimento: { type: "string" },
    data_leitura_anterior: { type: "string" },
    data_leitura_atual: { type: "string" },
    data_proxima_leitura: { type: "string" },
    data_emissao: { type: "string" },
    apresentacao: { type: "string" },
    mes_ano_referencia: { type: "string" },
    leitura_anterior: { type: "number" },
    leitura_atual: { type: "number" },
    beneficio_tarifario_bruto: { type: ["number", "null"] },
    beneficio_tarifario_liquido: { type: ["number", "null"] },
    icms: { type: ["number", "null"] },
    pis_pasep: { type: ["number", "null"] },
    cofins: { type: ["number", "null"] },
    fatura_debito_automatico: { type: "string", enum: ["yes", "no"] },
    credito_recebido: { type: ["number", "null"] },
    saldo_kwh: { type: ["number", "null"] },
    excedente_recebido: { type: ["number", "null"] },
    ciclo_geracao: { type: ["string", "null"] },
    informacoes_para_o_cliente: { type: ["string", "null"] },
    uc_geradora: { type: ["string", "null"] },
    uc_geradora_producao: { type: ["number", "null"] },
    cadastro_rateio_geracao_uc: { type: ["string", "null"] },
    cadastro_rateio_geracao_percentual: { type: ["number", "null"] },
    injecoes_scee: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          uc: { type: "string" },
          quant_kwh: { type: "number" },
          preco_unit_com_tributos: { type: "number" },
          tarifa_unitaria: { type: "number" }
        },
        required: ["uc", "quant_kwh", "preco_unit_com_tributos", "tarifa_unitaria"]
      }
    },
    consumo_scee_quant: { type: ["number", "null"] },
    consumo_scee_preco_unit_com_tributos: { type: ["number", "null"] },
    consumo_scee_tarifa_unitaria: { type: ["number", "null"] },
    media: { type: ["number", "null"] },
    parc_injet_s_desc_percentual: { type: ["number", "null"] },
    observacoes: { type: "string" },
    hash_pdf: { type: "string" },
    health: { type: "string" },
    tokens_ultima_execucao: { type: "number" },
    tokens_acumulado_mes: { type: "number" }
  },
  required: [
    "unidade_consumidora","total_a_pagar","data_vencimento","data_leitura_anterior",
    "data_leitura_atual","data_proxima_leitura","data_emissao","apresentacao",
    "mes_ano_referencia","leitura_anterior","leitura_atual",
    "beneficio_tarifario_bruto","beneficio_tarifario_liquido",
    "icms","pis_pasep","cofins",
    "fatura_debito_automatico","credito_recebido","saldo_kwh","excedente_recebido",
    "ciclo_geracao","informacoes_para_o_cliente",
    "uc_geradora","uc_geradora_producao","cadastro_rateio_geracao_uc","cadastro_rateio_geracao_percentual",
    "injecoes_scee","consumo_scee_quant","consumo_scee_preco_unit_com_tributos","consumo_scee_tarifa_unitaria",
    "media","parc_injet_s_desc_percentual","observacoes",
    "hash_pdf","health","tokens_ultima_execucao","tokens_acumulado_mes"
  ]
};

// -----------------------------
// Prompt “duro” com regras
// -----------------------------
const SYSTEM_PROMPT = `
Você é um extrator de dados de faturas Equatorial (primeira página). 
NUNCA invente valores. Se um campo não estiver explícito, retorne null.

REGRAS CHAVE (aplicar estritamente):
- "unidade_consumidora": somente dígitos (campo "Unidade Consumidora").
- Datas (dd/mm/aaaa):
  • "data_leitura_anterior", "data_leitura_atual", "data_proxima_leitura":
    busque EXATAMENTE na tabela "Data de Leituras"; pegue a terceira data como "data_proxima_leitura".
  • "apresentacao": valor da seção/tabela "Apresentação" (fica na parte inferior); não use outras datas.
- "mes_ano_referencia": textual como "SET/2025" (não converter para número).
- "beneficio_tarifario_liquido": se existir, é SEMPRE negativo (ex.: -324,33). Se não constar, null.
- "informacoes_para_o_cliente": trazer o texto INTEGRAL da seção "INFORMAÇÕES PARA O CLIENTE".
- "fatura_debito_automatico": "yes" se constar débito automático na fatura, senão "no".
- "uc_geradora" e "uc_geradora_producao": da linha "INFORMAÇÕES DO SCEE: GERAÇÃO DO CICLO".
  • UC = número logo após "GERAÇÃO DO CICLO".
  • Produção = valor após os dois pontos.
- "excedente_recebido": valor exibido logo após a UC geradora na mesma linha da geração do ciclo, se houver.
- "injecoes_scee": listar TODAS as injeções (UCs e quantidades), cada item com:
  • "uc" (somente dígitos),
  • "quant_kwh" (positivo),
  • "preco_unit_com_tributos" e "tarifa_unitaria":
     → garantir que "preco_unit_com_tributos" >= "tarifa_unitaria" quando ambos existirem.
- "consumo_scee_*": da tabela "CONSUMO SCEE":
  • "consumo_scee_quant": quantidade (kWh).
  • "consumo_scee_preco_unit_com_tributos": Preço Unitário COM tributos (ex.: 0,643844).
  • "consumo_scee_tarifa_unitaria": Preço Unitário SEM tributos (ex.: 0,498120).
  • Regra: preço com tributos >= sem tributos.
- "media": valor da coluna "MÉDIA" na tabela "CONSUMO kWh" (não confundir com "consumo_scee_quant").
- "parc_injet_s_desc_percentual": percentual exibido na linha "Parc. Injet s/ desc. GD II" (apenas número).
- "observacoes": único campo livre. Use só se houver algo pertinente; caso contrário, "" (string vazia).

Retorne SEMPRE todos os campos do schema (com null onde não houver).
Formatação decimal ponto (ex.: 14181.00 → 14181). Nada de separadores com vírgula.
`;

// -----------------------------
// Chamada Responses API (com fallback)
// -----------------------------
async function chamarOpenAI(model, texto, hash) {
  const body = {
    model,
    input: [
      {
        role: "system",
        content: [{ type: "text", text: SYSTEM_PROMPT }]
      },
      {
        role: "user",
        content: [{ type: "text", text: texto }]
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: SCHEMA_NAME,
        schema
      },
      verbosity: "medium"
    },
    max_output_tokens: MAX_OUTPUT_TOKENS
  };

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    throw new Error(`OpenAI ${model} falhou: ${resp.status} ${err}`);
  }

  const data = await resp.json();
  // O output vem em data.output[0].content[0].text ou data.output_text (dependendo do cliente).
  let textoJSON = null;

  // Tenta formatos comuns:
  try {
    // formato consolidado (alguns SDKs expõem output_text)
    if (data.output && Array.isArray(data.output) &&
        data.output[0]?.content?.[0]?.type === "output_text") {
      textoJSON = data.output[0].content[0].text;
    } else if (data.output_text) {
      textoJSON = data.output_text;
    }
  } catch {
    // ignora
  }

  if (!textoJSON || typeof textoJSON !== "string") {
    throw new Error("GPT não retornou conteúdo válido.");
  }

  let parsed;
  try {
    parsed = JSON.parse(textoJSON);
  } catch (e) {
    throw new Error("JSON inválido retornado pelo GPT.");
  }

  // pós-regra: normalizações mínimas
  parsed.unidade_consumidora = onlyDigits(parsed.unidade_consumidora);
  parsed.fatura_debito_automatico = toYesNo(parsed.fatura_debito_automatico);
  parsed.data_vencimento = ddmmyyyy(parsed.data_vencimento);
  parsed.data_leitura_anterior = ddmmyyyy(parsed.data_leitura_anterior);
  parsed.data_leitura_atual = ddmmyyyy(parsed.data_leitura_atual);
  parsed.data_proxima_leitura = ddmmyyyy(parsed.data_proxima_leitura);
  parsed.data_emissao = ddmmyyyy(parsed.data_emissao);
  parsed.apresentacao = ddmmyyyy(parsed.apresentacao);
  parsed.mes_ano_referencia = monthRef(parsed.mes_ano_referencia);

  // Consistência consumo vs tarifas
  if (parsed.consumo_scee_preco_unit_com_tributos != null &&
      parsed.consumo_scee_tarifa_unitaria != null) {
    const com = fixNumber(parsed.consumo_scee_preco_unit_com_tributos);
    const sem = fixNumber(parsed.consumo_scee_tarifa_unitaria);
    if (com != null && sem != null && com < sem) {
      // troca se vier invertido; se também não fizer sentido, zera sem tributos
      parsed.consumo_scee_preco_unit_com_tributos = sem;
      parsed.consumo_scee_tarifa_unitaria = com >= 0 && com <= 2 ? com : null;
    }
  }

  // injecoes: garante números positivos e relação com/sem tributos
  if (Array.isArray(parsed.injecoes_scee)) {
    parsed.injecoes_scee = parsed.injecoes_scee.map(it => {
      const out = { ...it };
      out.uc = onlyDigits(out.uc);
      out.quant_kwh = positiveOrNull(out.quant_kwh);
      const com = fixNumber(out.preco_unit_com_tributos);
      const sem = fixNumber(out.tarifa_unitaria);
      if (com != null && sem != null && com < sem) {
        out.preco_unit_com_tributos = sem;
        out.tarifa_unitaria = (com >= 0 && com <= 2) ? com : null;
      } else {
        out.preco_unit_com_tributos = com;
        out.tarifa_unitaria = sem;
      }
      return out;
    });
  }

  // benefício líquido sempre negativo se existir
  if (parsed.beneficio_tarifario_liquido != null) {
    const bl = fixNumber(parsed.beneficio_tarifario_liquido);
    parsed.beneficio_tarifario_liquido = bl == null ? null : -Math.abs(bl);
  }

  // anexa hash e health
  parsed.hash_pdf = hash;
  parsed.health = "ok";

  // tokens (best effort; alguns clientes devolvem usage diferente)
  const usage = data.usage || {};
  const totalTokens = Number(usage.total_tokens || usage.output_tokens || 0);
  parsed.tokens_ultima_execucao = totalTokens;
  TOKEN_ACUM_MES += totalTokens;
  parsed.tokens_acumulado_mes = TOKEN_ACUM_MES;

  appendLog({
    evento: "openai_response",
    model: model,
    usage: { ...usage, total_tokens: totalTokens },
    hash_pdf: hash
  });

  return parsed;
}

async function extrairComFallback(texto, hash) {
  let ultimoErro = null;
  for (const model of MODELOS) {
    try {
      return await chamarOpenAI(model, texto, hash);
    } catch (e) {
      ultimoErro = e;
      appendLog({ evento: "modelo_falhou", model, erro: String(e) });
      // tenta próximo
    }
  }
  throw ultimoErro || new Error("Falha ao extrair com todos os modelos.");
}

// -----------------------------
// Rotas
// -----------------------------
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    versao: "vE4-full",
    models: MODELOS
  });
});

app.get("/logs", (req, res) => {
  try {
    if (!fs.existsSync(LOG_FILE)) return res.status(404).json({ error: "Nenhum log encontrado." });
    const linhas = fs.readFileSync(LOG_FILE, "utf-8").trim().split("\n").filter(Boolean);
    if (!linhas.length) return res.status(404).json({ error: "Nenhum log encontrado." });
    const ultimas = linhas.slice(-200).map(l => JSON.parse(l));
    res.json({ count: ultimas.length, data: ultimas });
  } catch {
    res.status(500).json({ error: "Falha ao ler logs." });
  }
});

// Upload da fatura (campo 'fatura') → extrai texto e chama GPT
app.post("/extract-structured", upload.single("fatura"), async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      return res.status(400).json({ error: "OPENAI_API_KEY ausente nas variáveis de ambiente." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Arquivo PDF ausente (campo 'fatura')." });
    }

    const pdfBuffer = req.file.buffer;
    const hash = sha256(pdfBuffer);

    // Extrai TODO o texto (os seus PDFs atuais já tem 1ª página única)
    const parsed = await pdfParse(pdfBuffer);
    let texto = parsed.text || "";
    if (!texto.trim()) {
      return res.status(400).json({ error: "Não foi possível extrair texto do PDF." });
    }

    // Chama OpenAI com fallback e aplica as regras
    const resultado = await extrairComFallback(texto, hash);

    // Guarda log final
    appendLog({
      evento: "extracao_ok",
      nome_arquivo: req.file.originalname,
      hash_pdf: hash,
      resumo_campos: {
        unidade_consumidora: resultado.unidade_consumidora,
        data_vencimento: resultado.data_vencimento,
        apresentacao: resultado.apresentacao,
        ciclo_geracao: resultado.ciclo_geracao
      }
    });

    res.json(resultado);
  } catch (e) {
    appendLog({ evento: "extracao_erro", erro: String(e) });
    res.status(500).json({ error: "Falha ao processar a fatura." });
  }
});

// -----------------------------
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
