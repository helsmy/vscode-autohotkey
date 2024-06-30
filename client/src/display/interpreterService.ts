import { ConfigurationChangeEvent, ExtensionContext, languages, LanguageStatusItem, LanguageStatusSeverity, workspace } from 'vscode';
import { AUTOHOTKEY_LANGUAGE } from '../constants';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { InterpreterInformation } from './types';

export class InterpreterService {
    private languageStatus: LanguageStatusItem | undefined;
    private interpreterInfomation: InterpreterInformation;
    private availableInterpreterList: InterpreterInformation[] = [];
    private interpreterDir: Promise<string>;

    constructor() {
        this.interpreterInfomation = {
            version: undefined,
            path: ''
        }
        this.interpreterDir = this.getInterpreterDir();
    }

    private async onDidChangeConfiguration(event: ConfigurationChangeEvent) { 
        if (event.affectsConfiguration('ahk-simple-language-server.interpreterPath'))
            this.updateDisplay();
    }

    public onDidChangeInterpreter(interpreterInfomation: InterpreterInformation) {
        workspace.getConfiguration('ahk-simple-language-server')
                 .update('interpreterPath', interpreterInfomation.path);
    }
    
    public async activate(context: ExtensionContext) {
        this.languageStatus = languages.createLanguageStatusItem(
            'AutohotkeySS.displayInterpreter',
            {language: AUTOHOTKEY_LANGUAGE}
        );
        this.languageStatus.severity = LanguageStatusSeverity.Information;
        this.languageStatus.command = {
            title: 'Change Interpreter',
            command: 'AutohotkeySS.selectInterpreterCommand'
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
            this.interpreterInfomation = interpreter;
            this.syncLanguageStatus(interpreter);
        }
    }

    private syncLanguageStatus(interpreterInfomation: InterpreterInformation) {
        if (!this.languageStatus) return;
        if (interpreterInfomation.version !== undefined) {
            this.languageStatus.text = interpreterInfomation.version;
            this.languageStatus.detail = 'Autohotkey Version';
            if (this.languageStatus.command)
                this.languageStatus.command.tooltip = interpreterInfomation.path;
        }
        else {
            this.languageStatus.text = '$(alert) No Interpreter Selected';
            this.languageStatus.detail = '';
            if (this.languageStatus.command)
                this.languageStatus.command.tooltip = 'Set A Vaild Interpreter';
        }
    }
    

    /**
     * Return interpreter path if interpreter is vaild autohotkey runtime
     * @returns Path of interpreter
     */
    public getVaildInterpreterPath(): string | undefined {
        return this.interpreterInfomation.version ? this.interpreterInfomation.path : undefined;
    }

    public getInterpreterList(): InterpreterInformation[] {
        return [this.interpreterInfomation, ...this.availableInterpreterList];
    }

    /**
     * Get information of Interpreter set on settings
     */
    private async getInerpreterStatus(): Promise<InterpreterInformation> {
        const runtime = workspace
                        .getConfiguration('ahk-simple-language-server')
                        .get('interpreterPath') as string;
        const nruntime = path.normalize(runtime);
        if (!path.isAbsolute(nruntime))
            return {
                path: nruntime,
                version: undefined
            };
        if (!this.fileExistsSync(nruntime))
            return {
                path: nruntime,
                version: undefined
            };
        const rawStdout = await this.getVersion(nruntime).catch((error) => {
            console.warn(error);
            return undefined;
        });
        return {
            path: nruntime,
            version: rawStdout
        };
    }

    private async getInterpreterDir(): Promise<string> {
        return new Promise((resolve, reject) => {
            child_process.exec(
                'cmd.exe /c REG QUERY HKEY_LOCAL_MACHINE\\SOFTWARE\\AutoHotkey /v InstallDir',
                (error, stdout) => {
                    if (error) reject(error);
                    const temp = stdout.split('    ');
                    resolve(temp[temp.length-1].trim());
                }
            )
        })
    }

    public async scanInterpreter() {
        const dir = await this.interpreterDir;
        this.deepScanInterpreterAtDir(dir);
    }

    private async deepScanInterpreterAtDir(dir: string) {
        const isDirectory = fs.existsSync(dir) && fs.lstatSync(dir).isDirectory();
        if (!isDirectory) this.availableInterpreterList = [];
        const files = await (async (): Promise<string[]> => new Promise((resolve, reject) => {
            fs.readdir(dir, (e, f) => {
                if (e) reject(e);
                resolve(f)
            })
        }))();
        for (const file of files) {
            const fullpath = path.join(dir, file);
            // in case of permition denied
            try {
                if (fs.lstatSync(fullpath).isDirectory()) 
                    this.deepScanInterpreterAtDir(fullpath);
            }
            catch (e) {
                // pass, just skip it
                continue;
            }
            if (path.basename(file).startsWith('AutoHotkey') && path.extname(file) === '.exe') {
                const version = await this.getVersion(fullpath).catch(e => undefined);
                this.availableInterpreterList.push({
                    path: fullpath,
                    version: version
                });
            }
        }
    }
    /**
     * Run a dectection script to get version of runtime
     * @param runtime Executable path of autohotkey runtime
     * @returns Version of runtime
     * @todo Make a waiting UI, and wait until powershell finish execute. 
     */
    private async getVersion(runtime: string): Promise<string> {
        return new Promise((resolve, reject) => {
            // Use stdin as input file of runtime, 
            // so that no actually file on disk is needed.
            // A faster version use WMIC, although it is deprecated. 
            // However, it is so so so much faster than powershell version.
            // const queryCommand = `powershell -Nologo -NoProfile -Command "& {(Get-Command \\"${runtime}\\").FileVersionInfo.FileVersion} "`
            const queryCommand = `WMIC DATAFILE WHERE "name='${runtime.replace(/\\/g, '\\\\')}'" get Version`
            const child = child_process.exec(queryCommand, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                }
                resolve(stdout.trim());
            });
	    
            // child.stdin.write('FileOpen("*", "w").Write(A_AhkVersion)');
            // child.stdin.end();
            // kill it if no respond after 1000ms
            
	    // powershell时不时能超1s，就那么一点命令也能超，也是真行
            setTimeout(() => child.kill(), 1000);
        });
    }

    private fileExistsSync(path: string): boolean {
        if (!fs.existsSync(path)) return false;
        // In case of symbolic link
        path = fs.realpathSync(path);
        return fs.existsSync(path) && fs.lstatSync(path).isFile();
    }
}