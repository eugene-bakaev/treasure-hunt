import { Application, Graphics, Container } from 'pixi.js';
import type { PlayerSnapshot, Facing } from '@treasure-hunt/protocol';

const CELL_SIZE = 16;
const PLAYER_COLOR = 0xffdd00; // yellow
const RADIUS = CELL_SIZE * 0.4;

const FACING_OFFSET: Record<Facing, { dx: number; dy: number }> = {
  N: { dx: 0, dy: -3 },
  S: { dx: 0, dy: 3 },
  E: { dx: 3, dy: 0 },
  W: { dx: -3, dy: 0 },
};

export class PlayerRenderer {
  private container: Container;
  private sprites = new Map<string, Graphics>(); // playerId → graphic

  constructor(app: Application) {
    this.container = new Container();
    app.stage.addChild(this.container);
  }

  update(players: PlayerSnapshot[]): void {
    const seen = new Set<string>();

    for (const player of players) {
      seen.add(player.id);
      let g = this.sprites.get(player.id);
      if (!g) {
        g = new Graphics();
        this.sprites.set(player.id, g);
        this.container.addChild(g);
      }

      const cx = player.x * CELL_SIZE;
      const cy = player.y * CELL_SIZE;
      const { dx, dy } = FACING_OFFSET[player.facing];

      g.clear();
      // Body
      g.circle(cx, cy, RADIUS).fill(PLAYER_COLOR);
      // Facing dot
      g.circle(cx + dx, cy + dy, 2).fill(0x000000);
    }

    // Remove sprites for players who left
    for (const [id, g] of this.sprites) {
      if (!seen.has(id)) {
        this.container.removeChild(g);
        this.sprites.delete(id);
      }
    }
  }
}
