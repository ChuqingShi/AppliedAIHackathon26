"use client";

import { useRef, useState } from "react";
import type { CSSProperties, DragEvent, KeyboardEvent, MouseEvent, PointerEvent, ReactNode } from "react";
import type { OverviewLayout, TileSize } from "@/data/types";
import { useApp } from "./AppShell";
import { Icon } from "./Icon";

// A card the overview can show. A tile with a `row` is on the overview by
// default, in that row; one without is only there once the user adds it from
// its section. `size` is the one that suits it best (small unless given): until
// the user sets a size, a tile shares what's left of its row with the others
// that have none, in proportion to it.
export interface Tile { id: string; title: string; card: ReactNode; row?: number; size?: TileSize }

const ADDED_PER_ROW = 2;
const MAX_PER_ROW = 3;
// Dropping on the top or bottom quarter of a tile starts a new row there.
const EDGE = 0.25;
// Below this the rows collapse to one column (see .g-tiles in globals.css).
const STACKED = "(max-width: 1250px)";

const SIZES: TileSize[] = ["s", "m", "l"];
const SIZE_NAME: Record<TileSize, string> = { s: "Small", m: "Medium", l: "Large" };
// The space between tiles (see .g-tiles in globals.css).
const GAP = 16;
// How many sixths of a row each size takes.
const SPAN: Record<TileSize, number> = { s: 2, m: 3, l: 4 };
const ROW = 6;
// A tile wider than this share of its row counts as filling it.
const FULL = 0.85;

// The size whose width, in a row this wide, is closest to `width`: a third, a half or two thirds of the row.
function nearestSize(width: number, row: number) {
  const third = (row - 2 * GAP) / 3;
  const widths: Record<TileSize, number> = { s: third, m: (row - GAP) / 2, l: third * 2 + GAP };
  return SIZES.reduce((best, size) => (Math.abs(widths[size] - width) < Math.abs(widths[best] - width) ? size : best));
}

// Every tile with a place on the overview, row by row: the user's own
// arrangement once they have dragged tiles around, the default rows until then.
// Tiles that have no place yet (just added from a section) go at the end.
// Removed tiles keep their place, so they come back where they were.
function arrange(tiles: Tile[], { added, rows: saved }: OverviewLayout): Tile[][] {
  const byId = new Map(tiles.map((t) => [t.id, t]));
  const defaults = tiles.filter((t) => t.row !== undefined);
  const extra = added.flatMap((id) => { const t = byId.get(id); return t && t.row === undefined ? t : []; });
  const rows: Tile[][] = [];
  let rest = extra;
  if (saved.length) {
    const placed = new Set([...defaults, ...extra]);
    for (const ids of saved) rows.push(ids.flatMap((id) => { const t = byId.get(id); return t && placed.has(t) ? t : []; }));
    const seen = new Set(saved.flat());
    rest = [...placed].filter((t) => !seen.has(t.id));
  } else {
    for (const t of defaults) (rows[t.row!] ??= []).push(t);
  }
  for (let i = 0; i < rest.length; i += ADDED_PER_ROW) rows.push(rest.slice(i, i + ADDED_PER_ROW));
  return rows.filter((row) => row.length > 0);
}

// Where a dragged tile will land: beside another tile, or in a new row above or below that tile's row.
type Side = "before" | "after" | "above" | "below";
interface Drop { id: string; side: Side }

// The rows (as tile ids) after `id` is dropped on `drop`.
function move(rows: string[][], id: string, drop: Drop) {
  const at = rows.findIndex((row) => row.includes(drop.id));
  if (at < 0) return rows;
  const next = rows.map((row) => row.filter((other) => other !== id));
  if (drop.side === "above" || drop.side === "below") next.splice(drop.side === "above" ? at : at + 1, 0, [id]);
  else if (drop.id === id) return rows;
  else next[at].splice(next[at].indexOf(drop.id) + (drop.side === "after" ? 1 : 0), 0, id);
  return next.filter((row) => row.length > 0);
}

// A tile Auto-arrange is free to place, and how many sixths of a row suit it best.
interface Free { id: string; span: number }

// A line of tiles Auto-arrange leaves as it is: the locked tiles and whatever
// sits before them (`held`), the room left after them in sixths of a row, and
// the unlocked tiles chosen to fill it.
interface Anchor { held: string[]; room: number; fill: Free[] }

// What a row of unlocked tiles costs: nothing when their best sizes fill it
// exactly. They stretch or squeeze to fill it, and squeezing is the worse of the two.
function rowCost(row: Free[]) {
  const spare = ROW - row.reduce((sum, t) => sum + t.span, 0);
  return ((spare < 0 ? 2 : 1) * spare) ** 2;
}

// The tiles, kept in the order they read in, split into the rows that cost least.
function pack(tiles: Free[]) {
  // best[n]: the least the first n tiles can cost; from[n]: where the last of their rows starts.
  const best = [0];
  const from = [0];
  for (let end = 1; end <= tiles.length; end++) {
    best[end] = Infinity;
    for (let start = end - 1; start >= 0 && end - start <= MAX_PER_ROW; start--) {
      const cost = best[start] + rowCost(tiles.slice(start, end));
      if (cost < best[end]) { best[end] = cost; from[end] = start; }
    }
  }
  const rows: string[][] = [];
  for (let end = tiles.length; end > 0; end = from[end]) rows.unshift(tiles.slice(from[end], end).map((t) => t.id));
  return rows;
}

// The rows after Auto-arrange. `units` is the overview in the order it reads:
// the lines that hold locked tiles, and every tile that is free to move. Each
// of those lines keeps its tiles where they are and takes the nearest free
// tiles that fit in the room it has left; the rest are packed into rows around them.
function tidy(units: (Free | Anchor)[]) {
  const taken = new Set<Free>();
  units.forEach((anchor, at) => {
    if (!("held" in anchor)) return;
    // Nearest first, and at the same distance the one that comes after.
    const near = units
      .flatMap((u, i) => ("held" in u || taken.has(u) ? [] : [{ tile: u, far: Math.abs(i - at) + (i < at ? 0.5 : 0) }]))
      .sort((a, b) => a.far - b.far)
      .map((n) => n.tile);
    const full = () => anchor.held.length + anchor.fill.length >= MAX_PER_ROW;
    let room = anchor.room;
    for (const tile of near) {
      if (room < SPAN.s || full()) break;
      if (tile.span > room) continue;
      anchor.fill.push(tile);
      room -= tile.span;
    }
    // Nothing fits at its best size: squeeze the nearest one in rather than leave a gap.
    if (!anchor.fill.length && room >= SPAN.s && near.length && !full()) anchor.fill.push(near[0]);
    for (const tile of anchor.fill) taken.add(tile);
  });
  const rows: string[][] = [];
  let run: Free[] = [];
  for (const u of units) {
    if ("held" in u) {
      rows.push(...pack(run), [...u.held, ...u.fill.map((t) => t.id)]);
      run = [];
    } else if (!taken.has(u)) run.push(u);
  }
  return [...rows, ...pack(run)];
}

// Reads and changes what's on the signed-in user's overview. `removed` is kept
// in the order tiles were taken off, `added` in the order they were put on.
function useOverviewLayout() {
  const { overview, setOverview, toast } = useApp();
  const { removed, added, locked } = overview;
  return {
    overview,
    removed,
    isLocked: (t: Tile) => locked.includes(t.id),
    // Locking also fixes the tile's size, if it has one to fix; without one it keeps the whole row.
    lock: (t: Tile, size?: TileSize) => setOverview({ ...overview, locked: [...locked.filter((id) => id !== t.id), t.id], sizes: size ? { ...overview.sizes, [t.id]: size } : overview.sizes }),
    unlock: (t: Tile) => setOverview({ ...overview, locked: locked.filter((id) => id !== t.id) }),
    arrange: (rows: string[][], sizes: Record<string, TileSize>) => setOverview({ ...overview, rows, sizes }),
    has: (t: Tile) => !removed.includes(t.id) && (t.row !== undefined || added.includes(t.id)),
    add(t: Tile) {
      setOverview({
        ...overview,
        removed: removed.filter((id) => id !== t.id),
        added: t.row !== undefined ? added : [...added.filter((id) => id !== t.id), t.id],
      });
      toast(`Added “${t.title}” to your overview`);
    },
    remove: (t: Tile) => setOverview({ ...overview, removed: [...removed.filter((id) => id !== t.id), t.id] }),
    restore: (t: Tile) => setOverview({ ...overview, removed: removed.filter((id) => id !== t.id) }),
    restoreAll: () => setOverview({ ...overview, removed: [] }),
    setRows: (rows: string[][]) => setOverview({ ...overview, rows }),
    // No size puts the tile back to fitting around the others.
    setSize(t: Tile, size: TileSize | null) {
      const sizes = { ...overview.sizes };
      if (size) sizes[t.id] = size;
      else delete sizes[t.id];
      setOverview({ ...overview, sizes });
    },
  };
}

// The overview each user arranges for themselves: the default tiles, then the
// ones they added, minus the ones they removed, dragged into whatever rows they
// like. A tile they resize keeps that size; the rest fit around it. Auto-arrange
// tidies all of that up, except the tiles they locked.
export function Overview({ tiles }: { tiles: Tile[] }) {
  const { toast } = useApp();
  const layout = useOverviewLayout();
  const placed = arrange(tiles, layout.overview);
  const rows = placed.map((row) => row.filter(layout.has)).filter((row) => row.length > 0);
  // The first tile still known is the next one Redo brings back.
  const removed = layout.removed.flatMap((id) => tiles.find((t) => t.id === id) ?? []);

  // The tile being dragged, and where it would land if dropped now.
  const dragId = useRef<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const ids = placed.map((row) => row.map((t) => t.id));
  const visible = (all: string[][]) => all.map((row) => row.filter((id) => !layout.removed.includes(id))).filter((row) => row.length > 0);
  const changes = (id: string, to: Drop) => JSON.stringify(visible(move(ids, id, to))) !== JSON.stringify(visible(ids));

  // The tile being resized: where the pull on its grip began, and the size it has snapped to so far.
  const grip = useRef<{ id: string; left: number; x: number; moved: boolean } | null>(null);
  const [resizing, setResizing] = useState<{ id: string; size: TileSize } | null>(null);
  const sizeOf = (t: Tile): TileSize | undefined => (resizing?.id === t.id ? resizing.size : layout.overview.sizes[t.id]);

  function startResize(e: PointerEvent<HTMLDivElement>, t: Tile) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    // The tile can move as the row refits, so measure from where its left edge was at the start.
    grip.current = { id: t.id, left: e.currentTarget.parentElement!.getBoundingClientRect().left, x: e.clientX, moved: false };
  }

  function resize(e: PointerEvent<HTMLDivElement>, t: Tile) {
    const g = grip.current;
    if (g?.id !== t.id) return;
    if (!g.moved && Math.abs(e.clientX - g.x) < 4) return; // a click, not a pull
    g.moved = true;
    const size = nearestSize(e.clientX - g.left, e.currentTarget.closest(".g-tiles")!.clientWidth);
    setResizing((now) => (now?.id === t.id && now.size === size ? now : { id: t.id, size }));
  }

  function endResize(t: Tile, keep: boolean) {
    if (keep && grip.current?.moved && resizing?.id === t.id) layout.setSize(t, resizing.size);
    grip.current = null;
    setResizing(null);
  }

  // Arrow keys step through the sizes; Delete goes back to fitting around the others.
  function resizeByKey(e: KeyboardEvent<HTMLDivElement>, t: Tile) {
    const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    const reset = e.key === "Delete" || e.key === "Backspace";
    if (!step && !reset) return;
    e.preventDefault();
    if (reset) return layout.setSize(t, null);
    const tile = e.currentTarget.parentElement!;
    const now = layout.overview.sizes[t.id] ?? nearestSize(tile.offsetWidth, tile.parentElement!.clientWidth);
    layout.setSize(t, SIZES[Math.min(SIZES.length - 1, Math.max(0, SIZES.indexOf(now) + step))]);
  }

  // A locked tile with no size of its own keeps the whole row.
  const fills = (t: Tile) => layout.isLocked(t) && !layout.overview.sizes[t.id];

  // Locks the tile at the size it has on screen now, or unlocks it.
  function toggleLock(e: MouseEvent<HTMLButtonElement>, t: Tile, row: Tile[]) {
    if (layout.isLocked(t)) return layout.unlock(t);
    let size: TileSize | undefined = layout.overview.sizes[t.id];
    if (!size) {
      const tile = e.currentTarget.parentElement!;
      const width = tile.parentElement!.clientWidth;
      // Stacked in one column, every tile is as wide as its row, so go by what's in the row instead.
      if (window.matchMedia(STACKED).matches) size = row.length > 1 ? t.size ?? "s" : undefined;
      else if (tile.offsetWidth <= width * FULL) size = nearestSize(tile.offsetWidth, width);
    }
    layout.lock(t, size);
  }

  // Tidies the overview: every tile that isn't locked goes back to its best size, and they are split into rows
  // they fill. Locked tiles stay exactly where they are, and so does anything sitting before one on its line.
  const tilesEl = useRef<HTMLDivElement>(null);
  function autoArrange() {
    const sizes = { ...layout.overview.sizes };
    const units: (Free | Anchor)[] = [];
    for (const row of rows) {
      // The lines the row's tiles are on: a row wraps when its tiles don't fit side by side.
      const lines: { t: Tile; el: HTMLElement }[][] = [];
      for (const t of row) {
        const el = tilesEl.current!.querySelector<HTMLElement>(`[data-tile="${t.id}"]`)!;
        const line = lines.at(-1);
        if (line && line[0].el.offsetTop === el.offsetTop) line.push({ t, el });
        else lines.push([{ t, el }]);
      }
      for (const line of lines) {
        const held = line.slice(0, line.findLastIndex(({ t }) => layout.isLocked(t)) + 1);
        let used = 0;
        for (const { t, el } of held) {
          // An unlocked tile before a locked one keeps the width it has now, so the locked one doesn't shift.
          if (!layout.isLocked(t)) sizes[t.id] ??= nearestSize(el.offsetWidth, el.parentElement!.clientWidth);
          used += sizes[t.id] ? SPAN[sizes[t.id]] : ROW;
        }
        if (held.length) units.push({ held: held.map(({ t }) => t.id), room: Math.max(0, ROW - used), fill: [] });
        for (const { t } of line.slice(held.length)) {
          delete sizes[t.id];
          units.push({ id: t.id, span: SPAN[t.size ?? "s"] });
        }
      }
    }
    const next = tidy(units);
    const key = (r: string[][], z: Record<string, TileSize>) => JSON.stringify([r, Object.entries(z).sort()]);
    const same = key(next, sizes) === key(visible(ids), layout.overview.sizes);
    if (!same) layout.arrange(next, sizes);
    const kept = rows.flat().filter(layout.isLocked).length;
    toast(same ? "Your tiles are already arranged" : kept ? `Arranged around ${kept} locked ${kept === 1 ? "tile" : "tiles"}` : "Tiles arranged");
  }

  function startDrag(e: DragEvent<HTMLDivElement>, t: Tile) {
    // Pulling the grip resizes the tile rather than moving it, and a locked tile stays where it is.
    if (grip.current || layout.isLocked(t)) return e.preventDefault();
    dragId.current = t.id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", t.title);
    // Drag the whole tile, even when the drag began on a link or on selected text inside it.
    const box = e.currentTarget.getBoundingClientRect();
    e.dataTransfer.setDragImage(e.currentTarget, e.clientX - box.left, e.clientY - box.top);
    // Fade the tile only once the browser has taken its picture of it.
    setTimeout(() => { if (dragId.current === t.id) setDragging(t.id); });
  }

  function endDrag() {
    dragId.current = null;
    setDragging(null);
    setDrop(null);
  }

  function dragOver(e: DragEvent<HTMLDivElement>) {
    const id = dragId.current;
    if (!id) return; // something other than a tile, such as a file
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const from = e.target instanceof Element ? e.target : (e.target as Node).parentElement;
    const over = from?.closest<HTMLElement>("[data-tile]");
    const row = over && rows.find((r) => r.some((t) => t.id === over.dataset.tile));
    if (!over || !row) return; // in the gap between tiles: keep the last place shown
    const box = over.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width;
    const y = (e.clientY - box.top) / box.height;
    const stacked = window.matchMedia(STACKED).matches;
    let side: Side;
    // A full row takes no more tiles, so the only places left are above and below it.
    const others = row.filter((t) => t.id !== id);
    if (others.length >= MAX_PER_ROW || others.some(fills)) side = y < 0.5 ? "above" : "below";
    else if (stacked) side = y < 0.5 ? "before" : "after";
    else if (y < EDGE) side = "above";
    else if (y > 1 - EDGE) side = "below";
    else side = x < 0.5 ? "before" : "after";
    const to = { id: over.dataset.tile!, side };
    const next = changes(id, to) ? to : null;
    setDrop((now) => (now?.id === next?.id && now?.side === next?.side ? now : next));
  }

  function dragLeave(e: DragEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop(null);
  }

  function dropTile(e: DragEvent<HTMLDivElement>) {
    const id = dragId.current;
    if (!id) return;
    e.preventDefault();
    if (drop) layout.setRows(move(ids, id, drop));
    endDrag();
  }

  return (
    <>
      {rows.length > 0 && (
        <div className="tiles-bar">
          <button className="btn ghost sm" title="Resize and move every tile that isn’t locked so each row is filled" onClick={autoArrange}>
            <Icon name="grid" />Auto-arrange
          </button>
        </div>
      )}
      {rows.length > 0 && (
        <div className="tiles" ref={tilesEl} onDragOver={dragOver} onDragLeave={dragLeave} onDrop={dropTile}>
          {rows.map((row, i) => {
            const edge = drop && (drop.side === "above" || drop.side === "below") && row.some((t) => t.id === drop.id) ? ` drop-${drop.side}` : "";
            return (
              <div className={`g-tiles${edge}`} key={i}>
                {row.map((t) => {
                  const beside = drop?.id === t.id && (drop.side === "before" || drop.side === "after") ? ` drop-${drop.side}` : "";
                  const size = sizeOf(t);
                  const pulling = resizing?.id === t.id;
                  const locked = layout.isLocked(t);
                  return (
                    <div className={`tile${size ? ` size-${size}` : fills(t) ? " size-full" : ""}${dragging === t.id ? " dragging" : ""}${beside}`} key={t.id} data-tile={t.id} style={{ "--grow": SPAN[t.size ?? "s"] } as CSSProperties} draggable={!locked} onDragStart={(e) => startDrag(e, t)} onDragEnd={endDrag}>
                      {t.card}
                      <button className={locked ? "tile-lock on" : "tile-lock"} aria-pressed={locked} aria-label={`Lock ${t.title} in place`} title={locked ? "Locked in place. Click to unlock." : "Lock in place, so Auto-arrange leaves it as it is"} onClick={(e) => toggleLock(e, t, row)}>
                        <Icon name={locked ? "lock" : "unlock"} />
                      </button>
                      <button className="tile-x" aria-label={`Remove ${t.title}`} title="Remove from overview" onClick={() => layout.remove(t)}>
                        <Icon name="x" />
                      </button>
                      {!locked && (
                        <div
                          className={`tile-size${size ? " set" : ""}${pulling ? " on" : ""}`}
                          role="slider" tabIndex={0} aria-orientation="horizontal"
                          aria-label={`Size of ${t.title}`} aria-valuemin={0} aria-valuemax={SIZES.length}
                          aria-valuenow={size ? SIZES.indexOf(size) + 1 : 0} aria-valuetext={size ? SIZE_NAME[size] : "Fits the row"}
                          title="Drag to resize. Double-click to fit the row again."
                          onMouseDown={(e) => e.preventDefault()}
                          onPointerDown={(e) => startResize(e, t)} onPointerMove={(e) => resize(e, t)}
                          onPointerUp={() => endResize(t, true)} onPointerCancel={() => endResize(t, false)}
                          onDoubleClick={() => layout.setSize(t, null)} onKeyDown={(e) => resizeByKey(e, t)}
                        >
                          {pulling && <span className="tile-size-tag">{SIZE_NAME[resizing.size]}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
      {rows.length === 0 && <div className="card"><div className="empty">Your overview has no tiles. Bring them back below, or add tiles from any section.</div></div>}
      {removed.length > 0 && (
        <div className="restore">
          <button className="btn ghost sm" title={`Add back ${removed[0].title}`} onClick={() => layout.restore(removed[0])}>
            <Icon name="redo" />Redo
          </button>
          {removed.length} {removed.length === 1 ? "tile" : "tiles"} removed
          <button className="link" onClick={layout.restoreAll}>Restore all</button>
        </div>
      )}
    </>
  );
}

// A tile as it appears in its own section, with the button that puts it on the overview.
export function SectionTile({ tile, children }: { tile: Tile; children: ReactNode }) {
  const layout = useOverviewLayout();
  return (
    <div className="tile sec">
      {children}
      {layout.has(tile)
        ? <span className="tile-on"><Icon name="check" sm />On overview</span>
        : <button className="tile-add" onClick={() => layout.add(tile)}><Icon name="plus" sm />Add to overview</button>}
    </div>
  );
}
