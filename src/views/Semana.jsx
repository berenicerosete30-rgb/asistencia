import { useState } from 'react';
import { useStore } from '../store.jsx';
import { DAYS, evalBlock, fmt, weekSummary } from '../lib/rules.js';
import { addDays, parse, ymd } from '../lib/dates.js';

function Entrada({ b, date, today, cfg }) {
  const r = evalBlock(b, cfg);
  let cls = 'wait';
  let main = '—';
  let sub = `prog. ${fmt(b.s)}`;
  if (b.i != null) {
    cls = r.st;
    main = fmt(b.i);
    if (r.st === 'retardo') sub = `+${b.i - b.s} min · prog. ${fmt(b.s)}`;
  } else if (date < today) {
    cls = 'miss';
    main = 'Sin entrada';
  }
  return <div className={`ent ${cls}`}><b>{main}</b><small>{sub}</small></div>;
}

export default function Semana() {
  const { state } = useStore();
  const { emps, week, cfg, weekStart } = state;
  const [fin, setFin] = useState(false);
  const today = ymd(new Date());
  const days = [...Array(fin ? 7 : 5).keys()];
  const rows = emps.filter((e) => days.some((d) => week[e.id][d].length));
  const ws = Object.fromEntries(emps.map((e) => [e.id, weekSummary(week[e.id], cfg)]));
  const cnt = { puntual: 0, tiempo: 0, retardo: 0 };
  rows.forEach((e) => days.forEach((d) => week[e.id][d].forEach((b) => {
    if (b.i != null) cnt[evalBlock(b, cfg).st]++;
  })));
  const aten = rows.filter((e) => ws[e.id].ret > cfg.maxRet);
  const colCls = (date) => (date === today ? 'today' : '');

  return (
    <>
      <div className="titulo">
        <div>
          <h2>Entradas de la semana</h2>
          <p className="sub">Hora a la que registró cada empleado. En rojo, quien llegó tarde.</p>
        </div>
        <button className="g" onClick={() => setFin(!fin)}>{fin ? 'Ocultar' : 'Mostrar'} sábado y domingo</button>
      </div>

      {aten.length > 0 && (
        <div className="alert">
          <b>Llamada de atención:</b>{' '}
          {aten.map((e) => `${e.name} (${ws[e.id].ret} días con retardo)`).join(', ')}
        </div>
      )}

      <div className="resumen">
        <div><b>{cnt.puntual}</b><span>puntuales</span></div>
        <div><b>{cnt.tiempo}</b><span>a tiempo</span></div>
        <div className={cnt.retardo ? 'late' : ''}><b>{cnt.retardo}</b><span>retardos</span></div>
      </div>

      <div className="box flush">
        <div className="sc">
          <table className="wk">
            <thead>
              <tr>
                <th>Empleado</th>
                {days.map((d) => {
                  const date = addDays(weekStart, d);
                  return (
                    <th key={d} className={colCls(date)}>
                      <span>{DAYS[d].slice(0, 3)}</span>
                      <em>{parse(date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</em>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="who"><b>{e.name}</b><small>{e.area}</small></td>
                  {days.map((d) => {
                    const date = addDays(weekStart, d);
                    const bl = week[e.id][d];
                    return (
                      <td key={d} className={colCls(date)}>
                        {bl.length
                          ? bl.map((b, k) => <Entrada key={k} b={b} date={date} today={today} cfg={cfg} />)
                          : <span className="rest">Descanso</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="leyenda">
        <i className="d puntual" /> Puntual (5 min antes o antes)
        <i className="d tiempo" /> A tiempo
        <i className="d retardo" /> Retardo
        <i className="d miss" /> Sin entrada
      </p>
    </>
  );
}
