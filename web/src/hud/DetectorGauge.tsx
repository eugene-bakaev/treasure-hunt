interface Props { value: number; } // 0–100
export default function DetectorGauge({ value }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span style={{ width: '4rem', color: '#eee', fontSize: '0.85rem' }}>Detector</span>
      <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}
        style={{ flex: 1, height: '0.75rem', background: '#444', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%',
          background: value > 70 ? '#ff6b35' : value > 30 ? '#ffd700' : '#4ade80',
          transition: 'width 0.1s linear' }} />
      </div>
      <span style={{ width: '2.5rem', color: '#eee', fontSize: '0.85rem', textAlign: 'right' }}>{value}%</span>
    </div>
  );
}
