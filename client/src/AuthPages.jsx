import React, { useState } from 'react';
import { useApp } from './context.jsx';
import { accountToken } from './account-links.js';
import { AccountField, AccountLayout, AccountLink, AccountSubmit } from './AccountLayout.jsx';

const pageCopy = {
  login: ['Sign in to TourVista', 'Access your trips, campsite listings, or admin workspace.', 'Sign in', 'Signing in…'],
  register: ['Create your account', 'Choose a tourist account to book stays, or a host account to list a campsite.', 'Create account', 'Creating account…'],
  forgot: ['Forgot your password?', 'Enter your TourVista email address. Your reset link expires after 15 minutes.', 'Send reset link', 'Sending reset link…'],
  reset: ['Choose a new password', 'Use 10–128 characters. You’ll sign in again after updating your password.', 'Update password', 'Updating password…'],
  'verify-email': ['Confirm your email', 'Use the link from your verification email. The link works once and expires after 24 hours.', 'Verify email', 'Verifying email…'],
};

function bookingContinuation(route) {
  if (route.next === 'reservation' && route.campId) return { page: 'reservation', id: route.campId };
  if (route.page === 'reservation' && route.id) return { page: 'reservation', id: route.id };
}

function PreviewMailNote() {
  return <p className="notice-box sign-in-message"><strong>Local test emails</strong><br />
    Open the newest matching file in <code>server/storage/mail-preview</code> in VS Code and copy its link into your browser. Keep these files private.
  </p>;
}

export function AccountCreated({ user }) {
  const { session, route } = useApp();
  const continuation = bookingContinuation(route);
  return <AccountLayout title="Check your verification email" description="Open the verification link to confirm your account.">
    {user?.email && <p className="account-recipient">{user.email}</p>}
    {session.mailMode === 'preview' && <PreviewMailNote />}
    {user?.role === 'owner' && <p className="sign-in-form-note">After verifying your email, you can submit a campsite with ownership proof for review.</p>}
    <p className="sign-in-form-note">Check your inbox and spam folder for <strong>Verify your TourVista email</strong>.</p>
    <div className="sign-in-register">
      <AccountLink page="account">Sign in to resend verification email</AccountLink>
      <AccountLink page="login" continuation={continuation}>Continue to sign in</AccountLink>
    </div>
  </AccountLayout>;
}

export default function AuthPage({ kind, onSuccess }) {
  const { api, session, reload, navigate, route, setError, setNotice } = useApp();
  const continuation = bookingContinuation(route);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [role, setRole] = useState(() => kind === 'register' && new URLSearchParams(window.location.hash.split('?')[1]).get('role') === 'owner' ? 'owner' : 'tourist');
  const linkedToken = accountToken(window.location.hash);
  const [token, setToken] = useState(linkedToken);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [formError, setFormError] = useState('');

  const login = kind === 'login', registration = kind === 'register', verification = kind === 'verify-email';
  const needsToken = verification || kind === 'reset';
  const preview = session.mailMode === 'preview';
  const emailUnavailable = session.mailMode === 'unavailable' && (registration || kind === 'forgot');
  const [title, description, submitLabel, busyLabel] = pageCopy[kind];

  async function submit(event) {
    event.preventDefault();
    setFormError(''); setError(''); setNotice('');
    if ((registration || kind === 'reset') && password !== confirm) { setFormError('The passwords must match.'); return; }
    setBusy(true);
    try {
      if (kind === 'forgot') {
        const result = await api('/auth/request-reset', { method: 'POST', body: { email } });
        setDone(result.message);
      } else if (kind === 'reset' || verification) {
        const result = await api(verification ? '/auth/verify-email' : '/auth/reset', {
          method: 'POST', body: verification ? { token } : { token, password, confirmPassword: confirm },
        });
        setPassword(''); setConfirm(''); setToken('');
        await reload();
        navigate(verification && session.user ? 'account' : 'login', null, continuation);
        setNotice(result.message);
      } else {
        const result = await api(`/auth/${kind}`, {
          method: 'POST', body: registration ? { name, email, password, confirmPassword: confirm, role } : { email, password },
        });
        await onSuccess(result, kind);
      }
    } catch (failure) { setFormError(failure.message); }
    finally { setBusy(false); }
  }

  return <AccountLayout title={title} description={description}>
    {emailUnavailable
      ? <p className="notice-box sign-in-message" role="status">{registration
        ? 'New accounts are temporarily unavailable while email verification is being set up.'
        : 'Password reset email is temporarily unavailable. Please try again later.'}</p>
      : done ? <p className="success sign-in-message" role="status">{done}</p>
        : needsToken && !linkedToken && !preview
          ? <p className="notice-box sign-in-message">Open the link in your TourVista email to continue.</p>
          : <form onSubmit={submit}>
            <fieldset className="form-state" disabled={busy}>
              {registration && <AccountField label="Account type" icon="user" name="role" value={role} onChange={(event) => setRole(event.target.value)}>
                <option value="tourist">Tourist</option>
                <option value="owner">Campsite owner</option>
              </AccountField>}
              {registration && <AccountField label="Full name" icon="user" name="name" autoComplete="name" required maxLength={100}
                value={name} onChange={(event) => setName(event.target.value)} />}
              {!needsToken && <AccountField label="Email address" icon="mail" name="email" type="email" autoComplete={login ? 'username' : 'email'} required maxLength={160}
                value={email} onChange={(event) => setEmail(event.target.value)} />}
              {needsToken && !linkedToken && <details className="sign-in-token">
                <summary>Enter a local test token</summary>
                <AccountField label={verification ? 'Verification token from your email' : 'Reset token from your email'} name="token"
                  minLength={64} maxLength={64} autoComplete="off" spellCheck={false} value={token} onChange={(event) => setToken(event.target.value.trim())} />
              </details>}
              {(login || registration || kind === 'reset') && <AccountField label={kind === 'reset' ? 'New password' : 'Password'}
                action={login ? <AccountLink page="forgot" continuation={continuation} disabled={busy}>Forgot password?</AccountLink> : undefined}
                name="password" type="password" autoComplete={login ? 'current-password' : 'new-password'} required minLength={login ? undefined : 10} maxLength={128}
                value={password} onChange={(event) => setPassword(event.target.value)} />}
              {(registration || kind === 'reset') && <AccountField label="Confirm password" name="passwordConfirmation" type="password"
                autoComplete="new-password" required minLength={10} maxLength={128} value={confirm} onChange={(event) => setConfirm(event.target.value)} />}
              {registration && <p className="sign-in-form-note">Use 10–128 characters for your password. Confirm your email before booking or submitting a campsite.</p>}
              {formError && <p className="sign-in-error" role="alert">{formError}</p>}
              <AccountSubmit disabled={busy || (needsToken && token.length !== 64)}>{busy ? busyLabel : submitLabel}</AccountSubmit>
            </fieldset>
          </form>}

    <div className="sign-in-register">
      {login && <><span>New to TourVista?</span><AccountLink page="register" continuation={continuation} disabled={busy}>Create an account</AccountLink></>}
      {registration && <span>Already have an account?</span>}
      {!login && <AccountLink page="login" continuation={continuation} disabled={busy}>{registration ? 'Sign in' : 'Back to sign in'}</AccountLink>}
      {kind === 'forgot' && preview && <AccountLink page="reset" continuation={continuation}>I have a reset link or token</AccountLink>}
      {kind === 'reset' && !preview && !linkedToken && <AccountLink page="forgot" continuation={continuation}>Request a new reset link</AccountLink>}
      {verification && session.user && <AccountLink page="account">Account settings &amp; resend email</AccountLink>}
    </div>
    {login && session.mode === 'demo' && <div className="demo-accounts"><strong>Try a demo account</strong>
      <p>Password for all three: <code>TourVista123!</code></p><div className="button-row">
        {['tourist', 'owner', 'admin'].map((demoRole) => <button key={demoRole} type="button" disabled={busy}
          onClick={() => { setEmail(`${demoRole}@tourvista.test`); setPassword('TourVista123!'); }}>{demoRole}</button>)}
      </div><p>These credentials are for this local demo only.</p>
    </div>}
    {!login && preview && <PreviewMailNote />}
  </AccountLayout>;
}
