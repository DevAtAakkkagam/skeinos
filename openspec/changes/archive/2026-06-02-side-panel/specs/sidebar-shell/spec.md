## REMOVED Requirements

### Requirement: Panel docks outboard on the right and reflows the host

**Reason**: The workspace UI now renders in the browser's native side panel (see the
`side-panel` capability) instead of being injected into the host page. The browser
allocates the panel's space, so the in-page fixed-right dock and the host-page reflow
are no longer needed — and the per-host reflow fragility they introduced is removed.

**Migration**: No data or contract change. The side panel replaces the in-page dock;
the `dockSidebar` helper and the `marginRight` reflow are removed. The `SidebarShell`
component itself is unchanged and is now mounted by the side-panel entrypoint rather
than by the content script.
