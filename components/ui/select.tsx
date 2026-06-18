"use client"

import * as React from "react"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface SelectContextValue {
  value: string
  onValueChange: (value: string) => void
  open: boolean
  setOpen: (open: boolean) => void
  getItemContent: (value: string) => React.ReactNode
  registerItem: (value: string, content: React.ReactNode) => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
}

const SelectContext = React.createContext<SelectContextValue | null>(null)

function useSelect() {
  const ctx = React.useContext(SelectContext)
  if (!ctx) throw new Error("Select components must be used within <Select>")
  return ctx
}

interface SelectProps {
  children: React.ReactNode
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  disabled?: boolean
}

function Select({ children, value: controlledValue, defaultValue, onValueChange, disabled }: SelectProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue || "")
  const [open, setOpen] = React.useState(false)
  const itemContentsRef = React.useRef(new Map<string, React.ReactNode>())
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const isControlled = controlledValue !== undefined
  const value = isControlled ? controlledValue : internalValue
  const [version, setVersion] = React.useState(0)

  const handleValueChange = React.useCallback(
    (v: string) => {
      if (disabled) return
      if (!isControlled) setInternalValue(v)
      onValueChange?.(v)
      setOpen(false)
    },
    [isControlled, onValueChange, disabled]
  )

  const handleSetOpen = React.useCallback(
    (v: boolean) => {
      if (disabled) return
      setOpen(v)
    },
    [disabled]
  )

  const registerItem = React.useCallback(
    (itemValue: string, content: React.ReactNode) => {
      const prev = itemContentsRef.current.get(itemValue)
      if (prev === content) return
      itemContentsRef.current.set(itemValue, content)
      setVersion(v => v + 1)
    },
    []
  )

  const getItemContent = React.useCallback(
    (itemValue: string) => itemContentsRef.current.get(itemValue) ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version]
  )

  const contextValue = React.useMemo(
    () => ({
      value,
      onValueChange: handleValueChange,
      open,
      setOpen: handleSetOpen,
      getItemContent,
      registerItem,
      triggerRef,
    }),
    [value, handleValueChange, open, handleSetOpen, getItemContent, registerItem]
  )

  return (
    <SelectContext.Provider value={contextValue}>
      <div data-slot="select" data-disabled={disabled || undefined} className="relative">
        {children}
      </div>
    </SelectContext.Provider>
  )
}

function SelectTrigger({ className, children, ...props }: React.ComponentProps<"button">) {
  const { open, setOpen, triggerRef } = useSelect()

  return (
    <button
      ref={triggerRef}
      type="button"
      data-slot="select-trigger"
      aria-haspopup="listbox"
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      className={cn(
        "border-input data-[placeholder]:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 dark:hover:bg-input/50 flex w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 h-9 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&>[data-slot=select-value]]:min-w-0 [&>[data-slot=select-value]]:truncate",
        className
      )}
      {...props}
    >
      {children}
      <ChevronDownIcon className="size-4 opacity-50" />
    </button>
  )
}

function SelectValue({ placeholder, children }: { placeholder?: string; children?: React.ReactNode }) {
  const { value, getItemContent } = useSelect()
  const content = value ? getItemContent(value) : null
  if (content) return <span data-slot="select-value">{content}</span>
  if (value && children) return <span data-slot="select-value">{children}</span>
  if (value) return <span data-slot="select-value">{value}</span>
  return <span data-slot="select-value" className="text-muted-foreground">{placeholder}</span>
}

function SelectContent({ className, children, ...props }: React.ComponentProps<"div">) {
  const { open, setOpen, triggerRef } = useSelect()
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        ref.current && !ref.current.contains(target) &&
        triggerRef.current && !triggerRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open, setOpen, triggerRef])

  if (!open) {
    return (
      <div
        data-slot="select-content"
        className="absolute top-full left-0 z-50 hidden"
        aria-hidden="true"
      >
        <div className="max-h-60 overflow-y-auto p-1">
          {children}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={ref}
      data-slot="select-content"
      className={cn(
        "bg-popover text-popover-foreground absolute top-full left-0 z-50 mt-1 min-w-[220px] overflow-hidden rounded-md border shadow-md",
        className
      )}
      {...props}
    >
      <div className="max-h-60 overflow-y-auto p-1">
        {children}
      </div>
    </div>
  )
}

function SelectGroup({ children, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="select-group" {...props}>
      {children}
    </div>
  )
}

function SelectLabel({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="select-label"
      className={cn("text-muted-foreground px-2 py-1.5 text-xs font-semibold", className)}
      {...props}
    >
      {children}
    </div>
  )
}

interface SelectItemProps extends React.ComponentProps<"button"> {
  value: string
}

function SelectItem({ className, children, value, ...props }: SelectItemProps) {
  const { value: selectedValue, onValueChange, registerItem, setOpen } = useSelect()
  const isSelected = selectedValue === value

  React.useEffect(() => {
    registerItem(value, children)
  }, [value, registerItem]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <button
      type="button"
      data-slot="select-item"
      role="option"
      aria-selected={isSelected}
      onClick={() => {
        onValueChange(value)
        setOpen(false)
      }}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 hover:bg-accent hover:text-accent-foreground",
        className
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        {isSelected && <CheckIcon className="size-4" />}
      </span>
      {children}
    </button>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
}
