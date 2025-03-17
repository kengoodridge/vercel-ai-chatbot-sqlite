import * as vm from 'node:vm';
import { python } from 'pythonia';
import { 
  getAllEndpoints,
  getAllPages,
  getEndpointByPath, 
  getPageByPath 
} from './db/queries';
import { NextRequest, NextResponse } from 'next/server';

interface RouteInfo {
  type: 'endpoint' | 'page';
  path: string;
  function?: Function;
  parameters?: string[];
  httpMethod?: string;
  htmlContent?: string;
  language?: 'javascript' | 'python';
  pythonInstance?: any; // Store Python function reference
}

export class DynamicRouteManager {
  // Changed from private to public to allow direct access in update/delete operations
  public dynamicRoutes: Record<string, RouteInfo> = {};
  private isInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    // Load routes on first access
    this.initializationPromise = this.loadAllRoutes();
  }

  private async loadAllRoutes(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Load endpoints from database
      const endpoints = await getAllEndpoints();
      
      for (const endpoint of endpoints) {
        const paramList = endpoint.parameters ? endpoint.parameters.split(',') : [];
        await this.registerEndpoint(
          endpoint.path,
          paramList,
          endpoint.code,
          endpoint.httpMethod,
          endpoint.language as 'javascript' | 'python'
        );
      }
      
      // Load pages from database
      const pages = await getAllPages();
      
      for (const page of pages) {
        await this.registerPage(
          page.path,
          page.htmlContent
        );
      }
      
      this.isInitialized = true;
    } catch (error) {
      console.error('Error loading routes:', error);
      throw error;
    }
  }

  async ensureInitialized(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initializationPromise) {
      await this.initializationPromise;
    } else {
      this.initializationPromise = this.loadAllRoutes();
      await this.initializationPromise;
    }
  }

  async registerEndpoint(
    path: string, 
    parameters: string[], 
    code: string, 
    httpMethod: string,
    language: 'javascript' | 'python' = 'javascript'
  ): Promise<void> {
    console.log(`Registering endpoint ${path} (${language})`);
    
    try {
      if (language === 'javascript') {
        // JavaScript execution using Node.js VM
        // Create a new context for the VM
        const context = {
          endpoint_function: null,
          console: console
        };
        
        // Use VM to execute the code safely
        // Wrapped in a try-catch to handle execution errors
        try {
          const script = new vm.Script(`
            ${code}
            endpoint_function;
          `);
          
          const vmContext = vm.createContext(context);
          const func = script.runInContext(vmContext);
          
          if (!func || typeof func !== 'function') {
            throw new Error(`Invalid function definition in endpoint at ${path}`);
          }
          
          // Store in dynamic routes dictionary
          this.dynamicRoutes[path] = {
            type: 'endpoint',
            path,
            parameters,
            function: func,
            httpMethod,
            language: 'javascript'
          };
        } catch (execError) {
          console.error(`Error compiling JavaScript code for endpoint ${path}:`, execError);
          // Store a placeholder function that returns an error
          this.dynamicRoutes[path] = {
            type: 'endpoint',
            path,
            parameters,
            function: () => ({ 
              error: 'JavaScript endpoint code compilation error', 
              details: execError instanceof Error ? execError.message : String(execError) 
            }),
            httpMethod,
            language: 'javascript'
          };
        }
//       } else if (language === 'python') {
//         // Python execution using pythonia
//         try {
//           // First, register a placeholder function while Python loads (async)
//           this.dynamicRoutes[path] = {
//             type: 'endpoint',
//             path,
//             parameters,
//             function: () => ({ 
//               error: 'Python endpoint is still initializing', 
//               status: 'loading' 
//             }),
//             httpMethod,
//             language: 'python'
//           };
          
//           // Create a Python wrapper for the code
//           const pythonWrapper = `
// def endpoint_function(params):
//     try:
// ${code.split('\n').map(line => '        ' + line).join('\n')}
//     except Exception as e:
//         return {"error": f"Python execution error: {str(e)}"}
//           `;
          
//           // Initialize Python interpreter
//           const py = await Python.startup();
          
//           // Execute the Python code
//           await py.exec(pythonWrapper);
          
//           // Get the Python function
//           const pyFunc = await py.eval('endpoint_function');
          
//           // Store in dynamic routes dictionary with Python function reference
//           this.dynamicRoutes[path] = {
//             type: 'endpoint',
//             path,
//             parameters,
//             // Create a JavaScript function that calls the Python function
//             function: async (params: any) => {
//               try {
//                 // Convert params to Python compatible format
//                 const result = await pyFunc(params);
//                 // Convert result back to JavaScript
//                 return JSON.parse(await result.toString());
//               } catch (error) {
//                 console.error(`Error executing Python endpoint ${path}:`, error);
//                 return {
//                   error: 'Python execution error',
//                   details: error instanceof Error ? error.message : String(error)
//                 };
//               }
//             },
//             httpMethod,
//             language: 'python',
//             pythonInstance: pyFunc
//           };
//         } catch (execError) {
//           console.error(`Error compiling Python code for endpoint ${path}:`, execError);
//           // Store a placeholder function that returns an error
//           this.dynamicRoutes[path] = {
//             type: 'endpoint',
//             path,
//             parameters,
//             function: () => ({ 
//               error: 'Python endpoint code compilation error', 
//               details: execError instanceof Error ? execError.message : String(execError) 
//             }),
//             httpMethod,
//             language: 'python'
//           };
//         }
      } else {
        throw new Error(`Unsupported language: ${language}`);
      }
    } catch (error) {
      console.error(`Error registering endpoint ${path}:`, error);
      throw error;
    }
  }
  
  async registerPage(path: string, htmlContent: string): Promise<void> {
    console.log(`Registering page ${path}`);
    
    try {
      // Store the page in dynamic routes dictionary
      this.dynamicRoutes[path] = {
        type: 'page',
        path,
        htmlContent
      };
    } catch (error) {
      console.error(`Error registering page ${path}:`, error);
      throw error;
    }
  }
  
  // Refresh or add a specific endpoint (e.g., after updates)
  async refreshEndpoint(path: string): Promise<void> {
    const endpoint = await getEndpointByPath({ path });
    if (endpoint) {
      const paramList = endpoint.parameters ? endpoint.parameters.split(',') : [];
      
      // Clean up any previous Python instance if it exists
      if (this.dynamicRoutes[path]?.pythonInstance) {
        try {
          await this.dynamicRoutes[path].pythonInstance.destroy();
        } catch (error) {
          console.error(`Error cleaning up Python instance for ${path}:`, error);
        }
      }
      
      await this.registerEndpoint(
        endpoint.path,
        paramList,
        endpoint.code,
        endpoint.httpMethod,
        endpoint.language as 'javascript' | 'python'
      );
    } else {
      // If endpoint no longer exists in DB, clean up and remove it from in-memory routes
      if (this.dynamicRoutes[path]?.pythonInstance) {
        try {
          await this.dynamicRoutes[path].pythonInstance.destroy();
        } catch (error) {
          console.error(`Error cleaning up Python instance for ${path}:`, error);
        }
      }
      delete this.dynamicRoutes[path];
    }
  }
  
  // Refresh or add a specific page (e.g., after updates)
  async refreshPage(path: string): Promise<void> {
    const page = await getPageByPath({ path });
    if (page) {
      await this.registerPage(
        page.path,
        page.htmlContent
      );
    } else {
      // If page no longer exists in DB, remove it from in-memory routes
      delete this.dynamicRoutes[path];
    }
  }
  
  // Handle the request for dynamic endpoints
  async handleRequest(request: NextRequest, path: string): Promise<NextResponse> {
    await this.ensureInitialized();
    
    console.log(`Dynamic handler received: ${path}`);
    
    // Remove /api prefix if it exists (for compatibility with Next.js routing)
    let processedPath = path;
    if (processedPath.startsWith('/api')) {
      // We might get /api/api/... if the [...path] handler prefixes /api
      if (processedPath.startsWith('/api/api/')) {
        processedPath = processedPath.replace('/api/api/', '/api/');
      }
    } else {
      // If path doesn't start with /api, add it for compatibility with registration
      processedPath = '/api' + processedPath;
    }
    
    console.log(`Processed path: ${processedPath}`);
    const sanitizedPath = this.sanitizePath(processedPath);
    
    // Enhanced debugging
    console.log(`Available routes: ${JSON.stringify(Object.keys(this.dynamicRoutes))}`);
    console.log(`Looking for path: ${sanitizedPath}`);
    
    // Check if path exists in our dynamic routes
    if (this.dynamicRoutes[sanitizedPath]) {
      const route = this.dynamicRoutes[sanitizedPath];
      
      if (route.type === 'endpoint' && route.function && request.method === route.httpMethod) {
        let params: Record<string, any> = {};
        
        if (request.method === 'GET') {
          // Parse query parameters
          const url = new URL(request.url);
          route.parameters?.forEach(param => {
            params[param] = url.searchParams.get(param);
          });
        } else if (request.method === 'POST') {
          // Parse JSON body
          try {
            params = await request.json();
          } catch (e) {
            console.error('Error parsing JSON body:', e);
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
          }
        }
        
        try {
          // Execute the dynamic function
          const result = await Promise.resolve(route.function(params));
          return NextResponse.json(result);
        } catch (error) {
          console.error(`Error executing endpoint ${sanitizedPath}:`, error);
          return NextResponse.json(
            { error: 'Error executing endpoint', details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
          );
        }
      }
    }
    
    // Check if this might be a dynamic page request
    try {
      const page = await getPageByPath({ path: sanitizedPath });
      if (page) {
        return new NextResponse(page.htmlContent, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8'
          }
        });
      }
    } catch (error) {
      console.error(`Error trying to serve page at ${sanitizedPath}:`, error);
    }
    
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  
  sanitizePath(path: string): string {
    if (!path.startsWith('/')) {
      path = '/' + path;
    }
    if (path !== '/' && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    return path;
  }
  
  // Unregister an endpoint by path
  async unregisterEndpoint(path: string): Promise<boolean> {
    await this.ensureInitialized();
    
    const sanitizedPath = this.sanitizePath(path);
    console.log(`Unregistering endpoint: ${sanitizedPath}`);
    
    if (!this.dynamicRoutes[sanitizedPath]) {
      console.warn(`Attempted to unregister non-existent endpoint: ${sanitizedPath}`);
      return false;
    }
    
    const route = this.dynamicRoutes[sanitizedPath];
    
    if (route.type !== 'endpoint') {
      console.warn(`Attempted to unregister non-endpoint route: ${sanitizedPath}`);
      return false;
    }
    
    // Clean up any Python instance if it exists
    if (route.pythonInstance) {
      try {
        await route.pythonInstance.destroy();
      } catch (error) {
        console.error(`Error cleaning up Python instance for ${sanitizedPath}:`, error);
        // Continue with deletion even if cleanup fails
      }
    }
    
    // Remove the route from our registry
    delete this.dynamicRoutes[sanitizedPath];
    console.log(`Successfully unregistered endpoint: ${sanitizedPath}`);
    
    return true;
  }
  
  // Unregister a page by path
  async unregisterPage(path: string): Promise<boolean> {
    await this.ensureInitialized();
    
    const sanitizedPath = this.sanitizePath(path);
    console.log(`Unregistering page: ${sanitizedPath}`);
    
    if (!this.dynamicRoutes[sanitizedPath]) {
      console.warn(`Attempted to unregister non-existent page: ${sanitizedPath}`);
      return false;
    }
    
    const route = this.dynamicRoutes[sanitizedPath];
    
    if (route.type !== 'page') {
      console.warn(`Attempted to unregister non-page route: ${sanitizedPath}`);
      return false;
    }
    
    // Remove the route from our registry
    delete this.dynamicRoutes[sanitizedPath];
    console.log(`Successfully unregistered page: ${sanitizedPath}`);
    
    return true;
  }
  
  // For debugging - get all registered routes
  getRegisteredRoutes(): string[] {
    return Object.keys(this.dynamicRoutes);
  }
}

// Create a singleton instance for the application
export const dynamicRouteManager = new DynamicRouteManager();
// Alias for backwards compatibility
export const endpointManager = dynamicRouteManager;