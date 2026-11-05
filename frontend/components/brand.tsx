import Image from "next/image";

// takeflow-logo-reversed.png goes on navy, takeflow-logo.png on light backgrounds.
export function Logo({ onNavy = false, width = 132, priority = false }: { onNavy?: boolean; width?: number; priority?: boolean }) {
  return onNavy ? (
    <Image src="/brand/takeflow-logo-reversed.png" alt="TakeFlow" width={1224} height={346} style={{ width, height: "auto" }} priority={priority} />
  ) : (
    <Image src="/brand/takeflow-logo.png" alt="TakeFlow" width={1265} height={375} style={{ width, height: "auto" }} priority={priority} />
  );
}
