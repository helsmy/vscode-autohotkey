; Test file for #Include go-to-definition

#Include included_lib.ahk
#Include included_lib.ahk ; with trailing comment

TestFunc() {
	result := LibraryFunction()
	return result
}
