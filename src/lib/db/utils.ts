export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function containsPattern(input: string): string {
  return `%${escapeLike(input.toLowerCase())}%`;
}