/**
 * Radix returns focus to a dialog's or popover's trigger when it closes. The editor also
 * opens them from code (keyboard shortcuts, a menu that hands over to a form), with no
 * trigger, and focus would fall to the page. So the last element focused outside any
 * overlay is remembered, and gets focus back when nothing else took it.
 */
const OVERLAY =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [data-radix-popper-content-wrapper]';

let lastOutside: HTMLElement | SVGElement | null = null;

if (typeof document !== 'undefined') {
  document.addEventListener(
    'focusin',
    (event) => {
      const target = event.target;
      if (
        (target instanceof HTMLElement || target instanceof SVGElement) &&
        target !== document.body &&
        !target.closest(OVERLAY)
      ) {
        lastOutside = target;
      }
    },
    true,
  );
}

/** For `onCloseAutoFocus`: runs the caller's handler, then the fallback unless prevented. */
export function withReturnFocus(handler?: (event: Event) => void) {
  return (event: Event) => {
    handler?.(event);
    // The caller moved focus itself.
    if (event.defaultPrevented) return;
    // After Radix has focused the trigger, if there is one.
    window.setTimeout(() => {
      const active = document.activeElement;
      if ((active === null || active === document.body) && lastOutside?.isConnected) {
        lastOutside.focus({ preventScroll: true });
      }
    }, 0);
  };
}
