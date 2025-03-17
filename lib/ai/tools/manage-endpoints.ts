import { tool } from 'ai';
import { z } from 'zod';
import { auth } from '@/app/(auth)/auth';
import { 
  getEndpointById,
  getEndpointsByProjectId,
  getEndpointsByUserId,
  deleteEndpoint as deleteEndpointDB
} from '@/lib/db/queries';
import { dynamicRouteManager } from '@/lib/dynamic-route-manager';

export const getEndpoint = tool({
  description: 'Get details of a specific endpoint by ID',
  parameters: z.object({
    id: z.string().describe('The ID of the endpoint to retrieve')
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

      // Get endpoint directly from the database
      const endpoint = await getEndpointById({ id });

      if (!endpoint) {
        return {
          status: 'error',
          message: 'Endpoint not found'
        };
      }

      // Verify ownership
      if (endpoint.userId !== session.user.id) {
        return {
          status: 'error',
          message: 'Unauthorized: You do not have permission to access this endpoint'
        };
      }

      return {
        status: 'success',
        data: endpoint,
        message: `Retrieved endpoint: ${endpoint.path}`
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to get endpoint'
      };
    }
  }
});

export const listEndpointsByProject = tool({
  description: 'List all endpoints for a specific project',
  parameters: z.object({
    projectId: z.string().describe('The ID of the project to list endpoints for')
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

      // Get endpoints for the project
      const endpoints = await getEndpointsByProjectId({ projectId });

      // Verify at least one endpoint belongs to the user
      if (endpoints.length > 0 && endpoints[0].userId !== session.user.id) {
        return {
          status: 'error',
          message: 'Unauthorized: You do not have permission to access endpoints for this project'
        };
      }

      return {
        status: 'success',
        data: endpoints,
        message: `Found ${endpoints.length} endpoint(s) for project`
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to list endpoints by project'
      };
    }
  }
});

export const listEndpoints = tool({
  description: 'List all endpoints for the current user',
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

      // Get endpoints for the user
      const endpoints = await getEndpointsByUserId({ userId: session.user.id });

      return {
        status: 'success',
        data: endpoints,
        message: `Found ${endpoints.length} endpoint(s)`
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to list endpoints'
      };
    }
  }
});

export const deleteEndpoint = tool({
  description: 'Delete an endpoint by ID',
  parameters: z.object({
    id: z.string().describe('The ID of the endpoint to delete')
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

      // Verify the endpoint exists and get its details
      const existingEndpoint = await getEndpointById({ id });

      if (!existingEndpoint) {
        return {
          status: 'error',
          message: 'Endpoint not found'
        };
      }

      // Verify ownership
      if (existingEndpoint.userId !== session.user.id) {
        return {
          status: 'error',
          message: 'Unauthorized: You do not have permission to delete this endpoint'
        };
      }

      // Delete the endpoint from the database
      const success = await deleteEndpointDB({ 
        id, 
        userId: session.user.id 
      });

      if (!success) {
        return {
          status: 'error',
          message: 'Failed to delete endpoint'
        };
      }

      // Also unregister the endpoint from the dynamic route manager
      try {
        await dynamicRouteManager.unregisterEndpoint(existingEndpoint.path);
      } catch (unregisterError) {
        console.warn('Warning: Failed to unregister endpoint from route manager:', unregisterError);
        // Continue since the database deletion was successful
      }

      return {
        status: 'success',
        message: 'Endpoint deleted successfully'
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to delete endpoint'
      };
    }
  }
});
