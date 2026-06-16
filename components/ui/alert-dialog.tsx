"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

interface AlertDialogContextValue {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const AlertDialogContext = React.createContext<AlertDialogContextValue | null>(null)

function useAlertDialog() {
  const ctx = React.useContext(AlertDialogContext)
  if (!ctx) throw new Error("AlertDialog components must be used within <AlertDialog>")
  return ctx
}

interface AlertDialogProps {
  children: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

function AlertDialog({ children, open: controlledOpen, onOpenChange }: AlertDialogProps) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen

  const handleOpenChange = React.useCallback(
    (value: boolean) => {
      if (!isControlled) setInternalOpen(value)
      onOpenChange?.(value)
    },
    [isControlled, onOpenChange]
  )

  const ctx = React.useMemo(
    () => ({ open, onOpenChange: handleOpenChange }),
    [open, handleOpenChange]
  )

  return (
    <AlertDialogContext.Provider value={ctx}>
      {children}
    </AlertDialogContext.Provider>
  )
}

function AlertDialogTrigger({ children, asChild, ...props }: React.ComponentPropsWithoutRef<"button"> & { asChild?: boolean }) {
  const { onOpenChange } = useAlertDialog()

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      onClick: (e: React.MouseEvent) => {
        ;(children.props as { onClick?: React.MouseEventHandler }).onClick?.(e)
        if (!e.defaultPrevented) onOpenChange(true)
      },
      ...props,
    } as React.HTMLAttributes<HTMLElement>)
  }

  return (
    <button type="button" data-slot="alert-dialog-trigger" onClick={() => onOpenChange(true)} {...props}>
      {children}
    </button>
  )
}

function AlertDialogContent({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const { open, onOpenChange } = useAlertDialog()
  const isClient = typeof document !== "undefined"

  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden"
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [open])

  React.useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false)
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onOpenChange])

  if (!open || !isClient) return null

  return createPortal(
    <div
      data-slot="alert-dialog-overlay"
      className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center"
      onClick={() => onOpenChange(false)}
    >
      <div
        data-slot="alert-dialog-content"
        role="alertdialog"
        aria-modal="true"
        className={cn(
          "bg-background relative grid w-full max-w-[calc(100%-2rem)] gap-4 rounded-lg border p-6 shadow-lg sm:max-w-lg",
          className
        )}
        onClick={(e) => e.stopPropagation()}
        {...props}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}

function AlertDialogHeader({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function AlertDialogFooter({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  )
}

function AlertDialogTitle({ className, ...props }: React.ComponentPropsWithoutRef<"h2">) {
  return (
    <h2
      data-slot="alert-dialog-title"
      className={cn("text-lg font-semibold", className)}
      {...props}
    />
  )
}

function AlertDialogDescription({ className, ...props }: React.ComponentPropsWithoutRef<"p">) {
  return (
    <p
      data-slot="alert-dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

function AlertDialogAction({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"button">) {
  const { onOpenChange } = useAlertDialog()

  return (
    <button
      type="button"
      data-slot="alert-dialog-action"
      className={cn(buttonVariants(), className)}
      onClick={(e) => {
        props.onClick?.(e)
        onOpenChange(false)
      }}
      {...props}
    />
  )
}

function AlertDialogCancel({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"button">) {
  const { onOpenChange } = useAlertDialog()

  return (
    <button
      type="button"
      data-slot="alert-dialog-cancel"
      className={cn(buttonVariants({ variant: "outline" }), className)}
      onClick={(e) => {
        props.onClick?.(e)
        onOpenChange(false)
      }}
      {...props}
    />
  )
}

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
}
