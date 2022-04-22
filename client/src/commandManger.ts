import { ExtensionContext, commands } from 'vscode';
import { RunFileCommand } from "./runFileCommnad";
import { ICommnad } from './types';

type ICommandList = {[k: string]: ICommnad} 

export class CommandManger {
    private commandList: ICommandList

    constructor() {
        this.commandList = {
            "AutohotkeySS.runCurrentFile": new RunFileCommand()
        }
    }

    public subscript(context: ExtensionContext) {
        for (const name in this.commandList) {
            this.commandList[name].subscript(name, context);
        }
    }
}