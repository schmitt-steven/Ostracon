/**
 * What `import TagIcon from "@/icons/tag.svg"` is, as far as TypeScript is
 * concerned. The transform is SVGR's (see `turbopack.rules` in next.config.ts),
 * which spreads whatever props it's given onto the root `<svg>` — so the call
 * site is where `className`, `aria-hidden` and the rest are set, and the file
 * on disk carries only the drawing.
 */
declare module "*.svg" {
  import type { FC, SVGProps } from "react";
  const Icon: FC<SVGProps<SVGSVGElement>>;
  export default Icon;
}
