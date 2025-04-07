export function isString(topic: unknown): topic is string {
  return typeof topic === "string";
}
