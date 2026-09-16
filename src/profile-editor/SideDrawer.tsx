import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

// Shared chrome for the message/dictionary/error editors — backdrop +
// centered popup (not a right-edge drawer), header with a title slot +
// close button. Body content is up to the caller (bit-grid + fields,
// dictionary entries table, whatever). `bodyClassName` replaces the
// default padded/scrolling body wrapper entirely, for callers (the
// message editor's two-column layout) that manage their own padding and
// per-column scrolling instead.
export function SideDrawer({
  onClose,
  header,
  children,
  footer,
  maxWidth = "640px",
  bodyClassName,
}: {
  onClose: () => void;
  header: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
  bodyClassName?: string;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40 animate-in bg-foreground/20 backdrop-blur-[1px] fade-in duration-150" onClick={onClose} />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-6">
        <div
          className="pointer-events-auto flex max-h-[88vh] resize animate-in flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl fade-in slide-in-from-bottom-2 zoom-in-95 duration-200"
          style={{ width: maxWidth, maxWidth: "95vw", minWidth: 420, minHeight: 320 }}
        >
          <div className="flex shrink-0 items-start justify-between gap-2 border-b p-4">
            <div className="min-w-0 flex-1">{header}</div>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className={`min-h-0 flex-1 ${bodyClassName ?? "overflow-auto p-4"}`}>{children}</div>
          {footer && <div className="flex shrink-0 justify-end border-t p-3">{footer}</div>}
        </div>
      </div>
    </>
  );
}
