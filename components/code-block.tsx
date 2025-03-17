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
  // If value is provided directly, use it instead of children
  const codeContent = value || children;
  
  // If language is provided and there's no className, construct one
  const codeClassName = className || (language ? `language-${language}` : '');
  
  if (!inline) {
    return (
      <div className="not-prose flex flex-col">
        <pre
          {...props}
          className={`text-sm w-full overflow-x-auto dark:bg-zinc-900 p-4 border border-zinc-200 dark:border-zinc-700 rounded-xl dark:text-zinc-50 text-zinc-900`}
        >
          <code className={`${codeClassName} whitespace-pre-wrap break-words`}>
            {codeContent}
          </code>
        </pre>
      </div>
    );
  } else {
    return (
      <code
        className={`${codeClassName} text-sm bg-zinc-100 dark:bg-zinc-800 py-0.5 px-1 rounded-md`}
        {...props}
      >
        {codeContent}
      </code>
    );
  }
}
