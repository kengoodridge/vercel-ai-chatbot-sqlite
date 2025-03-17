'use client';

interface CodeBlockProps {
  // Original props for react-markdown integration
  node?: any;
  inline?: boolean;
  className?: string;
  children?: any;
  
  // Direct usage props
  language?: string;
  value?: string;
}

export function CodeBlock({
  node,
  inline,
  className,
  children,
  language,
  value,
  ...props
}: CodeBlockProps) {
  // For direct usage with value prop
  if (value !== undefined) {
    return inline ? (
      <code
        className="text-sm bg-gray-100 dark:bg-zinc-800 py-0.5 px-1 rounded-md"
        {...props}
      >
        {value}
      </code>
    ) : (
      <pre
        className="text-sm w-full overflow-x-auto bg-gray-50 dark:bg-zinc-900 p-4 border border-zinc-200 dark:border-zinc-700 rounded-xl dark:text-zinc-50 text-zinc-900"
      >
        <code className="whitespace-pre-wrap break-words">{value}</code>
      </pre>
    );
  }
  
  // For react-markdown integration
  const match = /language-(\w+)/.exec(className || '');
  
  if (inline) {
    return (
      <code
        className="text-sm bg-gray-100 dark:bg-zinc-800 py-0.5 px-1 rounded-md"
        {...props}
      >
        {children}
      </code>
    );
  }

  // Block code
  return (
    <span
      className="text-sm w-full overflow-x-auto bg-gray-50 dark:bg-zinc-900 p-1 border border-zinc-200 dark:border-zinc-700 rounded-xl dark:text-zinc-50 text-zinc-900"
    >
      <code className="whitespace-pre-wrap break-words">{children}</code>
    </span>
  );
}
