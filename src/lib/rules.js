// Reglas de negocio puras: sin React, sin red. Se pueden reutilizar en el servidor.
export const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export const toMin = (s) => {
  if (!s) return null;
  const [a, b] = s.split(':');
  return +a * 60 + +b;
};
export const fmt = (n) => (n == null ? '—' : `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`);
export const dur = (n) => `${Math.floor(n / 60)} h ${String(n % 60).padStart(2, '0')} min`;
export const money = (n) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
export const block = (s, e, i = null, o = null) => ({ s: toMin(s), e: toMin(e), i: toMin(i), o: toMin(o) });

export const DEFAULT_CFG = { hr: 20, hx: 20, bono: 300, tol: 5, maxRet: 3, minExt: 15 };

export const STATUS = {
  puntual: ['Puntual', 'ac'],
  tiempo: ['A tiempo, sin bono', ''],
  retardo: ['Retardo', 'er'],
  pend: ['Salida pendiente', 'wa'],
  sin: ['Sin registro', ''],
};
export const label = (r) => (r.pend ? 'pend' : r.st);

// Evalúa un bloque: puntualidad, horas ordinarias y horas extra (en minutos).
export function evalBlock(b, cfg) {
  if (b.i == null) return { st: 'sin', ord: 0, ext: 0 };
  const d = b.i - b.s;
  const st = d <= -cfg.tol ? 'puntual' : d <= 0 ? 'tiempo' : 'retardo';
  if (b.o == null) return { st, pend: true, ord: 0, ext: 0 };
  const x = b.o - b.e;
  return {
    st,
    ord: Math.max(0, Math.min(b.e, b.o) - Math.max(b.s, b.i)),
    ext: x >= cfg.minExt ? Math.floor(x / 15) * 15 : 0,
  };
}

// Resumen semanal de un empleado: retardos, bono y nómina.
export function weekSummary(days, cfg) {
  const w = { ord: 0, ext: 0, ret: 0, pend: 0, dias: 0, prog: 0, bn: true, why: [] };
  days.forEach((bl, d) => {
    if (!bl.length) return;
    w.prog++;
    let late = false;
    let worked = false;
    bl.forEach((b) => {
      const r = evalBlock(b, cfg);
      w.ord += r.ord;
      w.ext += r.ext;
      if (r.pend) w.pend++;
      if (b.i != null) worked = true;
      if (r.st === 'retardo') late = true;
      if (r.st !== 'puntual') {
        w.bn = false;
        w.why.push(`${DAYS[d].slice(0, 3)} ${b.i == null ? 'sin entrada' : `${fmt(b.i)} (${STATUS[r.st][0].toLowerCase()})`}`);
      }
    });
    if (late) w.ret++;
    if (worked) w.dias++;
  });
  w.bono = w.bn && w.dias > 0 ? cfg.bono : 0;
  w.pOrd = (w.ord / 60) * cfg.hr;
  w.pExt = (w.ext / 60) * cfg.hx;
  w.total = w.pOrd + w.pExt + w.bono;
  return w;
}

export const semaforo = (ret, cfg) =>
  ret > cfg.maxRet ? ['Llamada de atención', 'er'] : ret > 0 ? ['Atención', 'wa'] : ['Sin retardos', 'ok'];

// Asigna una checada al hueco libre (entrada o salida) más cercano del día.
export function assignPunch(blocks, t) {
  let best = null;
  blocks.forEach((b, k) => {
    const slot = b.i == null ? ['i', b.s] : b.o == null ? ['o', b.e] : null;
    if (slot) {
      const df = Math.abs(t - slot[1]);
      if (!best || df < best.df) best = { k, f: slot[0], df };
    }
  });
  if (!best) return null;
  const block = { ...blocks[best.k], [best.f]: t };
  return { blocks: blocks.map((b, k) => (k === best.k ? block : b)), field: best.f, block };
}

export const pendingList = (emps, week, cfg) =>
  emps.flatMap((e) =>
    week[e.id].flatMap((bl, d) => bl.map((b, k) => ({ e, d, k, b })).filter((x) => evalBlock(x.b, cfg).pend))
  );

// Rotación: invierte 7:00-15:00 y 12:00-20:00. Respeta descansos y días fijos del empleado.
const rot = (b) =>
  b.s === 420 && b.e === 900 ? { ...b, s: 720, e: 1200 } : b.s === 720 && b.e === 1200 ? { ...b, s: 420, e: 900 } : b;
export const nextWeek = (emp, days) =>
  days.map((bl, d) =>
    emp.desc?.includes(d)
      ? []
      : emp.fijo?.[d]
      ? [{ s: emp.fijo[d][0], e: emp.fijo[d][1], i: null, o: null }]
      : bl.map((b) => ({ ...rot(b), i: null, o: null }))
  );
export const setShift = (emp, days, s, e) =>
  days.map((bl, d) => (bl.length && !emp.fijo?.[d] ? [{ s: toMin(s), e: toMin(e), i: null, o: null }] : bl));

// "07:00-09:30,17:00-21:00" -> bloques; vacío = descanso; null si el formato es inválido.
export function parseBlocks(txt) {
  if (!txt.trim()) return [];
  const out = [];
  for (const part of txt.split(',')) {
    const [a, b] = part.split('-').map((x) => toMin(x.trim()));
    if (a == null || b == null || b <= a) return null;
    out.push({ s: a, e: b, i: null, o: null });
  }
  return out;
}
