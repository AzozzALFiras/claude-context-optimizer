//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

export interface FileRecord {
  path: string;
  hash: string;
  summary: string;
  language: string;
  lineCount: number;
  tokenEstimate: number;
  lastReadAt: number;
}

export interface FileChunk {
  content: string;
  startLine: number;
  endLine: number;
  relevanceScore: number;
  chunkType: 'function' | 'class' | 'block' | 'lines' | 'section';
  identifier?: string;
}

export interface ParsedFunction {
  name: string;
  startLine: number;
  endLine: number;
  signature: string;
  body: string;
  language: string;
}

export interface ParsedClass {
  name: string;
  startLine: number;
  endLine: number;
  methods: string[];
  body: string;
  language: string;
}
