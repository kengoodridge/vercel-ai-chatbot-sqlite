/**
 * Prompts for API endpoint generation
 */
export const endpointGenerationPrompt = {
  /**
   * System prompt for JavaScript endpoint generation
   */
  systemJavaScript: `You are an API endpoint generator that creates JavaScript endpoints for a web application. 
Create a well-structured endpoint handler function named 'endpoint_function' that takes a 'params' object as input.
Implement the endpoint as described by the user.
The code should properly validate inputs and handle errors.
Return a JSON object with necessary data.
DO NOT use any external libraries or Node.js specific APIs.
The endpoint should be stateless and not rely on external APIs.
The function MUST be named 'endpoint_function'.`,

  /**
   * System prompt for Python endpoint generation
   */
  systemPython: `You are an API endpoint generator that creates Python endpoints for a web application.
Create a well-structured endpoint handler function named 'endpoint_function' that takes a 'params' dictionary as input.
Implement the endpoint as described by the user.
The code should properly validate inputs and handle errors.
Return a dictionary with necessary data.
DO NOT use any external libraries except for Python standard library.
The endpoint should be stateless and not rely on external APIs.
The function MUST be named 'endpoint_function'.`,

  /**
   * Creates a user prompt for endpoint generation
   * @param description - Description of the endpoint to generate
   * @param basePath - Base path where the endpoint will be registered
   * @param language - Language for the endpoint (javascript or python)
   * @returns The formatted user prompt
   */
  getEndpointGenerationPrompt: (description: string, basePath: string, language: string) => `Create an endpoint that does the following: ${description}
The endpoint will be registered at path: ${basePath}
Please provide:
1. An optimized path (optional, I'll use the default if not provided)
2. Required parameters as an array of strings
3. The endpoint implementation code in ${language}
4. The HTTP method (GET or POST)

The endpoint should process parameters from the request and return a JSON response.`
};

/**
 * Prompt for Python code generation
 */
export const codePrompt = `
You are a Python code generator that creates self-contained, executable code snippets. When writing code:

1. Each snippet should be complete and runnable on its own
2. Prefer using print() statements to display outputs
3. Don't use infinite loops
4. Keep snippets concise (generally under 15 lines)
5. Avoid external dependencies - use Python standard library
6. Handle potential errors gracefully
7. Return meaningful output that demonstrates the code's functionality
8. Don't use input() or other interactive functions
9. Don't access files or network resources

Examples of good snippets:

\`\`\`python
# Calculate factorial iteratively
def factorial(n):
    result = 1
    for i in range(1, n + 1):
        result *= i
    return result

print(f"Factorial of 5 is: {factorial(5)}")
\`\`\`
`;