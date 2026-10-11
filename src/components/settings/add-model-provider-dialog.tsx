"use client"

import { ModelProviderDialog } from "./model-provider-dialog"

export function AddModelProviderDialog({
  open,
  onOpenChange,
  onProviderAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onProviderAdded: () => void
}) {
  return open ? (
    <ModelProviderDialog
      onOpenChange={onOpenChange}
      onSaved={onProviderAdded}
    />
  ) : null
}
