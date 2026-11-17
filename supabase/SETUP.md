# Expert Insights — Supabase setup

**Project:** SCDAid-Expert-Insights (`wllqjovzcbdxwiipalhd`)  
**Dashboard:** https://supabase.com/dashboard/project/wllqjovzcbdxwiipalhd

Automated so far:

- Dedicated project created (eu-central-1)
- Migration applied (`001_expert_insights.sql`) — tables, RLS, rate limits, immutability trigger
- Edge Function `submit-feedback` deployed (`verify_jwt = false`)
- Function secret `RATE_LIMIT_SALT` set (`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are platform-injected)
- Local `.env` written with **anon** credentials only (gitignored)
- Public submit smoke-tested successfully; anon REST select returns empty (RLS)

## Auth users

Temporary E2E test accounts were removed before public launch. Create production admin and supervisor users in **Authentication → Users**, then insert their UUIDs into `insights_profiles` (roles `admin` / `supervisor`). Public signup is disabled.

## Local frontend

```bash
npm run dev -- --host 127.0.0.1 --port 5174
```

- App: http://127.0.0.1:5174/  
- Insights login: http://127.0.0.1:5174/insights/login  

Never put `SUPABASE_SERVICE_ROLE_KEY` or `RATE_LIMIT_SALT` in Vite / `.env`.

## Verify after creating users

1. Open the prototype → **Expert Insights** → submit feedback  
2. Visit `/insights/login` as admin → change a status  
3. Sign in as supervisor → confirm status controls are unavailable and direct updates fail under RLS  
4. Confirm anon clients cannot read feedback rows (empty result under RLS)
