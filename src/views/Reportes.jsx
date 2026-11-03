import { useState } from 'react';
import { useStore } from '../store.jsx';
import { DAYS, dur, evalBlock, fmt, label, money, semaforo, weekSummary } from '../lib/rules.js';
import { Badge, Box, Table } from '../ui.jsx';

export function Asistencia() {
  const { state } = useStore();
  const { emps, week, cfg } = state;
  const [fil, setFil] = useState('all');
  const rows = emps
    .filter((e) => fil === 'all' || e.id === fil)
    .flatMap((e) => week[e.id].flatMap((bl, d) => bl.map((b) => {
      const r = evalBlock(b, cfg);
      return [DAYS[d], e.name, `${fmt(b.s)}–${fmt(b.e)}`, fmt(b.i), fmt(b.o), <Badge k={label(r)} />, r.ext ? dur(r.ext) : '—'];
    })));
  return (
    <Box title="Registro de asistencia">
      <div className="row" style={{ marginBottom: 10 }}>
        <label>Empleado
          <select value={fil} onChange={(e) => setFil(e.target.value)}>
            <option value="all">Todos</option>
            {emps.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
      </div>
      <Table head={['Día', 'Empleado', 'Horario', 'Entrada', 'Salida', 'Estatus', 'Extra']} rows={rows} />
    </Box>
  );
}

export function Bono() {
  const { state: { emps, week, cfg } } = useStore();
  return (
    <Box title={`Bono de puntualidad · ${money(cfg.bono)}`}
      note="Puntual = registrar 5 minutos antes o antes. Un solo bloque en zona gris o con retardo cancela el bono de la semana.">
      <Table head={['Empleado', 'Resultado', 'Motivo', 'Monto']} rows={emps.map((e) => {
        const w = weekSummary(week[e.id], cfg);
        return [e.name, <span className={`b ${w.bono ? 'ok' : 'er'}`}>{w.bono ? 'Gana bono' : 'Sin bono'}</span>,
          w.bono ? 'Puntual en todos sus bloques' : w.why.join(', '), money(w.bono)];
      })} />
    </Box>
  );
}

export function Retardos() {
  const { state: { emps, week, cfg } } = useStore();
  return (
    <Box title="Retardos de la semana"
      note={`Más de ${cfg.maxRet} días con retardo en la semana genera llamada de atención. Se cuenta un retardo por día.`}>
      <Table head={['Empleado', 'Días con retardo', 'Semáforo', 'Acción']} rows={emps.map((e) => {
        const { ret } = weekSummary(week[e.id], cfg);
        const [t, c] = semaforo(ret, cfg);
        return [e.name, ret, <span className={`b ${c}`}>{t}</span>, ret > cfg.maxRet ? 'Llamar la atención' : ret ? 'Solo seguimiento' : '—'];
      })} />
    </Box>
  );
}

export function Extras() {
  const { state: { emps, week, cfg } } = useStore();
  return (
    <Box title={`Horas extra · ${money(cfg.hx)} por hora`}
      note="Cuentan si la salida pasa 15 minutos del fin del bloque, redondeadas hacia abajo en bloques de 15 min.">
      <Table head={['Empleado', 'Detalle', 'Total', 'Pago']} rows={emps.map((e) => {
        const w = weekSummary(week[e.id], cfg);
        const det = week[e.id].flatMap((bl, d) => bl.map((b) => [d, evalBlock(b, cfg).ext]).filter(([, x]) => x))
          .map(([d, x]) => `${DAYS[d].slice(0, 3)} ${dur(x)}`);
        return [e.name, det.join(', ') || '—', w.ext ? dur(w.ext) : '—', money(w.pExt)];
      })} />
    </Box>
  );
}
