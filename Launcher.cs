using System;
using System.Diagnostics;

class Program {
    static void Main(string[] args) {
        Console.WriteLine("==========================================");
        Console.WriteLine("  啟動天下第一 Podcaster 大會 (SDH Award)  ");
        Console.WriteLine("==========================================");
        
        ProcessStartInfo startInfo = new ProcessStartInfo();
        startInfo.FileName = "node.exe";
        startInfo.Arguments = "cli.js";
        startInfo.UseShellExecute = false;
        
        try {
            Process process = Process.Start(startInfo);
            process.WaitForExit();
        } catch (Exception) {
            Console.WriteLine("\n[錯誤] 無法啟動工具箱！");
            Console.WriteLine("請確定這台電腦已經安裝了 Node.js。");
            Console.WriteLine("下載網址: https://nodejs.org/");
            Console.WriteLine("\n請按任意鍵結束...");
            Console.ReadKey();
        }
    }
}
