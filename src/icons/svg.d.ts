// An imported `.svg` is a component (SVGR — see `turbopack.rules` in
// next.config.ts) that spreads props onto the root `<svg>`.
declare module "*.svg" {
  import type { FC, SVGProps } from "react";
  const Icon: FC<SVGProps<SVGSVGElement>>;
  export default Icon;
}
