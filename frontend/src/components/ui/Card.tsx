import type { ReactNode } from "react";

export function Card({
  title,
  icon,
  right,
  children,
  className = "",
  appearance = "default",
}: {
  title?: string;
  icon?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  appearance?: "default" | "sampai";
}) {
  const isSampai = appearance === "sampai";

  return (
    <section
      className={`${
        isSampai
          ? "rounded-[20px] border border-[#d9e4df] bg-white p-4 text-[#17211d] shadow-[0_7px_22px_rgba(26,61,48,0.07)] sm:p-5"
          : "glass rounded-2xl p-4 sm:p-5"
      } ${className}`}
    >
      {(title || right) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          <h2
            className={`flex items-center gap-2 text-sm font-semibold tracking-wide ${
              isSampai ? "text-[#17211d]" : "text-slate-200/90"
            }`}
          >
            {icon}
            {title}
          </h2>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}
