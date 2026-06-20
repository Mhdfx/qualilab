import Image from "next/image";

type BrandLogoProps = {
  variant?: "full" | "compact" | "sidebar";
  className?: string;
};

export function BrandLogo({ variant = "full", className = "" }: BrandLogoProps) {
  if (variant === "compact") {
    return (
      <Image
        src="/qualilab-logo.png"
        alt="Qualilab International"
        width={40}
        height={40}
        className={`h-9 w-9 object-contain object-left ${className}`}
        priority
      />
    );
  }

  if (variant === "sidebar") {
    return (
      <div className="inline-flex rounded-lg bg-white px-2.5 py-2 shadow-sm">
        <Image
          src="/qualilab-logo.png"
          alt="Qualilab International"
          width={180}
          height={48}
          className={`h-8 w-[140px] object-contain object-left ${className}`}
          priority
        />
      </div>
    );
  }

  return (
    <Image
      src="/qualilab-logo.png"
      alt="Qualilab International — Laboratoire d'analyses agroalimentaire, eaux & environnement de travail"
      width={220}
      height={72}
      className={`h-auto w-[180px] max-w-full object-contain object-left sm:w-[220px] ${className}`}
      priority
    />
  );
}
