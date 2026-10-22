// nets-bridge/DllInspector.cs
// Diagnostic utility to inspect official NETS ECR3 DLL architecture,
// exported symbols, and .NET compatibility without inventing signatures.

using System;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;

public class DllInspector {
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Ansi)]
    private static extern IntPtr LoadLibrary(string lpFileName);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool FreeLibrary(IntPtr hModule);

    public static int Main(string[] args) {
        Console.WriteLine("=================================================");
        Console.WriteLine(" NETS ECR3 DLL Compatibility & Inspection Tool");
        Console.WriteLine("=================================================");
        Console.WriteLine("OS Architecture: " + (Environment.Is64BitOperatingSystem ? "64-bit" : "32-bit"));
        Console.WriteLine("Process Architecture: " + (Environment.Is64BitProcess ? "64-bit" : "32-bit"));
        Console.WriteLine("CLR Version: " + Environment.Version);
        Console.WriteLine("=================================================\n");

        string binDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "bin");
        if (args.Length > 0 && File.Exists(args[0])) {
            InspectFile(args[0]);
            return 0;
        }

        if (!Directory.Exists(binDir)) {
            Console.WriteLine("Directory not found: " + binDir);
            return 1;
        }

        string[] dlls = Directory.GetFiles(binDir, "*.dll");
        if (dlls.Length == 0) {
            Console.WriteLine("No DLL files found in: " + binDir);
            Console.WriteLine("Please copy the official NETS ECR3 DLL (e.g. NETSECR.dll or EcrEngine.dll) into this folder.");
            return 2;
        }

        foreach (string dll in dlls) {
            InspectFile(dll);
        }

        return 0;
    }

    private static void InspectFile(string path) {
        Console.WriteLine("Inspecting file: " + Path.GetFileName(path));
        Console.WriteLine("Full Path: " + path);
        FileInfo fi = new FileInfo(path);
        Console.WriteLine("Size: " + fi.Length + " bytes");
        Console.WriteLine("Last Modified: " + fi.LastWriteTime);

        // 1. Try loading as managed .NET Assembly
        try {
            AssemblyName an = AssemblyName.GetAssemblyName(path);
            Console.WriteLine("Type: Managed .NET Assembly");
            Console.WriteLine("Assembly Name: " + an.FullName);
            Console.WriteLine("Processor Architecture: " + an.ProcessorArchitecture);

            Assembly asm = Assembly.LoadFile(path);
            Console.WriteLine("Types in Assembly:");
            foreach (Type t in asm.GetExportedTypes()) {
                Console.WriteLine("  - Class: " + t.FullName);
                foreach (MethodInfo mi in t.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly)) {
                    Console.WriteLine("      Method: " + mi.Name + "(" + GetParamString(mi.GetParameters()) + ") -> " + mi.ReturnType.Name);
                }
            }
            return;
        } catch (BadImageFormatException) {
            // Not a .NET assembly, native unmanaged binary
            Console.WriteLine("Type: Native (Unmanaged) Windows PE DLL");
        } catch (Exception ex) {
            Console.WriteLine("Assembly load probe: " + ex.Message);
        }

        // 2. Try loading as native DLL
        IntPtr hMod = LoadLibrary(path);
        if (hMod == IntPtr.Zero) {
            int err = Marshal.GetLastWin32Error();
            Console.WriteLine("Native LoadLibrary failed. Win32 Error: " + err);
            if (err == 193) { // ERROR_BAD_EXE_FORMAT
                Console.WriteLine("Hint: 32-bit vs 64-bit architecture mismatch.");
            }
        } else {
            Console.WriteLine("Native LoadLibrary: SUCCESS (Loaded at 0x" + hMod.ToString("X") + ")");
            FreeLibrary(hMod);
        }
        Console.WriteLine("-------------------------------------------------");
    }

    private static string GetParamString(ParameterInfo[] parameters) {
        string s = "";
        for (int i = 0; i < parameters.Length; i++) {
            if (i > 0) s += ", ";
            s += parameters[i].ParameterType.Name + " " + parameters[i].Name;
        }
        return s;
    }
}
