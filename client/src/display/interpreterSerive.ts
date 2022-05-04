import * as fs from 'fs';
import * as path from 'path';
import { window, workspace } from 'vscode';
import { InterpreterInformation } from './types';
import * as child_process from 'child_process';

export class InterpreterService {

    /**
     * Get information of Interpreter set on settings
     */
    public async getInerpreterStatus(): Promise<InterpreterInformation | undefined> {
        const runtime = workspace
                        .getConfiguration('ahk-simple-language-server')
                        .get('interpreterPath') as string;
        const nruntime = path.normalize(runtime);
        const scriptPath = path.join(path.dirname(__filename),
                                '..', '..', 'src', 'helperahk', 'getAHKVersion.ahk');
        if (!path.isAbsolute(nruntime))
            return undefined;
        if (!this.fileExistsSync(nruntime))
            return undefined;
        const rawStdout = await this.runScript(nruntime, scriptPath);
        if (!rawStdout) 
            return undefined;
        return {
            path: nruntime,
            version: rawStdout
        };
    }

    /**
     * Get stdout of ahk script of interpreter at certain path
     * @param runtime Interpreter path
     * @param script Path of script for running
     * @returns Stdout of script
     */
    public async runScript(runtime: string, script: string): Promise<string> {
        return new Promise((resolve, reject) => {
            child_process.execFile(
                runtime, [script], 
                (error, stdout, stderr) => {
                    if (error) {
                        reject(error);
                    }
                    resolve(stdout);
                }
            )
        });
    }

    private fileExistsSync(path: string): boolean {
        return fs.existsSync(path) && fs.lstatSync(path).isFile();
    }
}