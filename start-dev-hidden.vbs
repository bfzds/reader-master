Option Explicit

Dim shell
Dim fileSystem
Dim projectRoot
Dim command

Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")

projectRoot = fileSystem.GetParentFolderName(WScript.ScriptFullName)
command = "cmd.exe /d /c cd /d """ & projectRoot & """ && npm run tauri:dev"

' Start without opening a console window. Logs are intentionally hidden.
shell.Run command, 0, False
