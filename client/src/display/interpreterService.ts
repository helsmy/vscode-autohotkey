import { ConfigurationChangeEvent, ExtensionContext, languages, LanguageStatusItem, LanguageStatusSeverity, workspace } from 'vscode';
import { AUTOHOTKEY_LANGUAGE } from '../constants';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { InterpreterInformation } from './types';

export class InterpreterService {
    private languageStatus: LanguageStatusItem | undefined;
    private interpreterInfomation: InterpreterInformation | undefined;

    constructor() {
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
                this.interpreterInfomation = interpreter;
                this.languageStatus.text = interpreter.version;
                this.languageStatus.detail = 'Autohotkey Version';
                this.languageStatus.command.tooltip = interpreter.path;
            }
            else {
                this.interpreterInfomation = undefined;
                this.languageStatus.text = '$(alert) No Interpreter Selected';
                this.languageStatus.detail = '';
                this.languageStatus.command.tooltip = 'Set A Vaild Interpreter';
            }
        }
    }

    /**
     * Return interpreter path if interpreter is vaild autohotkey runtime
     * @returns Path of interpreter
     */
    public getVaildInterpreterPath(): string | undefined {
        return this.interpreterInfomation ? this.interpreterInfomation.path : undefined;
    }

    /**
     * Get information of Interpreter set on settings
     */
    private async getInerpreterStatus(): Promise<InterpreterInformation | undefined> {
        const runtime = workspace
                        .getConfiguration('ahk-simple-language-server')
                        .get('interpreterPath') as string;
        const nruntime = path.normalize(runtime);
        if (!path.isAbsolute(nruntime))
            return undefined;
        if (!this.fileExistsSync(nruntime))
            return undefined;
        const rawStdout = await this.getVersion(nruntime).catch((error) => {
            console.log(error);
            return undefined;
        });
        if (!rawStdout) 
            return undefined;
        return {
            path: nruntime,
            version: rawStdout
        };
    }

    /**
     * Run a dectection script to get version of runtime
     * @param runtime Executable path of autohotkey runtime
     * @returns Version of runtime
     */
    private async getVersion(runtime: string): Promise<string> {
        return new Promise((resolve, reject) => {
            // Use stdin as input file of runtime, 
            // so that no actually file on disk is needed.
            const child = child_process.exec(`"${runtime}" *`, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                }
                resolve(stdout);
            });
            child.stdin.write('stdout := FileOpen("*", "w"),stdout.Write(A_AhkVersion)');
            child.stdin.end();
            // kill it if no respond after 1000ms
            setTimeout(() => child.kill(), 1000);
        });
    }

    private fileExistsSync(path: string): boolean {
        return fs.existsSync(path) && fs.lstatSync(path).isFile();
    }
}