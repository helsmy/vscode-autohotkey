import { SymbolInformation, SymbolKind } from 'vscode-languageserver';
import { AHKMethodSymbol, AHKObjectSymbol, AHKSymbol, HotkeySymbol, HotStringSymbol, VariableSymbol } from './symbol';
import { ISymbol, VarKind } from '../types';

export function symbolInformations(symbols: Map<string, AHKSymbol>, uri: string): SymbolInformation[] {
	let info: SymbolInformation[] = [];
	for (const [, sym] of symbols) {
		if (sym instanceof VariableSymbol) {
			// Do not show parameter in Outline
			if (sym.tag === VarKind.parameter)
				continue;
			info.push(SymbolInformation.create(
				symbolInfomationName(sym),
				sym.tag === VarKind.variable ? SymbolKind.Variable : SymbolKind.Property,
				sym.range,
				uri
			));
		}
		else if (sym instanceof AHKMethodSymbol) {
			info.push(SymbolInformation.create(
				symbolInfomationName(sym),
				SymbolKind.Method,
				sym.range,
				uri
			));
			info.push(...sym.symbolInformations());
		}
		else if (sym instanceof AHKObjectSymbol) {
			let symInfo = SymbolInformation.create(
				symbolInfomationName(sym),
				SymbolKind.Class,
				sym.range,
				uri
			);
			const childernInfo = sym.symbolInformations();
			if (symInfo.name === '' && childernInfo.length === 0) 
				continue;
			info.push(symInfo);
			info.push(...childernInfo);
		}
		else if (sym instanceof HotkeySymbol || sym instanceof HotStringSymbol) {
			info.push(SymbolInformation.create(
				symbolInfomationName(sym),
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

export function getSymbolKind(sym: ISymbol): SymbolKind {
	if (sym instanceof VariableSymbol) {
		return sym.tag === VarKind.variable ? SymbolKind.Variable : SymbolKind.Property;
	}
	else if (sym instanceof AHKMethodSymbol) {
		return SymbolKind.Method;
	}
	else if (sym instanceof AHKObjectSymbol) {
		return SymbolKind.Class;
	}
	else if (sym instanceof HotkeySymbol || sym instanceof HotStringSymbol) {
		return SymbolKind.Event;
	}
	return SymbolKind.Variable;
}

export function symbolInfomationName(sym: ISymbol): string {
	if (sym.name !== '') return sym.name;
	if (sym instanceof VariableSymbol) {
			// Do not show parameter in Outline
			if (sym.tag === VarKind.parameter)
				return '<parameter name>'
			return '<variable name>'
		}
		else if (sym instanceof AHKMethodSymbol) {
			return '<method name>'
		}
		else if (sym instanceof AHKObjectSymbol) {
			return '<class name>'
		}
		else if (sym instanceof HotkeySymbol) {
			return '<hotkey name>'
		}
		else if (sym instanceof HotStringSymbol) {
			return '<hotstring name>'
		}
		return '<unknown symbol name>'
}