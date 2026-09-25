/** Let HTTP, MCP, and the dashboard run between indexing slices. */
export function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}
