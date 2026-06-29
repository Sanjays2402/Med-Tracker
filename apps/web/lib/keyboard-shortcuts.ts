/**
 * keyboard-shortcuts — pure shortcut catalogue + route-aware additions for the
 * "press ?" KeyboardHelp overlay.
 *
 * Most shortcuts are global (command palette, the g-leader navigation, theme,
 * new medication, ?). A few are page-local: the /refills timeline density flip
 * lives on a bare "d" only while that page is mounted (STRIP_DENSITY_HOTKEY).
 * The cheat sheet should mirror reality — so a page-local shortcut appears in
 * the overlay ONLY on the route that actually listens for it, instead of always
 * advertising a key that does nothing elsewhere.
 *
 * This module owns the base groups and the per-route extras so the overlay stays
 * a thin render and the catalogue stays unit-tested. No React; the page passes
 * its pathname in. Keys are tokens the overlay renders ('Mod' -> Cmd/Ctrl).
 */

import { STRIP_DENSITY_HOTKEY } from './refill-timeline-density';

export interface Shortcut {
  /** Tokens like 'Mod', 'K', '?', 'G' — the overlay maps 'Mod' to the platform glyph. */
  keys: string[];
  label: string;
}

export interface ShortcutGroup {
  heading: string;
  shortcuts: Shortcut[];
}

/** The always-present shortcuts, independent of the current route. */
export const BASE_GROUPS: ShortcutGroup[] = [
  {
    heading: 'Navigation',
    shortcuts: [
      { keys: ['Mod', 'K'], label: 'Open command palette' },
      { keys: ['/'],        label: 'Open command palette' },
      { keys: ['G', 'D'],   label: 'Go to dashboard' },
      { keys: ['G', 'T'],   label: 'Go to today' },
      { keys: ['G', 'M'],   label: 'Go to medications' },
      { keys: ['G', 'S'],   label: 'Go to schedule' },
      { keys: ['G', 'R'],   label: 'Go to refills' },
      { keys: ['G', 'H'],   label: 'Go to history' },
    ],
  },
  {
    heading: 'Actions',
    shortcuts: [
      { keys: ['N'],   label: 'New medication' },
      { keys: ['T'],   label: 'Toggle theme' },
      { keys: ['Esc'], label: 'Close dialog / overlay' },
    ],
  },
  {
    heading: 'Help',
    shortcuts: [
      { keys: ['?'], label: 'Show keyboard shortcuts' },
    ],
  },
];

/**
 * The page-local shortcut for a route, or null when the route has none. Today
 * only /refills carries one: the bare density-flip key (uppercased for the kbd
 * block, matching how the overlay renders single letters). Pure; the predicate
 * matches the page's own `pathname.startsWith('/refills')` gate so the cheat
 * sheet and the live listener never disagree about where the key works.
 */
export function routeActionShortcut(pathname: string): Shortcut | null {
  if (typeof pathname === 'string' && pathname.startsWith('/refills')) {
    return { keys: [STRIP_DENSITY_HOTKEY.toUpperCase()], label: 'Flip refill timeline density' };
  }
  return null;
}

/**
 * The shortcut groups to show for the given route: the base catalogue, plus any
 * route-local action folded into the Actions group (so a page-specific key sits
 * alongside the other actions instead of in a lonely section). Returns fresh
 * arrays so a caller can't mutate the shared BASE_GROUPS. When the route has no
 * extra, the base groups are returned shape-identical. Pure.
 */
export function shortcutGroupsFor(pathname: string): ShortcutGroup[] {
  const extra = routeActionShortcut(pathname);
  return BASE_GROUPS.map((g) => {
    if (extra && g.heading === 'Actions') {
      // Insert before the always-last Esc row so Esc stays the group's tail.
      const head = g.shortcuts.slice(0, g.shortcuts.length - 1);
      const tail = g.shortcuts.slice(g.shortcuts.length - 1);
      return { heading: g.heading, shortcuts: [...head, extra, ...tail] };
    }
    return { heading: g.heading, shortcuts: [...g.shortcuts] };
  });
}
