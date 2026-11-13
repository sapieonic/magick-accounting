"use client";

import { useRef, type InputHTMLAttributes } from "react";
import { Search, X } from "lucide-react";
import { IconButton } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { ICON_STROKE, inputClass } from "@/components/ui/styles";

interface SearchInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "className"> {
  value: string;
  onValueChange: (value: string) => void;
  /** Layout classes for the wrapper (flex basis, width). */
  className?: string;
}

/**
 * Search box: magnifier inside the input and a Clear button once there is
 * text. Wrap it in a `Field` for a visible label, or give it an `aria-label`.
 */
export default function SearchInput({ value, onValueChange, className, ...input }: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className={cn("relative min-w-0", className)}>
      <Search
        aria-hidden="true"
        size={16}
        strokeWidth={ICON_STROKE}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
      />
      <input
        type="search"
        autoComplete="off"
        {...input}
        ref={inputRef}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={cn(inputClass, "pl-9 pr-11 [&::-webkit-search-cancel-button]:appearance-none")}
      />
      {value && (
        <IconButton
          icon={X}
          size="sm"
          onClick={() => {
            onValueChange("");
            // The button unmounts once the value is empty; keep focus in the box.
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
          className="absolute right-0.5 top-1/2 -translate-y-1/2"
        />
      )}
    </div>
  );
}
