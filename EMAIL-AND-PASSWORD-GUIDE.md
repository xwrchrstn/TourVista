# TourVista email and password guide

Tourists and campsite owners use their own email address. To connect the sender, follow [GMAIL-SETUP.md](GMAIL-SETUP.md). Registration, verification and password recovery require an active sender.

## Register and verify your email

1. Choose **Create an account** and select **Tourist** or **Campsite owner**.
2. Enter your name, email address and a password of 10–128 characters.
3. Open the TourVista verification email and select **Verify email**. Links expire after 24 hours.
4. Sign in. Tourists verify their email before booking, and owners verify before submitting their listing for review.

If you already registered, sign in and choose **Account settings → Resend verification email**. Use the newest link. Ownership approval is handled separately by a TourVista administrator.

## Change your password

1. Open **Account settings → Change password** while signed in.
2. Enter your current password and confirm your new one.
3. Sign in again using your new password. TourVista signs out previous sessions and invalidates old reset links.

## Forgot your password

1. Choose **Forgot password?** on the sign-in screen and enter your account email.
2. Open the newest **Reset your TourVista password** email. The link expires after 15 minutes and works once.
3. Enter and confirm your new password, then choose **Update password**.

If an email fails to arrive, check Spam and run `npm.cmd run email:check` from the project's VS Code terminal. Open links on a device that can reach the address configured as `APP_URL`.

## Technical and capstone notes

- Passwords retain salted scrypt hashing. Reset and verification tokens are random 256-bit values; only SHA-256 hashes are saved in the database. Plain links exist only in the private delivery message. Links use URL fragments and a no-referrer policy.
- Browser form actions retain CSRF protection and authenticated actions stay bound to the current user. Old-password verification, confirmation, expiry, single use, rate limits and session revocation are enforced by the server.
- Storage adds `users.emailVerified`, `users.emailVerificationRequired` and an `emailVerifications` table. Existing account access is preserved; an old admin/ownership flag is not reused as email proof. MySQL startup migration is provided but still needs live integration testing.
- Database backups include token hashes, not email-preview files. Restoring a backup invalidates outstanding verification/reset links, so resend them afterward. Source ZIPs exclude all runtime data and provider secrets.
- Implementation references: [OWASP account recovery](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [OWASP password changes](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#change-password-feature), and [Nodemailer SMTP transport](https://nodemailer.com/smtp).
