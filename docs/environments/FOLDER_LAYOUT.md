# Environment folder layout

**Parent directory layout (e.g. `~/Downloads`):**

```
Develop/
  Willsone/     ← this repo — active development
Testing/        ← full copy for QA / staging
production/     ← empty placeholder (README only)
```

## Develop / Willsone

- **Purpose:** Day-to-day development (this is the main git repo).
- **Run locally:** `npm install && npm run dev`
- **Env:** `.env` with dev/staging keys; `NEXT_PUBLIC_APP_URL=http://localhost:3000`
- **Deploy:** Connect to a Vercel **preview** or `dev` project.

## Testing

- **Purpose:** Same codebase as Develop, used for QA, UAT, and staging deploys without touching Develop’s working tree.
- **Setup after copy:**
  1. `cd Testing && npm install`
  2. Create `.env` with **Testing** Supabase, Cloudinary folder/prefix, and Resend test domain
  3. Point `NEXT_PUBLIC_APP_URL` to your staging URL
  4. Optional: separate git remote or branch policy for staging releases

**Do not** point Testing at production Supabase or production Resend from-email.

## production

- **Purpose:** Reserved for production deployment workflow (clone, release tags, or CI output). Folder starts **empty**.
- **Typical use:** When ready for go-live, either:
  - Deploy **Develop/Willsone** (or `main` branch) directly to Vercel Production, **or**
  - Copy/tag a release into `production/` as part of your release process.

Production secrets live only in Vercel **Production** environment variables and the production Supabase project — not in committed `.env` files.

## Renaming history

The project was previously named `willsfarms-website-codebase-with-leads-inbox`. It is now **`Willsone`** under **`Develop`**.

## Monthly infrastructure costs

See [`docs/INFRASTRUCTURE_AND_MONTHLY_COSTS.md`](../INFRASTRUCTURE_AND_MONTHLY_COSTS.md) for Vercel, Supabase, Cloudinary, Resend, Anthropic, and related monthly estimates.
