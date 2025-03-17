import { pagesPrompt } from './page';
import { artifactsPrompt } from './artifacts';
import { projectsPrompt } from './project';

/**
 * Basic assistant prompt
 */
export const regularPrompt =
  'You are a friendly assistant! Keep your responses concise and helpful.';

/**
 * Creates the main system prompt based on the selected chat model
 * @param selectedChatModel - The currently selected chat model
 * @returns The appropriate system prompt
 */
export const systemPrompt = ({
  selectedChatModel,
}: {
  selectedChatModel: string;
}) => {
  if (selectedChatModel === 'chat-model-reasoning') {
    return regularPrompt;
  } else {
    return `${regularPrompt}\n\n${artifactsPrompt}\n\n${pagesPrompt}\n\n${projectsPrompt}`;
  }
};