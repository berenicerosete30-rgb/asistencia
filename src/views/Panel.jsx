import { useState } from 'react';
import { useStore } from '../store.jsx';
import { DAYS, evalBlock, fmt, label, pendingList } from '../lib/rules.js';
import { addDays } from '../lib/dates.js';
import { Badge, Box, Table } from '../ui.jsx';

export default function Panel() {
  const { state, dispatch } = useStore();
  const { emps, week, cfg, day, weekStart } = state;
  const [id, setId] = useState(emps[0].id);
  const [time, setTime] = useState('06:58');
  const [msg, setMsg] = useState('');
  const [listo, setListo] = useState(false);

  const blocks = emps.flatMap((e) => week[e.id][day].map((b) => ({ e, b, r: evalBlock(b, cfg) })));
  const rows = blocks.map(({ e, b, r }) => [e.name, `${fmt(b.s)}–${fmt(b.e)}`, fmt(b.i), fmt(b.o), <Badge k={label(r)} />]);

  const reproducirSonido = () => {
    try {
      const audio = new Audio('/beep.mp3');
      audio.play().catch(() => {
        // Fallback a beep.wav o sintetizador del navegador si aún no se ha colocado el archivo
        const audioWav = new Audio('/beep.wav');
        audioWav.play().catch(() => {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (AudioCtx) {
            const ctx = new AudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(659.25, ctx.currentTime);
            osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
            osc.start();
            osc.stop(ctx.currentTime + 0.25);
          }
        });
      });
    } catch (e) {
      console.warn('Audio no disponible', e);
    }
  };

  const checar = async () => {
    const e = emps.find((x) => x.id === id);
    const r = await dispatch({ type: 'simulate', body: { uid: e.uid, date: addDays(weekStart, day), time } });
    setMsg(r.msg);
    reproducirSonido();
    setListo(true);
    setTimeout(() => setListo(false), 2000);
  };

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <label>Día de la semana
          <select value={day} onChange={(e) => dispatch({ type: 'day', day: +e.target.value })}>
            {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
        </label>
      </div>
      <div className="stats">
        <div><b>{blocks.length}</b><span>bloques programados</span></div>
        <div><b>{blocks.filter((x) => x.b.i != null).length}</b><span>entradas registradas</span></div>
        <div><b>{blocks.filter((x) => x.r.st === 'retardo').length}</b><span>retardos</span></div>
        <div><b>{pendingList(emps, week, cfg).length}</b><span>salidas pendientes (semana)</span></div>
      </div>
      <Box title={DAYS[day]}>
        {rows.length ? <Table head={['Empleado', 'Horario', 'Entrada', 'Salida', 'Estatus']} rows={rows} /> : <p className="mu">Nadie tiene horario este día.</p>}
      </Box>
      <Box title="Simular checado con tarjeta" note="Hace lo mismo que el ESP32, pero con el día de arriba y la hora que elijas.">
        <div className="row">
          <label>Tarjeta
            <select value={id} onChange={(e) => setId(e.target.value)}>
              {emps.map((e) => <option key={e.id} value={e.id}>{e.name} · {e.uid}</option>)}
            </select>
          </label>
          <label>Hora<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
          <button className={`p ${listo ? 'success' : ''}`} onClick={checar} disabled={listo}>
            {listo ? '✓ Listo' : 'Acercar tarjeta'}
          </button>
        </div>
        {msg && <div className="toast">{msg}</div>}
      </Box>
    </>
  );
}
