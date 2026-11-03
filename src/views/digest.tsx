import type { DigestNight } from '../digest/types.js';

const dash = '—';

function badLinesText(n: number) {
  return `${n} bad ${n === 1 ? 'line' : 'lines'}`;
}

export function DigestPage({ digest }: { digest: DigestNight }) {
  const { rows, badLines } = digest;
  return (
    <>
      <h1>digest · {digest.night}</h1>
      {rows.length === 0 ? (
        <p class="mute">{badLines > 0 ? `no readable rows · ${badLines} bad lines` : 'nothing ran'}</p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>job</th>
                <th>owner</th>
                <th>runs</th>
                <th>retries</th>
                <th>last status</th>
                <th>last error</th>
                <th>first</th>
                <th>last</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr>
                  <td>{r.job}</td>
                  <td>{r.owner ?? dash}</td>
                  <td>{r.runs}</td>
                  <td class={r.retries >= 3 ? 'warn' : undefined}>{r.retries}</td>
                  <td class={r.fails > 0 ? 'warn' : undefined}>{r.lastStatus}</td>
                  <td>{r.lastError ?? dash}</td>
                  <td>{r.firstAt}</td>
                  <td>{r.lastAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p class={badLines > 0 ? 'warn' : 'mute'}>{badLinesText(badLines)}</p>
        </>
      )}
    </>
  );
}
