# Deploying to Vercel

The app still runs on Manus unchanged. On Vercel, the Manus-only pieces are swapped out:

| Manus feature | On Vercel |
| --- | --- |
| Manus OAuth login | Operator passcode login (already in the sidebar) |
| Forge file storage | Vercel Blob (`BLOB_READ_WRITE_TOKEN`) |
| Manus MySQL | Any MySQL-compatible database (`DATABASE_URL`) |

## 1. Create a MySQL database

Any MySQL-compatible host works. TiDB Cloud Serverless has a free tier:

1. Create a cluster at https://tidbcloud.com.
2. Create a database named `downtime`.
3. Copy the connection string and add the SSL option, for example:
   `mysql://USER:PASSWORD@HOST:4000/downtime?ssl={"rejectUnauthorized":true}`

## 2. Import the project in Vercel

1. In Vercel, choose **Add New → Project** and import `Tee02/downtime-report-automation`.
2. Set **Production Branch** to `v2-dev` (Settings → Git), or deploy the branch as a preview.
3. Leave the framework preset at **Other**. Build settings come from `vercel.json`.

## 3. Add storage

In the project, open **Storage → Create → Blob** and connect it. Vercel adds `BLOB_READ_WRITE_TOKEN` automatically.

## 4. Environment variables

| Name | Value |
| --- | --- |
| `DATABASE_URL` | Connection string from step 1 |
| `JWT_SECRET` | A long random string (signs login sessions) |
| `VITE_APP_ID` | Any non-empty value, e.g. `skyworlds-vercel` |

## 5. Deploy

Redeploy after adding the variables. Each build runs the database migrations first (`pnpm vercel-build`), so tables are created automatically.

## Known limits on Vercel

- Uploads larger than about 4.5 MB are rejected by Vercel before they reach the app.
- Files stored by Manus (including the sidebar logo at `/manus-storage/skyworldslogo_4b1f1436.jpg`) are not on Vercel. Upload them to the Blob store with the same file name to restore them.
- Blob files are stored with unguessable URLs but are not access-controlled.
