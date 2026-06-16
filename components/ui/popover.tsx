"use client";
import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "start", sideOffset = 8, collisionPadding = 12, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(
        // z-[200] so popovers/Selects always sit above EVERYTHING that can
        // contain them — the sticky app header (z-50) AND modal dialogs
        // (which render their content as high as z-[120], e.g. the custom
        // recurrence dialog). At the old z-[100] a Select opened *behind*
        // those dialogs and looked broken. available-height + overflow-y-auto
        // keeps tall popovers (DayPicker, MultiSelect) inside the viewport.
        "z-[200] rounded-chip border border-hairline-strong bg-surface-card p-2",
        "max-h-[var(--radix-popover-content-available-height)] overflow-y-auto overflow-x-hidden",
        "data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className,
      )}
      style={{ boxShadow: "0 12px 32px rgba(15, 23, 42, 0.10)" }}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = "PopoverContent";
