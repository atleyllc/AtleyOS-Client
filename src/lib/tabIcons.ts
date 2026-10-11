/** Tab routes that show a drawn glyph. Names match the tab screens. */
export const TAB_ICON_ROUTES = ["chat", "home", "you", "approvals", "settings"] as const;

export type TabIconName = (typeof TAB_ICON_ROUTES)[number];

export function tabIconName(routeName: string): TabIconName | null {
  const name = routeName.trim().toLowerCase();
  return (TAB_ICON_ROUTES as readonly string[]).includes(name) ? (name as TabIconName) : null;
}
