import { createContext, useContext } from 'react';
export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);
export const money = (value) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(value);
export const tomorrow = (date, days = 1) => new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);
export function Field({ label, children, ...props }) {
  return <label className="field"><span>{label}</span>{children || <input {...props} />}</label>;
}
