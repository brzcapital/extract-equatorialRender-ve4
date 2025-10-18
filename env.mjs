// Carrega variáveis de ambiente do Render
export const PORT = process.env.PORT || 10000;

// Chave da OpenAI via var. de ambiente (NÃO comitar)
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

// Ordem de modelos: tenta gpt-4o, cai para gpt-5
export const MODELOS = ["gpt-4o-2024-08-06", "gpt-5-2025-08-07"];

// Limites de saída do Responses API
export const MAX_OUTPUT_TOKENS = 2000;

// Nome do schema no Responses API
export const SCHEMA_NAME = "extrator_equatorial";

// Arquivo de logs (persistido no disco do container durante o ciclo)
export const LOG_FILE = "logs.json";
