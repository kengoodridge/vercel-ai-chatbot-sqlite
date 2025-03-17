import { auth } from '@/app/(auth)/auth';
import { createPage, getProjectById } from '@/lib/db/queries';
import { NextRequest, NextResponse } from 'next/server';
import { corsMiddleware, withCorsHeaders } from '../../cors';
import { z } from 'zod';
import { streamObject } from 'ai';

const { myProvider, DEFAULT_CHAT_MODEL } = await import('@/lib/ai/models');

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
    const { description, projectId, model = DEFAULT_CHAT_MODEL } = await request.json();

    if (!description || !projectId) {
      return withCorsHeaders(NextResponse.json(
        { error: 'Description and project ID are required' },
        { status: 400 }
      ));
    }
    
    // Validate model
    try {
      if (!myProvider.languageModel || !myProvider.languageModel(model)) {
        console.warn(`Model validation failed - using default model. Requested: ${model}`);
        // Don't error out - we'll use the default model if the specified one doesn't exist
      }
    } catch (modelError) {
      console.error('Error validating model:', modelError);
      // Continue with default model if there's an error
    }

    // Verify the project exists and belongs to the user
    const project = await getProjectById({ id: projectId });

    if (!project) {
      return withCorsHeaders(NextResponse.json({ error: 'Project not found' }, { status: 404 }));
    }

    if (project.userId !== session.user.id) {
      return withCorsHeaders(NextResponse.json(
        { error: 'You do not have permission to add pages to this project' },
        { status: 403 }
      ));
    }

    // Use AI to generate the page content
    const projectName = project.name.toLowerCase().replace(/\s+/g, '-');
    const pageSlug = description.toLowerCase().replace(/\s+/g, '-');
    const pagePath = `/${projectName}/${pageSlug}`;
    
    // Define a schema for the AI response
    const pageSchema = z.object({
      path: z.string().optional(),
      htmlContent: z.string(),
    });
    
    // Import the common prompts
    const { pageGenerationPrompt } = await import('@/lib/ai/prompts/page');
    
    // Use the common system prompt
    const systemPrompt = pageGenerationPrompt.system;
    
    // Use the common user prompt generator
    const userPrompt = pageGenerationPrompt.getPageGenerationPrompt(description, pagePath, project.name);

    // Call the language model to generate the page
    let generatedPath = pagePath;
    let htmlContent = '';
    
    try {
      console.log(`Generating page for: ${description} using model: ${model}`);
      
      // Use a default model if the specified model is not available
      let modelToUse = model;
      try {
        if (!myProvider.languageModel(model)) {
          console.warn(`Specified model ${model} not available, falling back to ${DEFAULT_CHAT_MODEL}`);
          modelToUse = DEFAULT_CHAT_MODEL;
        }
      } catch (err) {
        console.warn(`Error accessing model, falling back to default: ${err}`);
        modelToUse = DEFAULT_CHAT_MODEL;
      }
      
      const { fullStream } = streamObject({
        model: myProvider.languageModel(modelToUse),
        system: systemPrompt,
        prompt: userPrompt,
        schema: pageSchema,
      });
      
      // Collect the response from the stream
      let pageResponse: z.infer<typeof pageSchema> | undefined;
      
      for await (const delta of fullStream) {
        const { type } = delta;
        
        if (type === 'object') {
          const { object } = delta;
          pageResponse = {
            htmlContent: object.htmlContent || '',
            path: object.path
          };
        }
      }
      
      if (pageResponse) {
        // Use the generated values, or fall back to defaults
        generatedPath = pageResponse.path || pagePath;
        htmlContent = pageResponse.htmlContent;
      } else {
        throw new Error('Failed to generate page: No valid response from model');
      }
    } catch (aiError) {
      console.error('Error while generating page with AI:', aiError);
      
      // Use fallback HTML if AI generation fails
      htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${description}</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body {
            padding-top: 2rem;
            padding-bottom: 2rem;
        }
        .fallback-notice {
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 1rem;
            margin-bottom: 1rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="fallback-notice">
            <p>Note: This is a fallback page created because AI generation failed. You can update this page with your content.</p>
        </div>
        
        <h1>${description}</h1>
        
        <div class="card my-4">
            <div class="card-body">
                <h5 class="card-title">About this page</h5>
                <p class="card-text">This page was created for the project: ${project.name}</p>
                <p class="card-text">It serves as a starting point that you can customize with your own content.</p>
            </div>
        </div>
        
        <div class="row">
            <div class="col-md-6">
                <div class="card mb-4">
                    <div class="card-body">
                        <h5 class="card-title">Features</h5>
                        <ul class="list-group list-group-flush">
                            <li class="list-group-item">Responsive design</li>
                            <li class="list-group-item">Bootstrap integration</li>
                            <li class="list-group-item">Clean layout</li>
                        </ul>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="card mb-4">
                    <div class="card-body">
                        <h5 class="card-title">Next Steps</h5>
                        <p>You can edit this page to add your content.</p>
                        <p>The path for this page is: ${pagePath}</p>
                    </div>
                </div>
            </div>
        </div>
        
        <footer class="mt-5 pt-3 border-top text-muted">
            <p>Generated page for ${project.name}</p>
        </footer>
    </div>
    
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
      `;
    }

    // Ensure path doesn't start with /api/ (reserved for endpoints)
    if (generatedPath.startsWith('/api/')) {
      generatedPath = `/${projectName}/${generatedPath.replace(/^\/api\/[^\/]+\//, '')}`;
    }
    
    // Create the page in the database
    const newPage = await createPage({
      path: generatedPath,
      htmlContent: htmlContent,
      projectId,
      userId: session.user.id,
    });

    return withCorsHeaders(NextResponse.json(newPage, { status: 201 }));
  } catch (error) {
    console.error('Error generating page:', error);
    return withCorsHeaders(NextResponse.json(
      { error: 'An error occurred while generating the page' },
      { status: 500 }
    ));
  }
}

// CORS preflight requests are handled by the corsMiddleware function