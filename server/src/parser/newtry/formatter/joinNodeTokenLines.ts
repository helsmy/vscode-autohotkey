import { NodeBase } from '../parser/models/nodeBase';
import { Token } from '../tokenizor/types';

export function joinNodeTokenLines(...nodeOrToken: Array<NodeBase|Token>): string[] {
    if (nodeOrToken.length === 0) return [];
    let oneline: string[] = [];
    let lines = [oneline];
    let prelement = nodeOrToken[0];
    for (const e of nodeOrToken) {
        const leadingSpace = (prelement === e) || (prelement.end.line !== e.start.line) ?
                             '' : ' '.repeat(e.start.character-prelement.end.character);
        if (e.start.line !== prelement.start.line) {
            oneline = [];
            lines.push(oneline);
        }
        if (e instanceof Token) {
            oneline.push(leadingSpace, e.content);
            continue;
        }
        const el = e.toLines();
        oneline.push(leadingSpace, el[0]);
        if (el.length >= 2) {
            lines.push(...el.slice(1).map(s => [s]));
            oneline = lines[lines.length-1];
        }
        prelement = e;
    } 
    return lines.map(s => s.join(''));
}