import React, { useState } from 'react';
import { useApp } from './context.jsx';
import Icon from './Icons.jsx';
import { AccountField, AccountLink, AccountPhoto, AccountSubmit } from './AccountLayout.jsx';

export default function AccountSettings() {
  const { session, api, reload, navigate, setNotice } = useApp(), user = session.user;
  const [currentPassword, setCurrent] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false), [sending, setSending] = useState(false);
  const [verificationError, setVerificationError] = useState(''), [passwordError, setPasswordError] = useState(''), [message, setMessage] = useState('');
  async function resend() {
    setSending(true); setVerificationError(''); setMessage('');
    try { const result = await api('/auth/resend-verification', { method: 'POST', body: {} }); setMessage(result.message); }
    catch (failure) { setVerificationError(failure.message); } finally { setSending(false); }
  }
  async function change(event) {
    event.preventDefault(); setPasswordError('');
    if (password !== confirm) { setPasswordError('The new passwords must match.'); return; }
    if (password === currentPassword) { setPasswordError('Choose a password different from your current password.'); return; }
    setBusy(true);
    try {
      const result = await api('/auth/change-password', { method: 'POST', body: { currentPassword, password, confirmPassword: confirm } });
      setCurrent(''); setPassword(''); setConfirm(''); await reload(); navigate('login'); setNotice(result.message);
    } catch (failure) { setPasswordError(failure.message); } finally { setBusy(false); }
  }
  return <><div className="page-heading"><h1>Account &amp; security</h1><p>Manage your email verification and password.</p></div>
    {!user.emailVerified && <section className="notice-box account-verification" aria-labelledby="account-verification-title">
      <div className="account-verification-copy">
        <h2 id="account-verification-title">Verify your email</h2>
        <p>Look for <strong>Verify your TourVista email</strong> in the inbox or spam folder for <strong>{user.email}</strong>.</p>
      </div>
      {session.mailMode === 'unavailable' ? <p>Verification email is temporarily unavailable.</p>
        : <button className="primary" type="button" disabled={sending} onClick={resend}>{sending ? 'Preparing email…' : 'Resend verification email'}</button>}
      {verificationError && <p className="sign-in-error" role="alert">{verificationError}</p>}
      {message && <p className="success" role="status">{message}</p>}
      {session.mailMode === 'preview' && <AccountLink className="account-recovery-link" page="verify-email">I have a verification link</AccountLink>}
    </section>}
    <div className="account-security-grid">
      <section className="panel sign-in-panel account-password-panel">
        <h2>Change your password</h2>
        <p className="sign-in-intro">Use 10–128 characters. After changing it, sign in again on each device.</p>
        <form onSubmit={change}>
          <fieldset disabled={busy} className="form-state">
            <input type="hidden" name="username" autoComplete="username" value={user.email} />
            <AccountField label="Current password" name="currentPassword" type="password" autoComplete="current-password" required maxLength={128}
              value={currentPassword} onChange={(event) => setCurrent(event.target.value)} />
            <AccountField label="New password" name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={128}
              value={password} onChange={(event) => setPassword(event.target.value)} />
            <AccountField label="Confirm new password" name="passwordConfirmation" type="password" autoComplete="new-password" required minLength={10} maxLength={128}
              value={confirm} onChange={(event) => setConfirm(event.target.value)} />
            {passwordError && <p className="sign-in-error" role="alert">{passwordError}</p>}
            <AccountSubmit disabled={busy}>{busy ? 'Updating password…' : 'Change password'}</AccountSubmit>
          </fieldset>
        </form>
        <div className="sign-in-register"><AccountLink page="forgot" disabled={busy}>Forgot your current password?</AccountLink></div>
      </section>
      <section className="panel account-profile-panel">
        <div className="account-profile-details">
          <div className="account-identity">
            <span className="security-icon"><Icon name="user" size={23} /></span>
            <div><h2>{user.name}</h2><p>{user.role === 'owner' ? 'Campsite owner' : user.role === 'admin' ? 'Administrator' : 'Tourist'}</p></div>
          </div>
          <p className="account-email">{user.email}</p>
          <span className={'email-state ' + (user.emailVerified ? 'is-verified' : '')}>{user.emailVerified
            ? session.mailMode === 'preview' ? 'Email confirmed · local demo' : 'Email verified' : 'Email not confirmed'}</span>
          {session.mailMode === 'preview' && <div className="notice-box"><strong>Local email testing</strong><p>Open the newest matching file in <code>server/storage/mail-preview</code> and copy its link into your browser. Keep these files private.</p></div>}
        </div>
        <AccountPhoto />
      </section>
    </div>
  </>;
}
