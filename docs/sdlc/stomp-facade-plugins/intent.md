# Intent: STOMP facade cannot use plugins

- **Date:** 2026-09-09
- **Status:** accepted
- **Owner:** 4sizn

## Problem

`StompWebSocketClient` takes only adapter options, so a caller has no way to
pass `plugins` or `logger`, and it overrides `connect()`/`disconnect()` to call
the adapter directly — skipping the plugin hook order README documents as public
behaviour. `WindowWebSocketClient` does neither.

Found while building the STOMP integration contract (PR #11). Three sibling
defects found at the same time are already fixed (#12 inbound messages reaching
the core, #13 UNSUBSCRIBE actually sent, #14 `status()` no longer throwing).
This one is left because it is not a typo — the outbound path has no hook
surface at all, so "pass the options through" would produce plugins that
silently do nothing on publish.

## Who is affected

Anyone using STOMP through the facade. Composition
(`new WebSocketClient(new StompWebSocketClientAdapter(...), { plugins }))` works
today for connect/disconnect/message hooks, so the facade is the gap.

## Success looks like

A STOMP facade user can pass `plugins` and `logger` and the hooks that apply to
STOMP run in the documented order; whatever does not apply is documented as not
applying, not left to be discovered.

## Non-goals

Fixing the two known STOMP lifecycle defects (`connect()` called twice orphans
the previous client; `connect()` never settles against a dead broker). They are
separate intents.
