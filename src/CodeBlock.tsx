import { useMemo, useState } from 'react';
import hljs from 'highlight.js/lib/core';
import python from 'highlight.js/lib/languages/python';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import bash from 'highlight.js/lib/languages/bash';
import sql from 'highlight.js/lib/languages/sql';
import r from 'highlight.js/lib/languages/r';
import cpp from 'highlight.js/lib/languages/cpp';
import java from 'highlight.js/lib/languages/java';

hljs.registerLanguage('python', python);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('r', r);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('java', java);

interface Props {
  code: string;
  blockId: string;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function CodeBlock({ code, blockId }: Props) {
  const [copied, setCopied] = useState(false);

  const highlighted = useMemo(() => {
    try {
      const result = hljs.highlightAuto(code, [
        'python',
        'javascript',
        'typescript',
        'bash',
        'sql',
        'r',
        'cpp',
        'java',
      ]);

      return { html: result.value, language: result.language || 'código' };
    } catch {
      return { html: escapeHtml(code), language: 'código' };
    }
  }, [code]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const lines = code.split('\n');

  return (
    <div className="code-block-wrapper" data-block-id={blockId}>
      <div className="code-block-header">
        <span className="code-block-lang">{highlighted.language}</span>
        <button type="button" className="code-block-copy" onClick={handleCopy}>
          {copied ? '✓ Copiado' : 'Copiar'}
        </button>
      </div>
      <div className="code-block-body">
        <div className="code-line-numbers" aria-hidden="true">
          {lines.map((_, i) => <span key={`${blockId}-line-${i}`}>{i + 1}</span>)}
        </div>
        <pre>
          <code dangerouslySetInnerHTML={{ __html: highlighted.html }} />
        </pre>
      </div>
    </div>
  );
}
