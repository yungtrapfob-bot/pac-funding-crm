'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFormStatus } from 'react-dom';
import { deleteHotLead } from '@/actions/deals';

export type HotLeadRowActionsProps = {
  leadId: string;
  businessName: string;
  isAdmin: boolean;
};

type MenuPosition = {
  top: number;
  left: number;
};

const MENU_WIDTH = 176;

export function HotLeadRowActions({ leadId, businessName, isAdmin }: HotLeadRowActionsProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const menuOpen = Boolean(menuPosition);

  function toggleMenu() {
    if (menuOpen) {
      setMenuPosition(null);
      return;
    }

    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    setMenuPosition({
      top: rect.bottom + 8,
      left: Math.max(8, rect.right - MENU_WIDTH)
    });
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`Actions for ${businessName}`}
        onClick={toggleMenu}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-lg leading-none text-muted-foreground transition hover:border-primary/50 hover:bg-muted hover:text-foreground"
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {menuPosition
        ? createPortal(
            <>
              <button type="button" aria-label="Close lead actions menu" className="fixed inset-0 z-40 cursor-default bg-transparent" onClick={() => setMenuPosition(null)} />
              <div
                role="menu"
                className="fixed z-50 overflow-hidden rounded-md border border-border bg-card py-1 text-left text-sm shadow-lg"
                style={{ top: menuPosition.top, left: menuPosition.left, width: MENU_WIDTH }}
              >
                <Link href={`/hot-leads/${leadId}`} role="menuitem" className="block px-3 py-2 text-foreground hover:bg-muted" onClick={() => setMenuPosition(null)}>
                  Open / View
                </Link>
                {isAdmin ? (
                  <form
                    action={deleteHotLead}
                    onSubmit={(event) => {
                      const confirmed = window.confirm(
                        `Delete hot lead "${businessName}"? This is intended only for junk/test leads and removes the lead plus its lead activity timeline. Converted leads are protected and will not be hard-deleted.`
                      );
                      if (!confirmed) event.preventDefault();
                    }}
                  >
                    <input type="hidden" name="hot_lead_id" value={leadId} />
                    <DeleteMenuItem />
                  </form>
                ) : null}
              </div>
            </>,
            document.body
          )
        : null}
    </>
  );
}

function DeleteMenuItem() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" role="menuitem" disabled={pending} className="block w-full px-3 py-2 text-left text-red-700 hover:bg-red-50 disabled:opacity-50">
      {pending ? 'Deleting...' : 'Delete lead'}
    </button>
  );
}
