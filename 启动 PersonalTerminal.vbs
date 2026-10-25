' Launch Personal Terminal silently from Explorer double-click.
' NOTE: window style MUST be 1 (SW_SHOWNORMAL), not 0. The exe has no
' console (GUI subsystem), so 0 only served to hide STARTUPINFO -- but
' the Wails build from 2026-10-09 forwards SW_HIDE to its window
' creation, which produced a running process with NO window. Style 1
' keeps it visible and still leaves no black console box.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
sh.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run """" & sh.CurrentDirectory & "\build\bin\PersonalTerminal.exe""", 1, False
