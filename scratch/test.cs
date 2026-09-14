using System;
using System.Diagnostics;
using System.IO;

class Program {
    static int Main(string[] args) {
        if (args.Length > 0 && args[0] == "--version") {
            Console.WriteLine("Sentinel Grid Edge Agent 0.1.18");
            return 0;
        }
        Console.WriteLine("Sentinel Grid Edge Agent running...");
        return 0;
    }
}
