"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { CopyButtonProps } from "@/components/common/copy-button.types";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";

const RESET_AFTER_MS = 2_000;

export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied",
  className,
  onCopied,
  variant = "outline",
  size,
}: CopyButtonProps) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    const copied = await copyText(value);
    setState(copied ? "copied" : "failed");
    if (copied) {
      onCopied?.();
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), RESET_AFTER_MS);
  }

  const text = state === "copied" ? copiedLabel : state === "failed" ? "Select and copy" : label;

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={() => void copy()}
      >
        {state === "copied" ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
        {text}
      </Button>
      <span role="status" className="sr-only">
        {state === "copied" ? copiedLabel : state === "failed" ? "Copy failed" : ""}
      </span>
    </>
  );
}
