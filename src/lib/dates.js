// Fechas locales (YYYY-MM-DD). Las semanas van de lunes a domingo.
const p = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
export const parse = (s) => new Date(`${s}T00:00:00`);
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
export const mondayOf = (d = new Date()) => {
  const x = typeof d === 'string' ? parse(d) : new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return ymd(x);
};
export const rango = (start) => {
  const f = (s) => parse(s).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  return `${f(start)} – ${f(addDays(start, 6))}`;
};
