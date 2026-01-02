import * as React from "react";

// Hook to detect if the device is mobile-like (touchscreen).
// Uses CSS media query for "coarse pointer" as a proxy for touch devices.
export function useIsMobileLike() {
  // “coarse pointer” is a good proxy for touch devices (phones/tablets)
  const [isMobileLike, setIsMobileLike] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia?.("(pointer: coarse)");
    const update = () => setIsMobileLike(!!mq?.matches);
    update();
    mq?.addEventListener?.("change", update);
    return () => mq?.removeEventListener?.("change", update);
  }, []);

  return isMobileLike;
}
