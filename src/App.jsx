import { useState } from 'react';
import { useStore } from './store.jsx';
import { pendingList } from './lib/rules.js';
import { addDays, mondayOf, rango } from './lib/dates.js';
import Semana from './views/Semana.jsx';
import Panel from './views/Panel.jsx';
import Turnos from './views/Turnos.jsx';
import { Asistencia, Bono, Retardos, Extras } from './views/Reportes.jsx';
import Empleados from './views/Empleados.jsx';
import { Nomina, Pendientes, Config } from './views/Admin.jsx';

const TABS = [
  ['Entradas', Semana], ['Día y pruebas', Panel], ['Empleados', Empleados], ['Turnos', Turnos], ['Asistencia', Asistencia], ['Bono', Bono],
  ['Retardos', Retardos], ['Horas extra', Extras], ['Pendientes', Pendientes], ['Nómina', Nomina], ['Configuración', Config],
];

export default function App() {
  const [tab, setTab] = useState(0);
  const { state, setWeekStart } = useStore();
  if (state.error) return <main><div className="box"><h2>Sin conexión</h2><p>{state.error}</p></div></main>;
  if (!state.ready) return <main><p className="mu">Cargando…</p></main>;
  const pend = pendingList(state.emps, state.week, state.cfg).length;
  const View = TABS[tab][1];
  const go = (n) => setWeekStart(addDays(state.weekStart, 7 * n));
  return (
    <>
      <header className="top">
        <div className="brand">
          <img src="/logo-tren.png" alt="Papelería El Trenecito" />
          <div><h1>Papelería El Trenecito</h1><span>Control de asistencia</span></div>
        </div>
        <div className="wknav">
          <button className="g" aria-label="Semana anterior" onClick={() => go(-1)}>‹</button>
          <b>{rango(state.weekStart)}</b>
          <button className="g" aria-label="Semana siguiente" onClick={() => go(1)}>›</button>
          <button className="g" onClick={() => setWeekStart(mondayOf())}>Hoy</button>
        </div>
      </header>
      <nav>
        {TABS.map(([name], i) => (
          <button key={name} className={i === tab ? 'on' : ''} onClick={() => setTab(i)}>
            {name}{name === 'Pendientes' && pend ? ` (${pend})` : ''}
          </button>
        ))}
      </nav>
      <main><View /></main>
    </>
  );
}
