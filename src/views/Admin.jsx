import { useState } from 'react';
import { useStore } from '../store.jsx';
import { DAYS, dur, fmt, money, pendingList, toMin, weekSummary } from '../lib/rules.js';
import { Box, Table } from '../ui.jsx';

export function Nomina() {
  const { state: { emps, week, cfg } } = useStore();
  const ws = emps.map((e) => weekSummary(week[e.id], cfg));
  const total = ws.reduce((a, w) => a + w.total, 0);
  return (
    <>
      <Box note="Corte: domingo 21:00. Pago bruto, sin deducciones.">
        <h2>Nómina de la semana</h2>
        <p className="big">Total a pagar: {money(total)}</p>
      </Box>
      <div className="rcb">
        {emps.map((e, i) => {
          const w = ws[i];
          return (
            <section className="box rc" key={e.id}>
              <h2>{e.name} <span className="mu">· ID {e.id}</span></h2>
              <dl>
                <dt>Días trabajados</dt><dd>{w.dias} de {w.prog} programados</dd>
                <dt>Horas ordinarias</dt><dd>{dur(w.ord)}</dd>
                <dt>Horas extra</dt><dd>{dur(w.ext)}</dd>
                <dt>Retardos</dt><dd>{w.ret}</dd>
                <dt>Salario ordinario</dt><dd>{money(w.pOrd)}</dd>
                <dt>Pago de horas extra</dt><dd>{money(w.pExt)}</dd>
                <dt>Bono de puntualidad</dt><dd>{money(w.bono)}</dd>
              </dl>
              <div className="tot"><span>Total</span><span>{money(w.total)}</span></div>
              {w.pend > 0 && <p className="sub"><span className="b wa">{w.pend} salida(s) pendiente(s)</span> Se pagarán como ajuste.</p>}
            </section>
          );
        })}
      </div>
    </>
  );
}

function PendRow({ x }) {
  const { dispatch } = useStore();
  const [t, setT] = useState(fmt(x.b.e));
  const guardar = () => toMin(t) != null && dispatch({ type: 'fixOut', blockId: x.b.id, t: toMin(t) });
  return (
    <tr>
      <td>{DAYS[x.d]}</td><td>{x.e.name}</td><td>{fmt(x.b.s)}–{fmt(x.b.e)}</td><td>{fmt(x.b.i)}</td>
      <td><input type="time" value={t} onChange={(e) => setT(e.target.value)} /></td>
      <td><button className="g" onClick={guardar}>Guardar</button></td>
    </tr>
  );
}

export function Pendientes() {
  const { state: { emps, week, cfg } } = useStore();
  const p = pendingList(emps, week, cfg);
  return (
    <Box title="Pendientes de revisar" note="Mientras una salida esté pendiente, ese bloque no suma horas. Al guardar queda la hora capturada por el administrador.">
      {p.length ? (
        <div className="sc"><table>
          <thead><tr>{['Día', 'Empleado', 'Horario', 'Entrada', 'Hora real de salida', ''].map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
          <tbody>{p.map((x) => <PendRow key={`${x.e.id}-${x.d}-${x.k}`} x={x} />)}</tbody>
        </table></div>
      ) : <p className="mu">No hay salidas por corregir.</p>}
    </Box>
  );
}

const Field = ({ cfg, dispatch, k, t }) => (
  <label>{t}
    <input type="number" min="0" value={cfg[k]} onChange={(e) => dispatch({ type: 'cfg', k, v: +e.target.value })} />
  </label>
);

export function Config() {
  const { state: { cfg }, dispatch } = useStore();
  const p = { cfg, dispatch };
  return (
    <Box title="Configuración" note="El bono y la tarifa extra son valores de ejemplo hasta confirmarlos.">
      <div className="row">
        <Field {...p} k="hr" t="Tarifa por hora ordinaria ($)" />
        <Field {...p} k="hx" t="Tarifa por hora extra ($)" />
        <Field {...p} k="bono" t="Bono de puntualidad ($)" />
        <Field {...p} k="tol" t="Minutos de anticipación para el bono" />
        <Field {...p} k="maxRet" t="Retardos permitidos por semana" />
        <Field {...p} k="minExt" t="Minutos mínimos para hora extra" />
      </div>
      <p><button className="g" onClick={() => confirm('¿Restablecer datos de ejemplo?') && dispatch({ type: 'reset' })}>Restablecer datos de ejemplo</button></p>
    </Box>
  );
}
