/* Toss build stand-in for next/image (a plain <img>); only the site-visit photo preview used it, which Toss hides. */
import type { ImgHTMLAttributes } from "react";

export default function Image({ unoptimized: _u, priority: _p, ...props }: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean; priority?: boolean }) {
  return <img {...props} />;
}
