#Include ./completion.ahk

FuncHover(a, b, c) {
	return a + b + c
}

FuncHover(1, 2, 3)

TestClass

hover := new TestClass()
hover.NestedFunc()

arr := [hover, 123]
dict := {"key": arr, "class": TestClass}
deep := {"array": [arr, 1+hover, 123]}