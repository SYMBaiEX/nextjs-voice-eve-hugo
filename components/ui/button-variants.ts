import { cva, type VariantProps } from "class-variance-authority";

/**
 * Button class variants — kept in a NON-client module so both client
 * components and React Server Components can call `buttonVariants(...)` (e.g. to
 * style a <Link> like a button). Importing this from a `"use client"` module
 * would make it a client reference that cannot be invoked on the server.
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none text-sm font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-hugo-cyan/60 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer select-none",
  {
    variants: {
      variant: {
        primary:
          "bg-hugo-cyan text-black hover:bg-hugo-cyan/90 shadow-[0_0_24px_-6px_var(--glow)]",
        default: "bg-text-primary text-background hover:opacity-90",
        outline:
          "border border-border-strong bg-transparent hover:bg-surface-elevated text-text-primary",
        ghost:
          "bg-transparent hover:bg-surface-elevated text-text-secondary hover:text-text-primary",
        subtle:
          "bg-surface-elevated text-text-primary hover:bg-surface-elevated/70 border border-border",
        destructive:
          "bg-error/15 text-error border border-error/30 hover:bg-error/25",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-12 px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;
