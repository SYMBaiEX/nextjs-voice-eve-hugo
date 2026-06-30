import { defineTool } from "eve/tools";
import { z } from "zod";

/**
 * `calculate` — evaluate a basic arithmetic expression. Demonstrates a typed
 * tool with input validation. Only digits, the four operators, parentheses, and
 * decimals are allowed (no identifiers), so the expression is safe to evaluate.
 */
const SAFE_EXPRESSION = /^[0-9+\-*/().\s]+$/;

export default defineTool({
  description:
    "Evaluate a basic arithmetic expression (+, -, *, /, parentheses).",
  inputSchema: z.object({
    expression: z
      .string()
      .min(1)
      .max(200)
      .describe("e.g. '(3 + 4) * 5 / 2'"),
  }),
  async execute({ expression }) {
    if (!SAFE_EXPRESSION.test(expression)) {
      return {
        error:
          "Only numbers and + - * / ( ) are allowed — no variables or functions.",
      };
    }
    try {
      // Safe: the input is restricted to an arithmetic-only character class.
      const result = Function(`"use strict"; return (${expression});`)() as unknown;
      if (typeof result !== "number" || !Number.isFinite(result)) {
        return { error: "That expression didn't evaluate to a finite number." };
      }
      return { expression, result };
    } catch {
      return { error: "Couldn't evaluate that expression." };
    }
  },
});
