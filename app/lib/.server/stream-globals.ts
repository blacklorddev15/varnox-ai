/*
 * Keeps the Web Streams implementation on the server self-consistent.
 *
 * @vercel/remix/globals.js calls @remix-run/node's installGlobals(), which replaces Node's native
 * fetch / ReadableStream / WritableStream / TransformStream with the @remix-run/web-* polyfills.
 * It does NOT replace TextDecoderStream, so Node's native one survives - and the AI SDK's
 * streaming path then mixes the two implementations:
 *
 *   response.body
 *     .pipeThrough(new TextDecoderStream())        // native TransformStream
 *     .pipeThrough(new EventSourceParserStream())  // polyfilled
 *
 * The polyfilled pipeThrough validates its argument and rejects the native pair with:
 *
 *   TypeError: First parameter has member 'readable' that is not a ReadableStream.
 *
 * ...which the SDK re-wraps as "Failed to process successful response", hiding the real cause.
 * Rebuilding the text streams on top of whichever TransformStream is actually in use keeps one
 * implementation across the whole chain.
 *
 * This is deliberately a function rather than a bare side-effect import: the package sets
 * "sideEffects": false, so `import './stream-globals'` is tree-shaken away completely.
 *
 * Call sites are the model choke points (server streamText, document entry). Re-checking on each
 * call matters because installGlobals() may run after this module is first evaluated.
 */
import { ReadableStream as NativeReadableStream } from 'node:stream/web';

let aligned = false;

export function ensureConsistentServerStreams(): void {
  if (aligned) {
    return;
  }

  // Nothing to do where streams are already native (local dev, Cloudflare, plain Node).
  if (globalThis.ReadableStream === NativeReadableStream) {
    return;
  }

  const ActiveTransformStream = globalThis.TransformStream;

  if (typeof ActiveTransformStream !== 'function') {
    return;
  }

  /*
   * Returning an object from a constructor overrides `this`, so these produce a real
   * TransformStream built by the active implementation without subclassing a polyfill.
   */
  if (typeof globalThis.TextDecoderStream !== 'undefined') {
    globalThis.TextDecoderStream = function TextDecoderStream(label = 'utf-8', options = {}) {
      const decoder = new TextDecoder(label, options);

      return new ActiveTransformStream({
        transform(chunk: BufferSource, controller: TransformStreamDefaultController<string>) {
          controller.enqueue(decoder.decode(chunk, { stream: true }));
        },
        flush(controller: TransformStreamDefaultController<string>) {
          const remaining = decoder.decode();

          if (remaining) {
            controller.enqueue(remaining);
          }
        },
      });
    } as unknown as typeof TextDecoderStream;
  }

  if (typeof globalThis.TextEncoderStream !== 'undefined') {
    globalThis.TextEncoderStream = function TextEncoderStream() {
      const encoder = new TextEncoder();

      return new ActiveTransformStream({
        transform(chunk: string, controller: TransformStreamDefaultController<Uint8Array>) {
          controller.enqueue(encoder.encode(chunk));
        },
      });
    } as unknown as typeof TextEncoderStream;
  }

  aligned = true;
}
