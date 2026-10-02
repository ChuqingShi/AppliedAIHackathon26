"use client";

import type { CSSProperties, ReactNode } from "react";
import { useApp } from "./AppShell";
import { Icon } from "./Icon";

// A card the overview can show. A tile with a `row` is on the overview by
// default, in that row; one without is only there once the user adds it from
// its section. `width` is its column; without one it shares what's left of the row.
export interface Tile { id: string; title: string; card: ReactNode; row?: number; width?: string }

const FLEX = "minmax(0, 1fr)";
const ADDED_PER_ROW = 2;

function columns(row: Tile[]) {
  const widths = row.map((t) => t.width ?? FLEX);
  // Fixed-width tiles on their own would leave the rest of the row empty, so they share it instead.
  return (widths.some((w) => w.includes("fr")) ? widths : widths.map(() => FLEX)).join(" ");
}

// Reads and changes what's on the signed-in user's overview. `removed` is kept
// in the order tiles were taken off, `added` in the order they were put on.
function useOverviewLayout() {
  const { overview, setOverview, toast } = useApp();
  const { removed, added } = overview;
  return {
    removed,
    added,
    has: (t: Tile) => !removed.includes(t.id) && (t.row !== undefined || added.includes(t.id)),
    add(t: Tile) {
      setOverview({
        removed: removed.filter((id) => id !== t.id),
        added: t.row !== undefined ? added : [...added.filter((id) => id !== t.id), t.id],
      });
      toast(`Added “${t.title}” to your overview`);
    },
    remove: (t: Tile) => setOverview({ removed: [...removed.filter((id) => id !== t.id), t.id], added }),
    restore: (t: Tile) => setOverview({ removed: removed.filter((id) => id !== t.id), added }),
    restoreAll: () => setOverview({ removed: [], added }),
  };
}

// The overview each user arranges for themselves: the default tiles, then the
// ones they added, minus the ones they removed.
export function Overview({ tiles }: { tiles: Tile[] }) {
  const layout = useOverviewLayout();
  const rows: Tile[][] = [];
  for (const t of tiles) if (t.row !== undefined && layout.has(t)) (rows[t.row] ??= []).push(t);
  const extra = layout.added.flatMap((id) => tiles.find((t) => t.id === id && t.row === undefined && layout.has(t)) ?? []);
  for (let i = 0; i < extra.length; i += ADDED_PER_ROW) rows.push(extra.slice(i, i + ADDED_PER_ROW));
  // The first tile still known is the next one Redo brings back.
  const removed = layout.removed.flatMap((id) => tiles.find((t) => t.id === id) ?? []);

  return (
    <>
      {rows.map((row, i) => row && (
        <div className="grid g-tiles" key={i} style={{ "--cols": columns(row) } as CSSProperties}>
          {row.map((t) => (
            <div className="tile" key={t.id}>
              {t.card}
              <button className="tile-x" aria-label={`Remove ${t.title}`} title="Remove from overview" onClick={() => layout.remove(t)}>
                <Icon name="x" />
              </button>
            </div>
          ))}
        </div>
      ))}
      {!rows.some(Boolean) && <div className="card"><div className="empty">Your overview has no tiles. Bring them back below, or add tiles from any section.</div></div>}
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
