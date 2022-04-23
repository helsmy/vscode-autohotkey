import { ExtensionContext } from 'vscode';
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

    constructor() {
        this.commandList = {
            "AutohotkeySS.runCurrentFile": new RunFileCommand(),
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