#Include ./completion.ahk

FuncHover(a, b, c) {
	return a + b + c
}

FuncHover(1, 2, 3)

TestClass

hover := new TestClass()
hover.NestedFunc()