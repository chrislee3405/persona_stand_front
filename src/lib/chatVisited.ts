/**
 * Whether this visitor has opened the chatroom before.
 *
 * Used by <ChatLauncher> to decide whether to play its one-off
 * introduction. Someone who has already used the chat does not need to be
 * told what the button does, and a nudge that reappears on every visit
 * stops being a hint and becomes nagging.
 *
 * Stored rather than kept in memory so the answer survives a reload --
 * "have you been there" is a fact about the visitor, not about this page
 * load. It is the only thing this site persists in the browser.
 *
 * Every access is wrapped: localStorage throws outright in some contexts
 * (a private window with site data blocked, some embedded webviews), and
 * a failure to remember must never break the button itself. When storage
 * is unavailable we report "not visited", so the worst case is the hint
 * playing again -- never a broken launcher.
 */
const KEY = 'persona-stand:chat-visited';

export function hasVisitedChat(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function markChatVisited(): void {
  try {
    window.localStorage.setItem(KEY, '1');
  } catch {
    /* storage unavailable -- the hint may replay, which is harmless */
  }
}
