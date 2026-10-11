"use client"

import type { ModelProviderInfo } from "@/lib/types"
import { ModelProviderDialog } from "./model-provider-dialog"

export function EditModelProviderDialog({
  provider,
  onOpenChange,
  onProviderUpdated,
}: {
  provider: ModelProviderInfo | null
  onOpenChange: (open: boolean) => void
  onProviderUpdated: () => void
}) {
  return provider ? (
    <ModelProviderDialog
      key={`${provider.id}:${provider.updated_at}`}
      provider={provider}
      onOpenChange={onOpenChange}
      onSaved={onProviderUpdated}
    />
  ) : null
}
