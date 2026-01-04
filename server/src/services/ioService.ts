/**
 * reference: kos-language-server
 */

import { readFile, readFileSync, readdirSync, existsSync, lstatSync, statSync } from 'fs';
import { dirname, join, relative } from 'path';
import ignore = require('ignore');

/**
 * What kind of entity is this
 */
export enum IoKind {
    /**
     * The io entity is a file
     */
    file,
  
    /**
     * The io entity is a directory
     */
    folder,
}
  
/**
 * What is the io entity that is found
 */
export interface IoEntity {
    /**
     * What is the path of this entity
     */
    path: string;
  
    /**
     * WHat is the kind of this entity
     */
    kind: IoKind;
}

function readFileAsync(path: string, encoding: string) :Promise<string> {
    return new Promise((resolve, reject) => {
        readFile(path, { encoding }, (err, data) => {
            if (err) {
                reject(err);
            }
    
            resolve(data);
        });
    });
}


/**
 * A small set of functionality for loading files and directory of files
 */
export class IoService {
    constructor() {}
  
    /**
     * Load a file from a given path
     * @param path the system path
     */
    public load(path: string): Promise<string> {
      return readFileAsync(path, 'utf-8');
    }

    public fileExistsSync(path: string): boolean {
        return existsSync(path) && lstatSync(path).isFile();
    }

    /**
     * Recursively find all files with a given extension in a directory
     * Respects .gitignore patterns if present
     * @param rootPath The root directory to search
     * @param extension The file extension to match (default: '.ahk')
     * @returns Array of absolute file paths
     */
    public findFilesRecursive(rootPath: string, extension: string = '.ahk'): string[] {
        const results: string[] = [];

        // Set up ignore patterns from .gitignore
        const ig = ignore();
        ig.add('.git');  // Always ignore .git directory

        const gitignorePath = join(rootPath, '.gitignore');
        if (existsSync(gitignorePath)) {
            try {
                const patterns = readFileSync(gitignorePath, 'utf-8');
                ig.add(patterns);
            } catch {
                // Ignore read errors
            }
        }

        const scan = (dir: string): void => {
            const entries = this.statDirectory(dir);
            for (const entry of entries) {
                const fullPath = join(dir, entry.path);
                const relativePath = relative(rootPath, fullPath);

                // Skip if matches .gitignore patterns
                if (ig.ignores(relativePath)) continue;

                if (entry.kind === IoKind.folder) {
                    scan(fullPath);
                } else if (entry.path.toLowerCase().endsWith(extension)) {
                    results.push(fullPath);
                }
            }
        };

        if (existsSync(rootPath) && lstatSync(rootPath).isDirectory()) {
            scan(rootPath);
        }
        return results;
    }

    /**
     * What entities are in the relevant directory
     * @param path The full path of the request
     */
    public statDirectory(path: string): IoEntity[] {
        const isDirectory = existsSync(path) && lstatSync(path).isDirectory();
        if (!isDirectory) {
            return [];
        }
        const directory = path;

        // check if file exists then
        if (!existsSync(directory)) {
            return [];
        }

        const files = readdirSync(directory);
        let entities: IoEntity[] = []
        for (const file of files) {
            const path = join(directory, file);

            // in case of permition denied
            try {
                entities.push({
                    path: file,
                    kind: statSync(path).isDirectory() ? IoKind.folder : IoKind.file
                });
            } catch (error) {
                // pass, just skip it
                continue;
            }
        }
        return entities;
    }
}