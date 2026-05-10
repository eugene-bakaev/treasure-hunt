interface Props {
  heldPowerup: 'shovel' | 'compass' | 'bomb' | null;
  disabled?: boolean;
}

const POWERUP_COLORS: Record<'shovel' | 'compass' | 'bomb', string> = {
  shovel: '#88aaff',
  compass: '#88ffaa',
  bomb: '#ff8888',
};

export default function PowerupSlot({ heldPowerup, disabled }: Props) {
  const isEmpty = heldPowerup === null;
  const color = isEmpty ? undefined : POWERUP_COLORS[heldPowerup];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.4rem 0.75rem',
        border: `2px solid ${isEmpty ? '#444' : color}`,
        borderRadius: '4px',
        background: isEmpty ? 'transparent' : `${color}33`,
        color: isEmpty ? '#555' : '#eee',
        fontFamily: 'monospace',
        fontSize: '0.85rem',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <span style={{ fontWeight: 'bold' }}>POWERUP:</span>
      <span>
        {isEmpty
          ? '—'
          : `${heldPowerup.toUpperCase()}${disabled ? ' (active)' : ''}`}
      </span>
    </div>
  );
}
