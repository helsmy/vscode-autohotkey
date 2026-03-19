import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { IoService } from '../services/ioService';

suite('IoService Test', () => {
    let tempDir: string;
    let ioService: IoService;

    setup(() => {
        // Arrange
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ioservice-test-'));
        ioService = new IoService();
    });

    teardown(() => {
        // Cleanup - using rmdirSync for compatibility with older Node.js
        const deleteRecursive = (dir: string) => {
            if (fs.existsSync(dir)) {
                fs.readdirSync(dir).forEach((file) => {
                    const fullPath = path.join(dir, file);
                    if (fs.lstatSync(fullPath).isDirectory()) {
                        deleteRecursive(fullPath);
                    } else {
                        fs.unlinkSync(fullPath);
                    }
                });
                fs.rmdirSync(dir);
            }
        };
        deleteRecursive(tempDir);
    });

    test('should find .ahk files recursively', () => {
        // Arrange
        fs.writeFileSync(path.join(tempDir, 'test1.ahk'), '');
        fs.mkdirSync(path.join(tempDir, 'subdir'));
        fs.writeFileSync(path.join(tempDir, 'subdir', 'test2.ahk'), '');

        // Act
        const results = ioService.findFilesRecursive(tempDir, '.ahk');

        // Assert
        assert.strictEqual(results.length, 2);
    });

    test('should ignore .git directory', () => {
        // Arrange
        fs.writeFileSync(path.join(tempDir, 'test.ahk'), '');
        fs.mkdirSync(path.join(tempDir, '.git'));
        fs.writeFileSync(path.join(tempDir, '.git', 'hidden.ahk'), '');

        // Act
        const results = ioService.findFilesRecursive(tempDir, '.ahk');

        // Assert
        assert.strictEqual(results.length, 1);
        assert.ok(results[0].endsWith('test.ahk'));
    });

    test('should respect .gitignore patterns', () => {
        // Arrange
        fs.writeFileSync(path.join(tempDir, '.gitignore'), 'ignored/\n*.tmp.ahk');
        fs.writeFileSync(path.join(tempDir, 'keep.ahk'), '');
        fs.writeFileSync(path.join(tempDir, 'temp.tmp.ahk'), '');
        fs.mkdirSync(path.join(tempDir, 'ignored'));
        fs.writeFileSync(path.join(tempDir, 'ignored', 'skip.ahk'), '');

        // Act
        const results = ioService.findFilesRecursive(tempDir, '.ahk');

        // Assert
        assert.strictEqual(results.length, 1);
        assert.ok(results[0].endsWith('keep.ahk'));
    });

    test('should ignore node_modules when in .gitignore', () => {
        // Arrange
        fs.writeFileSync(path.join(tempDir, '.gitignore'), 'node_modules');
        fs.writeFileSync(path.join(tempDir, 'main.ahk'), '');
        fs.mkdirSync(path.join(tempDir, 'node_modules'));
        fs.writeFileSync(path.join(tempDir, 'node_modules', 'dep.ahk'), '');

        // Act
        const results = ioService.findFilesRecursive(tempDir, '.ahk');

        // Assert
        assert.strictEqual(results.length, 1);
        assert.ok(results[0].endsWith('main.ahk'));
    });

    test('should work without .gitignore file', () => {
        // Arrange
        fs.writeFileSync(path.join(tempDir, 'test.ahk'), '');
        fs.mkdirSync(path.join(tempDir, 'subdir'));
        fs.writeFileSync(path.join(tempDir, 'subdir', 'nested.ahk'), '');

        // Act
        const results = ioService.findFilesRecursive(tempDir, '.ahk');

        // Assert
        assert.strictEqual(results.length, 2);
    });

    test('should handle negation patterns in .gitignore', () => {
        // Arrange
        fs.writeFileSync(path.join(tempDir, '.gitignore'), '*.ahk\n!important.ahk');
        fs.writeFileSync(path.join(tempDir, 'normal.ahk'), '');
        fs.writeFileSync(path.join(tempDir, 'important.ahk'), '');

        // Act
        const results = ioService.findFilesRecursive(tempDir, '.ahk');

        // Assert
        assert.strictEqual(results.length, 1);
        assert.ok(results[0].endsWith('important.ahk'));
    });
});
