"use client";

import { startTransition, useOptimistic } from "react";
import type { CSSProperties, ReactNode } from "react";
import { saveHiddenTiles } from "@/app/actions";
import { useApp } from "./AppShell";
import { Icon } from "./Icon";

// One card on the overview. `width` is its column; without one it shares what's left of the row.
export interface Tile { id: string; title: string; width?: string; card: ReactNode }

const FLEX = "minmax(0, 1fr)";

function columns(row: Tile[]) {
  const widths = row.map((t) => t.width ?? FLEX);
  // Fixed-width tiles on their own would leave the rest of the row empty, so they share it instead.
  return (widths.includes(FLEX) ? widths : widths.map(() => FLEX)).join(" ");
}

// The overview each user trims to what they need. Removed tiles are saved per
// user on the server; the tile disappears at once and the save follows.
export function Overview({ rows }: { rows: Tile[][] }) {
  const { hiddenTiles, toast } = useApp();
  const [hidden, setHidden] = useOptimistic(hiddenTiles);
  const tiles = rows.flat();
  // `hidden` is in the order the tiles were removed, so the first one still known is the next to come back.
  const removed = hidden.flatMap((id) => tiles.find((t) => t.id === id) ?? []);

  function save(next: string[]) {
    startTransition(async () => {
      setHidden(next);
      try {
        await saveHiddenTiles(next);
      } catch {
        toast("Couldn’t save your overview. Try again in a moment.");
      }
    });
  }

  return (
    <>
      {rows.map((row, i) => {
        const shown = row.filter((t) => !hidden.includes(t.id));
        if (!shown.length) return null;
        return (
          <div className="grid g-tiles" key={i} style={{ "--cols": columns(shown) } as CSSProperties}>
            {shown.map((t) => (
              <div className="tile" key={t.id}>
                {t.card}
                <button className="tile-x" aria-label={`Remove ${t.title}`} title="Remove from overview" onClick={() => save([...hidden, t.id])}>
                  <Icon name="x" />
                </button>
              </div>
            ))}
          </div>
        );
      })}
      {removed.length === tiles.length && <div className="card"><div className="empty">You’ve removed every tile from your overview.</div></div>}
      {removed.length > 0 && (
        <div className="restore">
          <button className="btn ghost sm" title={`Add back ${removed[0].title}`} onClick={() => save(hidden.filter((id) => id !== removed[0].id))}>
            <Icon name="redo" />Redo
          </button>
          {removed.length} {removed.length === 1 ? "tile" : "tiles"} removed
          <button className="link" onClick={() => save([])}>Restore all</button>
        </div>
      )}
    </>
  );
}
