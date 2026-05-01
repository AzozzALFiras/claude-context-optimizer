//  Developer By Azozz ALFiras
// https://github.com/AzozzALFiras/claude-context-optimizer

export type SymbolKind =
  | 'function'
  | 'class'
  | 'method'
  | 'interface'
  | 'type'
  | 'enum'
  | 'const'
  | 'block';

export interface SymbolEntry {
  name:           string;
  kind:           SymbolKind;
  filePath:       string;   // absolute path
  relPath:        string;   // path relative to indexed root
  line:           number;   // 1-based start line
  endLine:        number;
  signature:      string;   // first line, trimmed
  language:       string;
  containerName?: string;   // class name for methods
}

export interface SymbolFileMeta {
  filePath:    string;
  rootPath:    string;
  hash:        string;
  language:    string;
  symbolCount: number;
  indexedAt:   number;
}

export interface SymbolIndexStats {
  rootPath:     string;
  totalFiles:   number;
  totalSymbols: number;
  byKind:       Record<string, number>;
  byLanguage:   Record<string, number>;
  lastIndexed:  number;
}
