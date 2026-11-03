import { DatabaseSync } from 'node:sqlite'; // SQLite incluido en Node 22.5+, no requiere compilar nada
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CFG, STATUS, assignPunch, evalBlock, fmt, nextWeek } from '../src/lib/rules.js';
import { addDays, mondayOf, ymd } from '../src/lib/dates.js';
import { EMPLOYEES, WEEK } from './seed.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
fs.mkdirSync(dir, { recursive: true });
export const db = new DatabaseSync(path.join(dir, 'asistencia.db'));
db.exec('PRAGMA journal_mode = WAL');
let depth = 0;
const tx = (fn) => {
  if (depth) return fn(); // transacciones anidadas: se unen a la externa
  depth++;
  db.exec('BEGIN');
  try { fn(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } finally { depth--; }
};
db.exec(`
CREATE TABLE IF NOT EXISTS employees(id TEXT PRIMARY KEY, name TEXT NOT NULL, area TEXT, uid TEXT UNIQUE, fixed TEXT, rest_days TEXT, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS blocks(id INTEGER PRIMARY KEY AUTOINCREMENT, emp_id TEXT NOT NULL, date TEXT NOT NULL, s INTEGER NOT NULL, e INTEGER NOT NULL, i INTEGER, o INTEGER);
CREATE INDEX IF NOT EXISTS blocks_emp_date ON blocks(emp_id, date);
CREATE TABLE IF NOT EXISTS config(k TEXT PRIMARY KEY, v REAL);
CREATE TABLE IF NOT EXISTS punch_log(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, uid TEXT, emp_id TEXT, result TEXT, detail TEXT);
`);

// Migración: apellido (bases de datos creadas antes de esta versión)
if (!db.prepare('PRAGMA table_info(employees)').all().some((c) => c.name === 'last_name'))
  db.exec("ALTER TABLE employees ADD COLUMN last_name TEXT DEFAULT ''");

const fullName = (e) => [e.name, e.last_name].filter(Boolean).join(' ');
const norm = (u) => String(u || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
const j = (s) => (s ? JSON.parse(s) : undefined);

export const getCfg = () => ({
  ...DEFAULT_CFG,
  ...Object.fromEntries(db.prepare('SELECT k, v FROM config').all().map((r) => [r.k, r.v])),
});
export function setCfg(k, v) {
  if (!(k in DEFAULT_CFG) || !Number.isFinite(v) || v < 0) throw new Error('Configuración inválida');
  db.prepare('INSERT INTO config(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, v);
}

export const getEmps = () =>
  db.prepare('SELECT * FROM employees WHERE active = 1 ORDER BY id').all()
    .map((e) => ({ id: e.id, name: fullName(e), first: e.name, last: e.last_name || '', area: e.area, uid: e.uid, fijo: j(e.fixed), desc: j(e.rest_days) }));

// Bloques de una semana (lunes a domingo): { [empId]: [7 listas de bloques] }
export function getWeek(start) {
  const out = Object.fromEntries(getEmps().map((e) => [e.id, Array.from({ length: 7 }, () => [])]));
  const rows = db.prepare('SELECT * FROM blocks WHERE date >= ? AND date <= ? ORDER BY date, s').all(start, addDays(start, 6));
  const t0 = new Date(`${start}T00:00:00`);
  for (const r of rows) {
    const d = Math.round((new Date(`${r.date}T00:00:00`) - t0) / 864e5);
    out[r.emp_id]?.[d]?.push({ id: r.id, s: r.s, e: r.e, i: r.i, o: r.o });
  }
  return out;
}

export function setSchedule(start, empId, days) {
  const ok = Array.isArray(days) && days.length === 7 &&
    days.every((bl) => Array.isArray(bl) && bl.every((b) => Number.isInteger(b.s) && Number.isInteger(b.e) && b.e > b.s));
  if (!ok) throw new Error('Horario inválido');
  const ins = db.prepare('INSERT INTO blocks(emp_id, date, s, e) VALUES(?, ?, ?, ?)');
  tx(() => {
    db.prepare('DELETE FROM blocks WHERE emp_id = ? AND date >= ? AND date <= ?').run(empId, start, addDays(start, 6));
    days.forEach((bl, d) => bl.forEach((b) => ins.run(empId, addDays(start, d), b.s, b.e)));
  });
}

export function fixOut(blockId, o) {
  if (!Number.isInteger(o) || o < 0 || o > 1439) throw new Error('Hora inválida');
  db.prepare('UPDATE blocks SET o = ? WHERE id = ?').run(o, blockId);
}

const log = (uid, empId, result, detail = '') =>
  db.prepare('INSERT INTO punch_log(ts, uid, emp_id, result, detail) VALUES(?, ?, ?, ?, ?)').run(Date.now(), uid, empId, result, detail);

// Registra una checada. La hora la pone el servidor (o la simulada desde el panel).
export function registrarChecada(uid, now = new Date(), sim = false) {
  const emp = db.prepare('SELECT * FROM employees WHERE active = 1').all().find((e) => norm(e.uid) === norm(uid) && norm(uid));
  if (!emp) {
    log(uid, null, 'desconocida');
    return { status: 404, body: { ok: false, msg: 'Tarjeta no registrada' } };
  }
  const last = db.prepare("SELECT ts FROM punch_log WHERE emp_id = ? AND result = 'ok' ORDER BY id DESC LIMIT 1").get(emp.id);
  if (!sim && last && Date.now() - last.ts < 15000) return { status: 200, body: { ok: false, name: fullName(emp), msg: 'Ya registrado hace un momento' } };

  const t = now.getHours() * 60 + now.getMinutes();
  const rows = db.prepare('SELECT * FROM blocks WHERE emp_id = ? AND date = ? ORDER BY s').all(emp.id, ymd(now));
  const blocks = rows.map((r) => ({ s: r.s, e: r.e, i: r.i, o: r.o }));
  const r = assignPunch(blocks, t);
  if (!r) {
    log(uid, emp.id, 'sin_horario', `${ymd(now)} ${fmt(t)}`);
    return { status: 409, body: { ok: false, name: fullName(emp), msg: `${fullName(emp)}: sin horario o bloques completos. Queda para revisión.` } };
  }
  const k = r.blocks.findIndex((b, x) => b !== blocks[x]);
  db.prepare(`UPDATE blocks SET ${r.field} = ? WHERE id = ?`).run(t, rows[k].id);
  log(uid, emp.id, 'ok', `${r.field}=${fmt(t)}`);

  const ev = evalBlock(r.block, getCfg());
  const action = r.field === 'i' ? 'ENTRADA' : 'SALIDA';
  const status = r.field === 'i' ? ev.st : ev.ext ? 'extra' : 'normal';
  return {
    status: 200,
    body: { ok: true, name: fullName(emp), action, status, time: fmt(t), msg: `${fullName(emp)} · ${action} ${fmt(t)}${r.field === 'i' ? ` · ${STATUS[ev.st][0]}` : ev.ext ? ` · extra ${Math.floor(ev.ext / 60)} h ${ev.ext % 60} min` : ''}` },
  };
}

// Datos de ejemplo: semana pasada con checadas; semana actual y siguiente por rotación.
export function resetData() {
  const ie = db.prepare('INSERT INTO employees(id, name, area, uid, fixed, rest_days) VALUES(?, ?, ?, ?, ?, ?)');
  const ib = db.prepare('INSERT INTO blocks(emp_id, date, s, e, i, o) VALUES(?, ?, ?, ?, ?, ?)');
  const put = (id, start, days) => days.forEach((bl, d) => bl.forEach((b) => ib.run(id, addDays(start, d), b.s, b.e, b.i, b.o)));
  tx(() => {
    for (const t of ['blocks', 'employees', 'config', 'punch_log']) db.exec(`DELETE FROM ${t}`);
    const cur = mondayOf(new Date());
    for (const e of EMPLOYEES) {
      ie.run(e.id, e.name, e.area, e.uid, e.fijo ? JSON.stringify(e.fijo) : null, e.desc ? JSON.stringify(e.desc) : null);
      const now = nextWeek(e, WEEK[e.id]);
      put(e.id, addDays(cur, -7), WEEK[e.id]);
      put(e.id, cur, now);
      put(e.id, addDays(cur, 7), nextWeek(e, now));
    }
  });
}
export const seedIfEmpty = () => { if (!db.prepare('SELECT COUNT(*) c FROM employees').get().c) resetData(); };

// ---------- Empleados ----------
const fmtUid = (u) => (norm(u).match(/.{1,2}/g) || []).join(':');
const nextId = () => String(Math.max(1000, ...db.prepare('SELECT id FROM employees').all().map((r) => parseInt(r.id) || 0)) + 1);
const cleanDesc = (v) => [...new Set((Array.isArray(v) ? v : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
function cleanFijo(v) {
  const out = {};
  for (const [d, t] of Object.entries(v || {}))
    if (Number.isInteger(+d) && +d >= 0 && +d <= 6 && Array.isArray(t) && Number.isInteger(t[0]) && Number.isInteger(t[1]) && t[1] > t[0]) out[d] = t;
  return out;
}
const asJson = (v) => (v && (Array.isArray(v) ? v.length : Object.keys(v).length) ? JSON.stringify(v) : null);

function checkUid(uid, exceptId) {
  const n = norm(uid);
  if (!n) return null;
  const other = db.prepare('SELECT * FROM employees WHERE active = 1').all().find((e) => e.id !== exceptId && norm(e.uid) === n);
  if (other) throw new Error(`Esa tarjeta ya está asignada a ${fullName(other)}`);
  return fmtUid(uid);
}
function parseBody(b, id) {
  const first = String(b.first || '').trim();
  if (!first) throw new Error('El nombre es obligatorio');
  const desc = cleanDesc(b.desc);
  const fijo = cleanFijo(b.fijo);
  if (Object.keys(fijo).some((d) => desc.includes(+d))) throw new Error('Un día no puede ser de descanso y de horario fijo a la vez');
  return { id, name: first, last: String(b.last || '').trim(), area: String(b.area || '').trim() || 'Operación', uid: checkUid(b.uid, id), fijo, desc };
}
// Horario base: un bloque por día de trabajo; descansos vacíos; días fijos con su propio horario.
// La segunda semana en adelante rota 7:00 y 12:00, igual que el planificador.
function applyBase(emp, { s, e, weeks }) {
  if (!Number.isInteger(s) || !Number.isInteger(e) || e <= s) throw new Error('Horario base inválido');
  let days = Array.from({ length: 7 }, (_, d) =>
    emp.desc.includes(d) ? [] : emp.fijo[d] ? [{ s: emp.fijo[d][0], e: emp.fijo[d][1], i: null, o: null }] : [{ s, e, i: null, o: null }]);
  weeks.forEach((w, k) => {
    if (k > 0) days = nextWeek(emp, days);
    setSchedule(w, emp.id, days);
  });
}

export function createEmployee(b) {
  const id = String(b.id || '').trim() || nextId();
  if (db.prepare('SELECT 1 FROM employees WHERE id = ?').get(id)) throw new Error('Ya existe un empleado con ese ID');
  const emp = parseBody(b, id);
  tx(() => {
    db.prepare('INSERT INTO employees(id, name, last_name, area, uid, fixed, rest_days) VALUES(?, ?, ?, ?, ?, ?, ?)')
      .run(id, emp.name, emp.last, emp.area, emp.uid, asJson(emp.fijo), asJson(emp.desc));
    if (b.schedule?.weeks?.length) applyBase(emp, b.schedule);
  });
  return id;
}
export function updateEmployee(id, b) {
  if (!db.prepare('SELECT 1 FROM employees WHERE id = ? AND active = 1').get(id)) throw new Error('Empleado no encontrado');
  const emp = parseBody(b, id);
  tx(() => {
    db.prepare('UPDATE employees SET name = ?, last_name = ?, area = ?, uid = ?, fixed = ?, rest_days = ? WHERE id = ?')
      .run(emp.name, emp.last, emp.area, emp.uid, asJson(emp.fijo), asJson(emp.desc), id);
    if (b.schedule?.weeks?.length) applyBase(emp, b.schedule);
  });
}
// Baja: conserva los registros pero libera la tarjeta para otra persona.
export function deactivateEmployee(id) {
  db.prepare('UPDATE employees SET active = 0, uid = NULL WHERE id = ?').run(id);
}
// Última tarjeta no registrada que pasó por el lector (sirve para dar de alta tarjetas nuevas).
export function lastUnknown() {
  const r = db.prepare("SELECT uid, ts FROM punch_log WHERE result = 'desconocida' ORDER BY id DESC LIMIT 1").get();
  return r ? { uid: fmtUid(r.uid), ts: r.ts } : { uid: null, ts: 0 };
}
