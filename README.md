# SCDAid Prototype

Standalone SCDAid prototype: four fictional VOC cases with predefined recommendations, plus Expert Insights feedback (Supabase).

This repository is **separate** from the original SCDAid product codebase.

## Local development

```bash
cp .env.example .env
# set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY only
npm install
npm run dev
```

Never put `SUPABASE_SERVICE_ROLE_KEY` or other server secrets in `.env`.

## Production (GitHub Pages)

- Vite base path: `/SCDAid-Hackathon-Prototype/`
- Public site: `https://masheljmil123-svg.github.io/SCDAid-Hackathon-Prototype/`
- Insights login: `https://masheljmil123-svg.github.io/SCDAid-Hackathon-Prototype/insights/login`

GitHub Actions injects only the publishable Supabase URL and anon key via repository **Variables** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).

## Demo notice

Recommendations are static demo outputs. No live clinical AI model is executed in this prototype.
