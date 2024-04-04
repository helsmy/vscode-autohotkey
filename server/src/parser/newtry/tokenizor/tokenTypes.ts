export enum TokenType {
    // Level 18
    // operators
    pplus,
    mminus,
    // Level 17
    power, // **
    // Level 16
    not,  // !
    bnot, // ~
    // and(&), When as VarRef
    // Level 15
    multi,
    div,
    fdiv,
    // Level 14
    plus,
    minus,
    // Level 13
    rshift, // >>
    lshift, // <<
    logicRshift, // >>>
    // Level 12
    and, // &
    xor, // ^
    or,  // |
    // Level 11
    sconnect, // Space '.' Space 
    // Level 10
    regeq,    // ~= 
    // Level 9
    greater,  // >
    greaterEqual,// >=
    less,     // <
    lessEqual,// <=
    // Level 8
    equal,    // =
    dequal,   // ==
    glNEqual, // <> decrepte in v2
    notEqual, // !=
    notDEqual, // !==
    // Level 7
    isKeyword,
    inKeyword,
    containsKeyword,
    // Level 6
    notKeyword,
    // Level 5
    logicAnd, // &&
    andKeyword,
    // Level 4
    orKeyword,    
    logicOr,  // ||
    // Level 3
    dquestion,// ??
    // Level 2
    question, // as Ternary operator
    // Level 1
    aassign,  // :=
    pluseq,   // +=
    minuseq,  // -=
    multieq,  // *=
    diveq,    // /=
    idiveq,   // //=
    sconneq,  // .=
    oreq,     // |=
    andeq,    // &=
    xoreq,    // ^=
    rshifteq, // >>=
    lshifteq, // <<=
    logicRshiftEq, // >>>=
    fatArrow, // =>

    dot,
    comma,


    // literal
    string, number,
    true, false,

    id,

    // paren
    openBracket,
    openParen,
    precent,
    openBrace,
    closeBrace,
    closeBracket,
    closeParen,

    // marks
    sharp,
    dollar,
    key,

    /**
     * mark: ':'
     */
    colon,
    hotkey,
    hotkeyModifer,
    hotkeyand,
    /**
     * ':热字串的修饰符:'
     */
    hotstringOpen,
    /**
     * '热字串::'
     */
    hotstringEnd,

    // comment
    lineComment,
    blockComment,


    // keyword
    if, else, switch, case, loop,
    for, in,
    while, until, break, continue,
    try, catch, finally,
    gosub, goto, return, global,
    local, throw, class,
    extends, new, static,
    byref,


    command,
    drective,
    // label,
    implconn,

    // file
    EOL, EOF,

    // error
    unknown,
}

export function isValidIdentifier(type: TokenType): boolean {
    switch (type) {
        case TokenType.id:
        case TokenType.andKeyword:
        case TokenType.notKeyword:
        case TokenType.orKeyword:
        case TokenType.isKeyword:
        case TokenType.inKeyword:
        case TokenType.containsKeyword:
            return true;
    }
    if (type >= TokenType.if && type <= TokenType.byref)
        return true;
    return false;
}