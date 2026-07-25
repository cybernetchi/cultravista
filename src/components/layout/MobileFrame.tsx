import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MobileFrameProps {
  children: ReactNode;
  className?: string;
}

// Plain full-height container for the mobile layout. The fake status bar
// (mock clock/5G/battery) was removed: a real phone browser shows the OS
// status bar already, and the sticky z-50 bar intercepted taps on
// full-screen views' top controls (e.g. the detail view's back button).
export function MobileFrame({ children, className }: MobileFrameProps) {
  return (
    <div className={cn(
      "relative w-full min-h-screen bg-background flex flex-col",
      className
    )}>
      <div className="flex-1 flex flex-col">
        {children}
      </div>
    </div>
  );
}
