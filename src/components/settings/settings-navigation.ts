export const SETTINGS_NAVIGATION_EVENT = "harness-studio:settings-navigation"

/** Let an open editor resolve its unsaved draft before settings navigation. */
export function requestSettingsNavigation(leave: () => void) {
  const event = new CustomEvent(SETTINGS_NAVIGATION_EVENT, {
    cancelable: true,
    detail: { leave },
  })
  if (window.dispatchEvent(event)) leave()
}
