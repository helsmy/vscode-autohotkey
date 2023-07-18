import { Position, SignatureHelp } from 'vscode-languageserver';
import { Factor } from '../parser/newtry/parser/models/expr';
import * as SuffixTerm from '../parser/newtry/parser/models/suffixterm';
import { IScript } from '../parser/newtry/types';
import { binarySearchIndex, binarySearchNode, ScriptASTFinder } from './scriptFinder';
import { DocInfo } from './types';

export class ASTService {
	private finder: ScriptASTFinder = new ScriptASTFinder()

	constructor() {

	}

	public onSignatureHelp(position: Position, docInfo: DocInfo): Maybe<SignatureHelp> {
		const find = this.finder.find(docInfo.AST.script.stmts, position, [SuffixTerm.Call]);
        if (!find || !(find.outterFactor) || !(find.nodeResult instanceof SuffixTerm.Call)) return undefined;
        const baseId = find.outterFactor
		
	}

	private findCallIndex(call: SuffixTerm.Call, position: Position): Maybe<number> {
		const childernIndex = binarySearchIndex(call.args.childern, position);
		if (!childernIndex) return undefined;
		let index = 0;
		for(let i = 0; i <= Math.min(childernIndex, call.args.childern.length); i++) {
			
		}
	}

	private findCallInfo(node: Factor, position: Position): Maybe<CallInfo> {
		if (node.suffixTerm.atom instanceof SuffixTerm.Invalid) return;

		const fullNameList: string[] = [];
		if (node.suffixTerm.atom instanceof SuffixTerm.Identifier) {
			fullNameList.push(node.suffixTerm.atom.token.content)
		}
	}

	private fullIdList(node: Factor): Maybe<string[]> {
		if (node.suffixTerm.atom instanceof SuffixTerm.Invalid) return;
		node.suffixTerm.brackets
		let id: string[] = [];
		if (node.suffixTerm.atom instanceof SuffixTerm.Identifier) {

		}
	}
}

interface CallInfo {
	fullNameList: string[],
	bracketPos: number,
	activeParam: number
}
