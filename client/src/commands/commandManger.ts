import { ExtensionContext } from 'vscode';
import { FormatCommand } from './formatCommand';
import { RunFileCommand } from "./runFileCommand";
import { ICommand } from './types';

type ICommandList = {[k: string]: ICommand} 

export class CommandManger {
    private commandList: ICommandList

    constructor() {
        this.commandList = {
            "AutohotkeySS.runCurrentFile": new RunFileCommand(),
            "AutohotkeySS.formatDocument": new FormatCommand()
        }
    }

    public subscript(context: ExtensionContext) {
        for (const name in this.commandList) {
            this.commandList[name].subscript(name, context);
        }
    }
}