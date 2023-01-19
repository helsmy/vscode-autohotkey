# About

This is the plan of parser rewriting.   
This is consisted with two part:  
1. The whole frame of current parser. In other word, how current parser works.
2. The furture plan about how to build a more useful parser.

## How current parser work

Like other parsers, current parser produrce syntax tree in two steps:
1. The lexer reads text and proudce the tokens needed by parser.
2. The AHKParser read tokens from lexer and construct the final syntax tree.


### Lexer

Unlike other parsers which produce all tokens at once, the lexer produce a token when the parser want one. Because of the syntax of autohotkey, the way of splitting word will change when parser meet different sentence. Thus, lexer need to change with parser. The best way to handle the changings, I think, is to make lexer produce tokens when parser need.

#### Token

Tokens are represent like:
```typescript
interface IToken {
	type: TokenType; // the classification of the token
	content: string; // the content of the token eg. `123`, `var`
	start: Position; // the start position of token. which line and which character
	end: Position;   // the end position of token. which line and which character
}
```
### Parser

The autohotkey grammar is seems not be clearly defined, so most grammar is came from the autohotkey documention and is simplely summaried in `server\src\parser\newtry\LangSpec.txt`. The LangSpec file is not contained every aspect of autohotkey grammar. In most cases, it works like a reminder which grammar is not impleanment correctly.  
Anyway, the parser read all tokens from lexer and make a abstract syntax tree for all language support features. The parser use top-down style to make is easier to be read and write. For the expression parts, the farmous pratt parsing is used for combindation of power of bottom-up and readable of top-down. Take `while` statment as an example:
```
while -> 'while' expression statement
```
The resultant parsing logic will look something like this. A very typical top-down parsing. Or, it can be called LL(1) which only one current token is considered in each step.
```typescript
function whileStmt(): INodeResult<Stmt.WhileStmt> {
	const whileToken = this.eat();
	const cond = this.expression();
	// skip all EOL
	this.jumpWhiteSpace();
	const body = this.declaration();

	return nodeResult(
		new Stmt.WhileStmt(whileToken, cond.value, body.value),
		cond.errors.concat(body.errors)
	);
}
```

#### Error

Noticed that errors of while body and expressions is collected in last step to genarate a node of while statment. This is the major of the rewriting plan. Any errors detected by parser will produce an cautched expection, and then break current parse flow.
```typescript
function block(): INodeResult<Stmt.Block> {
    const open = this.eatDiscardCR(TokenType.openBrace);
    if (!open) {
        throw this.error(
            this.currentToken,
            'Expect a "{" at begining of block',
            Stmt.Block
        );
	}
	...
}
```
The current statment will not be finished and fail to a big loop. The loop will skip all error tokens and try find next correct statment.
```typescript
function bigloop() {
	while (this.currectToken !== somecondition) {
		this.nextToken();
	}
	goback_to_next_parse();
}
```
The major problem is that the condition is a little complex. Thus, sometimes, the big loop will skip to the end of file and nothing is parsed ( :\ ). Futhermore, even the big loop skip the errors sucessfully, the orginial contexts is not be preserved. In other word, the parse flow is broken.

## Plan

Hopyfully, I found a pretty project of language server -- tolerant-php-parser of microsoft--. if parser found some token is needed but is not exist, a missing token is generated. and the same way, Skipped Tokens: extra token that no one knows how to deal with. All contexts is finished and no big loop is needed. That way of error handling will give us a more tolerantable autohotkey parser.