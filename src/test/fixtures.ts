import type { ChatroomInit } from '../hooks/useChatroomInitialize';

// Deliberately fictional fixtures, separate from production website copy.
export const consentTerms = {
  header: 'Test chat consent',
  condition: 'Test messages are processed in this isolated test environment.',
};

export function initializedChat(consented = false): ChatroomInit {
  return {
    status: 'ready',
    reachable: true,
    consent: { consented, policyVersion: 'test-v1', terms: consentTerms },
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
