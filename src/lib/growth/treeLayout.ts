// Раскладка дерева навыков (Спецификация, раздел 10). Чистая функция: ветки и навыки → координаты.
// Раскладка «застывшая»: считается при изменении набора видимых навыков, хранится в settings.tree_layout,
// при каждом заходе дерево то же. Ширина 900 не растёт; не влезает по высоте — область растёт вниз (база 830).

export const TREE_W = 900;
const X = TREE_W / 2;          // персонаж — посередине между ветками
const HUB_DX = 110;            // центр левой (и единственной правой) ветки
const HUB_DX_MULTI = 130;      // центры правых веток, когда их несколько
const TOP = 100;               // первый узел при базовой высоте
const BASE_SPAN = 648;         // высота столбика узлов, которая влезает в базу
const BASE_H = 830;
const STEP_MAX = 90;
const ARC_MIN = 40, ARC_ADD = 85; // отступ узла от центра ветки: 40 у краёв, 125 посередине
const CHIP_GAP = 64;           // переключатель ветки — над первым узлом
const BAND_GAP = 40;           // между правыми ветками

export const nodeSize = (count: number) => (count <= 10 ? 64 : 48);
/** Шаг по высоте: от 90 до минимума «хитбокс + 8» (узел + 8). */
export const stepFor = (count: number, d = nodeSize(count)) => (count <= 1 ? 0 : Math.min(STEP_MAX, Math.max(d + 8, BASE_SPAN / (count - 1))));

export type TreeBranchInput = { key: string; skills: string[] };
export type TreeNodePos = { x: number; y: number; d: number; side: -1 | 1; branch: string };
export type TreeHub = { key: string; x: number; y: number; side: -1 | 1; chipX: number; chipY: number; d: number };
export type TreeGeom = { sig: string; w: number; h: number; cx: number; cy: number; hubs: TreeHub[]; nodes: Record<string, TreeNodePos> };

/** Подпись набора навыков: меняется только при добавлении, скрытии, удалении или перестановке навыка. */
export const treeSig = (branches: TreeBranchInput[]) => branches.map((b) => b.key + ':' + b.skills.join(',')).join('|');

function column(ids: string[], hub: { x: number; y: number }, side: -1 | 1, branch: string, out: Record<string, TreeNodePos>) {
  const d = nodeSize(ids.length), s = stepFor(ids.length, d);
  const span = (ids.length - 1) * s, half = span / 2;
  ids.forEach((id, i) => {
    const dy = -half + i * s;
    const t = half ? dy / half : 0;
    out[id] = { x: hub.x + side * (ARC_MIN + ARC_ADD * (1 - t * t)), y: hub.y + dy, d, side, branch };
  });
  return { d, span };
}

export function treeLayout(branches: TreeBranchInput[]): TreeGeom {
  const nodes: Record<string, TreeNodePos> = {};
  const hubs: TreeHub[] = [];
  const [left, ...right] = branches;
  const spanOf = (n: number) => Math.max(0, n - 1) * stepFor(n);

  // Высота: левая ветка столбиком, правые — полосами друг под другом.
  const leftSpan = left ? spanOf(left.skills.length) : 0;
  const bands = right.map((b) => {
    const d = nodeSize(b.skills.length);
    return { b, d, span: spanOf(b.skills.length), h: spanOf(b.skills.length) + d + (right.length > 1 ? CHIP_GAP : 0) };
  });
  const rightSpan = right.length <= 1 ? (bands[0]?.span ?? 0) : bands.reduce((s, x) => s + x.h, 0) + BAND_GAP * (bands.length - 1);
  const need = Math.max(leftSpan, rightSpan);
  const h = BASE_H + Math.max(0, need - BASE_SPAN);
  const cy = TOP + Math.max(need, BASE_SPAN) / 2;

  if (left) {
    const hub = { x: X - HUB_DX, y: cy };
    const { d, span } = column(left.skills, hub, -1, left.key, nodes);
    hubs.push({ key: left.key, ...hub, side: -1, d, chipX: 0, chipY: cy - span / 2 - d / 2 - CHIP_GAP });
  }
  if (right.length === 1) {
    const b = right[0];
    const hub = { x: X + HUB_DX, y: cy };
    const { d, span } = column(b.skills, hub, 1, b.key, nodes);
    hubs.push({ key: b.key, ...hub, side: 1, d, chipX: hub.x + 50, chipY: cy - span / 2 - d / 2 - CHIP_GAP });
  } else if (right.length > 1) {
    let y = cy - rightSpan / 2;
    for (const band of bands) {
      const top = y + CHIP_GAP;                       // место под переключатель
      const hub = { x: X + HUB_DX_MULTI, y: top + band.d / 2 + band.span / 2 };
      const { d, span } = column(band.b.skills, hub, 1, band.b.key, nodes);
      hubs.push({ key: band.b.key, ...hub, side: 1, d, chipX: hub.x + 50, chipY: hub.y - span / 2 - d / 2 - CHIP_GAP + 4 });
      y += band.h + BAND_GAP;
    }
  }
  return { sig: treeSig(branches), w: TREE_W, h, cx: X, cy, hubs, nodes };
}
