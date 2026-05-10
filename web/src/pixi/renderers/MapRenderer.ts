import { Application, Graphics, Container, Ticker } from 'pixi.js';
import type { PlayerSnapshot, CellType, ItemType } from '@treasure-hunt/protocol';
import type { StoredCompassResult } from '../../state/gameStore.js';

const CELL_SIZE = 16;
const ROCK_COLOR = 0x333333;
const WALKABLE_COLOR = 0x888888;
const ITEM_SIZE = 8;

const ITEM_COLORS: Record<Exclude<ItemType, 'treasure'>, number> = {
  nugget: 0xffd700,
  shovel: 0x88aaff,
  compass: 0x88ffaa,
  bomb: 0xff8888,
};

export class MapRenderer {
  private container: Container;
  private groundContainer: Container;
  private compassContainer: Container;
  private compassGfx: Graphics;
  private compassTime = 0;
  private compassResult: StoredCompassResult | null = null;
  private localPlayer: PlayerSnapshot | undefined = undefined;
  private tiles = new Map<string, Graphics>(); // key = `${x},${y}`

  constructor(app: Application) {
    this.container = new Container();
    app.stage.addChild(this.container);
    this.groundContainer = new Container();
    app.stage.addChild(this.groundContainer);

    this.compassContainer = new Container();
    this.compassGfx = new Graphics();
    this.compassContainer.addChild(this.compassGfx);
    app.stage.addChild(this.compassContainer);

    app.ticker.add((ticker: Ticker) => {
      this.compassTime += ticker.deltaTime * 0.1;
      this.renderCompass();
    });
  }

  initMap(
    width: number,
    height: number,
    cells: Map<string, CellType>,
  ): void {
    this.container.removeChildren();
    this.tiles.clear();

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cellType = cells.get(`${x},${y}`) ?? 'rock';
        const g = this.drawCell(cellType);
        g.x = x * CELL_SIZE;
        g.y = y * CELL_SIZE;
        this.container.addChild(g);
        this.tiles.set(`${x},${y}`, g);
      }
    }
  }

  updateCells(cells: Map<string, CellType>): void {
    for (const [key, cellType] of cells) {
      const g = this.tiles.get(key);
      if (g) {
        g.clear();
        g.rect(0, 0, CELL_SIZE, CELL_SIZE)
          .fill(cellType === 'walkable' ? WALKABLE_COLOR : ROCK_COLOR);
      }
    }
  }

  updateGroundItems(items: Array<{ x: number; y: number; item: ItemType }>): void {
    for (const child of this.groundContainer.children) {
      (child as Graphics).destroy();
    }
    this.groundContainer.removeChildren();
    for (const { x, y, item } of items) {
      if (item === 'treasure') continue;
      const color = ITEM_COLORS[item as Exclude<ItemType, 'treasure'>];
      const g = new Graphics();
      g.rect(0, 0, ITEM_SIZE, ITEM_SIZE).fill(color);
      g.x = x * CELL_SIZE + (CELL_SIZE - ITEM_SIZE) / 2;
      g.y = y * CELL_SIZE + (CELL_SIZE - ITEM_SIZE) / 2;
      this.groundContainer.addChild(g);
    }
  }


  updateCompassMarker(result: StoredCompassResult | null, localPlayer?: PlayerSnapshot): void {
    this.compassResult = result;
    this.localPlayer = localPlayer;
    this.renderCompass();
  }

  private renderCompass(): void {
    this.compassGfx.clear();
    if (!this.compassResult) return;

    if (this.compassResult.kind === 'exact') {
      const pulse = (Math.sin(this.compassTime) + 1) / 2;
      const radius = 4 + pulse * 4;
      this.compassGfx.circle(
        this.compassResult.x * CELL_SIZE + CELL_SIZE / 2,
        this.compassResult.y * CELL_SIZE + CELL_SIZE / 2,
        radius
      ).fill({ color: 0xffffff, alpha: 0.5 + pulse * 0.5 });
    } else if (this.compassResult.kind === 'direction' && this.localPlayer) {
      const px = this.localPlayer.x * CELL_SIZE + CELL_SIZE / 2;
      const py = this.localPlayer.y * CELL_SIZE + CELL_SIZE / 2;
      const length = 20;
      const angle = this.compassResult.angleRad;

      this.compassGfx.moveTo(px, py);
      this.compassGfx.lineTo(px + Math.cos(angle) * length, py + Math.sin(angle) * length);
      this.compassGfx.stroke({ color: 0xffffff, width: 2 });

      const headSize = 6;
      this.compassGfx.moveTo(
        px + Math.cos(angle) * length,
        py + Math.sin(angle) * length
      );
      this.compassGfx.lineTo(
        px + Math.cos(angle - 0.5) * (length - headSize),
        py + Math.sin(angle - 0.5) * (length - headSize)
      );
      this.compassGfx.moveTo(
        px + Math.cos(angle) * length,
        py + Math.sin(angle) * length
      );
      this.compassGfx.lineTo(
        px + Math.cos(angle + 0.5) * (length - headSize),
        py + Math.sin(angle + 0.5) * (length - headSize)
      );
      this.compassGfx.stroke({ color: 0xffffff, width: 2 });
    }
  }

  private drawCell(cellType: CellType): Graphics {
    const g = new Graphics();
    g.rect(0, 0, CELL_SIZE, CELL_SIZE)
      .fill(cellType === 'walkable' ? WALKABLE_COLOR : ROCK_COLOR);
    return g;
  }
}
