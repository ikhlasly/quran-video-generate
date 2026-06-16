import * as React from "react"
import { cn } from "@/lib/utils"

function Slot({
  children,
  ...props
}: { children?: React.ReactNode } & Record<string, unknown>) {
  if (!React.isValidElement(children)) {
    return <>{children}</>
  }
  const childProps = children.props as Record<string, unknown>
  const merged: Record<string, unknown> = { ...childProps }
  for (const [key, value] of Object.entries(props)) {
    if (key === "className") {
      merged.className = cn(
        childProps.className as string | undefined,
        value as string | undefined
      )
    } else if (key === "style") {
      merged.style = { ...(childProps.style as object || {}), ...(value as object || {}) }
    } else if (key.startsWith("on") && typeof value === "function") {
      const existing = childProps[key] as ((...args: unknown[]) => void) | undefined
      merged[key] = (...args: unknown[]) => {
        existing?.(...args)
        ;(value as (...args: unknown[]) => void)(...args)
      }
    } else {
      merged[key] = value
    }
  }
  return React.cloneElement(children, merged as React.Attributes)
}

export { Slot }
