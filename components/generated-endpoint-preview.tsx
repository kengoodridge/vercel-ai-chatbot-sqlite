'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CodeBlock } from './code-block';
import { Button } from './ui/button';

export interface GeneratedEndpointInfo {
  id?: string;
  path: string;
  url?: string;
  projectId?: string;
  projectName?: string;
  parameters: string[];
  code: string;
  httpMethod: string;
  language: 'javascript' | 'python';
  testFormHtml: string; // This will be a JSON string now
}

interface FormData {
  title: string;
  path: string;
  httpMethod: string;
  parameters: string[];
}

export function GeneratedEndpointPreview({
  endpointInfo
}: {
  endpointInfo: GeneratedEndpointInfo;
}) {
  // Log the props for debugging
  console.log('GeneratedEndpointPreview props:', {
    id: endpointInfo.id,
    path: endpointInfo.path,
    projectId: endpointInfo.projectId,
    parameters: endpointInfo.parameters,
    language: endpointInfo.language,
    httpMethod: endpointInfo.httpMethod,
    codeAvailable: !!endpointInfo.code,
    codeLength: endpointInfo.code?.length || 0,
    testFormHtmlLength: endpointInfo.testFormHtml?.length || 0
  });
  
  // Parse the form data from the JSON string
  let formData: FormData;
  try {
    formData = JSON.parse(endpointInfo.testFormHtml);
  } catch (error) {
    console.error('Error parsing testFormHtml JSON:', error);
    formData = {
      title: 'Test Form',
      path: endpointInfo.path,
      httpMethod: endpointInfo.httpMethod,
      parameters: endpointInfo.parameters
    };
  }
  
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<string>('// The response will appear here');
  const [error, setError] = useState<string | null>(null);
  
  const handleParamChange = (param: string, value: string) => {
    setParamValues(prev => ({
      ...prev,
      [param]: value
    }));
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setResponse('Loading...');
    setError(null);
    
    try {
      // Make the request based on HTTP method
      let response;
      const endpointPath = formData.path;
      
      if (formData.httpMethod === 'GET') {
        // For GET requests, build URL with query parameters
        let urlWithParams = endpointPath;
        const queryParams: string[] = []; // Explicitly define as string array
        
        Object.entries(paramValues).forEach(([key, value]) => {
          if (value) {
            queryParams.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
          }
        });
        
        if (queryParams.length > 0) {
          urlWithParams += (urlWithParams.includes('?') ? '&' : '?') + queryParams.join('&');
        }
        
        console.log('Sending GET request to:', urlWithParams);
        response = await fetch(urlWithParams, {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        });
      } else {
        // For POST requests, send JSON body
        console.log('Sending POST request to:', endpointPath, 'with data:', paramValues);
        response = await fetch(endpointPath, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(paramValues)
        });
      }
      
      // Parse and display the response
      const result = await response.json();
      setResponse(JSON.stringify(result, null, 2));
      console.log('Endpoint response:', result);
    } catch (error: any) {
      console.error('Error making request:', error);
      setError(error.message || 'Unknown error occurred');
      setResponse(`Error occurred while making the request.\nPlease check the console for more details.`);
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>
          {endpointInfo.projectName ? `${endpointInfo.projectName} - Generated Endpoint` : 'Generated Endpoint'}
        </CardTitle>
        <CardDescription>
          <div className="flex flex-row items-center gap-2">
            <span className={`px-2 py-0.5 text-xs rounded-full ${
              endpointInfo.httpMethod === 'GET' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
            }`}>
              {endpointInfo.httpMethod || 'GET'}
            </span>
            <span className="font-mono text-sm">{endpointInfo.path || ''}</span>
          </div>
          <div className="mt-1">
            <span className="text-sm">Parameters: </span>
            {endpointInfo.parameters && Array.isArray(endpointInfo.parameters) 
              ? endpointInfo.parameters.map((param, index) => (
                <span key={param} className="inline-flex items-center mx-1 px-2 py-0.5 rounded-full text-xs bg-gray-100">
                  {param}{index < endpointInfo.parameters.length - 1 ? "" : ""}
                </span>
              ))
              : null
            }
          </div>
          <div className="mt-1">
            <span className="text-sm">Language: </span>
            <span className={`inline-flex items-center mx-1 px-2 py-0.5 rounded-full text-xs ${
              endpointInfo.language === 'javascript' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'
            }`}>
              {endpointInfo.language || 'javascript'}
            </span>
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="test">
          <TabsList className="mb-4">
            <TabsTrigger value="test">Test Endpoint</TabsTrigger>
            <TabsTrigger value="code">View Code</TabsTrigger>
          </TabsList>
          
          <TabsContent value="test" className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border rounded-md p-4">
                <h3 className="text-lg font-medium mb-4">Request Form</h3>
                <form onSubmit={handleSubmit}>
                  {formData.parameters && Array.isArray(formData.parameters) 
                    ? formData.parameters.map((param) => (
                      <div key={param} className="mb-3">
                        <label htmlFor={param} className="block text-sm font-medium mb-1">{param}</label>
                        <input 
                          type="text" 
                          id={param} 
                          name={param} 
                          className="w-full p-2 border rounded-md" 
                          placeholder={`Enter ${param}`}
                          value={paramValues[param] || ''}
                          onChange={(e) => handleParamChange(param, e.target.value)}
                        />
                      </div>
                    ))
                    : <p>No parameters available for this endpoint</p>
                  }
                  <Button 
                    type="submit" 
                    className="mt-2" 
                    disabled={isLoading}
                  >
                    {isLoading ? 'Sending...' : 'Send Request'}
                  </Button>
                </form>
              </div>
              
              <div className="border rounded-md p-4">
                <h3 className="text-lg font-medium mb-4">Response</h3>
                <pre className="bg-gray-100 p-4 rounded-md overflow-auto min-h-40 max-h-80 font-mono text-sm whitespace-pre-wrap">
                  {error ? (
                    <div className="text-red-500">
                      <div>Error: {error}</div>
                      <div>Endpoint Path: {formData.path}</div>
                    </div>
                  ) : (
                    response
                  )}
                </pre>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="code" className="mt-0">
            {/* Add debug information */}
            <div className="mb-2 p-2 bg-gray-50 border rounded text-xs">
              <div><strong>Code available:</strong> {endpointInfo.code ? 'Yes' : 'No'}</div>
              <div><strong>Code length:</strong> {endpointInfo.code?.length || 0} characters</div>
              <div><strong>Language:</strong> {endpointInfo.language || 'javascript'}</div>
            </div>
            
            {endpointInfo.code ? (
              <CodeBlock
                language={endpointInfo.language === 'javascript' ? 'typescript' : 'python'}
                value={endpointInfo.code}
                inline={false}
              />
            ) : (
              <div className="p-4 bg-gray-50 rounded-md text-gray-600">
                No code available. This might be due to an issue with code generation or data passing.
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}