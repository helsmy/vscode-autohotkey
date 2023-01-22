import * as assert from 'assert';
import { Token } from '../../parser/newtry/types';

import { Tokenizer } from '../../parser/newtry/tokenizor/tokenizer';
import { TokenType } from '../../parser/newtry/tokenizor/tokenTypes';
import { Position } from 'vscode-languageserver';
import { TokenKind } from '../../parser/newtry/tokenizor/types';
function getalltoken(text: string): Token[] {
	let tokenizer = new Tokenizer(text);
	let token = GetNoErrorToken(tokenizer, TokenType.EOL);
	let actualTokens: Token[] = [];
	while (token.type != TokenType.EOF) {
		actualTokens.push(token);
		token = GetNoErrorToken(tokenizer, token.type);
	}
	actualTokens.push(token);
	return actualTokens;
}

function GetNoErrorToken(tokenizer: Tokenizer, pretype: TokenType): Token {
	let token = tokenizer.GetNextToken(pretype);
	while (token.kind === TokenKind.Diagnostic) {
		token = tokenizer.GetNextToken(pretype);
	}
	if (token.kind === TokenKind.Multi) 
		return token.result[0];
	return token.result;
}

suite('Basic Token Test', () => {

	test('float', () => {
		let actualTokens = getalltoken('1.324 .234');
		assert.deepStrictEqual(actualTokens[0], new Token(TokenType.number, '1.324', Position.create(0, 0),Position.create(0, 5)));
		assert.deepStrictEqual(actualTokens[1], new Token(TokenType.number, '.234', Position.create(0, 6),Position.create(0, 10)));
	});

	test('hex number', () => {
		const actualTokens = getalltoken('0x7B 0x007B -0x1')
		assert.deepStrictEqual(actualTokens[0], new Token(TokenType.number, '0x7B', Position.create(0, 0),Position.create(0, 4)));
		assert.deepStrictEqual(actualTokens[1], new Token(TokenType.number, '0x007B', Position.create(0, 5),Position.create(0, 11)));
		assert.deepStrictEqual(actualTokens[2], new Token(TokenType.minus, '-', Position.create(0, 12),Position.create(0, 13)));
		assert.deepStrictEqual(actualTokens[3], new Token(TokenType.number, '0x1', Position.create(0, 13),Position.create(0, 16)));
	})

	test('string', () => {
		let actualTokens = getalltoken('"123" "AHK是世界第一的热键语言"');
		assert.deepStrictEqual(actualTokens[0], new Token(TokenType.string, '123', Position.create(0, 0),Position.create(0, 5)));
		assert.deepStrictEqual(actualTokens[1], new Token(TokenType.string, 'AHK是世界第一的热键语言', Position.create(0, 6),Position.create(0, 21)));
	});

	test('multistring', () => {
		const actualTokens = getalltoken(`"
		(
		123
		)" "AHK是世界第一的热键语言"`);
		const expect = `
		(
		123
		`;
		assert.deepStrictEqual(actualTokens[0], new Token(TokenType.string, expect, Position.create(0, 0),Position.create(3, 3)));
	})

	test('identifer', () => {
		let actualTokens = getalltoken('AHKisHotkey DllCall');
		assert.deepStrictEqual(actualTokens[0], new Token(TokenType.id, 'AHKisHotkey', Position.create(0, 0),Position.create(0, 11)));
		assert.deepStrictEqual(actualTokens[1], new Token(TokenType.id, 'DllCall', Position.create(0, 12),Position.create(0, 19)));
	});

	test('drective', () => {
		let actualTokens = getalltoken('#IfWinActive WinTitle'); 
		assert.strictEqual(actualTokens[0].content, 'IfWinActive');
		assert.strictEqual(actualTokens[0].type, TokenType.drective);
		assert.strictEqual(actualTokens[1].content, 'WinTitle');
	});

	test('mark', () => {
		let actualTokens = getalltoken('^ >>= ||');
		assert.strictEqual(actualTokens[0].type, TokenType.xor);
		assert.strictEqual(actualTokens[1].type, TokenType.rshifteq);
		assert.strictEqual(actualTokens[2].type, TokenType.logicor);
	});
});

suite('Command token basic test', () => {
	const cmdTokenStr = '    	SoundGet	, master_mute, , mute';
	const expectTokens = [
		new Token(TokenType.command, 'SoundGet', Position.create(1, 1),Position.create(1, 8)),
		new Token(TokenType.comma, ',', Position.create(1, 8),Position.create(1, 9)),
		new Token(TokenType.string, 'master_mute', Position.create(1, 9),Position.create(1, 21)),
		new Token(TokenType.comma, ',', Position.create(1, 21),Position.create(1, 22)),
		// new Token(TokenType.string, '', 21, 22),
		new Token(TokenType.comma, ',',Position.create(1, 23),Position.create(1, 24)),
		new Token(TokenType.string, 'mute', Position.create(1, 24),Position.create(1, 29)),
		new Token(TokenType.EOF, 'EOF', Position.create(1, 30),Position.create(1, 30))
	];

	let actualTokens: Token[] = getalltoken(cmdTokenStr);

	test('length test', () => {
		assert.ok(actualTokens.length === expectTokens.length, `acl: ${actualTokens.length} expl: ${expectTokens.length}`);
	});

	test('token content test', () => {
		expectTokens.forEach((expectToken, i) => {
			let actualToken = actualTokens[i];

			assert.strictEqual(actualToken.type, expectToken.type, 'type false index:'+i);
			assert.strictEqual(actualToken.content, expectToken.content, 'content false index:'+i);
			// assert.strictEqual(actualToken.start, expectToken.start, 'start false');
			// assert.strictEqual(actualToken.end, expectToken.end, 'end false');
		})
	});
});

suite('Function token test', () => {
	const cmdTokenStr = '   SoundGet(master_mute, 1.334, mute)';
	const expectTokens = [
		new Token(TokenType.id, 'SoundGet', Position.create(1, 1),Position.create(1, 8)),
		new Token(TokenType.openParen, '(',Position.create(1, 8),Position.create(1, 9)),
		new Token(TokenType.id, 'master_mute', Position.create(1, 9),Position.create(1, 21)),
		new Token(TokenType.comma, ',', Position.create(1, 21),Position.create(1, 22)),
		new Token(TokenType.number, "1.334", Position.create(1, 24),Position.create(1, 31)),
		new Token(TokenType.comma, ',', Position.create(1, 31),Position.create(1, 32)),
		new Token(TokenType.id, 'mute', Position.create(1, 33),Position.create(1, 37)),
		new Token(TokenType.closeParen, ')', Position.create(1, 37),Position.create(1, 38)),
		new Token(TokenType.EOF, 'EOF', Position.create(1, 38),Position.create(1, 38))
	];

	let actualTokens: Token[] = getalltoken(cmdTokenStr);

	test('length test', () => {
		assert.strictEqual(actualTokens.length, expectTokens.length, `acl: ${actualTokens.length} expl: ${expectTokens.length}`);
	});

	test('token content test', () => {
		expectTokens.forEach((expectToken, i) => {
			let actualToken = actualTokens[i];
			assert.strictEqual(actualToken.type, expectToken.type, 'type false index:'+i);
			assert.strictEqual(actualToken.content, expectToken.content, 'content false index:'+i);
		})
	});
});