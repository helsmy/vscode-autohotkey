import * as assert from 'assert';
import { Range } from 'vscode-languageserver-types';
import { WorkspaceIndex } from '../services/workspaceIndex';
import { AHKMethodSymbol, AHKObjectSymbol, VariableSymbol } from '../parser/newtry/analyzer/models/symbol';

// VarKind is a const enum, so we use the numeric value directly
// VarKind.variable = 0, VarKind.parameter = 1, VarKind.property = 2
const VAR_KIND_VARIABLE = 0;

function createTestSymbol(name: string, uri: string): VariableSymbol {
    return new VariableSymbol(
        uri,
        name,
        Range.create(0, 0, 0, name.length),
        VAR_KIND_VARIABLE
    );
}

function createTestClass(name: string, uri: string): AHKObjectSymbol {
    return new AHKObjectSymbol(
        uri,
        name,
        Range.create(0, 0, 10, 0),
        undefined,
        undefined
    );
}

function createTestMethod(name: string, uri: string): AHKMethodSymbol {
    return new AHKMethodSymbol(
        uri,
        name,
        Range.create(0, 0, 5, 0),
        [],
        [],
        undefined
    );
}

suite('WorkspaceIndex Test', () => {
    test('should add and find symbols by name', () => {
        // Arrange
        const index = new WorkspaceIndex();
        const symbol = createTestSymbol('myVar', 'file:///test.ahk');

        // Act
        index.addFile('file:///test.ahk', [symbol]);
        const results = index.findByName('myVar');

        // Assert
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0].symbol.name, 'myVar');
        assert.strictEqual(results[0].uri, 'file:///test.ahk');
    });

    test('should find symbols case-insensitively', () => {
        // Arrange
        const index = new WorkspaceIndex();
        const symbol = createTestSymbol('MyClass', 'file:///test.ahk');

        // Act
        index.addFile('file:///test.ahk', [symbol]);

        // Assert
        assert.strictEqual(index.findByName('myclass').length, 1);
        assert.strictEqual(index.findByName('MYCLASS').length, 1);
        assert.strictEqual(index.findByName('MyClass').length, 1);
    });

    test('should remove file from index', () => {
        // Arrange
        const index = new WorkspaceIndex();
        const symbol = createTestSymbol('myVar', 'file:///test.ahk');
        index.addFile('file:///test.ahk', [symbol]);

        // Act
        index.removeFile('file:///test.ahk');

        // Assert
        assert.strictEqual(index.findByName('myVar').length, 0);
        assert.strictEqual(index.indexedFileCount, 0);
    });

    test('should track indexed file count', () => {
        // Arrange
        const index = new WorkspaceIndex();

        // Act
        index.addFile('file:///test1.ahk', [createTestSymbol('var1', 'file:///test1.ahk')]);
        index.addFile('file:///test2.ahk', [createTestSymbol('var2', 'file:///test2.ahk')]);

        // Assert
        assert.strictEqual(index.indexedFileCount, 2);
    });

    test('should handle multiple symbols with same name from different files', () => {
        // Arrange
        const index = new WorkspaceIndex();
        const symbol1 = createTestSymbol('Config', 'file:///file1.ahk');
        const symbol2 = createTestSymbol('Config', 'file:///file2.ahk');

        // Act
        index.addFile('file:///file1.ahk', [symbol1]);
        index.addFile('file:///file2.ahk', [symbol2]);
        const results = index.findByName('Config');

        // Assert
        assert.strictEqual(results.length, 2);
    });

    test('should re-index file when adding same URI', () => {
        // Arrange
        const index = new WorkspaceIndex();
        const symbol1 = createTestSymbol('oldVar', 'file:///test.ahk');
        const symbol2 = createTestSymbol('newVar', 'file:///test.ahk');

        // Act
        index.addFile('file:///test.ahk', [symbol1]);
        index.addFile('file:///test.ahk', [symbol2]);

        // Assert
        assert.strictEqual(index.findByName('oldVar').length, 0);
        assert.strictEqual(index.findByName('newVar').length, 1);
        assert.strictEqual(index.indexedFileCount, 1);
    });

    test('should clear all symbols', () => {
        // Arrange
        const index = new WorkspaceIndex();
        index.addFile('file:///test1.ahk', [createTestSymbol('var1', 'file:///test1.ahk')]);
        index.addFile('file:///test2.ahk', [createTestSymbol('var2', 'file:///test2.ahk')]);

        // Act
        index.clear();

        // Assert
        assert.strictEqual(index.indexedFileCount, 0);
        assert.strictEqual(index.findByName('var1').length, 0);
        assert.strictEqual(index.findByName('var2').length, 0);
    });

    test('should check if file is indexed', () => {
        // Arrange
        const index = new WorkspaceIndex();
        index.addFile('file:///test.ahk', [createTestSymbol('var1', 'file:///test.ahk')]);

        // Act & Assert
        assert.strictEqual(index.hasFile('file:///test.ahk'), true);
        assert.strictEqual(index.hasFile('file:///other.ahk'), false);
    });

    test('should index multiple symbols from same file', () => {
        // Arrange
        const index = new WorkspaceIndex();
        index.addFile('file:///test.ahk', [
            createTestSymbol('MyClass', 'file:///test.ahk'),
            createTestSymbol('MyFunction', 'file:///test.ahk'),
            createTestSymbol('OtherThing', 'file:///test.ahk')
        ]);

        // Act & Assert - verify all symbols are indexed and findable
        assert.strictEqual(index.findByName('MyClass').length, 1);
        assert.strictEqual(index.findByName('MyFunction').length, 1);
        assert.strictEqual(index.findByName('OtherThing').length, 1);
        assert.strictEqual(index.indexedFileCount, 1);
    });

    test('should index class symbols', () => {
        // Arrange
        const index = new WorkspaceIndex();
        const classSymbol = createTestClass('MyClass', 'file:///test.ahk');

        // Act
        index.addFile('file:///test.ahk', [classSymbol]);
        const results = index.findByName('MyClass');

        // Assert
        assert.strictEqual(results.length, 1);
        assert.ok(results[0].symbol instanceof AHKObjectSymbol);
    });

    test('should index method symbols', () => {
        // Arrange
        const index = new WorkspaceIndex();
        const methodSymbol = createTestMethod('DoSomething', 'file:///test.ahk');

        // Act
        index.addFile('file:///test.ahk', [methodSymbol]);
        const results = index.findByName('DoSomething');

        // Assert
        assert.strictEqual(results.length, 1);
        assert.ok(results[0].symbol instanceof AHKMethodSymbol);
    });
});
