import React, { useId, useState } from 'react';
import { useApp } from './context.jsx';
import { routeHash } from './flow.js';
import Icon from './Icons.jsx';
import './sign-in.css';

export function AccountLink({ page, continuation, disabled = false, children, ...props }) {
  const { navigate } = useApp();
  return <a {...props} href={disabled ? undefined : routeHash(page, null, continuation)} aria-disabled={disabled || undefined}
    onClick={(event) => { event.preventDefault(); if (!disabled) navigate(page, null, continuation); }}>{children}</a>;
}

export function AccountPhoto() {
  return <figure className="sign-in-landscape">
    <img src="/images/claveria-balatukan.jpg" alt="" width="1280" height="853" />
    <figcaption>
      <Icon name="pin" size={21} />
      <div><strong>Mount Balatukan</strong><span>Viewed from Claveria, Misamis Oriental</span></div>
      <a href="https://commons.wikimedia.org/wiki/File:Mount_Balatukan1.JPG" target="_blank" rel="noreferrer"
        aria-label="Mount Balatukan photo by Kleomarlo, licensed CC BY-SA 3.0">Photo credit</a>
    </figcaption>
  </figure>;
}

export function AccountLayout({ title, description, children }) {
  const titleId = useId();
  return <section className="sign-in-page" aria-labelledby={titleId}>
    <AccountLink className="sign-in-back" page="home"><Icon name="arrow" size={17} />Browse campsites</AccountLink>
    <div className="sign-in-card">
      <div className="auth-panel sign-in-panel">
        <h1 id={titleId}>{title}</h1>
        {description && <p className="sign-in-intro">{description}</p>}
        {children}
      </div>
      <AccountPhoto />
    </div>
  </section>;
}

export function AccountField({ label, icon, action, type = 'text', children, ...props }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const isPassword = type === 'password';
  const glyph = icon || (isPassword ? 'lock' : null);
  const visibilityName = label.startsWith('Confirm') ? 'password confirmation' : label.toLowerCase();
  return <div className="sign-in-field">
    {action ? <div className="sign-in-field-heading"><label htmlFor={id}>{label}</label>{action}</div>
      : <label htmlFor={id}>{label}</label>}
    <div className="sign-in-input">
      {glyph && <Icon name={glyph} size={19} />}
      {children ? <select {...props} id={id}>{children}</select>
        : <input {...props} id={id} type={isPassword && visible ? 'text' : type}
          autoCapitalize={isPassword || type === 'email' ? 'none' : undefined}
          spellCheck={isPassword || type === 'email' ? false : props.spellCheck} />}
      {isPassword && <button className="sign-in-visibility" type="button" aria-controls={id}
        aria-label={(visible ? 'Hide ' : 'Show ') + visibilityName} onClick={() => setVisible((value) => !value)}>
        <Icon name={visible ? 'eyeOff' : 'eye'} size={19} />
      </button>}
    </div>
  </div>;
}

export function AccountSubmit({ children, ...props }) {
  return <button {...props} className="primary sign-in-submit" type="submit">{children}<Icon name="arrow" size={19} /></button>;
}
