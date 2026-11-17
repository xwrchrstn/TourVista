# Deploy TourVista on Supabase and Vercel

Use a fresh Supabase project for the first hosted pilot. The app creates its tables in the private `tourvista` schema at startup. TourVista uses its own sign-in and roles, with sessions shared through PostgreSQL. The project uses Supabase for PostgreSQL. Listing photos and private ownership evidence are stored in the database and use the existing application access checks.

1. Open your Supabase project and choose **Connect → Transaction pooler**. Copy the PostgreSQL URI on port **6543**. Replace `[YOUR-PASSWORD]` with the project database password. Percent-encode password characters that have special meaning in a URL. [Supabase connection options](https://supabase.com/docs/guides/database/connecting-to-postgres)
2. Import **xwrchrstn/TourVista** in Vercel from GitHub. Use the repository root, Vite, and Node.js 24. The committed `vercel.json` sets the build command, output folder, and `/api` routing. [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)
3. In Vercel project settings, add the server-side variables below. Use the site's complete HTTPS address for `APP_URL`. If needed, deploy once to establish the domain, then set the variables and redeploy. Keep production and preview environments separate if you test with different data. [Vercel environment variables](https://vercel.com/docs/environment-variables)

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Supabase Transaction pooler URI with your project password |
| `APP_URL` | Your TourVista HTTPS origin, for example `https://your-project.vercel.app` |
| `MAIL_MODE` | `smtp` to enable registration, recovery, and notification emails |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | The Gmail sender address for TourVista |
| `SMTP_PASS` | The Google App Password for that sender |
| `MAIL_FROM` | TourVista display name and the sender address in angle brackets |
| `POSTGRES_CA_CERT` | Optional CA certificate from Supabase if your connection requires a custom CA |

4. After deploying, open `/api/health` on the hosted domain and confirm `status: ok` and `mode: postgres`. A fresh database starts with an empty catalog. To create the first administrator, put the Supabase URI in a private, Git-ignored `server/.env.hosted` file with the variable name `DATABASE_URL`. From the TourVista project folder, run:

   ```powershell
   node --env-file=server/.env.hosted server/admin-setup.mjs --postgres
   ```

   Enter the new admin password in the hidden terminal prompt.

5. Use the hosted HTTPS link on a phone to test verified tourist and host accounts, password reset, private ownership documents, approval, booking, directions, and check-in before bringing over any authorized data. Email links are generated from `APP_URL`. If `mailMode` is `smtp`, send a test registration or reset to a mailbox you control to verify actual delivery.

The laptop continues to use its own MySQL settings unless you give it a PostgreSQL connection. To back up the hosted PostgreSQL database from your computer, run `node --env-file=server/.env.hosted server/backup.mjs`. Browser backup operations are limited to 4 MiB on this deployment. Use the Supabase database tools for larger recovery jobs. [Vercel Functions limits](https://vercel.com/docs/functions/limitations#request-body-size)
