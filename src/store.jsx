import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { addDays, mondayOf } from './lib/dates.js';
import { DEFAULT_CFG, nextWeek } from './lib/rules.js';

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);
const api = async (method, url, body) => {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
};

export function StoreProvider({ children }) {
  const [weekStart, setWeekStart] = useState(() => mondayOf());
  const [data, setData] = useState({ cfg: DEFAULT_CFG, emps: [], week: {}, next: {} });
  const [day, setDay] = useState(() => (new Date().getDay() + 6) % 7);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setData(await api('GET', `/api/state?start=${weekStart}`));
      setError('');
      setReady(true);
    } catch {
      setError('No se pudo conectar con el servidor. ¿Está corriendo "npm run server"?');
    }
  }, [weekStart]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000); // actualiza solo cuando llegan checadas del ESP32
    return () => clearInterval(t);
  }, [refresh]);

  const dispatch = async (a) => {
    let out;
    switch (a.type) {
      case 'day': return setDay(a.day);
      case 'cfg':
        setData((d) => ({ ...d, cfg: { ...d.cfg, [a.k]: a.v } }));
        await api('PUT', '/api/config', { k: a.k, v: a.v });
        break;
      case 'fixOut': await api('PUT', `/api/blocks/${a.blockId}`, { o: a.t }); break;
      case 'next': await api('PUT', '/api/schedule', { start: addDays(weekStart, 7), empId: a.id, days: a.days }); break;
      case 'nextAll':
        for (const e of data.emps) await api('PUT', '/api/schedule', { start: addDays(weekStart, 7), empId: e.id, days: nextWeek(e, data.week[e.id]) });
        break;
      case 'simulate': out = await api('POST', '/api/simulate', a.body); break;
      case 'lastUnknown': return api('GET', '/api/last-unknown');
      case 'empSave': out = a.id ? await api('PUT', `/api/employees/${a.id}`, a.body) : await api('POST', '/api/employees', a.body); break;
      case 'empDelete': out = await api('DELETE', `/api/employees/${a.id}`); break;
      case 'reset': await api('POST', '/api/reset'); break;
      default: return;
    }
    await refresh();
    return out;
  };

  const state = { ...data, day, weekStart, ready, error };
  return <Ctx.Provider value={{ state, dispatch, setWeekStart }}>{children}</Ctx.Provider>;
}
