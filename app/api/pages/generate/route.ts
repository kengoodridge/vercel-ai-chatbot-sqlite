import { auth } from '@/app/(auth)/auth';
import { NextRequest, NextResponse } from 'next/server';
import { corsMiddleware, withCorsHeaders } from '../../cors';
import { generatePage } from '@/lib/ai/tools/generate-page';

export const dynamic = 'force-dynamic'; // Make sure the route is not statically optimized

/**
 * @swagger
 * /api/pages/generate:
 *   post:
 *     tags:
 *       - Pages
 *     summary: Generate a new page with AI
 *     description: Generate a new page with AI based on a description and add it to a project
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
 *                 description: Description of the page to generate
 *               projectId:
 *                 type: string
 *                 description: ID of the project this page belongs to
 *               model:
 *                 type: string
 *                 description: Optional model ID to use for generation (default is chat-model-small)
 *     responses:
 *       201:
 *         description: Page generated and created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 path:
 *                   type: string
 *                 htmlContent:
 *                   type: string
 *                 projectId:
 *                   type: string
 *                 userId:
 *                   type: string
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
 *         description: Failed to generate page or server error
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
    
    // Use the generate page tool directly
    const result = await generatePage.execute({
      projectId,
      description,
      path
    });
    
    if (result.status === 'error') {
      const errorMessage = result.message || 'Failed to generate page';
      
      if (errorMessage.includes('Project not found')) {
        return withCorsHeaders(NextResponse.json({ error: errorMessage }, { status: 404 }));
      }
      
      if (errorMessage.includes('Unauthorized') || errorMessage.includes('permission')) {
        return withCorsHeaders(NextResponse.json({ error: errorMessage }, { status: 403 }));
      }
      
      return withCorsHeaders(NextResponse.json({ error: errorMessage }, { status: 400 }));
    }
    
    // Extract page data
    const {
      id,
      path: pagePath,
      htmlContent,
      projectId: resultProjectId
    } = result;
    
    // Return the page data
    return withCorsHeaders(NextResponse.json({
      id,
      path: pagePath,
      htmlContent,
      projectId: resultProjectId
    }, { status: 201 }));
  } catch (error) {
    console.error('Error generating page:', error);
    return withCorsHeaders(NextResponse.json(
      { error: 'An error occurred while generating the page' },
      { status: 500 }
    ));
  }
}

// CORS preflight requests are handled by the corsMiddleware function