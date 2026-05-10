import { Application, Graphics, Container } from 'pixi.js';
import type { CellType, ItemType } from '@treasure-hunt/protocol';

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
  private tiles = new Map<string, Graphics>(); // key = `${x},${y}`

  constructor(app: Application) {
    this.container = new Container();
    app.stage.addChild(this.container);
    this.groundContainer = new Container();
    app.stage.addChild(this.groundContainer);
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

  private drawCell(cellType: CellType): Graphics {
    const g = new Graphics();
    g.rect(0, 0, CELL_SIZE, CELL_SIZE)
      .fill(cellType === 'walkable' ? WALKABLE_COLOR : ROCK_COLOR);
    return g;
  }
}
