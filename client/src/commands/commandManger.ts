import { ExtensionContext } from 'vscode';
import { InterpreterService } from '../display/interpreterService';
import { FormatCommand } from './formatCommand';
import { RunFileCommand } from "./runFileCommand";
import { SelectInterpreterCommand } from './selectInterpreterCommand';
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
        const selectInterpreterCommand = new SelectInterpreterCommand(interpreterSerivce.getInterpreterList.bind(interpreterSerivce));
        selectInterpreterCommand.on("InterpreterChange", interpreterSerivce.onDidChangeInterpreter.bind(interpreterSerivce));
        this.commandList = {
            "AutohotkeySS.runCurrentFile": new RunFileCommand(interpreterSerivce.getVaildInterpreterPath.bind(interpreterSerivce)),
            "AutohotkeySS.formatDocument": new FormatCommand(),
            "AutohotkeySS.selectInterpreterCommand": selectInterpreterCommand
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