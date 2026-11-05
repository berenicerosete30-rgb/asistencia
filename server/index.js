import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as D from './db.js';
import { addDays, mondayOf } from '../src/lib/dates.js';

const PORT = process.env.PORT || 3000;
const DEVICE_KEY = process.env.DEVICE_KEY || '3003';
D.seedIfEmpty();

const app = express();
app.use(express.json());
const wrap = (fn) => (req, res) => {
  try { fn(req, res); } catch (e) { res.status(400).json({ ok: false, msg: e.message }); }
};

app.get('/api/state', wrap((req, res) => {
  const q = String(req.query.start || '');
  const start = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(q) ? q : new Date());
  res.json({ cfg: D.getCfg(), emps: D.getEmps(), week: D.getWeek(start), next: D.getWeek(addDays(start, 7)) });
}));

// Endpoint del ESP32: solo manda el UID. La hora la pone el servidor.
app.post('/api/punch', wrap((req, res) => {
  if (req.get('x-api-key') !== DEVICE_KEY) return res.status(401).json({ ok: false, msg: 'Clave inválida' });
  const r = D.registrarChecada(req.body.uid, new Date());
  res.status(r.status).json(r.body);
}));

// Simulador del panel web (fecha y hora elegidas por el administrador).
app.post('/api/simulate', wrap((req, res) => {
  const { uid, date, time } = req.body;
  const r = D.registrarChecada(uid, new Date(`${date}T${time}:00`), true);
  res.status(r.status).json(r.body);
}));

app.put('/api/config', wrap((req, res) => { D.setCfg(req.body.k, Number(req.body.v)); res.json({ ok: true }); }));
app.put('/api/schedule', wrap((req, res) => { D.setSchedule(req.body.start, req.body.empId, req.body.days); res.json({ ok: true }); }));
app.put('/api/blocks/:id', wrap((req, res) => { D.fixOut(Number(req.params.id), Number(req.body.o)); res.json({ ok: true }); }));
app.post('/api/reset', wrap((req, res) => { D.resetData(); res.json({ ok: true }); }));

app.get('/api/last-unknown', wrap((req, res) => res.json(D.lastUnknown())));
app.post('/api/employees', wrap((req, res) => res.json({ ok: true, id: D.createEmployee(req.body) })));
app.put('/api/employees/:id', wrap((req, res) => { D.updateEmployee(req.params.id, req.body); res.json({ ok: true }); }));
app.delete('/api/employees/:id', wrap((req, res) => { D.deactivateEmployee(req.params.id); res.json({ ok: true }); }));

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor listo. En esta computadora: http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) console.log(`Para el ESP32 usa: http://${i.address}:${PORT}/api/punch`);
  if (DEVICE_KEY === 'cambia-esta-clave') console.log('Aviso: cambia DEVICE_KEY (variable de entorno) y la clave del ESP32.');
});
