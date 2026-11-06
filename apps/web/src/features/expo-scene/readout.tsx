export function ExpoReadout({ name, probability }: { name: string; probability: number | null }) {
  const percent = probability === null ? 0 : Math.max(0, Math.min(1, probability)) * 100;
  return <div className="expo-center">
    <h2>{name}</h2>
    <div className="expo-meter">
      <p>P(claim)<strong aria-live="polite">{probability === null ? '—' : probability.toFixed(2)}</strong></p>
      <svg className="expo-ring" viewBox="0 0 100 100" aria-hidden="true">
        <circle className="expo-ring-track" cx="50" cy="50" r="43" />
        <circle className="expo-ring-value" cx="50" cy="50" r="43" pathLength="100" strokeDasharray={`${percent} 100`} transform="rotate(-90 50 50)" />
      </svg>
    </div>
  </div>;
}
