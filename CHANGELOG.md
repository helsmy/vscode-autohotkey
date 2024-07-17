# CHANGELOG

## 0.9.9

1. support `=>` short dynamic property
2. support v2 tokens
3. support `static` modifier in class' method
3. use wmic to query autohotkey version


## 0.9.8

1. fix crash while hover on trailor expression.
2. v2 CompatibleMode configuration. 

## 0.9.7

1. fix completions dose not show at object property and method
2. fix hover error on new expression
3. fix include file can not find on unix like path
4. `jsdoc` like document comment autofill

## 0.9.6
1. fix hover dosen't show on iter identifer of for statements.
2. fix hover dosen't show on items of array and associative array.
3. hover will show `__new()` meta function on new expression.

## 0.9.5
1. fix bugs.
2. basic support of Hover feature.

## 0.9.4
1. fix about brackets
2. correctly parse spread parameter

## 0.9.3
1. update hotkey highlight

## 0.9.2
1. `AutohotkeySS.selectInterpreterCommand` command
2. Bug fix on wrong token order when multi-token is produced at once.

## 0.9.1
1. Debugger runtime executable path overlap.
2. Bug fix on scaning hotkey and name confliction of Label(temporary solution).

## 0.9.0
1. Refactor Autohotkey parser

## 0.8.27
1. add command `AutohotkeySS.runCurrentFile`, `AutohotkeySS.formatDocument`
2. add `run current file` button to menu
3. add setting `ahk-simple-language-server.runtimePath`
4. fix hightlighting bugs #9

## 0.8.0
1. pre-release of recursive descent parser
2. bug fixs in if for call and new
3. improve synchronize
4. more bugs fixed see commit log
5. fix parse error on multi-index `[]`, more check on hotkey token
6. fix bug that outline may not load 
7. fix include load wrong and path compeltion for absolute path
8. fix bugs on parsing `else if` statement
9. fix bugs on directive
10. update highlight
11. add option for sending errors. update highlight (0.8.25)
12. improve highlighting (0.8.26)
13. support continuation section (0.8.26)

## 0.5.0

1. Command parse
2. Unit test
3. fix command parse bug (0.5.1)
4. improve regex parser. Handle `{}` better. (0.5.3)
5. Experimental hint for where symbol is included on completion (0.5.3)
6. Correct enumerate Includes (0.5.4)
7. Fix that `/` and `<` fire completion incorrectly (0.5.4)
8. Better AST finder, support compeltion suffix for Multiple references (0.5.5)
9. Fix class parse bug (0.5.5)
10. Bug fixs #15 #16 #17 (0.5.9)

## 0.4.0

1. improve include path parse
2. new Class TreeManager for mananging ASTs
3. support searching node cross ASTs
4. signature help and node searching bug fixs (0.4.1)
5. include completion (0.4.1)
6. experimental support for lib include (0.4.2)

## 0.3.0

1. improved parser, better analysis of variables
2. support v2 formation
3. fix parse wrong on class property (0.3.1)
4. folding region commnet, fix reference bugs, static property parse wrong (0.3.2)

## 0.2.0

1. new parser for signature help
2. fix completion(in class) and signature help(when string is passed) bugs
3. support completion and signature help of reference  (0.2.2)
4. New configuration `documentLanguage` (0.2.5)
5. Fix bugs about unworking configuration (0.2.5)
6. add doc formation (0.2.6)

## 0.1.0

1. Improve parser
2. Improve Completion
3. Improve Completion and go to definition (0.1.1)
4. Fixs bugs about function range. (0.1.2)
