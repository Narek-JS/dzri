/**
 * Typed failures from the client-side image pipeline (`./prepare`,
 * `./upload`). Both are browser-only modules with no server to hand a
 * `{ code, message }` envelope to, so this is their equivalent: a caller can
 * switch on `code` the same way `ApiClientError.code` is switched on
 * elsewhere, instead of pattern-matching on an `Error#message` string.
 */
export type ImagePrepareErrorCode =
  'UNSUPPORTED_TYPE' | 'DECODE_FAILED' | 'CANVAS_UNAVAILABLE' | 'ENCODE_FAILED' | 'THUMB_TOO_LARGE';

export class ImagePrepareError extends Error {
  readonly code: ImagePrepareErrorCode;

  constructor(code: ImagePrepareErrorCode, message: string) {
    super(message);
    this.name = 'ImagePrepareError';
    this.code = code;
  }
}
