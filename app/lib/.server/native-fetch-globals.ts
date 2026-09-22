/*
 * Makes the server's fetch/stream globals come from one consistent family.
 *
 * @vercel/remix/server.js requires ./globals.js, which calls @remix-run/node's installGlobals()
 * with no options. That installs @remix-run/web-fetch as the global fetch, and web-fetch builds
 * response bodies out of web-streams-polyfill ReadableStreams (via @remix-run/web-stream).
 *
 * Crucially, installGlobals only replaces fetch / Response / Headers / Request / FormData / File -
 * it never touches ReadableStream, WritableStream, TransformStream or TextDecoderStream. So on
 * Node those stay native while fetch stays polyfilled, and the AI SDK's streaming path mixes them:
 *
 *   response.body                              // web-streams-polyfill ReadableStream
 *     .pipeThrough(new TextDecoderStream())    // native TransformStream
 *     .pipeThrough(new EventSourceParserStream())
 *
 * The polyfilled pipeThrough validates its argument and rejects the native pair with:
 *
 *   TypeError: First parameter has member 'readable' that is not a ReadableStream.
 *
 * ...which the SDK re-wraps as "Failed to process successful response", hiding the real cause.
 *
 * installGlobals({ nativeFetch: true }) is Remix's own supported answer: it installs undici's
 * implementations instead, so response bodies are native ReadableStreams and the whole chain
 * agrees. undici is already a declared dependency of @remix-run/node, so no new package is needed.
 *
 * Called per request rather than at module scope, because it has to run *after* the adapter's own
 * installGlobals() call - running first would simply be overwritten.
 */
import { installGlobals } from '@remix-run/node';

let applied = false;

export function useNativeFetchGlobals(): void {
  if (applied) {
    return;
  }

  installGlobals({ nativeFetch: true });
  applied = true;
}
