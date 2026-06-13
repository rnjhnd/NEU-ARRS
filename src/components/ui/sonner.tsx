"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-right"
      icons={{
        success: <CircleCheckIcon className="size-5 text-emerald-600 dark:text-emerald-400" />,
        info: <InfoIcon className="size-5 text-blue-600 dark:text-blue-400" />,
        warning: <TriangleAlertIcon className="size-5 text-amber-600 dark:text-amber-400" />,
        error: <OctagonXIcon className="size-5 text-rose-600 dark:text-rose-400" />,
        loading: <Loader2Icon className="size-5 animate-spin text-primary" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background/60 group-[.toaster]:backdrop-blur-xl group-[.toaster]:text-foreground group-[.toaster]:border-border/50 group-[.toaster]:shadow-2xl rounded-2xl font-sans p-4",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground font-medium rounded-lg px-3 py-2",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground font-medium rounded-lg px-3 py-2",
          success: "group-[.toaster]:border-emerald-500/30 group-[.toaster]:bg-emerald-50/80 dark:group-[.toaster]:bg-emerald-950/40 group-[.toaster]:text-emerald-800 dark:group-[.toaster]:text-emerald-300",
          error: "group-[.toaster]:border-rose-500/30 group-[.toaster]:bg-rose-50/80 dark:group-[.toaster]:bg-rose-950/40 group-[.toaster]:text-rose-800 dark:group-[.toaster]:text-rose-300",
          warning: "group-[.toaster]:border-amber-500/30 group-[.toaster]:bg-amber-50/80 dark:group-[.toaster]:bg-amber-950/40 group-[.toaster]:text-amber-800 dark:group-[.toaster]:text-amber-300",
          info: "group-[.toaster]:border-blue-500/30 group-[.toaster]:bg-blue-50/80 dark:group-[.toaster]:bg-blue-950/40 group-[.toaster]:text-blue-800 dark:group-[.toaster]:text-blue-300",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
