import { tool } from 'ai';
import { z } from 'zod';
import { auth } from '@/app/(auth)/auth';
import { 
  getPageById,
  getPagesByProjectId,
  getPagesByUserId,
  deletePage as deletePageDB
} from '@/lib/db/queries';
import { dynamicRouteManager } from '@/lib/dynamic-route-manager';

export const getPage = tool({
  description: 'Get details of a specific page by ID',
  parameters: z.object({
    id: z.string().describe('The ID of the page to retrieve')
  }),
  execute: async ({ id }) => {
    try {
      // Get the current user session
      const session = await auth();
      
      if (!session || !session.user || !session.user.id) {
        return {
          status: 'error',
          message: 'Unauthorized: User not authenticated'
        };
      }
      
      // Get page directly from the database
      const page = await getPageById({ id });
      
      if (!page) {
        return {
          status: 'error',
          message: 'Page not found'
        };
      }
      
      // Verify ownership
      if (page.userId !== session.user.id) {
        return {
          status: 'error',
          message: 'Unauthorized: You do not have permission to access this page'
        };
      }
      
      return {
        status: 'success',
        data: page,
        message: `Retrieved page: ${page.path}`
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to get page'
      };
    }
  }
});

export const listPagesByProject = tool({
  description: 'List all pages for a specific project',
  parameters: z.object({
    projectId: z.string().describe('The ID of the project to list pages for')
  }),
  execute: async ({ projectId }) => {
    try {
      // Get the current user session
      const session = await auth();
      
      if (!session || !session.user || !session.user.id) {
        return {
          status: 'error',
          message: 'Unauthorized: User not authenticated'
        };
      }
      
      // Get pages for the project
      const pages = await getPagesByProjectId({ projectId });
      
      // Verify at least one page belongs to the user
      if (pages.length > 0 && pages[0].userId !== session.user.id) {
        return {
          status: 'error',
          message: 'Unauthorized: You do not have permission to access pages for this project'
        };
      }
      
      return {
        status: 'success',
        data: pages,
        message: `Found ${pages.length} page(s) for project`
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to list pages by project'
      };
    }
  }
});

export const listPages = tool({
  description: 'List all pages for the current user',
  parameters: z.object({}),
  execute: async () => {
    try {
      // Get the current user session
      const session = await auth();
      
      if (!session || !session.user || !session.user.id) {
        return {
          status: 'error',
          message: 'Unauthorized: User not authenticated'
        };
      }
      
      // Get pages for the user
      const pages = await getPagesByUserId({ userId: session.user.id });
      
      return {
        status: 'success',
        data: pages,
        message: `Found ${pages.length} page(s)`
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to list pages'
      };
    }
  }
});

export const deletePage = tool({
  description: 'Delete a page by ID',
  parameters: z.object({
    id: z.string().describe('The ID of the page to delete')
  }),
  execute: async ({ id }) => {
    try {
      // Get the current user session
      const session = await auth();
      
      if (!session || !session.user || !session.user.id) {
        return {
          status: 'error',
          message: 'Unauthorized: User not authenticated'
        };
      }
      
      // Verify the page exists
      const existingPage = await getPageById({ id });
      
      if (!existingPage) {
        return {
          status: 'error',
          message: 'Page not found'
        };
      }
      
      // Verify ownership
      if (existingPage.userId !== session.user.id) {
        return {
          status: 'error',
          message: 'Unauthorized: You do not have permission to delete this page'
        };
      }
      
      // Delete page directly from the database
      const success = await deletePageDB({ 
        id, 
        userId: session.user.id 
      });
      
      if (!success) {
        return {
          status: 'error',
          message: 'Failed to delete page'
        };
      }
      
      // Also unregister the page from the dynamic route manager
      try {
        await dynamicRouteManager.unregisterPage(existingPage.path);
      } catch (unregisterError) {
        console.warn('Warning: Failed to unregister page from route manager:', unregisterError);
        // Continue since the database deletion was successful
      }
      
      return {
        status: 'success',
        message: 'Page deleted successfully'
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to delete page'
      };
    }
  }
});