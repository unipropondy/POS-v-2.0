@echo off
title Compile NETS DLL Runner
cd /d "%~dp0"
echo Compiling NetsDllRunner.cs and DllInspector.cs...
for /f "tokens=*" %%i in ('powershell -Command "[System.Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()"') do set CSC=%%i\csc.exe

"%CSC%" /out:NetsDllRunner.exe NetsDllRunner.cs
"%CSC%" /out:DllInspector.exe DllInspector.cs

echo Done.
pause
