import { tool, streamObject } from 'ai';
import { z } from 'zod';
import { auth } from '@/app/(auth)/auth';
import { 
  createEndpoint,
  getProjectById
} from '@/lib/db/queries';
import { dynamicRouteManager } from '@/lib/dynamic-route-manager';
import { myProvider, DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import { endpointGenerationPrompt } from '@/lib/ai/prompts/endpoint';

// Export the generate endpoint tool
const generateEndpoint = tool({
  description: 'Generate a dynamic API endpoint for a project with test form',
  parameters: z.object({
    projectId: z.string().describe('The ID of the project to add the endpoint to'),
    description: z.string().describe('Description of the endpoint to generate'),
    language: z.enum(['javascript', 'python']).default('javascript').describe('Language to use for the endpoint (javascript or python)'),
    path: z.string().optional().describe('Optional custom path for the endpoint (will be generated if not provided)')
  }),
  execute: async ({ projectId, description, language, path }) => {
    // Always ensure language is set with javascript as default
    const endpointLanguage = language || 'javascript';
    try {
      // Get the current user session
      const session = await auth();
      
      if (!session || !session.user || !session.user.id) {
        return {
          status: 'error',
          message: 'Unauthorized: User not authenticated'
        };
      }
      
      if (!projectId || !description) {
        return {
          status: 'error',
          message: 'Project ID and description are required'
        };
      }
      
      // Verify the project exists and belongs to the user
      let project;
      try {
        project = await getProjectById({ id: projectId });
        
        if (!project) {
          return {
            status: 'error',
            message: 'Project not found'
          };
        }
        
        if (!project.id) {
          return {
            status: 'error',
            message: 'Invalid project data'
          };
        }
        
        if (project.userId !== session.user.id) {
          return {
            status: 'error',
            message: 'Unauthorized: You do not have permission to add endpoints to this project'
          };
        }
      } catch (e: any) {
        return {
          status: 'error',
          message: `Failed to verify project: ${e.message || 'Unknown error'}`
        };
      }
      
      // Generate path if not provided
      const projectName = project.name.toLowerCase().replace(/\s+/g, '-');
      const endpointSlug = description.toLowerCase().replace(/\s+/g, '-');
      
      // Force path to follow api/<project-name>/<endpoint-name> format
      let basePath = `/api/${projectName}/${endpointSlug}`;
      
      // If path was provided, validate and modify if needed
      if (path) {
        // Extract endpoint name from provided path
        const pathParts = path.split('/').filter(p => p);
        const lastPart = pathParts[pathParts.length - 1];
        // Ensure the path follows required format
        basePath = `/api/${projectName}/${lastPart || endpointSlug}`;
      }
      
      // Define a schema for the AI response
      const endpointSchema = z.object({
        path: z.string().optional(),
        parameters: z.array(z.string()).optional(),
        code: z.string(),
        httpMethod: z.enum(['GET', 'POST']).optional(),
      });
      
      // Get the appropriate system prompt based on the language
      const systemPrompt = endpointLanguage === 'javascript' 
        ? endpointGenerationPrompt.systemJavaScript
        : endpointGenerationPrompt.systemPython;
      
      // Use the common user prompt generator
      const userPrompt = endpointGenerationPrompt.getEndpointGenerationPrompt(description, basePath, endpointLanguage);
      
      // Call the language model to generate the endpoint
      let generatedPath = basePath;
      let parameters: string[] = [];
      let code = '';
      let httpMethod = 'GET';
      
      try {
        // Validate model and use a safe fallback if needed
        let modelToUse = DEFAULT_CHAT_MODEL;
        try {
          if (!myProvider.languageModel(modelToUse)) {
            throw(`Default model ${modelToUse} not available, falling back to alternative model`);
          }
        } catch (err) {
          console.warn(`Error accessing models, using fallback: ${err}`);
          modelToUse = 'chat-model-small';
        }
        
        const { fullStream } = streamObject({
          model: myProvider.languageModel(modelToUse),
          system: systemPrompt,
          prompt: userPrompt,
          schema: endpointSchema,
        });
        
        // Collect the response from the stream
        let endpointResponse: z.infer<typeof endpointSchema> | undefined;
        
        for await (const delta of fullStream) {
          const { type } = delta;
          
          if (type === 'object') {
            const { object } = delta;
            endpointResponse = {
              code: object.code ?? '', 
              path: object.path ?? '', 
              // Filter out any undefined values and ensure all elements are strings
              parameters: object.parameters?.filter((param): param is string => typeof param === 'string'),
              httpMethod: object.httpMethod,
            };
          }
        }
        
        if (endpointResponse) {
          // Use the generated values, or fall back to defaults
          generatedPath = endpointResponse.path || basePath;
          parameters = endpointResponse.parameters || ['query'];
          code = endpointResponse.code;
          httpMethod = endpointResponse.httpMethod || 'GET';
        } else {
          throw new Error('Failed to generate endpoint: No valid response from model');
        }
      } catch (aiError) {
        console.error('Error while generating endpoint with AI:', aiError);
        
        // Use fallback code if AI generation fails
        if (endpointLanguage === 'javascript') {
          code = `
/**
 * Fallback endpoint function for: ${description}
 * This is a simple implementation because AI generation failed.
 * 
 * @param {Object} params - The parameters passed to the endpoint
 * @param {string} params.query - The query parameter
 * @returns {Object} The response object
 */
function endpoint_function(params) {
  const query = params.query || '';
  
  return {
    success: true,
    language: "javascript",
    description: "${description}",
    query: query,
    timestamp: new Date().toISOString(),
    result: "Endpoint created without AI assistance. Query: " + query,
    note: "AI generation failed, using fallback implementation"
  };
}
`;
        } else {
          code = `
# Fallback endpoint function for: ${description}
# This is a simple implementation because AI generation failed.
#
# Parameters:
#   params (dict): The parameters passed to the endpoint
#   params['query'] (str): The query parameter
# Returns:
#   dict: The response object

import json
from datetime import datetime

def endpoint_function(params):
    query = params.get('query', '')
    
    return {
        "success": True,
        "language": "python",
        "description": "${description}",
        "query": query,
        "timestamp": datetime.now().isoformat(),
        "result": f"Endpoint created without AI assistance. Query: {query}",
        "note": "AI generation failed, using fallback implementation"
    }
`;
        }
        
        parameters = ['query'];
        httpMethod = 'GET';
      }
      
      // Ensure path follows the required format api/<project-name>/<endpoint-name>
      if (!generatedPath.startsWith(`/api/${projectName}/`)) {
        // Extract the endpoint name from the generated path
        let endpointName = endpointSlug;
        
        if (generatedPath.startsWith('/api/')) {
          // Extract the last part from the path
          const pathParts = generatedPath.split('/').filter(p => p);
          if (pathParts.length >= 2) {
            endpointName = pathParts[pathParts.length - 1];
          }
        } else {
          // Use the entire path without slashes as endpoint name
          endpointName = generatedPath.replace(/^\//, '').replace(/\//g, '-');
        }
        
        // Recreate the path with the correct format
        generatedPath = `/api/${projectName}/${endpointName}`;
      }
      
      // Create the endpoint in the database
      try {
        const newEndpoint = await createEndpoint({
          path: generatedPath,
          parameters,
          code,
          httpMethod,
          language: endpointLanguage,
          projectId,
          userId: session.user.id,
        });
        
        // Register the endpoint in the dynamic route manager
        await dynamicRouteManager.registerEndpoint(
          generatedPath,
          parameters,
          code,
          httpMethod,
          endpointLanguage
        );
        
        // Generate a simple HTML form for testing the endpoint
        const testFormHtml = generateTestForm(description, generatedPath, parameters, httpMethod);
        
        return {
          id: newEndpoint.id,
          path: newEndpoint.path,
          url: newEndpoint.path, // Providing URL for easy access
          projectId: newEndpoint.projectId,
          projectName: project.name,
          parameters: parameters,
          code: code,
          httpMethod: httpMethod,
          language: endpointLanguage,
          testFormHtml: testFormHtml, // HTML form for testing
          status: 'success',
          message: `Created endpoint at ${newEndpoint.path}`
        };
      } catch (dbError : any) {
        return {
          status: 'error',
          message: `Failed to save endpoint to database: ${dbError.message || 'Unknown error'}`
        };
      }
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to generate endpoint'
      };
    }
  }
});

/**
 * Generates form field information for the endpoint test UI
 */
function generateTestForm(description: string, path: string, parameters: string[], httpMethod: string): string {
  // Simple object structure that can be parsed by the React component
  const formData = {
    title: `Test Form for: ${description}`,
    path,
    httpMethod,
    parameters
  };
  
  // Return JSON string that can be parsed by the React component
  return JSON.stringify(formData);
}

// Export the tool
export { generateEndpoint };