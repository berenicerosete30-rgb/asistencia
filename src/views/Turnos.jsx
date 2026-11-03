import { useStore } from '../store.jsx';
import { DAYS, fmt, nextWeek, parseBlocks, setShift } from '../lib/rules.js';
import { Box, Table } from '../ui.jsx';

const sch = (bl) => (bl.length ? bl.map((b) => `${fmt(b.s)}–${fmt(b.e)}`).join(' y ') : <span className="mu">Descanso</span>);

export default function Turnos() {
  const { state, dispatch } = useStore();
  const { emps, week, next } = state;
  const head = ['Empleado', ...DAYS.map((d) => d.slice(0, 3))];

  const edit = (e, d) => {
    const cur = next[e.id][d].map((b) => `${fmt(b.s)}-${fmt(b.e)}`).join(',');
    const v = prompt(`Bloques de ${e.name} el ${DAYS[d]} (ej. 07:00-09:30,17:00-21:00). Vacío = descanso:`, cur);
    if (v === null) return;
    const bl = parseBlocks(v);
    if (!bl) return alert('Formato no válido');
    const days = [...next[e.id]];
    days[d] = bl;
    dispatch({ type: 'next', id: e.id, days });
  };
  const put = (e, days) => dispatch({ type: 'next', id: e.id, days });

  return (
    <>
      <Box title="Próxima semana"
        note="Rotar invierte los turnos de 7:00 y 12:00. Los horarios partidos se copian igual. El viernes de Arely siempre es de 7:00 a 15:00 y Naty siempre descansa viernes y sábado.">
        <div className="row" style={{ marginBottom: 10 }}>
          <button className="p" onClick={() => dispatch({ type: 'nextAll' })}>Rotar todos desde la semana en curso</button>
        </div>
        <Table
          head={[...head, 'Atajos']}
          rows={emps.map((e) => [
            e.name,
            ...DAYS.map((_, d) => <button key={d} className="g" onClick={() => edit(e, d)}>{sch(next[e.id][d])}</button>),
            <>
              <button className="g" onClick={() => put(e, nextWeek(e, week[e.id]))}>Rotar</button>{' '}
              <button className="g" onClick={() => put(e, setShift(e, next[e.id], '07:00', '15:00'))}>Todo 7:00</button>{' '}
              <button className="g" onClick={() => put(e, setShift(e, next[e.id], '12:00', '20:00'))}>Todo 12:00</button>
            </>,
          ])}
        />
      </Box>
      <Box title="Semana en curso">
        <Table head={head} rows={emps.map((e) => [e.name, ...DAYS.map((_, d) => sch(week[e.id][d]))])} />
      </Box>
    </>
  );
}
