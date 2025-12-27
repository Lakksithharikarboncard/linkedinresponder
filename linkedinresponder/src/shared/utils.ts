export function randomBetween(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}
export function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
