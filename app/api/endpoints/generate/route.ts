import { auth } from '@/app/(auth)/auth';
import { NextRequest, NextResponse } from 'next/server';
import { corsMiddleware, withCorsHeaders } from '../../cors';
import { generateEndpoint } from '@/lib/ai/tools/generate-endpoint';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';

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
    const { description, projectId, path } = await request.json();

    if (!description || !projectId) {
      return withCorsHeaders(NextResponse.json(
        { error: 'Description and project ID are required' },
        { status: 400 }
      ));
    }
    
    // Get the optional language parameter or default to JavaScript
    const language = request.headers.get('x-preferred-language') === 'python' ? 'python' : 'javascript';
    
    // Use the generate endpoint tool directly
    const result = await generateEndpoint.execute({
      projectId,
      description,
      language,
      path
    });
    
    if (result.status === 'error') {
      const errorMessage = result.message || 'Failed to generate endpoint';
      
      if (errorMessage.includes('Project not found')) {
        return withCorsHeaders(NextResponse.json({ error: errorMessage }, { status: 404 }));
      }
      
      if (errorMessage.includes('Unauthorized') || errorMessage.includes('permission')) {
        return withCorsHeaders(NextResponse.json({ error: errorMessage }, { status: 403 }));
      }
      
      return withCorsHeaders(NextResponse.json({ error: errorMessage }, { status: 400 }));
    }
    
    // Extract the endpoint data from the successful result
    const {
      id,
      path: endpointPath,
      parameters,
      code,
      httpMethod,
      projectId: resultProjectId,
      language: resultLanguage,
      testFormHtml,
      ...rest
    } = result;
    
    // Return just the endpoint data (omitting testFormHtml which is only needed by the UI)
    return withCorsHeaders(NextResponse.json({
      id,
      path: endpointPath,
      parameters,
      code,
      httpMethod,
      projectId: resultProjectId,
      language: resultLanguage
    }, { status: 201 }));
  } catch (error) {
    console.error('Error generating endpoint:', error);
    return withCorsHeaders(NextResponse.json(
      { error: 'An error occurred while generating the endpoint' },
      { status: 500 }
    ));
  }
}

// CORS preflight requests are handled by the corsMiddleware function