'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

import { ListSheetRow, useListRows } from './scenes/ListPages';

/**
 * Prints the List view with the browser (EXP-09): every row of the outline as it is now,
 * as real text (selectable, sharp at any size). `globals.css` hides the rest of the page
 * while printing. Mounting it prints; `onDone` runs when the print dialog closes.
 */
export function PrintList({ title, onDone }: { title: string; onDone: () => void }) {
  const rows = useListRows(false);

  useEffect(() => {
    const done = () => onDone();
    window.addEventListener('afterprint', done, { once: true });
    // Let the rows render before the print dialog takes a snapshot.
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', done);
    };
  }, [onDone]);

  return createPortal(
    <div id="print-root" data-export className="hidden font-sans text-foreground print:block">
      <h1 className="pb-4 text-2xl font-semibold">{title}</h1>
      {rows.map((row) => (
        <ListSheetRow key={row.key} row={row} photos />
      ))}
    </div>,
    document.body,
  );
}
