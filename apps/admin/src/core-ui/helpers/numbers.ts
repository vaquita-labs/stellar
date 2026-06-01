export function isHex32(str: string) {
  return /^[0-9a-fA-F]{32}$/.test(str);
}

export async function toHexFromAny(input: number, size: number): Promise<string> {
  const data = new TextEncoder().encode(input + '');
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
  const bytes = new Uint8Array(digest).slice(0, size / 2);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
