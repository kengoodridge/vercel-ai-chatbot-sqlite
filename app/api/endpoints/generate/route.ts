import { auth } from '@/app/(auth)/auth';
import { createEndpoint, getProjectById } from '@/lib/db/queries';
import { NextRequest, NextResponse } from 'next/server';
import { corsMiddleware, withCorsHeaders } from '../../cors';
import { dynamicRouteManager } from '@/lib/dynamic-route-manager';
import { z } from 'zod';
import { streamObject } from 'ai';

const { myProvider, DEFAULT_CHAT_MODEL } = await import('@/lib/ai/models');

export const dynamic = 'force-dynamic'; // Make sure the route is not statically optimized

/**
 * @swagger
 * /api/endpoints/generate:
 *   post:
 *     tags:
 *       - Endpoints
 *     summary: Generate a new endpoint with AI
 *     description: Generate a new endpoint with AI based on a description and add it to a project
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - description
 *               - projectId
 *             properties:
 *               description:
 *                 type: string
 *                 description: Description of the endpoint to generate
 *               projectId:
 *                 type: string
 *                 description: ID of the project this endpoint belongs to
 *               model:
 *                 type: string
 *                 description: Optional model ID to use for generation (default is chat-model-small)
 *     parameters:
 *       - in: header
 *         name: x-preferred-language
 *         schema:
 *           type: string
 *           enum: [javascript, python]
 *           default: javascript
 *         description: Optional header to specify the preferred language for the endpoint
 *     responses:
 *       201:
 *         description: Endpoint generated and created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 path:
 *                   type: string
 *                 code:
 *                   type: string
 *                 parameters:
 *                   type: string
 *                 httpMethod:
 *                   type: string
 *                 projectId:
 *                   type: string
 *                 userId:
 *                   type: string
 *                   description: ID of the user who owns the endpoint
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Bad request - missing required fields
 *       401:
 *         description: Unauthorized - user not authenticated
 *       403:
 *         description: Forbidden - user does not own this project
 *       404:
 *         description: Project not found
 *       500:
 *         description: Failed to generate endpoint or server error
 */
export async function POST(request: NextRequest) {
  // Handle OPTIONS request and apply CORS
  const corsResponse = corsMiddleware(request);
  if (corsResponse) return corsResponse;
  
  const session = await auth();

  if (!session || !session.user || !session.user.id) {
    return withCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  }

  try {
    const { description, projectId, model = DEFAULT_CHAT_MODEL } = await request.json();

    if (!description || !projectId) {
      return withCorsHeaders(NextResponse.json(
        { error: 'Description and project ID are required' },
        { status: 400 }
      ));
    }
    
    // Validate model
    if (!myProvider.languageModel(model)) {
      return withCorsHeaders(NextResponse.json(
        { error: 'Invalid model specified' },
        { status: 400 }
      ));
    }

    // Verify the project exists and belongs to the user
    const project = await getProjectById({ id: projectId });

    if (!project) {
      return withCorsHeaders(NextResponse.json({ error: 'Project not found' }, { status: 404 }));
    }

    if (project.userId !== session.user.id) {
      return withCorsHeaders(NextResponse.json(
        { error: 'You do not have permission to add endpoints to this project' },
        { status: 403 }
      ));
    }

    // Use AI to generate the endpoint code and configuration
    const projectName = project.name.toLowerCase().replace(/\s+/g, '-');
    const endpointSlug = description.toLowerCase().replace(/\s+/g, '-');
    const basePath = `/api/${projectName}/${endpointSlug}`;
    
    // Get the optional language parameter or default to JavaScript
    const language = request.headers.get('x-preferred-language') === 'python' ? 'python' : 'javascript';
    
    // Define a schema for the AI response
    const endpointSchema = z.object({
      path: z.string().optional(),
      parameters: z.array(z.string()).optional(),
      code: z.string(),
      httpMethod: z.enum(['GET', 'POST']).optional(),
    });
    
    // Import the common prompts
    const { endpointGenerationPrompt } = await import('@/lib/ai/prompts/endpoint');
    
    // Get the appropriate system prompt based on the language
    const systemPrompt = language === 'javascript' 
      ? endpointGenerationPrompt.systemJavaScript
      : endpointGenerationPrompt.systemPython;
    
    // Use the common user prompt generator
    const userPrompt = endpointGenerationPrompt.getEndpointGenerationPrompt(description, basePath, language);

    // Call the language model to generate the endpoint
    let generatedPath = basePath;
    let parameters: string[] = [];
    let code = '';
    let httpMethod = 'GET';
    
try {
      console.log(`Generating ${language} endpoint for: ${description} using model: ${model}`);

      const { fullStream } = streamObject({
        model: myProvider.languageModel(model),
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
          // Ensure the object has all required properties before assigning
          if (object && typeof object.code === 'string') {
            endpointResponse = {
              code: object.code,
              path: object.path,
              // Filter out any undefined values and ensure all elements are strings
              parameters: object.parameters?.filter((param): param is string => typeof param === 'string'),
              httpMethod: object.httpMethod,
            };
          }
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
      if (language === 'javascript') {
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

    // Ensure path starts with /api/
    if (!generatedPath.startsWith('/api/')) {
      generatedPath = `/api/${projectName}/${generatedPath.replace(/^\//, '')}`;
    }
    
    // Create the endpoint in the database
    const newEndpoint = await createEndpoint({
      path: generatedPath,
      parameters,
      code,
      httpMethod,
      language,
      projectId,
      userId: session.user.id,
    });

    // Register the endpoint in the dynamic route manager
    await dynamicRouteManager.registerEndpoint(
      generatedPath,
      parameters,
      code,
      httpMethod,
      language
    );

    return withCorsHeaders(NextResponse.json(newEndpoint, { status: 201 }));
  } catch (error) {
    console.error('Error generating endpoint:', error);
    return withCorsHeaders(NextResponse.json(
      { error: 'An error occurred while generating the endpoint' },
      { status: 500 }
    ));
  }
}

// CORS preflight requests are handled by the corsMiddleware function