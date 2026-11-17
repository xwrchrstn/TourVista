# Deploy and update TourVista

Keep the `tourvista-complete` folder in VS Code. The hosted site runs the code you publish, and its MySQL database stores accounts, listings, photos, ownership evidence, and bookings. Owners edit campsite content from **My campsites**. Administrators decide listing submissions from **Listing approvals**. Use VS Code for changes to the design, logic, or algorithms.

This walkthrough uses a private GitHub repository and a Railway project with one app service and one MySQL service. Railway currently requires Pro or above for outbound SMTP, which TourVista uses for Gmail. Check with your school before choosing a paid plan. [Railway email networking](https://docs.railway.com/networking/outbound-networking)

## 1. Publish the source from VS Code

1. Open the `tourvista-complete` folder itself in VS Code. Its `package.json` should be at the top of the Explorer.
2. Open **Source Control**. If the folder has no repository, initialize it in this folder. Review the files before the first commit. The project ignores `.env` files with credentials, `storage` folders, installed dependencies, and generated builds. Keep backups and ownership documents outside Git.
3. Use **Publish to GitHub** and choose a **private** repository. Sign in using your own GitHub account. [VS Code GitHub publishing guide](https://code.visualstudio.com/docs/sourcecontrol/quickstart)

## 2. Create the hosted app and database

1. In Railway, create a project and add your GitHub repository as an app service. Use the repository root. Name the service **TourVista** and connect the branch you want to publish, usually `main`.
2. Add a separate **MySQL** service in the same project. Keep its connection private to the project. The examples below assume the database service is named `MySQL`. [Railway MySQL setup](https://docs.railway.com/guides/mysql)
3. In the **TourVista** service settings, use `npm run build` as the build command and `npm start` as the start command. Set the health check path to `/api/health`. Keep one app instance while sessions are stored in memory. [Railway build and start commands](https://docs.railway.com/builds/build-and-start-commands)
4. In the **TourVista** service’s networking settings, generate its HTTPS domain. Set `APP_URL` to the complete origin including `https://` and without `/#/home`. The generated domain is internet-facing. If the adviser requires restricted access, use the approved access controls before sharing or importing pilot records. [Railway public networking](https://docs.railway.com/networking/public-networking)

## 3. Enter the service variables

In **TourVista → Variables**, set these names. Enter the Railway references exactly as shown if the database service is named `MySQL`.

```text
DEMO_MODE=false
RAILPACK_NODE_VERSION=24
DB_HOST=${{MySQL.MYSQLHOST}}
DB_PORT=${{MySQL.MYSQLPORT}}
DB_USER=${{MySQL.MYSQLUSER}}
DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
DB_NAME=${{MySQL.MYSQLDATABASE}}
APP_URL=https://replace-with-your-app-domain
```

Railway supplies the app port. Apply the variables and deploy. Open the app URL followed by `/api/health` to check for `status: ok` and `mode: mysql`. The website should open at the same origin.

### Enable email before registration

Use a Gmail sender with a Google App Password. Enter its settings in **TourVista → Variables** on a plan that permits SMTP. The placeholders below show where each value belongs.

```text
MAIL_MODE=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-tourvista-gmail@gmail.com
SMTP_PASS=your-google-app-password
MAIL_FROM=TourVista <your-tourvista-gmail@gmail.com>
```

Enter the App Password without spaces. Deploy after saving, and verify that the links in a real registration and password-reset email open the hosted site. Your Windows terminal email setup configures the local copy. [Google App Passwords](https://support.google.com/accounts/answer/185833) · [Railway service variables](https://docs.railway.com/variables)

### Create the hosted administrator

Open an interactive shell for the **TourVista** app service with Railway SSH. In the service shell, run the following command and enter the administrator name, email, and password in the prompts.

```sh
npm run admin:setup -- --hosted
```

It creates the first administrator only. The hosted MySQL database starts empty. If you are transferring an authorized local backup into an empty pilot, use the same administrator email as the active admin in the backup. The restore replaces the target data and signs users out. Keep the backup private and sign back in with the credentials in the imported backup. [Railway SSH instructions](https://docs.railway.com/cli/ssh)

## 4. Edit after deployment

- **Code, layout, and algorithms.** Edit in VS Code. Test locally with `npm.cmd run dev`. Run `npm.cmd test` and `npm.cmd run build`, review the changes, then **Commit** and **Push** in Source Control. Railway deploys pushes to the connected branch when autodeploy is enabled. Check the deployment logs and open the same HTTPS address. [Railway GitHub autodeploy](https://docs.railway.com/deployments/github-autodeploys)
- **Campsites and availability.** Sign in to the hosted site as the owner. Use **My campsites** or **Availability**. Submit edited listing details for admin review when prompted. Changes to your hosted MySQL records take effect through the website.
- **Data across updates.** Keep the same MySQL service and app connection when deploying updated code. Continue taking database backups. An app restart can require users to sign in again because sessions are stored in memory.
