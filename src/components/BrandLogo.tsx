const LOGO_SRC = "/qualilab-logo-nobg.png";

const ALT =
  "Qualilab International — Laboratoire d'analyses agroalimentaire, eaux & environnement de travail";

type BrandLogoProps = {
  variant?: "full" | "compact" | "sidebar" | "onDark" | "invoice";
  className?: string;
};

export function BrandLogo({ variant = "full", className = "" }: BrandLogoProps) {
  const sizes: Record<
    NonNullable<BrandLogoProps["variant"]>,
    { width: number; height: number; className: string; crossOrigin?: boolean }
  > = {
    full: {
      width: 240,
      height: 96,
      className: "h-auto w-[180px] max-w-full object-contain object-left sm:w-[220px]",
    },
    compact: {
      width: 120,
      height: 48,
      className: "h-9 w-auto max-w-[120px] object-contain object-left",
    },
    sidebar: {
      width: 180,
      height: 72,
      className:
        "h-8 w-[150px] max-w-full object-contain object-left brightness-0 invert",
    },
    onDark: {
      width: 220,
      height: 88,
      className:
        "h-auto w-[180px] max-w-full object-contain object-left brightness-0 invert sm:w-[200px]",
    },
    invoice: {
      width: 240,
      height: 96,
      className: "h-auto w-[200px] max-w-full object-contain object-left sm:w-[240px]",
      crossOrigin: true,
    },
  };

  const config = sizes[variant];

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={LOGO_SRC}
      alt={ALT}
      width={config.width}
      height={config.height}
      crossOrigin={config.crossOrigin ? "anonymous" : undefined}
      className={`${config.className} ${className}`.trim()}
    />
  );
}
