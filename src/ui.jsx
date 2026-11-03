import { STATUS } from './lib/rules.js';

export const Badge = ({ k }) => <span className={`b ${STATUS[k][1]}`}>{STATUS[k][0]}</span>;
export const Box = ({ title, note, children }) => (
  <section className="box">
    {title && <h2>{title}</h2>}
    {children}
    {note && <p className="sub">{note}</p>}
  </section>
);
export const Table = ({ head, rows }) => (
  <div className="sc">
    <table>
      <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
    </table>
  </div>
);
