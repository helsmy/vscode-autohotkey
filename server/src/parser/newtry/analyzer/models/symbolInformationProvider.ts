import { SymbolInformation, SymbolKind } from 'vscode-languageserver';
import { AHKMethodSymbol, AHKObjectSymbol, AHKSymbol, HotkeySymbol, HotStringSymbol, VariableSymbol } from './symbol';
import { VarKind } from '../types';

export function symbolInformations(symbols: Map<string, AHKSymbol>, uri: string): SymbolInformation[] {
	let info: SymbolInformation[] = [];
	for (const [, sym] of symbols) {
		if (sym instanceof VariableSymbol) {
			// Do not show parameter in Outline
			if (sym.tag === VarKind.parameter)
				continue;
			info.push(SymbolInformation.create(
				sym.name,
				SymbolKind.Variable,
				sym.range,
				uri
			));
		}
		else if (sym instanceof AHKMethodSymbol) {
			info.push(SymbolInformation.create(
				sym.name,
				SymbolKind.Method,
				sym.range,
				uri
			));
			info.push(...sym.symbolInformations());
		}
		else if (sym instanceof AHKObjectSymbol) {
			let symInfo = SymbolInformation.create(
				sym.name,
				SymbolKind.Class,
				sym.range,
				uri
			);
			const childernInfo = sym.symbolInformations();
			if (symInfo.name === '' && childernInfo.length === 0) 
				continue;
			symInfo.name = symInfo.name === '' ? '<class name>' : symInfo.name;
			info.push(symInfo);
			info.push(...childernInfo);
		}
		else if (sym instanceof HotkeySymbol || sym instanceof HotStringSymbol) {
			info.push(SymbolInformation.create(
				sym.name,
				SymbolKind.Event,
				sym.range,
				uri
			));
		}
		else
			continue;
	}
	return info;
}