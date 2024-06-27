import { TokenType } from '../../tokenizor/tokenTypes';

export const enum Associativity {
    None,
    Left,
    Right
}

/**
 * Precedences and associativity for all operators
 * total 18 level. 
 * Same order as TokenType
 * Contains V2 operators
 */
export const PrecedenceAndAssociativity: Array<[number, Associativity]> = [
    // ++, --, Unary operator (X)
    [18, Associativity.None], [18, Associativity.None],
    // **, L in v1, R in v2
    [17, Associativity.Right],
    // !, ~ Unary operator (X)
    [16, Associativity.None], [16, Associativity.None],
    // *, /, //
    [15, Associativity.Left], [15, Associativity.Left], [15, Associativity.Left],
    // +, -
    [14, Associativity.Left], [14, Associativity.Left],
    // >>, <<, >>>
    [13, Associativity.Left], [13, Associativity.Left], [13, Associativity.Left],
    // &, ^, |
    [12, Associativity.Left], [12, Associativity.Left], [12, Associativity.Left],
    // Space '.' Space, String concate expression
    [11, Associativity.Left],
    // ~=
    [10, Associativity.Left],
    // >, >=, <, <=
    [9, Associativity.Left], [9, Associativity.Left], [9, Associativity.Left], [9, Associativity.Left],
    // =, ==. <>, !=, !==
    [8, Associativity.Left], [8, Associativity.Left], [8, Associativity.Left], [8, Associativity.Left], [8, Associativity.Left],
    // is, in, contains
    [7, Associativity.Left], [7, Associativity.Left], [7, Associativity.Left],
    // not Unary operator (X)
    [6, Associativity.None],
    // &&, and
    [5, Associativity.Left], [5, Associativity.Left],
    // or, ||
    [4, Associativity.Left], [4, Associativity.Left],
    // ??
    [3, Associativity.Left],
    // ? as Ternary operator
    [2, Associativity.Right],
    // :=, +=, -=, *=, /=, //=, .=, |=, &=, ^=, >>=, <<=, >>>=
    ...(() => new Array(13).fill([1, Associativity.Right]))()
];
