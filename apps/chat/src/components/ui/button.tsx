import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

const button = cva(
  "group/btn inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-ctl font-medium tracking-[-0.005em] select-none transition-[background-color,border-color,color,box-shadow,transform,filter] duration-[var(--duration-fast)] ease-[var(--ease-snap)] disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-ink text-on-ink shadow-btn hover:brightness-[1.18]",
        ink: "bg-ink text-on-ink shadow-btn hover:brightness-[1.18]",
        secondary: "border border-line-strong bg-raised text-ink shadow-ctl hover:border-ink-4 hover:bg-wash",
        ghost: "text-ink-2 hover:bg-sunk hover:text-ink",
        danger: "border border-bad/30 bg-raised text-bad-ink shadow-ctl hover:bg-bad-quiet",
        link: "h-auto rounded-none px-0 text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink active:translate-y-0 active:scale-100",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-9 px-3.5 text-sm",
        lg: "h-11 px-[1.125rem] text-[0.9375rem]",
        icon: "size-8 p-0",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, loading, children, disabled, ...props },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp ref={ref} className={cn(button({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {asChild ? children : (
        <>
          {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  );
});

export { button as buttonStyles };
