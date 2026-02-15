# How to write code for this repository

- Code should document itself as much as possible. Only use comments where the code is not self-explanatory.
- Write as minimal code as possible to achieve the desired functionality.
- Embrace TypeScript's type system to ensure type safety and reduce runtime errors, create specific types and interfaces as needed.
- Break down large functions and components into smaller, reusable pieces.
- Follow consistent naming conventions for variables, functions, classes, and files.
- Ensure proper error handling and input validation throughout the codebase.
- RXJS should be used for state management and asynchronous operations where appropriate.

# Testing

- Unit tests can be written using vitest in "\*.test.ts" files alongside the implementation files.
- Intergration tests can writen using Playwright in the "tests" folder.
