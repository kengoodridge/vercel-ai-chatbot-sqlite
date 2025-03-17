import { createOpenAI } from '@ai-sdk/openai';
// Use any type to bypass type incompatibility between different versions
// @ts-ignore
import { google } from '@ai-sdk/google';
import { fireworks } from '@ai-sdk/fireworks';
import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';

const openai = createOpenAI({
   'baseURL': 'http://localhost:11434/v1',
   'apiKey': 'dontcare'
})


export const DEFAULT_CHAT_MODEL: string = 'gemini';

// Use type assertion to bypass the type checking issues
export const myProvider = customProvider({
  languageModels: {
    'chat-model-small': openai('llama3.1_cwin'),
    // @ts-ignore - Ignore type incompatibility between different AI SDK versions
    'gemini': google('gemini-2.0-flash-exp'),
    // @ts-ignore - Ignore type incompatibility between different AI SDK versions
    'title-model': google('gemini-2.0-flash-exp'),
    // @ts-ignore - Ignore type incompatibility between different AI SDK versions
    'artifact-model': google('gemini-2.0-flash-exp'),
    // Add Groq models
    // @ts-ignore - Ignore type incompatibility between different AI SDK versions
    'groq': groq('llama-3.3-70b-versatile'),
  }
});

interface ChatModel {
  id: string;
  name: string;
  description: string;
}

export const chatModels: Array<ChatModel> = [
  {
    id: 'chat-model-small',
    name: 'llama3.1_cwin',
    description: 'Small model for fast, lightweight tasks',
  },
  {
    id: 'gemini',
    name: 'gemini-2.0-flash-exp',
    description: 'Gemini flash 2.0',
  },
  {
    id: 'groq',
    name: 'llama-3.3-70b-versatile',
    description: 'Groq llama-3.3-70b-versatile',
  },
];
