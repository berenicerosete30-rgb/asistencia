import { useEffect, useRef, useState } from 'react';
import { useStore } from './store.jsx';
import { pendingList } from './lib/rules.js';
import { addDays, mondayOf, rango } from './lib/dates.js';
import Semana from './views/Semana.jsx';
import Panel from './views/Panel.jsx';
import Turnos from './views/Turnos.jsx';
import { Asistencia, Bono, Retardos, Extras } from './views/Reportes.jsx';
import Empleados from './views/Empleados.jsx';
import { Nomina, Pendientes, Config } from './views/Admin.jsx';

// Texto de los botones que YA tienen su propio sonido — no reproducir el clic aquí
const SIN_SONIDO = ['acercar tarjeta', '✓ listo', 'listo'];

function useGlobalClickSound() {
  const audioRef = useRef(null);

  useEffect(() => {
    // Pre-carga el audio una sola vez
    audioRef.current = new Audio('/click.wav');
    audioRef.current.volume = 0.45;

    const handleClick = (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;

      // Excluir botones deshabilitados
      if (btn.disabled) return;

      // Excluir botones que ya tienen su propio sonido
      const texto = btn.textContent.trim().toLowerCase();
      if (SIN_SONIDO.some((s) => texto.includes(s))) return;

      try {
        const audio = audioRef.current.cloneNode();
        audio.volume = 0.45;
        audio.play().catch(() => {
          // Fallback con AudioContext si el navegador bloquea el audio
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (!AudioCtx) return;
          const ctx = new AudioCtx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(620, ctx.currentTime + 0.07);
          gain.gain.setValueAtTime(0.25, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.1);
        });
      } catch (_) { /* silencioso */ }
    };

    document.addEventListener('click', handleClick, { capture: true });
    return () => document.removeEventListener('click', handleClick, { capture: true });
  }, []);
}

const TABS = [
  ['Entradas', Semana], ['Día y pruebas', Panel], ['Empleados', Empleados], ['Turnos', Turnos], ['Asistencia', Asistencia], ['Bono', Bono],
  ['Retardos', Retardos], ['Horas extra', Extras], ['Pendientes', Pendientes], ['Nómina', Nomina], ['Configuración', Config],
];

export default function App() {
  useGlobalClickSound();
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
            <span>{name}</span>
            {name === 'Pendientes' && pend ? <span className="tab-badge">{pend}</span> : null}
          </button>
        ))}
      </nav>
      <main><View /></main>
    </>
  );
}
