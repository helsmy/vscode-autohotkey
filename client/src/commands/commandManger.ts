import { ExtensionContext } from 'vscode';
import { InterpreterService } from '../display/interpreterService';
import { FormatCommand } from './formatCommand';
import { RunFileCommand } from "./runFileCommand";
import { ICommand } from './types';

type ICommandList = {[k: string]: ICommand} 

/**
 * Manager for all command
 */
export class CommandManger {
    /**
     * Storage of command name to its class map
     */
    private commandList: ICommandList

    constructor(interpreterSerivce: InterpreterService) {
        // 还是好丑啊，来个dalao教我写的好看点
        // 要把这个服务传参进来真的丑，还要塞个全局变量OTZ
        const runfilecmd = new RunFileCommand();
        interpreterSerivce.on('StatusChange', runfilecmd.onDidChangeInterpreterStatus.bind(runfilecmd));
        this.commandList = {
            "AutohotkeySS.runCurrentFile": runfilecmd,
            "AutohotkeySS.formatDocument": new FormatCommand()
        }
    }

    /**
     * Register all command in command list
     */
    public subscript(context: ExtensionContext) {
        for (const name in this.commandList) {
            this.commandList[name].subscript(name, context);
        }
    }
}