import { highlight } from 'cli-highlight';
import chalk from 'chalk';

// Language mappings for file extensions
const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.md': 'markdown',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.html': 'html',
  '.xml': 'xml',
  '.sql': 'sql',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.fish': 'fish',
};

/**
 * Detect language from file path or content
 */
function detectLanguage(filePath?: string, content?: string): string | undefined {
  // Try to detect from file path
  if (filePath) {
    const ext = filePath.toLowerCase().split('.').pop();
    if (ext) {
      const fullExt = '.' + ext;
      if (LANGUAGE_MAP[fullExt]) {
        return LANGUAGE_MAP[fullExt];
      }
    }
  }

  // Try to detect from content patterns
  if (content) {
    const firstLine = content.split('\n')[0].toLowerCase();
    
    // Shebang detection
    if (firstLine.startsWith('#!/usr/bin/env python') || firstLine.startsWith('#!/usr/bin/python')) {
      return 'python';
    }
    if (firstLine.startsWith('#!/bin/bash') || firstLine.startsWith('#!/usr/bin/bash')) {
      return 'bash';
    }
    if (firstLine.startsWith('#!/usr/bin/env node') || firstLine.startsWith('#!/usr/bin/node')) {
      return 'javascript';
    }

    // Content pattern detection
    if (content.includes('import React') || content.includes('from React') || content.includes('export default')) {
      return content.includes('interface ') || content.includes('type ') ? 'typescript' : 'javascript';
    }
    if (content.includes('def ') && content.includes('import ')) {
      return 'python';
    }
    if (content.includes('function ') || content.includes('const ') || content.includes('let ')) {
      return 'javascript';
    }
  }

  return undefined;
}

/**
 * Apply syntax highlighting to code content
 */
export function highlightCode(code: string, language?: string, filePath?: string): string {
  try {
    const detectedLanguage = language || detectLanguage(filePath, code);
    
    if (detectedLanguage) {
      return highlight(code, {
        language: detectedLanguage,
        theme: {
          // Keywords (def, class, import, function, const, let, etc.)
          keyword: chalk.blue.bold,
          built_in: chalk.cyan.bold,
          
          // Types and class names
          type: chalk.green.bold,
          class: chalk.green.bold,
          
          // Literals and constants
          literal: chalk.magenta.bold,
          number: chalk.yellow.bold,
          string: chalk.green,
          
          // Comments
          comment: chalk.gray.italic,
          
          // Functions and methods
          function: chalk.cyan.bold,
          title: chalk.cyan.bold,
          
          // HTML/XML
          tag: chalk.blue,
          attribute: chalk.cyan,
          
          // Variables and identifiers
          variable: chalk.white,
          symbol: chalk.yellow,
          
          // Operators and punctuation
          operator: chalk.white.bold,
          punctuation: chalk.white,
          
          // Language-specific enhancements
          meta: chalk.gray,
          regexp: chalk.red,
          subst: chalk.yellow,
          
          // Python specific
          'attr': chalk.cyan,
          'doctag': chalk.blue,
          
          // TypeScript/JavaScript specific
          'params': chalk.white,
          'property': chalk.cyan,
          'template-variable': chalk.yellow,
          'template-tag': chalk.magenta,
        }
      });
    }
  } catch (error) {
    // If highlighting fails, return original code
    console.warn('Syntax highlighting failed:', error);
  }

  return code;
}

/**
 * Highlight git patch/diff content with red/blue colors
 */
export function highlightPatch(patchContent: string): string {
  const lines = patchContent.split('\n');
  
  return lines.map(line => {
    if (line.startsWith('+++') || line.startsWith('---')) {
      // File headers in bold cyan
      return chalk.cyan.bold(line);
    } else if (line.startsWith('@@')) {
      // Hunk headers in bold yellow with background
      return chalk.bgYellow.black.bold(` ${line} `);
    } else if (line.startsWith('+')) {
      // Added lines in bright blue (user requested blue instead of green)
      return chalk.blue.bold(line);
    } else if (line.startsWith('-')) {
      // Removed lines in bright red
      return chalk.red.bold(line);
    } else if (line.startsWith(' ')) {
      // Context lines in dim gray
      return chalk.gray(line);
    } else if (line.startsWith('*** ')) {
      // Patch markers in bright magenta with background
      return chalk.bgMagenta.white.bold(` ${line} `);
    } else if (line.match(/^(Begin|End) Patch/)) {
      // Begin/End patch markers in bright magenta with background
      return chalk.bgMagenta.white.bold(` ${line} `);
    } else if (line.startsWith('Update File:') || line.startsWith('Create File:') || line.startsWith('Delete File:')) {
      // File operation markers in bright cyan with background
      return chalk.bgCyan.black.bold(` ${line} `);
    } else if (line.match(/^\s*\+\+\+|^\s*---/)) {
      // Additional file diff headers
      return chalk.cyan.bold(line);
    } else if (line.match(/^index [a-f0-9]+\.\.[a-f0-9]+/)) {
      // Git index lines
      return chalk.yellow.dim(line);
    } else if (line.match(/^diff --git/)) {
      // Git diff headers
      return chalk.white.bold(line);
    } else {
      // Default lines
      return line;
    }
  }).join('\n');
}

/**
 * Highlight apply_patch command content specifically
 */
export function highlightApplyPatch(content: string): string {
  // First check if this looks like a patch
  if (content.includes('*** Begin Patch') || content.includes('@@') || content.includes('Update File:')) {
    return highlightPatch(content);
  }
  
  // Otherwise try to detect language and highlight normally
  const language = detectLanguage(undefined, content);
  return highlightCode(content, language);
}

/**
 * Highlight code blocks in markdown-style content
 */
export function highlightCodeBlocks(content: string): string {
  // Match code blocks with language specification: ```language\ncode\n```
  const codeBlockPattern = /```(\w+)?\n([\s\S]*?)```/g;
  
  return content.replace(codeBlockPattern, (match, language, code) => {
    const highlighted = highlightCode(code.trim(), language);
    return `${chalk.gray('```')}${language ? chalk.cyan(language) : ''}${chalk.gray('\n')}${highlighted}${chalk.gray('\n```')}`;
  });
}

/**
 * Auto-detect and highlight content based on context
 */
export function autoHighlight(content: string, context?: { 
  filePath?: string; 
  language?: string; 
  isPatch?: boolean;
  isCommand?: boolean;
}): string {
  if (context?.isPatch || content.includes('*** Begin Patch') || content.includes('Update File:')) {
    return highlightApplyPatch(content);
  }
  
  if (context?.isCommand) {
    // Highlight shell commands
    return highlightCode(content, 'bash');
  }
  
  // Check for code blocks first
  if (content.includes('```')) {
    return highlightCodeBlocks(content);
  }
  
  // Regular code highlighting
  return highlightCode(content, context?.language, context?.filePath);
}

/**
 * Create a themed output with consistent coloring
 */
export function createThemedOutput(content: string, options?: {
  title?: string;
  type?: 'success' | 'error' | 'warning' | 'info' | 'patch' | 'code';
  language?: string;
  filePath?: string;
}): string {
  const { title, type, language, filePath } = options || {};
  
  let output = '';
  
  // Add title if provided
  if (title) {
    const titleColor = type === 'error' ? chalk.red.bold : 
                      type === 'warning' ? chalk.yellow.bold :
                      type === 'success' ? chalk.green.bold :
                      type === 'patch' ? chalk.magenta.bold :
                      chalk.cyan.bold;
    output += titleColor(`▶ ${title}\n`);
  }
  
  // Apply appropriate highlighting
  const highlighted = autoHighlight(content, {
    filePath,
    language,
    isPatch: type === 'patch',
    isCommand: type === 'code' && language === 'bash'
  });
  
  output += highlighted;
  
  return output;
}