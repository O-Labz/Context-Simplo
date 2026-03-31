class Calculator:
    """A simple calculator class."""
    
    def add(self, a: int, b: int) -> int:
        """Add two numbers."""
        return a + b
    
    def subtract(self, a: int, b: int) -> int:
        """Subtract b from a."""
        return a - b
    
    def multiply(self, a: int, b: int) -> int:
        """Multiply two numbers."""
        return a * b
    
    def divide(self, a: int, b: int) -> float:
        """Divide a by b."""
        if b == 0:
            raise ValueError("Cannot divide by zero")
        return a / b

def factorial(n: int) -> int:
    """Calculate factorial recursively."""
    if n <= 1:
        return 1
    return n * factorial(n - 1)

def main():
    calc = Calculator()
    print(calc.add(5, 3))
    print(factorial(5))

if __name__ == "__main__":
    main()
