export function hello(name: string): string {
  return greet(name);
}

function greet(name: string): string {
  return `Hello, ${name}!`;
}