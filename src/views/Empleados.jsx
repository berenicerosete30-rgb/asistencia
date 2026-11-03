import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.jsx';
import { DAYS, fmt, toMin } from '../lib/rules.js';
import { addDays } from '../lib/dates.js';
import { Box, Table } from '../ui.jsx';

function Form({ emp, onClose }) {
  const { state, dispatch } = useStore();
  const { next, weekStart, emps } = state;
  const nb = emp ? next[emp.id]?.flat()[0] : null; // primer bloque de la próxima semana, para precargar
  const fj = emp?.fijo ? Object.entries(emp.fijo)[0] : null;
  const [f, setF] = useState({
    first: emp?.first ?? '', last: emp?.last ?? '', id: emp?.id ?? '', area: emp?.area ?? 'Operación', uid: emp?.uid ?? '',
    s: fmt(nb?.s ?? 420), e: fmt(nb?.e ?? 900), desc: emp?.desc ?? [],
    fd: fj ? String(fj[0]) : '', fs: fj ? fmt(fj[1][0]) : '07:00', fe: fj ? fmt(fj[1][1]) : '15:00',
    apply: !emp,
  });
  const [err, setErr] = useState('');
  const [esperando, setEsp] = useState(false);
  const timer = useRef();
  useEffect(() => () => clearInterval(timer.current), []);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const preset = (s, e) => setF((p) => ({ ...p, s, e }));

  // Lee la próxima tarjeta desconocida que pase por el lector.
  const capturar = async () => {
    setErr('');
    setEsp(true);
    const base = (await dispatch({ type: 'lastUnknown' })).ts;
    let n = 0;
    clearInterval(timer.current);
    timer.current = setInterval(async () => {
      n++;
      const r = await dispatch({ type: 'lastUnknown' });
      if (r.uid && r.ts > base) { clearInterval(timer.current); setEsp(false); set('uid', r.uid); }
      else if (n > 20) { clearInterval(timer.current); setEsp(false); setErr('No llegó ninguna tarjeta nueva. Acércala al lector e inténtalo otra vez.'); }
    }, 1500);
  };

  const guardar = async () => {
    setErr('');
    if (f.apply && !(toMin(f.e) > toMin(f.s))) return setErr('La salida debe ser después de la entrada.');
    if (f.fd !== '' && f.desc.includes(+f.fd)) return setErr('Un día no puede ser de descanso y de horario fijo a la vez.');
    const body = {
      first: f.first, last: f.last, id: f.id, area: f.area, uid: f.uid, desc: f.desc,
      fijo: f.fd !== '' ? { [f.fd]: [toMin(f.fs), toMin(f.fe)] } : null,
      schedule: f.apply ? { s: toMin(f.s), e: toMin(f.e), weeks: emp ? [addDays(weekStart, 7)] : [weekStart, addDays(weekStart, 7)] } : null,
    };
    const r = await dispatch({ type: 'empSave', id: emp?.id, body });
    r?.ok ? onClose() : setErr(r?.msg || 'No se pudo guardar.');
  };
  const baja = async () => {
    if (!confirm(`¿Dar de baja a ${emp.name}? Sus registros se conservan y su tarjeta queda libre.`)) return;
    await dispatch({ type: 'empDelete', id: emp.id });
    onClose();
  };
  const toggle = (d) => set('desc', f.desc.includes(d) ? f.desc.filter((x) => x !== d) : [...f.desc, d]);
  const areas = [...new Set(emps.map((e) => e.area))];

  return (
    <Box title={emp ? `Editar a ${emp.name}` : 'Agregar empleado'}>
      <div className="form">
        <div className="fgrid">
          <label>Nombre(s)<input value={f.first} onChange={(e) => set('first', e.target.value)} autoFocus /></label>
          <label>Apellido(s)<input value={f.last} onChange={(e) => set('last', e.target.value)} /></label>
          <label>ID {emp ? '(no se puede cambiar)' : '(opcional, se asigna solo)'}
            <input value={f.id} disabled={!!emp} onChange={(e) => set('id', e.target.value)} />
          </label>
          <label>Área<input list="areas" value={f.area} onChange={(e) => set('area', e.target.value)} />
            <datalist id="areas">{areas.map((a) => <option key={a} value={a} />)}</datalist>
          </label>
        </div>

        <div>
          <label>Tarjeta RFID (UID)</label>
          <div className="row" style={{ marginTop: 4 }}>
            <input value={f.uid} placeholder="04:A3:1B:7C" onChange={(e) => set('uid', e.target.value)} />
            <button className="g" onClick={capturar} disabled={esperando}>{esperando ? 'Acerca la tarjeta al lector…' : 'Leer con el lector'}</button>
          </div>
          <p className="sub">Al leerla, el lector la marcará como “no registrada” (LED rojo). Es normal: aquí queda capturado su UID.</p>
        </div>

        <fieldset>
          <legend>Horario</legend>
          <div className="row">
            <label>Entrada<input type="time" value={f.s} onChange={(e) => set('s', e.target.value)} /></label>
            <label>Salida<input type="time" value={f.e} onChange={(e) => set('e', e.target.value)} /></label>
            <button className="g" onClick={() => preset('07:00', '15:00')}>7:00 a 15:00</button>
            <button className="g" onClick={() => preset('12:00', '20:00')}>12:00 a 20:00</button>
          </div>
          <label style={{ marginTop: 14 }}>Días de descanso fijos</label>
          <div className="days">
            {DAYS.map((d, i) => (
              <label key={d} className="chk"><input type="checkbox" checked={f.desc.includes(i)} onChange={() => toggle(i)} />{d.slice(0, 3)}</label>
            ))}
          </div>
          <label style={{ marginTop: 14 }}>Día con horario fijo (opcional)</label>
          <div className="row" style={{ marginTop: 4 }}>
            <select value={f.fd} onChange={(e) => set('fd', e.target.value)}>
              <option value="">Ninguno</option>
              {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
            {f.fd !== '' && <>
              <input type="time" value={f.fs} onChange={(e) => set('fs', e.target.value)} />
              <input type="time" value={f.fe} onChange={(e) => set('fe', e.target.value)} />
            </>}
          </div>
          <p className="sub">Un día fijo no cambia con la rotación semanal (por ejemplo, un viernes que siempre cubre el descanso de otra persona). Los turnos de 7:00 y 12:00 sí rotan cada semana.</p>
          <label className="chk" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={f.apply} onChange={(e) => set('apply', e.target.checked)} />
            {emp ? 'Reemplazar el horario de la próxima semana con estos datos' : 'Crear su horario de esta semana y la siguiente'}
          </label>
          <p className="sub">Los horarios partidos o por día se ajustan después en la pestaña Turnos.</p>
        </fieldset>

        {err && <div className="alert">{err}</div>}
        <div className="row">
          <button className="p" onClick={guardar}>Guardar</button>
          <button className="g" onClick={onClose}>Cancelar</button>
          {emp && <button className="g danger" onClick={baja}>Dar de baja</button>}
        </div>
      </div>
    </Box>
  );
}

export default function Empleados() {
  const { state: { emps } } = useStore();
  const [edit, setEdit] = useState(null); // null | 'new' | empleado
  const dias = (e) => (e.desc?.length ? e.desc.map((d) => DAYS[d].slice(0, 3)).join(', ') : '—');
  const fijo = (e) => (e.fijo ? Object.entries(e.fijo).map(([d, t]) => `${DAYS[d].slice(0, 3)} ${fmt(t[0])}–${fmt(t[1])}`).join(', ') : '—');
  return (
    <>
      {edit && <Form key={edit === 'new' ? 'new' : edit.id} emp={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      <Box title="Empleados" note="Una tarjeta pertenece a un solo empleado. Al dar de baja a alguien, sus registros se conservan y su tarjeta queda libre.">
        {!edit && <div className="row" style={{ marginBottom: 14 }}><button className="p" onClick={() => setEdit('new')}>Agregar empleado</button></div>}
        <Table
          head={['Nombre', 'ID', 'Área', 'Tarjeta (UID)', 'Descansos fijos', 'Día fijo', '']}
          rows={emps.map((e) => [
            <b>{e.name}</b>, e.id, e.area,
            e.uid || <span className="b wa">Sin tarjeta</span>,
            dias(e), fijo(e),
            <button className="g" onClick={() => setEdit(e)}>Editar</button>,
          ])}
        />
      </Box>
    </>
  );
}
