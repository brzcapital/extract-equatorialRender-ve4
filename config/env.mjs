// env.mjs for Render deployment
export const PORT = process.env.PORT || 10000;
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
export const MODELOS = ['gpt-4o-2024-08-06', 'gpt-5-2025-08-07'];
export const MAX_OUTPUT_TOKENS = 2000;
export const SCHEMA_NAME = 'extrator_equatorial';
export const LOG_FILE = 'logs.json';

