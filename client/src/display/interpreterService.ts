import { ConfigurationChangeEvent, ExtensionContext, languages, LanguageStatusItem, LanguageStatusSeverity, TextEditor, window, workspace } from 'vscode';
import { AUTOHOTKEY_LANGUAGE } from '../constants';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { InterpreterInformation, InterpreterStatus, StatusChangeHandler } from './types';
import { EventEmitter } from 'events';

export declare interface InterpreterService  {
	on(event: 'StatusChange', listener: StatusChangeHandler): this;
	emit(event: 'StatusChange', ...args: Parameters<StatusChangeHandler>): boolean;
}

export class InterpreterService extends EventEmitter {
    private languageStatus: LanguageStatusItem | undefined;

    constructor() {
        super();
    }

    private async onDidChangeConfiguration(event: ConfigurationChangeEvent) { 
        if (event.affectsConfiguration('ahk-simple-language-server.interpreterPath'))
            this.updateDisplay();
    }
    
    public activate(context: ExtensionContext) {
        this.languageStatus = languages.createLanguageStatusItem(
            'autohotkeyss.displayInterpreter',
            {language: AUTOHOTKEY_LANGUAGE}
        );
        this.languageStatus.severity = LanguageStatusSeverity.Information;
        this.languageStatus.command = {
            title: 'Change Interpreter config',
            command: 'workbench.action.openSettings',
            arguments: ['Ahk-simple-language-server:interpreterPath']
        };

        context.subscriptions.push(
            workspace.onDidChangeConfiguration(
                this.onDidChangeConfiguration.bind(this)
            )
        );
    }

    public async updateDisplay() {
        if (this.languageStatus) {
            const interpreter = await this.getInerpreterStatus();
            if (interpreter) {
                this.languageStatus.text = interpreter.version;
                this.languageStatus.detail = 'Autohotkey';
                this.languageStatus.command.tooltip = interpreter.path;
                this.emit('StatusChange', InterpreterStatus.available);
            }
            else {
                this.languageStatus.text = '$(alert) No Interpreter Selected';
                this.languageStatus.detail = '';
                this.languageStatus.command.tooltip = 'Set A Vaild Interpreter';
                this.emit('StatusChange', InterpreterStatus.unknown);
            }
        }
    }

    /**
     * Get information of Interpreter set on settings
     */
    private async getInerpreterStatus(): Promise<InterpreterInformation | undefined> {
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
     * Get stdout of ahk script with interpreter at certain path
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