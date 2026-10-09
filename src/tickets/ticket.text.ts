/** PostgreSQL no admite NUL; los sustitutos aislados se alteran al codificar UTF-8. */
export function isStorableText(value: string): boolean {
  return !/[\u0000\uD800-\uDFFF]/u.test(value);
}
