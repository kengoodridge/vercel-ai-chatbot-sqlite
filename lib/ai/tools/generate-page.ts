import { tool, streamObject } from 'ai';
import { z } from 'zod';
import { auth } from '@/app/(auth)/auth';
import { 
  createPage,
  getProjectById,
  getPageById
} from '@/lib/db/queries';
import { dynamicRouteManager } from '@/lib/dynamic-route-manager';
import { myProvider, DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import { pageGenerationPrompt } from '@/lib/ai/prompts/page';

export const generatePage = tool({
  description: 'Generate a dynamic web page for a project',
  parameters: z.object({
    projectId: z.string().describe('The ID of the project to add the page to'),
    description: z.string().describe('Description of the page to generate'),
    path: z.string().optional().describe('Optional custom path for the page (will be generated if not provided)')
  }),
  execute: async ({ projectId, description, path }) => {
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
            message: 'Unauthorized: You do not have permission to add pages to this project'
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
      const pageSlug = description.toLowerCase().replace(/\s+/g, '-');
      const pagePath = path || `/${projectName}/${pageSlug}`;
      
      // Define a schema for the AI response
      const pageSchema = z.object({
        path: z.string().optional(),
        htmlContent: z.string(),
      });
      
      // Use the common prompts from the prompts.ts file
      const systemPrompt = pageGenerationPrompt.system;
      
      // Use the common user prompt generator
      const userPrompt = pageGenerationPrompt.getPageGenerationPrompt(description, pagePath, project.name);
      
      // Call the language model to generate the page
      let generatedPath = pagePath;
      let htmlContent = '';
      
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
      try {
        const newPage = await createPage({
          path: generatedPath,
          htmlContent: htmlContent,
          projectId,
          userId: session.user.id,
        });
        
        // Register the page in the dynamic route manager
        await dynamicRouteManager.registerPage(
          generatedPath,
          htmlContent
        );
        
        return {
          id: newPage.id,
          path: newPage.path,
          url: newPage.path, // Providing URL for easy access
          projectId: newPage.projectId,
          projectName: project.name,
          htmlContent: htmlContent, // Include the full HTML content for rendering
          status: 'success',
          message: `Created page at ${newPage.path}`
        };
      } catch (dbError : any) {
        return {
          status: 'error',
          message: `Failed to save page to database: ${dbError.message || 'Unknown error'}`
        };
      }
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to generate page'
      };
    }
  }
});