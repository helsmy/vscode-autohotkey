import { AHKMethodSymbol, AHKObjectSymbol, AHKSymbol, VariableSymbol } from '../parser/newtry/analyzer/models/symbol';

export interface WorkspaceSymbolEntry {
    uri: string;
    symbol: AHKSymbol;
}

/**
 * Stores and queries workspace-wide symbols for cross-file go-to-definition
 */
export class WorkspaceIndex {
    private fileSymbols: Map<string, AHKSymbol[]> = new Map();
    private symbolLookup: Map<string, WorkspaceSymbolEntry[]> = new Map();
    public isIndexing: boolean = false;

    /**
     * Add symbols from a file to the index
     */
    public addFile(uri: string, symbols: AHKSymbol[]): void {
        // Remove old symbols if file was previously indexed
        this.removeFile(uri);

        // Store file's symbols
        this.fileSymbols.set(uri, symbols);

        // Add to lookup by name
        for (const symbol of symbols) {
            const name = symbol.name.toLowerCase();
            const entries = this.symbolLookup.get(name) || [];
            entries.push({ uri, symbol });
            this.symbolLookup.set(name, entries);
        }
    }

    /**
     * Remove a file's symbols from the index
     */
    public removeFile(uri: string): void {
        const symbols = this.fileSymbols.get(uri);
        if (!symbols) return;

        // Remove from lookup
        for (const symbol of symbols) {
            const name = symbol.name.toLowerCase();
            const entries = this.symbolLookup.get(name);
            if (entries) {
                const filtered = entries.filter(e => e.uri !== uri);
                if (filtered.length === 0) {
                    this.symbolLookup.delete(name);
                } else {
                    this.symbolLookup.set(name, filtered);
                }
            }
        }

        this.fileSymbols.delete(uri);
    }

    /**
     * Find symbols by name (case-insensitive)
     */
    public findByName(name: string): WorkspaceSymbolEntry[] {
        return this.symbolLookup.get(name.toLowerCase()) || [];
    }

    /**
     * Get all symbols, optionally filtered by query
     */
    public getAllSymbols(query?: string): WorkspaceSymbolEntry[] {
        const results: WorkspaceSymbolEntry[] = [];
        const lowerQuery = query?.toLowerCase();

        // Use forEach for better compatibility with bundlers
        this.symbolLookup.forEach((entries, name) => {
            if (!lowerQuery || name.includes(lowerQuery)) {
                results.push(...entries);
            }
        });

        return results;
    }

    /**
     * Clear all indexed symbols
     */
    public clear(): void {
        this.fileSymbols.clear();
        this.symbolLookup.clear();
    }

    /**
     * Check if a file is indexed
     */
    public hasFile(uri: string): boolean {
        return this.fileSymbols.has(uri);
    }

    /**
     * Get count of indexed files
     */
    public get indexedFileCount(): number {
        return this.fileSymbols.size;
    }
}
