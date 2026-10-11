// Browser-hosted application connections were removed.
// Legacy file-call fallbacks use this inert hook; desktop calls use Tauri IPC.
export function notifyWebUnauthorized(): void {}
