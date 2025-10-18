# extract-equatorialRender-vFINAL2

Servidor Node.js para extração de faturas Equatorial Goiás com GPT-5 e fallback GPT-4-turbo.

## Endpoints
- **GET /health**
- **GET /logs**
- **POST /extract-structured** → campo `fatura` (PDF)

## Deploy
1. Suba tudo no GitHub.
2. Conecte no Render.
3. Configure `OPENAI_API_KEY`.
4. Deploy.