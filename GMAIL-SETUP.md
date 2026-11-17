# Send real TourVista emails

TourVista uses one configured sender for account, reservation and listing notifications.

You need **one Gmail sender account** for TourVista. Recipients receive messages at their own account email addresses.

## Connect the sender once

1. For the Gmail account you want to send from, enable **2-Step Verification**. Then create a **Google App Password** named TourVista at [Google App Passwords](https://myaccount.google.com/apppasswords). This is different from your normal Gmail password. Google requires 2-Step Verification for this option; some managed or protected accounts may not offer it. See [Google's instructions](https://support.google.com/accounts/answer/185833).
2. In the project's VS Code terminal, run:

   ```powershell
   npm.cmd run email:setup
   ```

3. Enter your sender Gmail address and the website address recipients can open. Use the suggested local address for laptop-only testing or the private forwarded HTTPS address for a phone test. Enter your App Password in the hidden prompt.
4. The command asks permission to send **one TourVista connection-test email to that sender address** and save the private sender settings in `server/.env`. Type **y** if those details are correct. It checks Gmail's secure connection and sign-in before saving. Cancelling leaves the settings unchanged. Existing database settings are preserved.
5. Check that Gmail received the test message, including Spam. SMTP acceptance alone does not prove inbox placement. If setup reports an authentication error, check the sender's App Password rather than entering your ordinary Gmail password.
6. Stop the existing TourVista server with **Ctrl+C**, then run:

   ```powershell
   npm.cmd run dev
   ```

   The terminal should show **TourVista email: SMTP delivery configured for accounts, reservations and listing reviews.**

## Reservation and listing notifications

| Event | Who receives an email |
| --- | --- |
| Tourist submits a booking request | Tourist and campsite owner |
| Owner confirms or declines a request | Tourist |
| Tourist or owner cancels a reservation | Tourist and campsite owner |
| Check-in is recorded | Tourist and campsite owner |
| Owner marks a stay complete | Tourist |
| Owner submits a listing for review | Administrators |
| Administrator approves, declines or suspends a listing | Campsite owner |

Workflow emails go to verified account addresses. Administrators can verify their email in **Account settings**. Messages link to the appropriate TourVista page. Check the current status there if emails arrive out of order or delivery fails.

## Use the basic flows

- **Register:** create a tourist or campsite-owner account with your own email and password. Open TourVista's verification email and choose **Verify email**.
- **Already registered during preview mode:** sign in, open **Account settings**, and choose **Resend verification email**. There is no need to create a second account. Old local previews are not sent automatically.
- **Forgot password:** choose **Forgot password?**, enter the account's registered email and select **Send reset link**. Open the new email, enter and confirm a new password, then sign in. Reset links expire in 15 minutes and work once.
- **Change password while signed in:** **Account settings → Change password** requires your current password. Other sessions are signed out afterward.

The verification and reset link supply their token automatically. Normal email users do not need to copy a long code. Verification expires in 24 hours and resending replaces older verification links. A new reset email has a one-minute resend cooldown, with additional rate limits. Use the latest email.

When `APP_URL` is the laptop's local address, open the links on that laptop. To open them on a phone during your private test, use the forwarded HTTPS address as `APP_URL`. Set `APP_URL` to the permanent HTTPS address when you deploy.

## Check a connection problem

```powershell
npm.cmd run email:check
```

This checks the configured SMTP connection and sign-in without sending a message or printing a credential. If it says real email is off, finish `email:setup`, restart TourVista and request a new link. Registration and recovery cannot deliver real mail until the sender credentials are configured.

The Gmail preset uses `smtp.gmail.com:465` with implicit TLS and certificate checking, as documented by [Google's SMTP settings](https://developers.google.com/workspace/gmail/imap/imap-smtp). Existing generic SMTP settings remain supported for another provider. App Passwords may be revoked if the Google account password changes; then run setup with a new App Password. Gmail sending limits and spam filtering still apply.

## What was verified

Automated checks use synthetic credentials and in-memory SMTP transports. They cover account verification and password reset, reservation and listing recipients, duplicate submissions, and bookings that stay saved after an SMTP error. Real inbox delivery can be checked using the connection-test email and a new reservation with verified accounts.
