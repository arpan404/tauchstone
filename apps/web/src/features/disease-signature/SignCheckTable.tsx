import type { Schema } from '@/api/types';

export function SignCheckTable({
  rows,
}: {
  rows: NonNullable<Schema<'Signature'>['sign_check']>;
}) {
  return (
    <table aria-label="Sign check on known AD genes" className="w-full text-sm tabular-nums">
      <thead>
        <tr className="border-b border-neutral-200 text-left text-neutral-500">
          <th className="py-1 pr-2 font-medium">Gene</th>
          <th className="py-1 pr-2 font-medium">Expected</th>
          <th className="py-1 pr-2 font-medium">Observed stat</th>
          <th className="py-1 font-medium">Match</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.symbol} className="border-b border-neutral-100">
            <td className="py-1 pr-2 font-medium">{r.symbol}</td>
            <td className="py-1 pr-2">{r.expected === 'up' ? 'up in AD' : 'down in AD'}</td>
            <td className="py-1 pr-2">{r.stat.toFixed(2)}</td>
            <td className="py-1" aria-label={`${r.symbol} ${r.matches ? 'matches' : 'does not match'}`}>
              {r.matches ? (
                <span className="text-teal-700">✓</span>
              ) : (
                <span className="text-red-700">✗</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
