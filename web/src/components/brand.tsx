import cloud from "@/assets/brand/lingxi-cloud.png"

/** Generated C4D-style cloud, shared by the brand and conversation welcome. */
export function BrandCloud({ className = "" }: { className?: string }) {
  return <img className={className} src={cloud} width={144} height={108} alt="" aria-hidden="true" draggable={false} />
}
