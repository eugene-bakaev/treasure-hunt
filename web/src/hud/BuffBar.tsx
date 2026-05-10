interface Props {
  fasterShovelTicksRemaining: number;
}

const MAX_TICKS = 450;

export default function BuffBar({ fasterShovelTicksRemaining }: Props) {
  if (fasterShovelTicksRemaining <= 0) {
    return null;
  }

  const seconds = Math.ceil(fasterShovelTicksRemaining / 30);
  const widthPct = Math.min(100, (fasterShovelTicksRemaining / MAX_TICKS) * 100);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span style={{ width: '10rem', color: '#eee', fontSize: '0.85rem' }}>
        FASTER SHOVEL {seconds}s
      </span>
      <div
        role="progressbar"
        aria-valuenow={fasterShovelTicksRemaining}
        aria-valuemin={0}
        aria-valuemax={MAX_TICKS}
        style={{
          flex: 1,
          height: '0.75rem',
          background: '#444',
          borderRadius: '4px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${widthPct}%`,
            height: '100%',
            background: '#88aaff', // Shovel blue
            transition: 'width 0.1s linear',
          }}
        />
      </div>
    </div>
  );
}
